# 04 · 系统实现设计（第四阶段）设计文档

> 本文档定义 `inkwell` 第四阶段的设计方案：
> 在 Phase 1-3 需求文档 + 澄清决议的基础上，明确**架构、目录结构、状态管理、关键组件、Composables、关键流程、实现里程碑**，
> 为后续编码提供明确方向。
>
> **本阶段不引入新需求**，仅落实现有决议。Phase 2 §9 / Phase 3 §8 中的决议在本设计中以「§X #Y」标注追溯。

---

## 1. 架构概览

### 1.1 分层结构

```
┌──────────────────────────────────────────────────────┐
│  表现层 (Vue 3 + JSX)                                 │
│  ┌────────────┬────────────┬──────────────────┐      │
│  │ EntryView  │ EditorView │ SettingsDrawer   │      │
│  │ (新建/打开) │ (vditor)   │  (侧滑)           │      │
│  └────────────┴────────────┴──────────────────┘      │
│                       │                               │
│  ──────────────────── │ ─────────────────────────────│
│                       ▼                               │
│  状态层 (Pinia)                                       │
│  ┌─────────────────┬──────────────────┐              │
│  │ useEditorStore  │ useSettingsStore │              │
│  │ (单文档编辑器)   │ (用户偏好)        │              │
│  └─────────────────┴──────────────────┘              │
│                       │                               │
│  ──────────────────── │ ─────────────────────────────│
│                       ▼                               │
│  服务层 (Composables / Utils)                         │
│  ┌────────────┬────────────┬────────────────┐        │
│  │ useFileSys │ useAutoSave│ useExtWatcher  │        │
│  │ useTheme   │ useUnsavedGuard           │        │
│  └────────────┴────────────┴────────────────┘        │
│                       │                               │
│  ──────────────────── │ ─────────────────────────────│
│                       ▼                               │
│  浏览器能力                                          │
│  ┌────────────┬────────────┬────────────────┐        │
│  │ File Sys   │ beforeunload│ localStorage   │        │
│  │ Access API │             │                │        │
│  └────────────┴────────────┴────────────────┘        │
└──────────────────────────────────────────────────────┘
```

### 1.2 关键设计原则

- **vditor 是内容真理之源（Source of Truth）**：vditor 内部维护富文本状态与 HTML / Markdown 转换；Vue 层只通过 `getValue()` / `setValue()` 与之交互，**不**做"双向绑定 + 同步"的中间层（避免转换回环）。
- **Pinia 是跨组件 / 跨 Composables 的状态总线**：编辑器状态、设置偏好、UI 状态均通过 store 共享。
- **Composables 是副作用封装**：自动保存、外部轮询、主题切换、未保存拦截等副作用逻辑全部抽到 composables 中，便于复用与测试。
- **路由只承担页面切换**：当前 / 编辑页两态由路由区分；无 Tab 状态需要持久化在路由中（见 Phase 3 §9 #9）。

---

## 2. 目录结构

在 AGENTS.md §3 的基础上，新增以下目录与文件：

```
src/
├── main.js                     # 现有：初始化 Pinia + Router + Plugins
├── App.jsx                     # 改造：改为 router-view 容器
├── plugins/                    # 现有
│   ├── index.js
│   └── naive.js
├── router/
│   ├── index.js                # 现有：createWebHistory + 路由聚合
│   └── routes.js               # 新增：路由定义
├── stores/
│   ├── useEditorStore.js       # 新增：编辑器状态
│   ├── useSettingsStore.js     # 新增：用户偏好
│   └── counter.js              # 现有：保留作示例
├── views/                      # 新增目录
│   ├── EntryView.jsx           # "/" 入口选择
│   └── EditorView.jsx          # "/editor" 编辑器
├── components/                 # 新增目录
│   ├── editor/
│   │   ├── VditorEditor.jsx    # vditor 包装（生命周期 + 事件）
│   │   ├── TitleBar.jsx        # 顶部标题栏（含 dirty 圆点）
│   │   ├── SettingsDrawer.jsx  # 设置抽屉（Phase 2 §9 #3）
│   │   └── ExternalChangeDialog.jsx  # 外部修改对话框
│   └── common/
│       └── BrowserGate.jsx     # 浏览器能力检测（§9 #17）
├── composables/                # 新增目录
│   ├── useFileSystem.js        # File System Access API 封装
│   ├── useAutoSave.js          # 自动保存
│   ├── useExternalWatcher.js   # 外部修改轮询
│   ├── useTheme.js             # 主题切换（§9 #2）
│   └── useUnsavedGuard.js      # 未保存拦截（§9 #5、#6、#18）
├── utils/                      # 新增目录
│   ├── browser.js              # 浏览器能力检测
│   ├── persistence.js          # localStorage 封装（§9 #1）
│   └── file.js                 # 扩展名验证等
└── styles/
    ├── index.css               # 全局样式（含 vditor css 引入）
    └── vditor-overrides.css    # vditor 自定义覆盖（如主题色联动）
```

