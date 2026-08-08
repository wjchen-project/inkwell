# 05 · M6 · 另存为（Save As）

> 第五阶段 · 里程碑 6 / 9
> 关联设计文档：[04-design.md §4 路由设计](../04-design.md#4-路由设计) / [§6.1 useFileSystem.saveAsFile](../04-design.md#61-usefilesystem) / [§7.3 保存/另存为流程](../04-design.md#73-保存--另存为)
> 关联需求：[Phase 3 §4.1 另存为](../03-file-capabilities.md#41-另存为-save-as) / [§9 #12 另存为后 dirty 清零](../03-file-capabilities.md)

---

## 1. 目标

实现「另存为」功能：把当前内容写入新路径，更新文件句柄，并清 dirty。让用户能创建副本或将文档放到新文件夹，而无需手动复制。

---

## 2. 依赖

### 2.1 前置里程碑

- **M2**：`useFileSystem.saveAsFile` 已实现 + `VditorEditor` + `EditorView`
- **M3**：dirty 状态机就绪
- **M5**：`TitleBar` 加入「设置」按钮（顺便加「另存为」按钮）

### 2.2 外部依赖

无新增。

---

## 3. 交付内容

### 3.1 新增文件

无（功能通过 M2 已有的 composables + M5 已有的 TitleBar 改造实现）。

### 3.2 `useFileSystem.saveAsFile` 增强

```
saveAsFile(content, suggestedName) → Promise<{ handle, name } | null>

行为：
  1. 调用 showSaveFilePicker({ suggestedName, types: [...] })
  2. 用户选择路径 + 文件名
  3. 创建 writable → write(content) → close()
  4. 返回新句柄与最终文件名
  5. 用户取消 → 返回 null
  6. 写入失败 → toast「另存为失败：<原因>」+ 返回 null
```

> M2 已实现 `saveAsFile`。M6 仅需在调用方正确接入并更新 store。

### 3.3 `TitleBar` 增加按钮

```
[●?] filename.md           [另存为] [设置]
```

- 「另存为」按钮（图标或文字按钮）
- `onClick` → 调用 `useFileSystem.saveAsFile(...)` → 成功后 `useEditorStore.updateFileHandle({...})` + `markSaved({...})`
- 禁用条件：`content === lastSavedContent`（无内容变化时禁用）— 可选

### 3.4 快捷键 `Ctrl/Cmd+Shift+S`

在 `EditorView` 顶层监听：

```
onMounted / onUnmounted:
  handler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault()
      handleSaveAs()
    }
  }
  window.addEventListener('keydown', handler)
```

> 注意：vditor 可能占用某些快捷键（如 `Ctrl+S`）。`Ctrl+Shift+S` 不与 vditor 冲突，优先使用。

### 3.5 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/components/editor/TitleBar.jsx` | 加入「另存为」按钮 + 点击处理 |
| `src/views/EditorView.jsx` | 加入 `Ctrl/Cmd+Shift+S` 监听（onMounted/onUnmounted） |
| `src/stores/useEditorStore.js` | 确认 `updateFileHandle` + `markSaved` 联动（已在 M1 实现） |

---

## 4. 验收标准

### 4.1 功能验收

#### UI 触发

- [ ] 「另存为」按钮在 `TitleBar` 显示
- [ ] 点击「另存为」→ 弹系统保存对话框
- [ ] 默认文件名 = 当前 `fileName`（`untitled.md` 或实际文件名）
- [ ] 文件类型过滤器显示 `.md` / `.markdown`

#### 快捷键触发

- [ ] `Ctrl+Shift+S`（Linux / Windows）触发另存为
- [ ] `Cmd+Shift+S`（macOS）触发另存为
- [ ] 在 vditor 编辑区聚焦时也响应
- [ ] 不与 vditor 内置快捷键冲突（实测）

#### 保存行为

- [ ] 选择新路径 + 文件名 → 写入成功 → 弹窗关闭
- [ ] 写入成功后 `useEditorStore.fileHandle` 更新为新句柄
- [ ] 写入成功后 `useEditorStore.fileName` 更新为新文件名
- [ ] 写入成功后 `dirty = false`，圆点消失
- [ ] 写入成功后 `lastSavedContent` 更新

#### 取消行为

- [ ] 用户取消保存对话框 → 不弹错误提示
- [ ] 取消后 `fileHandle` / `fileName` / `dirty` 均不变

#### 异常

- [ ] 写入失败（磁盘满 / IO 错误）→ toast「另存为失败：<原因>」
- [ ] 失败后状态保留（脏数据未丢失）
- [ ] 用户可在 dirty=true 状态下继续尝试另存为

#### 「另存为」到原路径

- [ ] 「另存为」对话框中选择的路径与当前 `fileHandle` 一致 → 写入成功，效果等同于普通保存
- [ ] 不会创建重复文件（同名同路径会覆盖）

### 4.2 与其他里程碑的联动

- [ ] M3 自动保存通道感知新句柄：另存为后下一次自动保存写入新路径（不再弹「首次保存」对话框）
- [ ] M4 关闭拦截不影响另存为流程
- [ ] M7 外部修改检测对另存为后的新文件立即生效
- [ ] M8 orphaned 状态下另存为仍可用（写入新路径会解除 orphaned）

### 4.3 边界

- [ ] 「新建文档」（无 fileHandle）→ 「另存为」成功 → fileHandle 正常建立
- [ ] 「打开文档」（有 fileHandle）→ 「另存为」到新路径 → 原文件不被修改（实测磁盘）
- [ ] 内容为空时「另存为」→ 弹窗、写入空文件、不报错

### 4.4 质量验收

- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过
- [ ] `npm run format` 通过
- [ ] 快捷键不触发两次（防抖或 `e.preventDefault()`）

---

## 5. 参考

- 设计文档：[04-design.md §6.1](../04-design.md#61-usefilesystem) §7.3
- 需求文档：[Phase 3 §4.1 F-SA-1~8](../03-file-capabilities.md#41-另存为-save-as) / [§9 #12](../03-file-capabilities.md)