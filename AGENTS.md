# AGENTS.md

> ⚠️ **维护提醒**：当本项目发生**较大更新**（例如新增/替换核心依赖、目录结构大改、引入新的工程化工具链、新增测试框架、路由或状态管理方案重构、构建/部署链路变更、新增大型功能模块等）时，**必须**同步更新本文档，保证后续 AI 代理与协作者能基于最新事实工作。

---

## 1. 项目概览

| 项目     | 值                                                                          |
| -------- | --------------------------------------------------------------------------- |
| 名称     | `md-editor-web`                                                             |
| 形态     | 私有前端工程 (`private: true`)，非发布到 npm                                |
| 包管理器 | npm（存在 `package-lock.json`，未启用其他 lockfile）                        |
| 目标     | 从当前脚手架演进为**Web 端 Markdown 编辑器**（尚未实现，仅占位脚手架）       |
| Node 版本 | `^22.18.0 \|\| >=24.12.0`                                                  |

> 当前仓库 `src/` 仍是 Vue 官方 Vite 模板的默认脚手架（占位 `App.jsx`、空 `routes[]`、Pinia counter 示例），**还没有任何 Markdown 编辑相关代码**。后续工作应以“补齐 Markdown 编辑器”作为主线目标。组件一律以 **JSX** 形式编写，详见 [§5.3](#53-vue-3--jsx-写法)。

---

## 2. 技术栈

### 运行时依赖 (`dependencies`)

- **Vue `^3.5.40`** —— Composition API，**JSX** 渲染函数（`@vitejs/plugin-vue-jsx`），不使用 `<template>` / `<script setup>`
- **Vue Router `^5.2.0`** —— `createWebHistory(import.meta.env.BASE_URL)`
- **Pinia `^4.0.2`** —— 状态管理（`useEditorStore` / `useSettingsStore`，详见 [§6](#6-待补齐--路线图持续更新)）
- **Naive UI `^2.44.1`** —— UI 组件库，按需全局注册，详见 [§5.7](#57-第三方组件与-plugins-约定)；CSS-in-JS，无需单独引入样式文件
- **vditor `^3.11.2`** —— Markdown 编辑器核心（M2 起接入）。**不在** `src/plugins/` 中注册（它不是 UI 组件库），由 `src/components/editor/VditorEditor.jsx` 直接 import；CSS 由 `src/styles/index.css` 顶部 `@import 'vditor/dist/index.css';` 引入

### 构建 / 工程化 (`devDependencies`)

- **Vite `^8.1.5`**
  - 插件链（顺序见 `vite.config.js`）：`@vitejs/plugin-vue` → `@vitejs/plugin-vue-jsx` → `vite-plugin-vue-devtools`
  - 别名：`@` → `./src`（与 `jsconfig.json` 保持一致）
- **ESLint `^10.7.0`**（flat config）+ `eslint-plugin-vue` + `eslint-plugin-oxlint` + `eslint-config-prettier`（`skipFormatting`）
- **Oxlint `~1.73.0`**（启用 `eslint / unicorn / oxc / vue` 插件，`correctness` 等级为 `error`）
- **Oxfmt `^0.59.0`** —— 配置见 [§5.1](#51-风格与格式) 与 `.oxfmtrc.json`（`tabWidth: 2`、`semi: true`、`singleQuote: true`）
- **Node 类型与工具**：`globals`、`@eslint/js`、`vue-eslint-parser`、`npm-run-all2`

> 注意：**未引入任何单元/E2E 测试框架**（无 vitest / jest / playwright 等）。如果新增 Markdown 编辑器，需要在引入测试时同步把“测试约定”补到第 5 节并更新本文档。

---

## 3. 目录结构

```
md-editor-web/
├── .editorconfig           # 2 空格 / LF / UTF-8 / max 100 字符
├── .gitattributes          # * text=auto eol=lf
├── .gitignore              # 含 dist / coverage / .eslintcache 等
├── .oxfmtrc.json           # Oxfmt 配置（semi: false, singleQuote: true）
├── .oxlintrc.json          # Oxlint 配置（含 vue / unicorn 插件）
├── README.md               # 项目说明（仍为模板占位文案）
├── AGENTS.md               # ← 本文件（AI/协作者指南）
├── eslint.config.js        # ESLint flat config
├── index.html              # Vite 入口（lang="" 未设置，需留意 i18n）
├── jsconfig.json           # 路径别名 @/* → ./src/*
├── package.json
├── package-lock.json
├── vite.config.js          # Vite 配置（vue + vue-jsx + devtools）
├── public/
│   └── favicon.ico
├── docs/                  # 业务流程文档（按阶段组织，见 docs/README.md）
│   ├── README.md          #   - 索引
│   ├── 01-core-editor-flow.md       #   - 第一阶段：核心编辑流程
│   ├── 02-editor-and-experience.md  #   - 第二阶段：编辑器 + 体验增强（调研）
│   ├── 03-file-capabilities.md      #   - 第三阶段：文件能力扩展（需求）
│   ├── 04-design.md                 #   - 第四阶段：系统实现设计
│   └── 05-mN-*.md                   #   - 第五阶段：实施里程碑（9 份，见 docs/README.md）
└── src/
    ├── main.js             # createApp → Pinia → hydrateSettings → Router → Plugins → mount('#app')
    ├── App.jsx             # 根组件（BrowserGate > router-view）
    ├── router/
    │   ├── index.js        # createWebHistory + 聚合 routes.js
    │   └── routes.js       # 路由定义（`/` + `/editor`，M1 起懒加载）
    ├── plugins/            # 第三方组件/插件统一入口（见 §5.7）
    │   ├── index.js        #   - installPlugins(app)：遍历 `plugins` 数组
    │   └── naive.js        #   - Naive UI：create({ components: [...] })
    ├── stores/
    │   ├── useEditorStore.js   # 单文档编辑器状态（M1+）
    │   ├── useSettingsStore.js # 用户偏好 + localStorage 持久化（M1+）
    │   └── counter.js          # 示例 store（保留）
    ├── views/              # 页面级组件（M1 起：EntryView / EditorView 占位）
    │   ├── EntryView.jsx   #   - 入口选择（M2 填充）
    │   └── EditorView.jsx  #   - 编辑器主界面（M2 填充）
    ├── components/         # 通用组件
    │   ├── common/         #   - 跨场景通用（如 BrowserGate）
    │   └── editor/         #   - 编辑器专属（M2+ 填充）
    │       ├── TitleBar.jsx        #   - 顶部标题栏（含 dirty 圆点 / 保存 / 设置 / 返回）
    │       ├── VditorEditor.jsx    #   - vditor 包装（M2+）
    │       └── SettingsDrawer.jsx  #   - 设置抽屉（M5，主题 / 自动保存 / 外部修改检测 / 关于）
    ├── composables/        # 组合式函数（M3+ 填充）
    │   ├── useFileSystem.js        #   - File System Access API 封装（M2+）
    │   ├── useAutoSave.js          #   - 自动保存（M3）
    │   ├── useUnsavedGuard.js      #   - 关闭 + 路由拦截（M4）
    │   ├── useTheme.js             #   - 主题切换 + auto 模式系统联动（M5，导出 THEME_INJECTION_KEY）
    │   └── useThemeStyles.js       #   - 暴露 Naive UI 主题颜色变量（bodyColor / cardColor / borderColor / textColor2/3）给非 Naive UI 组件（M5 主题层修复）
    ├── utils/              # 工具函数
    │   ├── browser.js      #   - hasFSAPI / isChromium
    │   ├── file.js         #   - Markdown 扩展名 / showOpenFilePicker accept types（M2+）
    │   └── persistence.js  #   - localStorage 安全读写 + debounce
    └── styles/
        └── index.css       # 全局样式入口（`@import 'vditor/dist/index.css'`）
```

---

## 4. 常用脚本

| 命令              | 作用                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `npm run dev`     | 启动 Vite 开发服务器（含 HMR + Vue DevTools）                              |
| `npm run build`   | 生产构建                                                                   |
| `npm run preview` | 本地预览生产产物                                                           |
| `npm run lint`    | 通过 `npm-run-all2` 并行执行 `lint:oxlint` 与 `lint:eslint`（均带 `--fix`） |
| `npm run format`  | `oxfmt src/` 格式化源码                                                    |

> ESLint 同时跑：`oxlint . --fix` → `eslint . --fix --cache`（`npm-run-all2` 并发）。两套规则需要兼容，目前由 `eslint-plugin-oxlint` + `eslint-config-prettier` 桥接。

---

## 5. 编码与工程约定

### 5.1 风格与格式

- 由 **Oxfmt**（`.oxfmtrc.json`）与 **.editorconfig**（2 空格、LF、最长 100 列）共同约束
- 当前 Oxfmt 配置（见 `.oxfmtrc.json`）：
  - `useTabs: false` + `tabWidth: 2` —— 脚本与 Vue 文件使用 **2 空格**缩进
  - `semi: true` —— 脚本语句以 **分号** 结尾
  - `singleQuote: true` —— 字符串默认使用 **单引号**
- Oxfmt 的 `tabWidth` / `useTabs` 会覆盖 `.editorconfig` 的 `indent_size` / `indent_style`；如需调整缩进必须同时修改两边
- **不要**手动与 Oxfmt / ESLint 风格配置对抗；如有冲突优先调整代码
- 文件末尾保留一个换行（`insert_final_newline: true`）

### 5.2 路径与导入

- **始终使用 `@/` 别名** 引用 `src` 下模块（如 `import App from '@/App.jsx'`）
- 不要使用相对路径 `../` 跨目录引用，保持扁平可读
- 新增目录后，记得同步确认 `jsconfig.json` / `vite.config.js` 的 alias 仍然覆盖

### 5.3 Vue 3 + JSX 写法

- **所有组件**统一以 `.jsx` 文件 + `defineComponent({ setup() { return () => <jsx /> } })` 的形式编写；**不再使用** `<template>` / `<script setup>` / `<style scoped>` 等 SFC 写法
- 编译：`@vitejs/plugin-vue-jsx`（已挂载，见 `vite.config.js`）
- 组件文件命名：与目录保持语义对应（如 `App.jsx`、`Editor.jsx`），不要起 `App.vue` 这种带 `.vue` 后缀的名字
- 组件目录：根组件之外的页面建议放在 `src/views/`（或后续约定的目录），**避免直接堆在根目录**
- JSX 中引用组件的两种方式（参考 `App.jsx` 头部注释）：
  - **局部 import**（推荐）：`import { NButton } from 'naive-ui'` → `<NButton />`，便于 IDE 跳转与 tree-shaking
  - **全局注册**：`src/plugins/naive.js` 通过 `create({ components })` 注入的组件，可在 JSX 中以 kebab-case 引用（如 `<n-button />`），由 `@vue/babel-plugin-jsx` 调用 `resolveComponent()` 解析
- JSX 特殊语法注意：
  - `v-model` 用 `vModel={[value, 'value']}`（Naive UI 多数组件用 `:value` + `@update:value`），必要时直接写 `value={x} onUpdateValue={(v) => (x = v)}`
  - 属性名一律 camelCase（`class` → `class`，`for` → `htmlFor`，`tabindex` → `tabIndex`）；事件用 `onClick` / `onInput` 等
  - 插槽用 `v-slots` 对象传入：`{{ default: () => <span>slot</span> }}`

### 5.4 状态管理

- 使用 **Pinia Composition Store**（参考 `stores/counter.js` 的 setup function 形式），**不要**写 Options Store
- Store 文件命名：`useXxxStore.js`，`defineStore('xxx', () => { ... })` 第一个参数 id 与文件名/变量名保持一致
- 跨模块共享的可派生值用 `computed` 暴露；动作封装为函数返回
- 需要 `$subscribe` 的 store（如 `useSettingsStore`）应在 setup 内暴露一个 `installPersistence()` action；通过 store proxy 调用时 `this.$subscribe` 自动可用。`main.js` 负责启动恢复（`hydrateXxx`）与 `installPersistence()` 调用

### 5.5 路由

- `createWebHistory(import.meta.env.BASE_URL)`，部署到子路径时不要硬编码 base
- 路由模块按 `src/router/*.js` 拆分，主入口 `index.js` 仅做 `routes` 聚合
- 路由定义统一懒加载：`component: () => import('@/views/XxxView.jsx')`
- 守卫（beforeEach）如需登录态校验，统一走 Pinia store，**不要**在组件内做路由跳转

### 5.6 Lint / Format 流程

- 提交前：**必须** 跑 `npm run lint` 与 `npm run format`
- ESLint 已挂 `--cache`，二次执行显著加速
- Oxlint 不可通过注释禁用既有规则——如确需抑制，使用 `// eslint-disable-next-line` 并附理由

### 5.7 第三方组件与 `plugins/` 约定

- **所有第三方 Vue 组件 / 插件**（含 Naive UI、未来的 icon 库、Monaco / CodeMirror 包装等）一律放在 `src/plugins/<name>.js`，并在 `src/plugins/index.js` 的 `plugins` 数组中注册
- 入口统一导出 `installPlugins(app)`，`main.js` 内**禁止**直接 `import` 具体第三方插件，保持 `main.js` 极简（仅路由 / 状态 / 插件 / 挂载）
- 单个插件文件规范：
  - 只 `export default` 一个 Vue 插件对象（`app.use()` 可消费的形式）
  - 内部完成按需注册（例如 Naive UI 用 `create({ components: [...] })` 保留 tree-shaking）
  - 顶部用注释说明“如何新增 / 移除组件”，避免后来人误改全局
- 新增第三方组件的步骤：
  1. `npm i xxx` 安装
  2. 在 `src/plugins/` 下新建 `xxx.js`，按上述规范导出插件
  3. 在 `src/plugins/index.js` 的 `plugins` 数组追加该插件
  4. **不得**在 `main.js`、组件文件或 `App.jsx` 中直接 `import` 该第三方包

---

## 6. 待补齐 / 路线图（持续更新）

> 本节用于追踪与 `md-editor-web` 命名相符的核心功能落地。每完成一项请勾选并补充关联文件。

- [x] 集成 Naive UI（按需全局注册，封装于 `src/plugins/naive.js`）
- [x] 基础设施（M1）：目录骨架 + Pinia stores（`useEditorStore` / `useSettingsStore`）+ `BrowserGate` + localStorage 持久化
- [x] 入口与编辑器骨架（M2）：vditor 接入 + File System Access API 封装（`useFileSystem`）+ 入口页「新建 / 打开」+ `EntryView` / `EditorView` / `VditorEditor` / `TitleBar` + `useEditorStore.reset()`
- [x] 实现 Markdown 编辑器 UI 增强：自动保存（M3）、关闭拦截（M4）、主题切换 + 设置抽屉（M5）、另存为（M6）、外部修改检测（M7）、外部异常处理（M8）、体验打磨（M9）
  - M3 已完成：`src/composables/useAutoSave.js`（防抖 + 首存另存为 + 1s/2s/4s 退避重试 3 次 + 失败 toast）、`EditorView` 接入、`TitleBar` 增加 dirty primary 圆点（`aria-label="未保存"`）、`useEditorStore.setContent` 容许 undo 回滚到 `lastSavedContent` 时自动清 dirty
  - M4 已完成：`src/composables/useUnsavedGuard.js` 暴露 `installGuard()` / `uninstallGuard()`——`window.beforeunload`（仅浏览器原生弹窗） + Vue Router `beforeEach`（从 `/editor` 离开时若 dirty 弹原生 `confirm()` 二次确认，自动保存进行中则 `waitUntil(isSaving=false, timeout=10s)`）；`EditorView` 在 `onMounted` 安装、`onBeforeUnmount` 由 composable 内部清理，幂等不重复注册
  - M5 已完成：`src/composables/useTheme.js`（`theme` 双向绑 `useSettingsStore.theme`、`effectiveTheme` 计算 `auto` 模式系统偏好、仅 `auto` 时 attach `matchMedia('(prefers-color-scheme: dark)')` `change` 监听、离开 `auto` 立即 `removeEventListener`；导出 `THEME_INJECTION_KEY` 供 `App.jsx` `provide` 给 `EditorView` `inject`，避免 `MediaQueryList` 监听器被多处注册）；`src/components/editor/SettingsDrawer.jsx`（NDrawer 右侧 360px，4 节：主题 NRadioGroup / 自动保存 NSwitch+NSlider 1-30s / 外部修改检测 NSwitch+NSlider 5-60s / 关于——版本号从 `package.json` JSON import 读取）；`App.jsx` 增加 `<NConfigProvider :theme="effectiveTheme==='dark' ? darkTheme : null">` 包裹；`EditorView` 移除调试信息，改用 `inject(THEME_INJECTION_KEY)` 拿 effectiveTheme 透传给 `VditorEditor`（vditor 已在 `watch(theme)` 调 `setTheme`）；`TitleBar` 增加「设置」NButton（`aria-label="打开设置"`）+ `showSettings` 本地 ref + 嵌入 `<SettingsDrawer v-model:show="showSettings">`；`src/plugins/naive.js` 追加 `NDrawer / NDrawerContent / NRadio / NRadioGroup / NSwitch / NSlider / NDivider / NH3 / NText`；持久化复用 M1 的 `useSettingsStore.installPersistence()`（`$subscribe` + 300ms 防抖 → `localStorage['md-editor-settings']`），本里程碑不改动 store
  - **M5 收尾修复**（vditor 暗主题部分切换为官方 API）：`VditorEditor.jsx` 主题联动的 `watch(theme)` 改用 vditor 提供的合并 API **`vditor.setTheme(uiTheme, contentTheme, codeTheme?, contentPath?)`**（`node_modules/vditor/dist/index.d.ts:16`），一条调用同时处理两条主题：① `uiTheme='classic'|'dark'` 处理 UI 外壳（工具栏、输入框背景，CSS 变量翻转）；② `contentTheme='light'|'dark'` + `contentPath='https://unpkg.com/vditor@${vditor.version}/dist/css/content-theme'` 处理 `.vditor-reset` 等硬编码颜色（vditor 官方 `dist/css/content-theme/{light,dark}.css`，含主文字、blockquote、hr、table、kbd、inline code、speech、linkcard 等）。`createVditor()` 初始传入 `preview.theme.current`，vditor initUI 内部会调一次 `setContentTheme` 与主题对齐（免首次闪烁）。CDN 路径用 `vditor.version` 动态拼装，与 vditor 内部默认 `Constants.CDN` 一致。原先手写的 `src/styles/vditor-overrides.css` 已删除（与官方内容主题重叠且覆盖元素少于官方），`src/styles/index.css` 顶部 `@import` 同步还原为只保留 vditor 默认 CSS。任意超出「占位脚手架」的功能实现都属于**较大更新**，请同步更新本文件。
  - **M5 主题层修复**（Naive UI 主题变量全局不可见导致的「暗模式仍白底」）：根因是 Naive UI 的 `--n-color` / `--n-text-color` / `--n-border-color` 等**不是全局 CSS 变量**——`css-render` 在每个组件挂载时生成 hash 类（如 `.__button-dark-abc123`），把 CSS 变量挂在该类的 style 块里，**仅在该组件根元素作用域内生效**（见 `node_modules/naive-ui/es/_mixins/use-css-vars-class.mjs`）。本项目此前所有 `var(--n-color, #ffffff)` / `var(--n-border-color, #e6e6e6)` / `var(--n-text-color-3, #888)` 等写法在暗模式下**永远是 fallback 值**，表现为 `.editor-view` 白底、`.editor-title-bar` 浅灰、EntryView 副标题 `#888` 不变。修复：① `App.jsx` 在 `<NConfigProvider>` 内挂 `<NGlobalStyle>`（Naive UI 自带的副作用组件）负责 body —— 读 merged theme 的 `bodyColor` / `textColor2` 等写为 `body.style.*` 内联样式，并随主题响应式更新 + 补 `.3s` 过渡；② 新增 `src/composables/useThemeStyles.js` 包 `useThemeVars()` 暴露 `bodyColor / cardColor / borderColor / dividerColor / textColor1/2/3` 为 `ComputedRef`；③ `EditorView.jsx` 把 `.editor-view` 的 `background` 从 `var(--n-color, #ffffff)` 改为 `themeStyles.bodyColor.value`；④ `TitleBar.jsx` 把 `.editor-title-bar` 的 `background` / `borderBottom` 从 `var(--n-color-embedded, #fafafa)` / `var(--n-border-color, #e6e6e6)` 改为 `themeStyles.cardColor.value` / `themeStyles.borderColor.value`；⑤ `EntryView.jsx` 副标题「选择开始方式」的 `color` 从 `var(--n-text-color-3, #888)` 改为 `themeStyles.textColor3.value`；⑥ `src/styles/index.css` 移除 `html / body / #app` 上失效的 `var(--n-color, #ffffff)` / `var(--n-text-color, #333333)`，仅保留 margin / padding / height / font-family（body 背景与文字由 NGlobalStyle 接管）。同步更新 `AGENTS.md` §3 目录结构与 §6 路线图。任意超出「占位脚手架」的功能实现都属于**较大更新**，请同步更新本文件。
- [ ] 选型 Markdown 解析库（如 `marked` / `markdown-it`）并封装为 `src/utils/markdown/`
- [ ] 支持常用编辑能力：标题、列表、代码块、表格、引用、链接、图片
- [ ] 内容持久化：`localStorage` 已就位（设置）；`IndexedDB` / 文件系统接口（取决于 Web 容器能力）
- [x] 路由：`/`（入口）+ `/editor`（编辑器，懒加载）；`/settings`（M5 设置抽屉路由待定）
- [x] Pinia stores：`useEditorStore`（文档状态，撤销栈待 M3+）、`useSettingsStore`（主题、自动保存、外部轮询）
- [x] 主题/暗色模式切换（基于 Naive UI 的 `NConfigProvider` + `darkTheme`，M5 已接入：`useTheme` + `SettingsDrawer` + `App.jsx` `NConfigProvider` + `<NGlobalStyle>` 包裹 + `useThemeStyles` 绑定 bodyColor/cardColor/borderColor/textColor3 + `EditorView` 透传 `effectiveTheme` 给 vditor）
- [ ] 引入测试框架（建议 vitest + @vue/test-utils）并配置 CI
- [ ] 国际化（当前 `index.html` 的 `lang=""` 未设置，需要在引入 i18n 时一并定下默认语言）

---

## 7. 给 AI 代理的操作建议

1. **先读本文档与 `package.json`**，再决定修改方案；任何对依赖/脚本/目录结构的改动都要回头更新本文档。
2. **保持脚手架特征**：仓库还很“年轻”，新增大件前先和用户确认选型（解析库、测试库、状态方案等），避免一次性引入过多技术债。
3. **不要删除占位代码**：`src/stores/counter.js` 仍是 Pinia setup store 的示例，改动/删除前先确认示例文档是否还需要保留。
4. **不要提交 `node_modules` / `dist` / `.eslintcache`**（已在 `.gitignore`）。
5. **修改 `vite.config.js` 或 `jsconfig.json`** 时注意 `@` 别名两端要同步。
6. **新增 ESLint/Oxlint 规则** 时优先调整 `.oxlintrc.json`，避免污染 ESLint flat config；如确需在 `.eslint.config.js` 增加，附理由。
7. **遇到不确定项**（解析库、测试库、目录约定、命名规范）—— **先问，再写**。可以用 `ask_user_question` 一次问多个相关问题。
8. **完成大改动后**：更新本文件相关章节，并在 PR/commit message 中明确提及“已更新 AGENTS.md”。

---

## 8. 快速上手（首次接触者）

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 3. 提交前：先格式化、再 lint
npm run format
npm run lint

# 4. 生产构建并预览
npm run build
npm run preview
```

---

_最后更新：完成 M5 主题 + 设置抽屉（新增 `src/composables/useTheme.js`：① 返回 `{ theme: WritableComputedRef, effectiveTheme: ComputedRef<'light'|'dark'>, setTheme(v) }` —— `theme` 双向绑 `useSettingsStore.theme`，`effectiveTheme` 根据 `theme` 与 `matchMedia('(prefers-color-scheme: dark)').matches` 计算；② 系统联动仅在 `theme==='auto'` 时 `attachMediaListener`（`matchMedia.addEventListener('change', ...)`），离开 `auto` 立即 `removeEventListener` 兑底；③ 导出 `THEME_INJECTION_KEY` 让 `App.jsx` `provide` 给 `EditorView` `inject`——避免 `MediaQueryList` 监听器被多处注册，与 M5 §3.4 「EditorView 调用 useTheme」略有偏差，但行为等价。`App.jsx` 加 `<NConfigProvider :theme="effectiveTheme==='dark' ? darkTheme : null">` 包裹路由出口。`src/components/editor/SettingsDrawer.jsx`：`<NDrawer placement="right" width={360}>` + 4 节区块——主题 `<NRadioGroup>`（light/dark/auto）、自动保存 `<NSwitch>` + `<NSlider :min={1} :max={30}>`（关闭时禁用）、外部修改检测 `<NSwitch>` + `<NSlider :min={5} :max={60}>`（关闭时禁用）、关于（版本号从 `package.json` JSON import 读取，GitHub 链接占位）；所有设置 `v-model` 到 `useSettingsStore` 字段，持久化复用 M1 已就位的 `installPersistence()`（`$subscribe` + 300ms 防抖 → `localStorage['md-editor-settings']`）。`EditorView` 移除调试信息与 `vditorTheme = 'light'`，改用 `inject(THEME_INJECTION_KEY, ref('light'))` 拿 `effectiveTheme` 透传给 `<VditorEditor theme={...} />`，vditor 侧由 `VditorEditor` 原有的 `watch(theme)` 调 `vditor.setTheme('classic'|'dark')`。`TitleBar` 增加「设置」NButton（`aria-label="打开设置"`）+ 本地 `showSettings` ref + 嵌入 `<SettingsDrawer v-model:show>`（Drawer 显隐不入 store）。`src/plugins/naive.js` 追加 `NDrawer / NDrawerContent / NRadio / NRadioGroup / NSwitch / NSlider / NDivider / NH3 / NText`（保留按需全局注册）。验证：`npm run format` / `npm run lint` / `npm run build` 均通过，无新增依赖。同步更新 `AGENTS.md` §3 目录结构与 §6 路线图。后续：M6 另存为、M7 外部修改检测（`useExternalWatcher` + `ExternalChangeDialog`）、M8 外部异常处理、M9 体验打磨。任意超出「占位脚手架」的功能实现都属于**较大更新**，请同步更新本文件。_

_历史：M5 主题层修复（Naive UI 主题变量全局不可见）。背景：vditor 主题修复后仍出现「暗模式仍白底」的反馈（如 `.editor-view` 始终是白色），逐层排查发现根因不止 vditor。读 Naive UI 源码确认：**`--n-color` / `--n-text-color` / `--n-border-color` 等不是全局 CSS 变量**——`css-render` 在每个组件挂载时生成 hash 类（如 `.__button-dark-abc123`），把 CSS 变量挂在该类的 style 块里，**仅在该组件根元素作用域内生效**（见 `node_modules/naive-ui/es/_mixins/use-css-vars-class.mjs`）。项目此前所有 `var(--n-color, #ffffff)` / `var(--n-border-color, #e6e6e6)` / `var(--n-text-color-3, #888)` 等写法在暗模式下**永远是 fallback 值**。修复：① `App.jsx` 在 `<NConfigProvider>` 内挂 `<NGlobalStyle>`（副作用组件）负责 body —— 读 merged theme 的 `bodyColor` / `textColor2` 写为 `body.style.*` 内联样式 + `.3s` 过渡 + 响应式更新；② 新增 `src/composables/useThemeStyles.js` 包 `useThemeVars()` 暴露 `bodyColor / cardColor / borderColor / dividerColor / textColor1/2/3` 为 `ComputedRef`；③ `EditorView.jsx` `.editor-view` 的 `background` 改用 `themeStyles.bodyColor.value`；④ `TitleBar.jsx` `.editor-title-bar` 的 `background` / `borderBottom` 改用 `themeStyles.cardColor.value` / `themeStyles.borderColor.value`；⑤ `EntryView.jsx` 副标题 `color` 改用 `themeStyles.textColor3.value`；⑥ `src/styles/index.css` 移除 `html / body / #app` 上失效的 `var(--n-color, #ffffff)` / `var(--n-text-color, #333333)`，body 背景与文字由 NGlobalStyle 接管。同步更新 `AGENTS.md` §3 目录结构与 §6 路线图 M5 子项。任意超出「占位脚手架」的功能实现都属于**较大更新**，请同步更新本文件。_

_历史：M5 收尾修复（vditor 暗主题部分切换为官方 API 实现）。

_历史：完成 M4 关闭拦截（新增 `src/composables/useUnsavedGuard.js`：① `installGuard()` 注册 `window.beforeunload` + Vue Router `beforeEach` 两路拦截——`beforeunload` 仅在 dirty=true 时设 `e.preventDefault() + e.returnValue = ''` 触发浏览器原生「离开 / 取消」；`router.beforeEach` 仅当 `from.path === '/editor'` 且 `to.path !== '/editor'` 且 dirty=true 时拦截，先 `await waitUntil(!isSaving, timeout=10s)` 等自动保存完成，再次判断 dirty 后 `window.confirm()` 二次确认（方案 A `dispatchEvent` 逻辑上不可行·见 M4 §3.2 注解，本实现用 `window.confirm()` 作为浏览器原生弹窗后备，与 §9 #18 决议精神一致）；② `uninstallGuard()` 幂等清理两个监听器，避免 HMR / 重复挂载下 console 重复警告；③ `onBeforeUnmount` 兑底清理调用方忘记 uninstall 的情况；④ `installGuard()` 幂等，重复调用不重复注册。`EditorView.jsx` `setup()` 中：`useAutoSave` 返回 `isSaving`、新增 `toRef(editorStore, 'dirty')` 作为 `isDirtyRef`，在 `onMounted(() => guard.installGuard())` 安装（保证 router 初始化后再注册守卫）。同步更新 `AGENTS.md` §3 目录结构与 §6 路线图。任意超出「占位脚手架」的功能实现都属于**较大更新**，请同步更新本文件。_

_历史：M3 自动保存 + 未保存指示（新增 `src/composables/useAutoSave.js`：防抖 + 首存另存为 + 1s/2s/4s 退避重试 3 次 + 失败 toast + 中断 generation 机制 + `cancelPending`；`EditorView` `setup()` 接入 `useAutoSave(editorStore.content)`；`TitleBar` 新增 primary 色 8px 圆点（`role="status" aria-label="未保存"`），不再依赖 `store.displayName` 内置 `●` 后缀，无句柄时右侧 NTag 改为「新建文档（首次保存将弹出对话框）」；`useEditorStore.setContent` 改为 `dirty = value !== lastSavedContent`，容许 undo 回滚 / programmatic 重置时圆点消失）。后续修复：① `VditorEditor.jsx` 兑底 vditor 3.11.x `customWysiwygToolbar` 缺失错误（选中表格/代码块等元素时 vditor 内部会无条件调用 `vditor.options.customWysiwygToolbar(...)`，类型上该选项为 optional 但运行时未做 optional-chaining 守卫），提供空函数避免控制台报错；② `useAutoSave.js` 移除退避间插的「第 N 次重试中」toast，避免与 `useFileSystem.saveFile` 的「保存失败：…」toast 重叠刷屏，仅保留末轮「自动保存失败，请手动保存」汇总提示；③ `useFileSystem.saveFile` 返回值改为 `{ ok, error }`（保留原 toast 行为），新增 `requestPermission(handle, mode?)` 与 `saveFileWithPermission(handle, content)` 封装：首次写入遇 `NotAllowedError` / `SecurityError` 时主动调 `handle.requestPermission({ mode: 'readwrite' })` 弹系统授权框，授权后重试一次写入；`TitleBar` 手动保存与 `useAutoSave` 首次自动保存都改走 `saveFileWithPermission`，权限被拒后跳过退避重试并明确提示「未授予写入权限，请点击编辑器「保存」按钮重新授权」）。_