> 路径命名沿用 AGENTS.md §5.2 的 `@/` 别名约定。

---

## 3. 状态管理（Pinia Stores）

### 3.1 `useEditorStore`

单文档编辑器状态。无 Tab（Phase 3 §9 #9）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fileHandle` | `FileSystemFileHandle \| null` | 当前文件句柄；`null` 表示新建未保存 |
| `fileName` | `string` | 文件名，默认 `'untitled.md'`（§9 #15） |
| `content` | `string` | 编辑器当前内容（由 vditor input 事件同步） |
| `dirty` | `boolean` | 是否有未保存变更 |
| `externalState` | `'clean' \| 'pending' \| 'orphaned'` | 外部文件状态 |
| `lastSavedContent` | `string` | 上次保存的内容（用于 dirty 检测） |
| `lastExternalModified` | `number \| null` | 上次轮询到的外部 `lastModified` |

| Getter | 说明 |
| --- | --- |
| `hasFileHandle` | `fileHandle !== null` |
| `displayName` | `fileName + (dirty ? ' ●' : '')`（§9 #8 圆点） |

| Action | 说明 |
| --- | --- |
| `loadFromFile({ handle, content, name })` | 从打开的文件加载 |
| `setContent(value)` | 由 vditor input 事件触发，同步更新 content + dirty |
| `markSaved({ content })` | 保存成功后调用，清 dirty + 更新 lastSavedContent |
| `updateFileHandle({ handle, name })` | 另存为成功后调用 |
| `setExternalState(state)` | 外部状态变更 |
| `markOrphaned()` | 文件被外部删除 / 权限撤销 |

### 3.2 `useSettingsStore`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | 主题偏好；`'auto'` 跟随系统 |
| `autoSave` | `boolean` | `true` | 自动保存开关 |
| `autoSaveInterval` | `number` | `5` | 防抖秒数 |
| `externalWatchEnabled` | `boolean` | `true` | 外部修改检测开关 |
| `externalWatchInterval` | `number` | `10` | 轮询秒数 |

**持久化**（§9 #1）：

- 写入：`localStorage.setItem('md-editor-settings', JSON.stringify(state))`
- 启动恢复：`main.js` 中 `useSettingsStore` 初始化时读取并 `$patch`
- 写入策略：防抖 300ms（避免频繁 IO），订阅 store `$subscribe`

---

## 4. 路由设计

```
/                  → EntryView（新建 / 打开选择）
/editor            → EditorView（编辑器主界面）
/editor?mode=new   → 新建模式（query 用于路由元信息）
/editor?mode=open  → 打开模式（query 用于路由元信息）
```

**路由模式**：`createWebHistory(import.meta.env.BASE_URL)`

**导航流程**：

- `EntryView` 点击「新建」→ `router.push('/editor?mode=new')`，由 `useEditorStore` 初始化空文档
- `EntryView` 点击「打开」→ 调用 `useFileSystem.openFile()`，成功后 `router.push('/editor?mode=open')`，并将文件信息存入 `useEditorStore`
- `EditorView` 内点击「新建 / 打开」→ `useUnsavedGuard` 拦截（§9 #18）

