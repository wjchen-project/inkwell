# 05 · M4 · 关闭拦截（Close & Navigation Guard）

> 第五阶段 · 里程碑 4 / 9
> 关联设计文档：[04-design.md §6.5 useUnsavedGuard](../04-design.md#65-useunsavedguardisdirtyref-beforeleavefn) / [§7.5 关闭拦截流程](../04-design.md#75-关闭拦截phase-2-§53--phase-3-§43)
> 关联需求：[Phase 2 §5.3 关闭/刷新/退出提示](../02-editor-and-experience.md#53-关闭--刷新--退出提示) / [§9 #5 只走原生 beforeunload](../02-editor-and-experience.md) / [§9 #6 不拦截路由切换](../02-editor-and-experience.md) / [Phase 3 §4.3 新建/打开时未保存拦截](../03-file-capabilities.md#43-新建--打开时的未保存拦截) / [§9 #18 浏览器原生拦截](../03-file-capabilities.md)

---

## 1. 目标

实现浏览器原生 `beforeunload` 拦截，覆盖**标签页关闭/刷新**与**应用内路由切换**（点击「新建 / 打开」）两种场景，与 Phase 2 §9 #5 / Phase 3 §9 #18 决议一致——**仅走原生 beforeunload，不做自定义对话框**。

---

## 2. 依赖

### 2.1 前置里程碑

- **M3**：自动保存就绪（拦截前需等待保存完成）

### 2.2 外部依赖

无新增。

---

## 3. 交付内容

### 3.1 新增文件

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `src/composables/useUnsavedGuard.js` | composable | 关闭 + 路由拦截（见 §3.2） |

### 3.2 `useUnsavedGuard` 接口

```ts
useUnsavedGuard(isDirtyRef: Ref<boolean>, isSavingRef: Ref<boolean>)
  → {
    installGuard(),
    uninstallGuard(),
  }
```

**核心逻辑**：

```
installGuard():
  // 1. beforeunload 监听（标签关闭 / 刷新）
  beforeUnloadHandler = (e) => {
    if (!isDirtyRef.value) return  // 放行
    e.preventDefault()
    e.returnValue = ''  // 触发浏览器原生提示
  }
  window.addEventListener('beforeunload', beforeUnloadHandler)

  // 2. 路由切换拦截
  removeRouterGuard = router.beforeEach(async (to, from) => {
    // 仅在编辑器页面 (from.path === '/editor') 拦截
    if (from.path !== '/editor') return true
    if (to.path === '/editor') return true  // 同一页面不拦截
    if (!isDirtyRef.value) return true

    // 等待自动保存完成
    if (isSavingRef.value) {
      await waitUntil(() => !isSavingRef.value, timeout=10s)
    }

    // 重新判断（保存后可能不再 dirty）
    if (!isDirtyRef.value) return true

    // 触发原生 beforeunload 模拟
    const confirmed = await simulateBeforeUnload()
    return confirmed
  })

uninstallGuard():
  window.removeEventListener('beforeunload', beforeUnloadHandler)
  removeRouterGuard()
```

**simulateBeforeUnload 实现**（Q-18 决策）：

```js
function simulateBeforeUnload() {
  return new Promise((resolve) => {
    // 现代浏览器对 e.preventDefault() 在 beforeunload 中的处理是显示原生确认框
    // 但 beforeunload 不能由代码触发。需用其他机制：
    // 方案：在路由切换时 dispatch 一个事件，让 beforeunload 处理器先运行
    const event = new Event('beforeunload', { cancelable: true })
    const result = window.dispatchEvent(event)
    if (!result) {
      // 用户取消（在原生 beforeunload 中取消等价于 false）
      resolve(false)
    } else {
      resolve(true)
    }
  })
}
```

> 注：方案 A（dispatchEvent 模拟 beforeunload）在浏览器中通常**不会**弹出原生 UI；浏览器安全策略禁止脚本主动弹出该类提示。实际实现可能需要：
> - 方案 B：自定义 `useDialog()` 模态确认框（与 §9 #18 决策略冲突，但浏览器限制使方案 A 不可行时作为后备）
> - 实施时根据实际浏览器行为决定方案 A 或 B

**waitUntil 实现**：

```js
function waitUntil(predicate, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeout) return resolve()  // 超时放行
      setTimeout(check, 100)
    }
    check()
  })
}
```

### 3.3 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/views/EditorView.jsx` | 调用 `useUnsavedGuard(isDirtyRef, isSavingRef)`，在 `onMounted` 安装，`onUnmounted` 卸载 |
| `src/router/routes.js` | 路由定义无需改；拦截逻辑通过 `useUnsavedGuard` 在 `router.beforeEach` 注册 |

---

## 4. 验收标准

### 4.1 功能验收

#### 标签关闭 / 刷新（beforeunload）

- [ ] dirty=false 时关闭标签 → 直接关闭，无提示
- [ ] dirty=false 时刷新 → 直接刷新
- [ ] dirty=true 时关闭标签 → 浏览器原生「离开 / 取消」弹窗
- [ ] dirty=true 时刷新 → 浏览器原生「离开 / 取消」弹窗
- [ ] 用户选「取消」→ 留在当前页
- [ ] 用户选「离开」→ 标签关闭 / 刷新执行
- [ ] 自动保存进行中触发关闭 → 等待保存完成后再判断 dirty（保存成功 → 直接放行；保存失败 → 仍拦截）

#### 应用内路由切换

- [ ] `/editor` 路由内部 query 变化（如 `?mode=new` → `?mode=open`）不触发拦截
- [ ] 编辑器页面 → 入口页（`/editor` → `/`）：dirty=false 时直接跳转
- [ ] 编辑器页面 → 入口页：dirty=true 时弹出确认（实现见 §3.2 方案 A 或 B）
- [ ] 用户确认离开 → 跳转执行
- [ ] 用户取消 → 留在编辑器
- [ ] 自动保存进行中 → 等待完成再判断（最长 10s 超时放行）

#### 卸载清理

- [ ] 离开 `/editor` 路由 → `uninstallGuard` 被调用
- [ ] 再次进入 → `installGuard` 被调用（事件不重复）
- [ ] 多次进入/离开 → console 无重复监听警告

### 4.2 边界场景

- [ ] `isSaving=true` 且 `dirty=false`（保存刚成功）→ 放行（无需拦截）
- [ ] `isSaving=true` 且 `dirty=true`（保存失败）→ 拦截，等待超时后放行（避免卡死）
- [ ] `isDirtyRef` 在异步等待期间变为 false（保存成功）→ 放行
- [ ] 多个 tab 同时存在 → 各 tab 独立拦截（不同 store 实例）

### 4.3 浏览器兼容性

- [ ] Chromium：原生 beforeunload 弹窗正常显示
- [ ] 路由切换的二次确认在 Chromium 中表现符合预期（方案 A 实际行为需实测）
- [ ] 若方案 A 在 Chrome 中不弹原生提示，则实施方案 B（自定义 `useDialog()`）

### 4.4 质量验收

- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过
- [ ] `npm run format` 通过
- [ ] console 无「重复注册监听器」警告
- [ ] console 无「removeEventListener 未找到对应监听器」警告

---

## 5. 参考

- 设计文档：[04-design.md §6.5](../04-design.md#65-useunsavedguardisdirtyref-beforeleavefn) §7.5
- 需求文档：[Phase 2 §5.3](../02-editor-and-experience.md#53-关闭--刷新--退出提示) / [§9 #5 #6](../02-editor-and-experience.md) / [Phase 3 §4.3](../03-file-capabilities.md#43-新建--打开时的未保存拦截) / [§9 #18](../03-file-capabilities.md)