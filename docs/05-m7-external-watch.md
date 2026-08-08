# 05 · M7 · 外部修改检测（External Modification Detection）

> 第五阶段 · 里程碑 7 / 9
> 关联设计文档：[04-design.md §6.3 useExternalWatcher](../04-design.md#63-useexternalwatcherhandleref-contentref) / [§5.4 ExternalChangeDialog](../04-design.md#54-externalchangedialog) / [§7.4 外部修改检测流程](../04-design.md#74-外部修改检测)
> 关联需求：[Phase 3 §4.2 外部修改检测](../03-file-capabilities.md#42-外部修改检测-external-modification-detection) / [§9 #10 仅首次确认](../03-file-capabilities.md) / [§9 #13 仅下次保存前提示](../03-file-capabilities.md)

---

## 1. 目标

实现后台轮询检测打开文件的外部修改，提供「保留 / 重载 / 稍后」三选项对话框，处理「外部待处理」状态机与首次保存二次确认。本里程碑是 Phase 3 §4.2 的核心实现。

---

## 2. 依赖

### 2.1 前置里程碑

- **M2**：`useFileSystem.getMetadata` 已实现
- **M3**：dirty 状态机 + 自动保存
- **M5**：`useSettingsStore.externalWatchEnabled` / `externalWatchInterval`

### 2.2 外部依赖

无新增（Naive UI `useDialog` 或 `NModal` 用于对话框 UI）。

---

## 3. 交付内容

### 3.1 新增文件

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `src/composables/useExternalWatcher.js` | composable | 后台轮询 + 三选项逻辑（见 §3.2） |
| `src/components/editor/ExternalChangeDialog.jsx` | 组件 | 「保留 / 重载 / 稍后」对话框（见 §3.3） |

### 3.2 `useExternalWatcher` 接口

```ts
useExternalWatcher(handleRef: Ref<FileSystemFileHandle | null>)
  → {
    externalState: Ref<'clean' | 'pending' | 'orphaned'>,
    startWatch(),
    stopWatch(),
    checkNow(): Promise<void>,
  }
```

**核心逻辑**：

```
startWatch():
  // 立即检查一次
  checkNow()

  // 定时轮询
  intervalId = setInterval(() => {
    if (useSettingsStore.externalWatchEnabled) checkNow()
  }, useSettingsStore.externalWatchInterval * 1000)

  // 窗口聚焦时立即检查
  focusHandler = () => checkNow()
  window.addEventListener('focus', focusHandler)

checkNow():
  try {
    metadata = await useFileSystem.getMetadata(handleRef.value)
  } catch (err) {
    // M8 处理：NotFoundError / SecurityError → markOrphaned
    return  // M7 暂不处理外部异常，仅静默
  }

  if (metadata.lastModified === lastExternalModified) return  // 无变化
  lastExternalModified = metadata.lastModified

  // 有变化
  if (!useEditorStore.dirty) {
    // 自动重载
    await reloadFromHandle()
  } else {
    // dirty=true → 弹对话框
    showDialog.value = true  // 触发 ExternalChangeDialog 渲染
  }

reloadFromHandle():
  content = await handleRef.value.getFile().then(f => f.text())
  useEditorStore.markSaved({ content })  // 清 dirty，更新 lastSavedContent
  vditor.setValue(content)  // 通知 vditor
```

**退订**：

```
stopWatch():
  clearInterval(intervalId)
  window.removeEventListener('focus', focusHandler)
```

### 3.3 `ExternalChangeDialog` 行为

```
props:
  show: boolean
  onResolve: (choice: 'keep' | 'reload' | 'later') => void
内容：
  <NModal :show="show">
    <NCard>
      <h3>文件已被外部修改</h3>
      <p>磁盘上的文件 <code>{{ fileName }}</code> 已被外部程序修改。</p>
      <p>请选择如何处理：</p>
      <NSpace>
        <NButton @click="onResolve('keep')">保留我的编辑</NButton>
        <NButton @click="onResolve('reload')">重新加载外部</NButton>
        <NButton @click="onResolve('later')" tertiary>稍后处理</NButton>
      </NSpace>
    </NCard>
  </NModal>
```

**与 store 的交互**：

```
- 'keep'  → useEditorStore.setExternalState('pending')
- 'reload' → await reloadFromHandle() → useEditorStore.setExternalState('clean')
- 'later' → 关闭弹窗，保留 current externalState（pending 或 clean）
```

### 3.4 「保留我的编辑」后续保存逻辑

修改 M3 的 `useAutoSave.triggerSave`：

```
triggerSave():
  isSaving = true
  if (useEditorStore.externalState === 'pending') {
    // Phase 3 §9 #10：仅首次确认
    if (!firstOverrideConfirmed) {
      confirmed = await showOverrideConfirmDialog()  // Naive UI NModal
      if (!confirmed) {
        isSaving = false
        return  // 用户取消，不保存
      }
      firstOverrideConfirmed = true  // 仅一次
    }
    // 静默写入
    await useFileSystem.saveFile(handle, content)
    useEditorStore.markSaved({ content })
    // 注意：externalState 保持 'pending'，直到下次轮询或重载
  } else {
    // 普通保存
  }
```

> 实现细节：`firstOverrideConfirmed` 应在 `loadFromFile` 时重置；在 M7 期间无需独立持久化。

### 3.5 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/views/EditorView.jsx` | 调用 `useExternalWatcher(handleRef)`（仅 fileHandle 非空时启动） |
| `src/composables/useAutoSave.js` | 加入「保留」分支的首次保存二次确认（M3 的扩展） |
| `src/components/editor/EditorView.jsx`（如有需要） | 在模板中加入 `<ExternalChangeDialog>` |

---

## 4. 验收标准

### 4.1 功能验收

#### 轮询机制

- [ ] 文件打开后，10s（默认）后第一次轮询
- [ ] 轮询间隔可由 `useSettingsStore.externalWatchInterval` 调整
- [ ] 关闭 `externalWatchEnabled` → 停止轮询；开启 → 恢复
- [ ] 切换 tab / 最小化窗口 → 重新聚焦时立即检查一次
- [ ] 离开编辑器路由 → `stopWatch` 被调用
- [ ] 重新进入 → `startWatch` 被调用，状态正确

#### 检测外部修改

- [ ] 用另一个编辑器修改文件 → 10s 内检测到 `lastModified` 变化
- [ ] 检测到变化 + dirty=false → 自动重载（无需用户操作）
- [ ] 自动重载后 dirty=false，内容与外部一致
- [ ] 检测到变化 + dirty=true → 弹出 ExternalChangeDialog

#### 三选项逻辑

- [ ] 「保留我的编辑」 → `externalState = 'pending'`，弹窗关闭
- [ ] 「重新加载外部」 → 内容更新 + dirty=false + `externalState = 'clean'`
- [ ] 「稍后处理」 → 弹窗关闭，`externalState` 保持当前值

#### 「保留」后的保存二次确认

- [ ] 选「保留我的编辑」后，下次自动保存（5s 后）→ 弹窗「外部已修改，继续保存将覆盖外部内容？」（确认 / 取消）
- [ ] 用户确认 → 写入成功，dirty=false
- [ ] 用户取消 → 不写入，dirty 保持
- [ ] 首次确认后，下次保存**不再**弹窗（§9 #10 决议）

#### 「稍后」后的行为

- [ ] 选「稍后处理」后，**不**在轮询中重复弹窗（§9 #13 决议）
- [ ] 仅在下次主动保存（自动或手动）前弹窗一次
- [ ] 弹窗逻辑与「保留」分支的二次确认一致

### 4.2 性能与边界

- [ ] 轮询失败（getMetadata 抛错）→ M7 静默，M8 处理
- [ ] 多次快速轮询 → 节流生效（interval 至少 1s 一次，避免 IO 过频）
- [ ] 文件大小 > 1MB 时重载有 toast 提示「正在加载大文件」

### 4.3 状态机

| 状态 | 显示 | 下次轮询 |
| --- | --- | --- |
| `clean` | 无弹窗 | 无变化跳过；有变化按 dirty 走自动重载/弹窗 |
| `pending` | 无弹窗 | 无变化跳过；有变化**不弹窗**（避免重复打扰） |
| `orphaned` | TitleBar 徽标 | M8 处理 |

### 4.4 质量验收

- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过
- [ ] `npm run format` 通过
- [ ] console 无内存泄漏警告（轮询监听器正确清理）
- [ ] 多次进入/离开编辑器后，无重复 `setInterval` 累积

---

## 5. 参考

- 设计文档：[04-design.md §5.4](../04-design.md#54-externalchangedialog) §6.3 §7.4
- 需求文档：[Phase 3 §4.2 F-EM-1~11](../03-file-capabilities.md#42-外部修改检测-external-modification-detection) / [§9 #10 #13](../03-file-capabilities.md)