> query 参数 `mode` 当前仅用于日志 / 调试；不参与业务逻辑分支（业务状态由 store 决定）。

---

## 5. 关键组件

### 5.1 `VditorEditor`

vditor 包装组件，封装实例生命周期与事件桥接。

**Props**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `value` | `string` | 初始内容（用于 `setValue`） |
| `theme` | `'light' \| 'dark'` | vditor 主题（'classic' / 'dark'） |
| `readonly` | `boolean` | 只读模式（外部异常时禁用编辑） |

**Events**：

- `update:value(value: string)` — vditor input 事件
- `ready` — vditor 实例就绪

**实现要点**：

- `onMounted`：创建 vditor 实例（`mode: 'wysiwyg'`）；`after` 回调中 `setValue(value)`；注册 `input` 事件 → `emit('update:value')`
- `onUnmounted`：**必须** 调用 `vditor.destroy()`（vditor 内部维护 DOM 与事件，不销毁会泄漏）
- `watch(value)`：**仅在外部来源变化时**调用 `setValue`（如打开新文件）；跳过自身 emit 触发的更新（用 `isInternalUpdate` 标志位避免回环）
- 主题切换：`watch(theme)` 重建实例（vditor 不支持运行时主题切换），或调用 `vditor.setTheme()`（若版本支持）

### 5.2 `TitleBar`

顶部标题栏，固定在编辑器上方。

**Props**：无（全部从 store 读取）

**渲染内容**（从左到右）：

- dirty 圆点（v-if `dirty`，颜色 = Naive UI primary，见 §9 #8）
- 文件名（`useEditorStore.displayName`）
- 外部状态徽标（v-if `externalState === 'pending'`：橙色「外部已修改」；`orphaned`：红色「文件不可用」）
- 右侧操作：
  - 「另存为」按钮（vditor 工具栏内已有时可省略）
  - 「设置」按钮（打开 SettingsDrawer）

### 5.3 `SettingsDrawer`

Naive UI `Drawer` 侧滑（§9 #3）。

**Props**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `show` | `boolean` | 由父组件 `v-model` 控制 |

**内容**：

- 主题：Radio（light / dark / auto）
- 自动保存：Switch + Slider（1-30 秒）
- 外部修改检测：Switch + Slider（5-60 秒，可关闭）
- 关于：版本号 + 链接（可选）

**数据绑定**：全部 `v-model` 到 `useSettingsStore`，自动通过 `$subscribe` 持久化到 localStorage。

### 5.4 `ExternalChangeDialog`

外部修改检测对话框（Phase 3 §4.2）。

**Props**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `show` | `boolean` | 控制显示 |

**触发**：由 `useExternalWatcher` 在检测到外部变化且本地 dirty 时调用。

**选项**：

- 「保留我的编辑」→ `setExternalState('pending')`
- 「重新加载外部」→ 调用 `useFileSystem` 重新读取 → `markSaved()` → `setExternalState('clean')`
- 「稍后处理」→ 关闭弹窗，保留 `'pending'`

### 5.5 `BrowserGate`

入口处检测，非 Chromium 浏览器拦截（§9 #17）。

**实现**：

```js
const isChromium = !!window.showOpenFilePicker && !!window.showSaveFilePicker;
if (!isChromium) {
  // 渲染「请使用 Chrome / Edge」提示，禁用编辑器入口
}
```

放置位置：`App.jsx` 顶层，或 `EntryView` 顶部 banner。

---

## 6. Composables

### 6.1 `useFileSystem()`

File System Access API 封装。

```ts
{
  openFile(): Promise<{ handle, content, name } | null>,
  saveFile(handle, content): Promise<boolean>,
  saveAsFile(content, suggestedName): Promise<{ handle, name } | null>,
  getMetadata(handle): Promise<{ lastModified, size }>,
  createWritable(handle): Promise<FileSystemWritableFileStream>,
}
```

**错误处理**：

- `AbortError`（用户取消）→ 返回 `null`，不视为错误
- `NotFoundError`（文件被删除）→ throw，由调用方标记 orphaned
- `SecurityError` / `NotAllowedError`（权限被撤销）→ toast + throw
- 其他 IO 错误 → toast + throw

