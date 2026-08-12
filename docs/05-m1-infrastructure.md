# 05 · M1 · 基础设施（Infrastructure）

> ✅ **已通过验收**（v1.1.3 最终交付）
> 第五阶段 · 里程碑 1 / 9
> 关联设计文档：[04-design.md §2 目录结构](../04-design.md#2-目录结构) / [§3 状态管理](../04-design.md#3-状态管理pinia-stores) / [§6.5 useUnsavedGuard](../04-design.md#65-useunsavedguardisdirtyref-beforeleavefn)
> 关联需求：[Phase 2 §9 #1](../02-editor-and-experience.md#91-phase-2-§9-原待澄清问题决议)（持久化） / [§9 #17](../02-editor-and-experience.md#91-phase-2-§9-原待澄清问题决议)（浏览器目标）

---

## 1. 目标

搭建项目骨架：新建目录、Pinia stores（`useEditorStore` + `useSettingsStore`）、路由配置、浏览器能力检测、本地持久化工具。为后续里程碑（M2-M9）提供基础设施。

---

## 2. 依赖

### 2.1 前置里程碑

无（首个里程碑）。

### 2.2 外部依赖

无新增包（沿用现有 Vue 3 / Pinia / Vue Router / Naive UI）。

---

## 3. 交付内容

### 3.1 新增文件

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `src/views/` | 目录 | 页面级组件（占位，下一里程碑填充） |
| `src/components/` | 目录 | 通用组件 |
| `src/components/common/` | 目录 | 跨场景通用组件 |
| `src/components/editor/` | 目录 | 编辑器相关组件（M2+ 填充） |
| `src/composables/` | 目录 | 组合式函数（M2+ 填充） |
| `src/utils/` | 目录 | 工具函数 |
| `src/styles/` | 目录 | 样式 |
| `src/stores/useEditorStore.js` | Pinia store | 编辑器状态（见 §3.2） |
| `src/stores/useSettingsStore.js` | Pinia store | 用户偏好（见 §3.3） |
| `src/router/routes.js` | 模块 | 路由定义（聚合到 `router/index.js`） |
| `src/components/common/BrowserGate.jsx` | 组件 | 浏览器能力检测 + 非 Chromium 提示 |
| `src/utils/browser.js` | 模块 | `isChromium()` / `hasFSAPI()` 等 |
| `src/utils/persistence.js` | 模块 | `localStorage` 安全读写（含降级） |
| `src/styles/index.css` | 样式 | 全局样式入口（可为空） |

### 3.2 `useEditorStore` 接口

```
state:
  fileHandle: FileSystemFileHandle | null      // 当前文件句柄
  fileName: 'untitled.md'                      // 文件名
  content: ''                                  // 当前内容
  dirty: true                                  // 未保存标志（新建时默认 true）
  externalState: 'clean'                       // 'clean' | 'pending' | 'orphaned'
  lastSavedContent: ''                         // 上次保存内容
  lastExternalModified: null                   // 上次轮询的 lastModified
getters:
  hasFileHandle        // fileHandle !== null
  displayName          // fileName + (dirty ? ' ●' : '')
actions:
  loadFromFile({ handle, content, name })      // 打开文件后调用
  setContent(value)                            // vditor input 触发
  markSaved({ content })                       // 保存成功后调用
  updateFileHandle({ handle, name })           // 另存为后调用
  setExternalState(state)                      // 外部状态变更
  markOrphaned()                               // 文件不可用
```

### 3.3 `useSettingsStore` 接口

```
state:
  theme: 'light'                              // 'light' | 'dark' | 'auto'
  autoSave: true
  autoSaveInterval: 5                         // 秒
  externalWatchEnabled: true
  externalWatchInterval: 10                   // 秒
persistence:
  key = 'md-editor-settings'
  写入：$subscribe 防抖 300ms
  启动恢复：main.js 中初始化时读取 + $patch
```

### 3.4 路由定义

| 路径 | 组件（占位） | 说明 |
| --- | --- | --- |
| `/` | `EntryView`（M2 填充） | 入口选择页 |
| `/editor` | `EditorView`（M2 填充） | 编辑器页 |

### 3.5 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/App.jsx` | 改造为 `<BrowserGate><router-view /></BrowserGate>` 结构 |
| `src/router/index.js` | 引入 `routes.js`，聚合为 `routes` 数组 |
| `src/main.js` | 增加 `useSettingsStore` 启动恢复逻辑（在 `app.mount` 之前 `$patch`） |
| `src/main.js` | 把 placeholder import 改为 `@/stores/counter` 之外的实际路径（若需要） |

---

## 4. 验收标准

### 4.1 功能验收

#### 目录与文件

- [x] `src/views/`、`src/components/`、`src/composables/`、`src/utils/`、`src/styles/` 五个目录均已创建（可为空，但需存在）
- [x] `src/components/common/` 与 `src/components/editor/` 子目录已创建
- [x] `src/stores/useEditorStore.js`、`src/stores/useSettingsStore.js`、`src/router/routes.js` 已创建

#### useEditorStore

- [x] 默认初始值与 §3.2 一致
- [x] `setContent(value)` 同步更新 `content` 并将 `dirty` 置为 `true`（除非 `value === lastSavedContent`）
- [x] `markSaved({ content })` 清 `dirty`，更新 `lastSavedContent`
- [x] `updateFileHandle({ handle, name })` 更新 `fileHandle` + `fileName`，**不**改变 `dirty`
- [x] `loadFromFile({ handle, content, name })` 重置 store：`dirty=false`、`externalState='clean'`、`lastExternalModified=null`，更新句柄 + 文件名 + 内容 + lastSavedContent
- [x] `displayName` 在 `dirty=true` 时返回 `"<filename> ●"`

#### useSettingsStore

- [x] 默认值与 §3.3 一致
- [x] 任一字段变更后 300ms 内写入 `localStorage['md-editor-settings']`（JSON 序列化）
- [x] 应用启动时（`main.js` 中）：若 `localStorage` 中存在 key，则 `JSON.parse` + `$patch`；解析失败时回退默认值 + console.warn
- [x] 字段 schema 与 §3.3 完全一致（`theme` 仅允许三个值，其他字段有类型校验）

#### 路由

- [x] `routes` 数组含 `/` 与 `/editor` 两条
- [x] 路由懒加载（`() => import('@/views/EntryView.jsx')`）
- [x] 浏览器访问 `/` 与 `/editor` 不报错（即使组件是 placeholder）

#### BrowserGate

- [x] 检测 `window.showOpenFilePicker && window.showSaveFilePicker`
- [x] 检测失败时显示「请使用 Chrome / Edge 获得完整体验」提示
- [x] 检测通过时不显示提示，直接渲染 `router-view`
- [x] 不阻断路由跳转（非阻塞）

#### App.jsx

- [x] 不再渲染 Phase 1 占位按钮
- [x] 结构：`<BrowserGate><router-view /></BrowserGate>`
- [x] `useSettingsStore` 在 `main.js` 初始化后能正确读到主题

### 4.2 持久化验收

- [x] 设置 `useSettingsStore.theme='dark'` → 等待 300ms → `localStorage['md-editor-settings']` 含 `{"theme":"dark",...}`
- [x] 刷新页面后 `useSettingsStore.theme` 恢复为 `'dark'`
- [x] 手动改坏 `localStorage['md-editor-settings']`（如 `"invalid json"`）→ 应用启动正常，store 回退默认值，console.warn 一条

### 4.3 浏览器兼容验收

- [x] Chrome / Edge / Opera / Brave 中：BrowserGate 不显示提示
- [x] Firefox / Safari 中：BrowserGate 显示「请使用 Chrome / Edge」提示（手动测试，或在 DevTools 中模拟）

### 4.4 质量验收

- [x] `npm run lint` 通过
- [x] `npm run build` 通过
- [x] `npm run format` 通过（运行后无文件改动）

---

## 5. 参考

- 设计文档：[04-design.md §2](../04-design.md#2-目录结构) §3 §6.5
- 需求文档：[02-editor-and-experience.md §9.1 #1](../02-editor-and-experience.md) §9.2 #17
- 项目约定：[AGENTS.md §5.2](../AGENTS.md#52-路径与导入) §5.7