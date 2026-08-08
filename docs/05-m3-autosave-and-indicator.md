# 05 · M3 · 自动保存 + 未保存指示（Auto-Save & Dirty Indicator）

> 第五阶段 · 里程碑 3 / 9
> 关联设计文档：[04-design.md §3.1 useEditorStore](../04-design.md#31-useeditorstore) / [§5.2 TitleBar](../04-design.md#52-titlebar) / [§6.2 useAutoSave](../04-design.md#62-useautosavecontentref-options)
> 关联需求：[Phase 2 §5.1 自动保存](../02-editor-and-experience.md#51-自动保存) / [Phase 2 §5.2 「未保存」指示](../02-editor-and-experience.md#52-未保存指示) / [§9 #4 自动保存失败处理](../02-editor-and-experience.md) / [§9 #8 圆点颜色](../02-editor-and-experience.md)

---

## 1. 目标

实现自动保存（带防抖与失败重试）以及标题栏「未保存」圆点指示。本里程碑完成后，用户的编辑体验闭环：输入 → 防抖 → 自动写入 → 圆点消失。

---

## 2. 依赖

### 2.1 前置里程碑

- **M1**：stores 就绪
- **M2**：编辑器骨架 + vditor 集成 + `useFileSystem`

### 2.2 外部依赖

无新增。

---

## 3. 交付内容

### 3.1 新增文件

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `src/composables/useAutoSave.js` | composable | 自动保存逻辑（见 §3.2） |

### 3.2 `useAutoSave` 接口

```ts
useAutoSave(contentRef: Ref<string>, options?: { onFirstSave?: () => void })
  → {
    isSaving: Ref<boolean>,
    lastError: Ref<Error | null>,
    retryCount: Ref<number>,
    triggerSave: () => Promise<void>,    // 手动触发（绕过防抖）
    cancelPending: () => void,           // 取消未触发的防抖
  }
```

**核心逻辑**：

```
1. watch(contentRef, () => {
     if (useSettingsStore.autoSave === false) return
     if (contentRef.value === useEditorStore.lastSavedContent) return  // 无变化
     scheduleTimer()
   })

2. scheduleTimer():
     clearTimeout(prev)
     timer = setTimeout(() => triggerSave(), useSettingsStore.autoSaveInterval * 1000)

3. triggerSave():
     isSaving = true
     content = contentRef.value
     handle = useEditorStore.fileHandle
     if (!handle) {
       // 首次保存：自动走 saveAsFile（M2 已实现）
       result = useFileSystem.saveAsFile(content, 'untitled.md')
       if (result) {
         useEditorStore.updateFileHandle(result)
         useEditorStore.markSaved({ content })
         onFirstSave?.()
       } else {
         // 用户取消；保留 dirty
       }
     } else {
       success = await retryWithBackoff(
         () => useFileSystem.saveFile(handle, content),
         retries = 3, delays = [1000, 2000, 4000]
       )
       if (success) {
         useEditorStore.markSaved({ content })
         retryCount = 0
       } else {
         // 全部失败：toast「自动保存失败，请手动保存」
       }
     }
     isSaving = false
```

**退订（组件卸载）**：

```
return () => {
  clearTimeout(timer)
  // 不取消正在进行的 isSaving，避免半保存状态
}
```

### 3.3 `TitleBar` 增强

M2 仅显示文件名；M3 加入：

```
[●?] filename.md           [另存为] [设置]    // 设置按钮 M5 加入
```

- `●` dirty 圆点
  - `v-if="useEditorStore.dirty"`
  - 颜色：Naive UI primary（通过 CSS 变量或 inline style）
  - `aria-label="未保存"`
- `filename.md`：`useEditorStore.fileName`
- 外部状态徽标：M7-M8 加入（M3 不显示）

### 3.4 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/views/EditorView.jsx` | 调用 `useAutoSave(contentRef)` 并 watch 卸载 |
| `src/components/editor/TitleBar.jsx` | 加入圆点渲染逻辑 |
| `src/stores/useEditorStore.js` | `setContent(value)` 中：若 `value === lastSavedContent`，将 `dirty` 置为 `false`（容许 undo / programmatic 重置时圆点消失） |

---

## 4. 验收标准

### 4.1 功能验收

#### 自动保存

- [ ] 编辑器输入文字 → 等待 5 秒（默认）→ 自动写入磁盘
- [ ] 写入成功后 `useEditorStore.dirty = false`
- [ ] 连续输入 → 防抖生效（仅最后一次输入触发保存）
- [ ] 「新建文档」首次触发自动保存 → 自动走「另存为」流程（弹保存对话框）
- [ ] 「新建文档」首次保存成功后 → 文件句柄更新 + 标题栏文件名更新
- [ ] 「新建文档」首次保存用户取消 → dirty 保持 true
- [ ] 「打开文档」编辑后 → 自动保存直接写入原路径（不弹对话框）
- [ ] 编辑间隔 < 防抖时间（5s）→ 仅最后一次触发

#### 圆点指示

- [ ] 新建文档初始进入编辑器 → 圆点显示（`dirty=true`）
- [ ] 输入文字 → 圆点持续显示
- [ ] 自动保存成功 → 圆点消失
- [ ] 圆点颜色 = Naive UI primary（实测：light 主题下偏蓝紫；dark 主题下偏浅蓝）
- [ ] 圆点 `aria-label="未保存"`，屏幕阅读器能识别
- [ ] 圆点旁文件名正确（`useEditorStore.fileName`）

#### 失败处理（Phase 2 §9 #4）

- [ ] 写入失败一次 → toast「自动保存失败：<原因>，正在重试…」 + 重试
- [ ] 重试 1s 后再次失败 → 第二次 toast + 重试
- [ ] 重试 2s 后再次失败 → 第三次 toast + 重试
- [ ] 三次全部失败 → toast「自动保存失败，请手动保存」 + dirty 保持
- [ ] 重试中 `retryCount` 反映当前次数
- [ ] 重试成功 → toast 消失 + dirty 清零

#### 自动保存设置

- [ ] 设置 `useSettingsStore.autoSave = false` → 不再触发自动保存
- [ ] 重新开启 → 防抖重新工作
- [ ] 调整 `autoSaveInterval` 为 1s → 防抖时间 = 1s（实测）
- [ ] 调整为 30s → 防抖时间 = 30s

#### 内容回环检测

- [ ] vditor input → setContent → store 更新 → 不再触发 useAutoSave 重新调度（M3 通过 `value === lastSavedContent` 判断避免）

### 4.2 状态机

| 输入 | dirty 期望 |
| --- | --- |
| 进入编辑器（新建模式） | true |
| 进入编辑器（打开模式） | false |
| 编辑内容 | true |
| 自动保存成功 | false |
| 「保留我的编辑」分支（M7） | 保持 true |
| 「重新加载外部」（M7） | false |
| 文件删除（M8） | true（orphaned 下无法保存） |
| 「另存为」成功（M6） | false |

### 4.3 质量验收

- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过
- [ ] `npm run format` 通过
- [ ] 浏览器 console 无 vditor 警告（如 setValue 前后值不一致警告）

---

## 5. 参考

- 设计文档：[04-design.md §3.1](../04-design.md#31-useeditorstore) §5.2 §6.2
- 需求文档：[Phase 2 §5.1](../02-editor-and-experience.md#51-自动保存) §5.2 §9 #4 §9 #8