### 6.2 `useAutoSave(contentRef, options?)`

自动保存逻辑（Phase 2 §5.1 + §9 #4）。

```ts
{
  isSaving: Ref<boolean>,
  lastError: Ref<Error | null>,
  triggerSave: () => Promise<void>,
  retryCount: Ref<number>,
}
```

**逻辑**：

1. 监听 `contentRef` 变化，启动防抖计时器（时长 = `useSettingsStore.autoSaveInterval`）
2. 防抖结束 → 调用 `triggerSave`
3. `triggerSave`：
   - 调用 `useFileSystem.saveFile(fileHandle, content)`
   - 成功 → `useEditorStore.markSaved({ content })`
   - 失败 → toast + 重试（最多 3 次，间隔 1s / 2s / 4s 指数退避）
   - 全部失败 → toast「自动保存失败，请手动保存」+ dirty 保持
4. 监听 `useSettingsStore.autoSave` 切换：关闭时取消所有计时器

### 6.3 `useExternalWatcher(handleRef, contentRef)`

外部修改轮询（Phase 3 §4.2）。

```ts
{
  externalState: Ref<'clean' | 'pending' | 'orphaned'>,
  startWatch(),
  stopWatch(),
  checkNow(): Promise<void>,
}
```

**逻辑**：

1. `startWatch`：
   - 立即 `checkNow()` 一次
   - 每 N 秒（`useSettingsStore.externalWatchInterval`，默认 10s）调用 `getMetadata()`
   - 对比 `lastExternalModified`：
     - 变化 + dirty=false → 自动重载 → `markSaved({ content: newContent })`
     - 变化 + dirty=true → 打开 ExternalChangeDialog
     - `lastModified` 不变 → 无操作
2. 监听 `window.focus` → `checkNow()`
3. `stopWatch`（组件卸载）：`clearInterval`
4. 错误处理：
   - `NotFoundError` → `externalState = 'orphaned'`，停止轮询
   - `SecurityError` → 同上
   - 其他 → toast + 跳过本轮

### 6.4 `useTheme()`

主题切换（Phase 2 §9 #2）。

```ts
{
  theme: Ref<'light' | 'dark' | 'auto'>,
  effectiveTheme: Ref<'light' | 'dark'>,
  setTheme(theme),
}
```

**联动**：

- `effectiveTheme`：根据 `theme` 与 `matchMedia('(prefers-color-scheme: dark)')` 计算实际生效主题
- `'auto'` 时监听系统主题变化（`matchMedia.addEventListener`）
- vditor 主题：`effectiveTheme === 'dark' ? 'dark' : 'classic'`（通过 prop 传给 `VditorEditor`）
- Naive UI 主题：在 `App.jsx` 或 `main.js` 中包裹 `NConfigProvider :theme="effectiveTheme === 'dark' ? darkTheme : undefined"`

### 6.5 `useUnsavedGuard(isDirtyRef, beforeLeaveFn)`

未保存拦截（Phase 2 §5.3 + Phase 3 §4.3）。

```ts
{
  installGuard(),
  uninstallGuard(),
}
```

**逻辑**：

1. `installGuard()`：
   - 注册 `window.addEventListener('beforeunload', handler)`
   - handler：`if (isDirtyRef.value) { e.preventDefault(); e.returnValue = ''; }`（浏览器原生提示，§9 #5）
2. `installGuard()` 同步注册 Vue Router `beforeEach`：
   - 检测 `isDirtyRef.value` + 离开编辑器路由 → 调用 `beforeLeaveFn()`
   - `beforeLeaveFn` 内部：等待自动保存完成（v-if `isSaving`）→ 弹原生 `confirm()`（替代方案：自定义 beforeunload 模拟，见 §9 #18）
3. `uninstallGuard()`：清理事件监听
4. **注意**：浏览器对 `beforeunload` 的自定义对话框支持较弱，只能给「离开 / 取消」；Phase 3 §9 #18 选择的就是这种"原生拦截"方案。

---

## 7. 关键流程

