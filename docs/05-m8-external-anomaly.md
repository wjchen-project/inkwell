# 05 · M8 · 外部异常处理（External Anomaly Handling）

> 第五阶段 · 里程碑 8 / 9
> 关联设计文档：[04-design.md §8 错误处理](../04-design.md#8-错误处理策略) / [§6.3 useExternalWatcher](../04-design.md#63-useexternalwatcherhandleref-contentref)
> 关联需求：[Phase 3 §4.2 F-EM-7~9](../03-file-capabilities.md#42-外部修改检测-external-modification-detection) / [§9 #11 外部删除报错+另存为](../03-file-capabilities.md) / [§9 #14 外部移动/重命名](../03-file-capabilities.md)

---

## 1. 目标

处理打开的文件被外部**删除 / 移动 / 重命名 / 权限撤销**时的异常，统一收敛到 `externalState = 'orphaned'`，禁用常规保存，强制用户「另存为」恢复。本里程碑补齐 M7 仅处理「修改」而未处理「消失」的缺口。

---

## 2. 依赖

### 2.1 前置里程碑

- **M7**：外部修改检测基础设施 + 状态机
- **M6**：另存为已实现（orphaned 下唯一恢复路径）

### 2.2 外部依赖

无新增。

---

## 3. 交付内容

### 3.1 新增文件

无新文件（扩展现有 composables / store / 组件）。

### 3.2 `useExternalWatcher` 错误处理扩展

```
checkNow():
  try {
    metadata = await useFileSystem.getMetadata(handleRef.value)
  } catch (err) {
    if (err.name === 'NotFoundError') {
      // 文件被外部删除 / 移动 / 重命名
      useEditorStore.markOrphaned()
      stopWatch()
      toast('文件已被删除 / 移动 / 重命名，请另存为')
    } else if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      // 权限被撤销
      useEditorStore.markOrphaned()
      stopWatch()
      toast('文件权限已被撤销，请重新授权或另存为')
    } else {
      // 其他错误：toast + 跳过本轮，不停止轮询
      toast('外部文件检查失败：<原因>')
    }
    return
  }

  // ... 原有 lastModified 对比逻辑
```

### 3.3 `useFileSystem` 错误分类

明确错误到异常的映射（在 M2 已有基础上细化）：

| 错误名 | 含义 | 处理 |
| --- | --- | --- |
| `AbortError` | 用户取消 | 静默 |
| `NotFoundError` | 文件被删除 / 路径不存在 | 抛给调用方，标记 orphaned |
| `NotAllowedError` | 权限被撤销 | 抛给调用方，标记 orphaned |
| `SecurityError` | 同上 | 抛给调用方，标记 orphaned |
| 其他 | IO 错误 | toast + throw |

### 3.4 `useEditorStore.markOrphaned()` 实现确认

```
markOrphaned():
  externalState = 'orphaned'
  // fileHandle 仍保留，但任何写入都会失败
```

### 3.5 `TitleBar` 外部状态徽标

```
[●?] filename.md [⚠ 文件不可用]      [另存为] [设置]
                              ↑ 仅在 orphaned 时显示
```

- 「文件不可用」徽标：橙色 / 红色（Naive UI warning 或 error）
- 鼠标悬停 tooltip：「文件已被删除 / 移动 / 重命名 / 权限被撤销，请另存为」
- `aria-label="文件不可用"`

### 3.6 常规保存禁用

```
useEditorStore 派生 getter:
  canSaveNormally = computed(() => {
    return externalState !== 'orphaned' && fileHandle !== null
  })
```

在 vditor 工具栏的「保存」按钮 / `EditorView` 任何常规保存入口处根据 `canSaveNormally` 禁用。

### 3.7 orphaned 下的「另存为」特殊处理

```
saveAsFile(content, suggestedName):
  // M2 已有逻辑
  // M8 额外：成功后清理 orphaned 状态
  result = await useFileSystem.saveAsFile(content, suggestedName)
  if (result) {
    useEditorStore.updateFileHandle(result)
    useEditorStore.markSaved({ content })
    useEditorStore.setExternalState('clean')  // 解除 orphaned
    // 可选：重启外部轮询
    startWatch()  // 在新句柄下重新监听
  }
```

### 3.8 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/composables/useExternalWatcher.js` | 加入 `catch` 分支（NotFoundError / SecurityError → markOrphaned + stopWatch） |
| `src/composables/useFileSystem.js` | 细化错误分类（M2 基础上） |
| `src/stores/useEditorStore.js` | 确认 `markOrphaned` + `canSaveNormally` getter |
| `src/components/editor/TitleBar.jsx` | 加入「文件不可用」徽标（`v-if="externalState === 'orphaned'"`） |
| `src/views/EditorView.jsx` | orphaned 下禁用常规保存入口；「另存为」后重启 watch |
| `src/composables/useAutoSave.js` | orphaned 下不触发自动保存（直接跳过或提示） |

---

## 4. 验收标准

### 4.1 功能验收

#### 外部删除

- [ ] 打开文件 A → 用 `rm` 或 Finder 删除 A → 下次轮询（≤10s）检测到 `NotFoundError`
- [ ] 检测到后：`externalState = 'orphaned'`，停止轮询
- [ ] TitleBar 显示「文件不可用」徽标
- [ ] 弹出 toast「文件已被删除 / 移动 / 重命名，请另存为」
- [ ] 常规保存按钮禁用
- [ ] 「另存为」按钮仍可用
- [ ] 「另存为」成功 → `externalState = 'clean'`，徽标消失，轮询恢复

#### 外部移动 / 重命名

- [ ] 文件被 `mv` 到其他路径 → handle 仍指向原路径 → NotFoundError → 同上处理
- [ ] 文件被重命名（同目录）→ 同上

#### 权限撤销

- [ ] 在浏览器设置中撤销文件权限 → 下次轮询 → `NotAllowedError` / `SecurityError`
- [ ] 处理流程与删除一致

#### orphaned 下的写行为

- [ ] 触发自动保存 → 检测 `externalState === 'orphaned'` → 跳过保存
- [ ] 手动 vditor 工具栏「保存」→ 按钮禁用
- [ ] 任何路径调用 `useFileSystem.saveFile(handle, content)` → 抛错 → toast

#### 「另存为」恢复

- [ ] orphaned 状态下点击「另存为」→ 弹保存对话框
- [ ] 选择新路径 → 写入成功 → 新句柄建立
- [ ] 新句柄建立后：`externalState = 'clean'`，徽标消失
- [ ] 外部轮询在新句柄下重启（10s 后第一次检查）
- [ ] 用户继续编辑 → 正常自动保存

### 4.2 边界场景

- [ ] orphaned 状态下用户手动关闭标签 → `beforeunload` 正常提示（与 M4 一致）
- [ ] orphaned 状态下用户点击「新建 / 打开」（路由切换）→ M4 拦截生效
- [ ] orphaned 状态下刷新页面 → 重新进入 → `fileHandle` 失效（浏览器侧权限丢失）→ 启动时检测失败 → 进入空白编辑器或 fallback

### 4.3 性能与稳定性

- [ ] 反复 trigger `markOrphaned` → 状态幂等（多次调用结果一致）
- [ ] stopWatch 后 `setInterval` 被清除，浏览器无「未清理 timer」警告
- [ ] toast 出现频率合理（不要每次轮询都 toast — orphaned 后停止轮询，不再 toast）

### 4.4 质量验收

- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过
- [ ] `npm run format` 通过
- [ ] 无 console 异常（孤儿状态期间也不应有）

---

## 5. 参考

- 设计文档：[04-design.md §6.3 §8](../04-design.md#63-useexternalwatcherhandleref-contentref)
- 需求文档：[Phase 3 §4.2 F-EM-7~9](../03-file-capabilities.md#42-外部修改检测-external-modification-detection) / [§9 #11 #14](../03-file-capabilities.md)
- File System Access API：[NotFoundError 规范](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker#exceptions)