### 7.1 新建文档

```
EntryView 「新建」点击
  → router.push('/editor?mode=new')
  → EditorView mount
    → useEditorStore: fileHandle=null, content='', dirty=true,
                       fileName='untitled.md', externalState='clean'
    → VditorEditor mount（空 vditor）
    → useAutoSave.install(contentRef)         // 防抖就绪
    → useUnsavedGuard.install()               // beforeunload + 路由拦截
    → useExternalWatcher.install(null)        // handle=null 时不启动
  → 用户编辑
  → 防抖 5s → useAutoSave.triggerSave
    → fileHandle=null → 改走 saveAsFile
    → 弹保存对话框 → 用户选择路径
    → 写入 → useEditorStore.updateFileHandle + markSaved
    → dirty=false
  → 后续编辑 → 同上（直接 saveFile，无弹窗）
```

### 7.2 打开文档

```
EntryView 「打开」点击
  → useFileSystem.openFile()
    → showOpenFilePicker(.md+.markdown)        // §9 #16
    → 用户选择 → 读取 content
    → 返回 { handle, content, name }
  → useEditorStore.loadFromFile(...)
    → fileHandle=X, content=Y, dirty=false,
      externalState='clean', lastExternalModified=metadata.lastModified
  → router.push('/editor?mode=open')
  → EditorView mount
    → VditorEditor mount（vditor.setValue(Y)）
    → useAutoSave.install(contentRef)
    → useUnsavedGuard.install()
    → useExternalWatcher.install(handleRef)
      → 启动轮询（10s 一次 + focus 触发）
```

### 7.3 保存 / 另存为

```
「保存」触发（手动按钮 / 自动保存 / Ctrl+S）
  → useFileSystem.saveFile(handle, content)
  → handle?
  ├─ null: 改走 saveAsFile
  └─ 有: handle.createWritable().write(content)
  → 成功 → useEditorStore.markSaved({ content })
  → 失败 → toast + 重试（自动保存）或 toast + dirty 保持（手动）

「另存为」触发（按钮 / Ctrl/Cmd+Shift+S）
  → useFileSystem.saveAsFile(content, suggestedName)
    → suggestedName = currentFileName（§F-SA-7）
    → showSaveFilePicker
  → 用户选择路径
  → 写入 → useEditorStore.updateFileHandle + markSaved
  → 取消（AbortError）→ 无变化

「保留我的编辑」后续首次保存（§9 #10）
  → 二次确认弹窗（自定义 Naive UI Modal）：「外部已被修改，继续保存将覆盖外部内容？」
  → 用户确认 → saveFile
  → 后续同 saveFile，不重复确认
```

### 7.4 外部修改检测

```
useExternalWatcher.checkNow
  → useFileSystem.getMetadata(handle)
  → 错误？
  ├─ NotFoundError / SecurityError → markOrphaned + stopWatch + 提示「请另存为」
  └─ 成功
  → 对比 lastModified
  ├─ 未变 → 无操作
  └─ 变化
     → 比对 dirty
     ├─ dirty=false → 自动 reload
     │   → 读取 content → useEditorStore.markSaved + setExternalState('clean')
     └─ dirty=true → 打开 ExternalChangeDialog
         ├─「保留」→ setExternalState('pending')，关闭弹窗
         ├─「重载」→ 读取 → markSaved + setExternalState('clean')
         └─「稍后」→ 关闭弹窗，保留 'pending'（§9 #13）
                    下次 saveFile 时若 pending → 触发二次确认弹窗
```

### 7.5 关闭拦截（Phase 2 §5.3 + Phase 3 §4.3）

```
标签关闭 / 刷新（beforeunload）
  → useUnsavedGuard handler
  → isDirty?
  ├─ false: 放行（returnValue 不设置）
  └─ true: e.preventDefault() + e.returnValue = ''
           → 浏览器原生「离开 / 取消」弹窗
           ├─ 离开: 自动保存的最新内容已写入 → 关闭
           └─ 取消: 留在当前页

应用内路由切换（点击「新建 / 打开」）
  → router.beforeEach
  → isDirty?
  ├─ false: next()
  └─ true: 等待自动保存（isSaving）→ 然后：
           方案 A（§9 #18 决策）：调用 window.onbeforeunload 模拟原生弹窗
           方案 B：自定义 confirm() 三按钮（保存 / 丢弃 / 取消）
           → 当前采用方案 A，保持与关闭拦截一致
```

---

## 8. 错误处理策略

| 错误场景 | 检测位置 | 处理 |
| --- | --- | --- |
| 非 Chromium 浏览器 | `BrowserGate`（启动时） | 入口拦截 + 提示「请使用 Chrome / Edge」（§9 #17） |
| 用户取消文件选择 | `useFileSystem` | 返回 `null`，静默 |
| 文件权限被撤销 | `useExternalWatcher.checkNow` | markOrphaned + 停止轮询 + toast |
| 文件被外部删除 | 同上 | 同上 |
| 文件被外部移动 / 重命名 | 同上 | 同上（handle 仍存在但路径变了 → NotFoundError） |
| 写入失败（磁盘满 / IO 错误） | `useAutoSave` / `useFileSystem` | toast + 自动保存重试 3 次（§9 #4）；手动保存仅 toast |
| vditor 初始化失败 | `VditorEditor` | ErrorBoundary 兜底 + Toast 上报告错 |
| localStorage 不可用 | `useSettingsStore` 初始化 | 降级为内存存储 + Toast「设置将不会持久化」 |
| 自动保存进行中触发关闭 | `useUnsavedGuard` | 等待保存完成 → 再判断 dirty |
| 路由切换时 vditor 仍在加载 | `VditorEditor.ready` 事件 | 等待 ready → 再继续 |

---

## 9. 实现里程碑

依赖顺序（与 Phase 3 §9 + Phase 2 §10 对齐）：

### M1 · 基础设施（~1 天）

- 新建目录骨架：`views/`、`components/`、`composables/`、`utils/`、`styles/`
- Pinia stores：`useEditorStore`、`useSettingsStore`
- 路由配置：`/` + `/editor`
- `BrowserGate` 组件 + `utils/browser.js`
- `utils/persistence.js`（localStorage 封装）

### M2 · 入口与编辑器骨架（~2 天）

- `EntryView`（新建 / 打开按钮，UI only）
- `EditorView` + `TitleBar`
- `VditorEditor` 包装组件（生命周期、事件桥接）
- `useFileSystem` composable
- 与 Phase 1 保存通道对接，手动保存可用

### M3 · 自动保存 + 未保存指示（~1 天）

- `useAutoSave` 实现 + 接入 vditor input
- `TitleBar` 集成 dirty 圆点（primary 主题色）
- 失败 Toast + 重试（§9 #4）

### M4 · 关闭拦截（~0.5 天）

- `useUnsavedGuard` 实现
- `beforeunload` + 路由切换拦截

### M5 · 主题 + 设置（~1.5 天）

- `useTheme` 实现 + vditor / Naive UI 联动
- `SettingsDrawer` UI
- `useSettingsStore` 持久化（localStorage + 启动恢复）

### M6 · 另存为（~0.5 天）

- 「另存为」按钮 + `Ctrl/Cmd+Shift+S` 快捷键
- `useFileSystem.saveAsFile` 接入
- 句柄更新 + dirty 清零

### M7 · 外部修改检测（~2 天）

- `useExternalWatcher` 实现（轮询 + focus 触发）
- `ExternalChangeDialog` UI
- 「保留 / 重载 / 稍后」三选项
- 「保留我的编辑」首次保存二次确认
- 「稍后处理」仅下次保存前提示

### M8 · 外部异常处理（~1 天）

- orphaned 状态机
- 外部删除 / 移动 / 重命名 / 权限撤销检测
- 禁用常规保存 + 强制另存为

### M9 · 体验打磨（~1 天，可选）

- vditor 工具栏集成「另存为」「设置」按钮
- 快捷键完善（`Ctrl/Cmd+S` 手动保存）
- aria-label 完善
- 仅 Chromium 浏览器入口提示

**总计估时**：~10.5 天（不含测试 / Code Review / Buffer）

---

## 10. 技术决策摘要（追溯）

| 议题 | 决策 | 出处 |
| --- | --- | --- |
| 渲染模式 | JSX | AGENTS.md §5.3 |
| UI 组件 | Naive UI + 按需全局 | AGENTS.md §5.7 |
| 第三方组件目录 | `src/plugins/` | AGENTS.md §5.7 |
| Markdown 编辑器 | [vditor](https://github.com/Vanessa219/vditor) | Phase 2 §3 #2 |
| 渲染模式 | WYSIWYG | Phase 2 §4.2 |
| 工具栏 | 默认全量 | Phase 2 §4.2 |
| 偏好持久化 | localStorage | Phase 2 §9 #1 |
| 主题联动 | vditor + Naive UI 同步 | Phase 2 §9 #2 |
| 设置弹窗 | Drawer 侧滑 | Phase 2 §9 #3 |
| 自动保存失败 | Toast + 静默重试 3 次 | Phase 2 §9 #4 |
| 关闭拦截 | 仅浏览器原生 `beforeunload` | Phase 2 §9 #5、#6 |
| vditor 版本 | `^X.Y.Z` | Phase 2 §9 #7 |
| 圆点颜色 | primary 主题色 | Phase 2 §9 #8 |
| 浏览器目标 | 仅 Chromium | Phase 2 §9 #17 |
| 扩展名 | `.md` + `.markdown` | Phase 2 §9 #16 |
| 默认文件名 | `untitled.md` | Phase 2 §9 #15 |
| 文件能力 | 另存为 + 外部检测（无 Tab） | Phase 3 §9 #9 |
| 另存为后 dirty | 清零 | Phase 3 §9 #12 |
| 「保留」后续保存 | 仅首次确认 | Phase 3 §9 #10 |
| 「稍后」再提示 | 仅下次主动保存前 | Phase 3 §9 #13 |
| 外部删除 / 重命名 | 报错 + 建议另存为 | Phase 3 §9 #11、#14 |
| 新建 / 打开时拦截 | 浏览器原生 `beforeunload` | Phase 3 §9 #18 |

---

## 11. 待澄清 / 技术风险

| 类别 | 问题 | 建议 |
| --- | --- | --- |
| vditor `input` 事件粒度 | 每次按键 / 每行 / 每段？决定防抖策略 | 实测后调整 |
| vditor 运行时主题切换 | 是否支持？若否需重建实例 | 查 vditor 文档 / 实测 |
| `FileSystemFileHandle` 跨会话 | 刷新后能否复用？ | 不支持，需重新打开 |
| vditor 与 Naive UI 主题色冲突 | CSS 优先级 / 覆盖策略 | 通过 `vditor-overrides.css` 用 CSS 变量覆盖 |
| vditor undo / redo 对 dirty 的影响 | `getValue()` 后是否触发 input？ | 实测，可能需要 lastSavedContent 对比而非依赖 input 事件 |
| > 1MB 大文件性能 | vditor / 自动保存 / 轮询开销 | 后续阶段评估 |
| IndexedDB 暂存 | 「未保存内容暂存」何时引入？ | 留待后续阶段 |
| 多草稿（无 Tab 时） | 用户开两个标签页（浏览器 Tab）会怎样？ | 各自独立 state，可接受 |
| 浏览器降级 | Firefox / Safari 入口提示的 UI 形态？ | Banner 形式，禁用编辑器入口 |
| vditor 工具栏按钮事件 | 自定义按钮的事件是否生效？ | 通过 vditor 配置 `toolbar` 选项 |
| vditor `destroy()` 兼容性 | 不同版本的清理行为差异？ | `^X.Y.Z` 内固定 minor，监控 |
| `matchMedia` 兼容性 | `auto` 主题模式需现代浏览器 | §9 #17 已限定 Chromium，无问题 |

---

_最后更新：基于 Phase 1-3 决议 + Phase 2 §9 / Phase 3 §8 澄清结果。本设计文档**不引入新需求**，仅落实现有决议。代码实现按 §9 里程碑执行。_