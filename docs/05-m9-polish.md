# 05 · M9 · 体验打磨（Polish）

> ✅ **已通过验收**（v1.1.3 最终交付）
> 第五阶段 · 里程碑 9 / 9
> 关联设计文档：[04-design.md §8 错误处理](../04-design.md#8-错误处理策略) / [§7 关键流程](../04-design.md#7-关键流程)
> 关联需求：Phase 2 §9 决议中所有体验细节的最终落地

---

## 1. 目标

在前 8 个里程碑功能完成的基础上，补齐**细节打磨**：快捷键完善、vditor 工具栏集成、键盘可达性、视觉一致性、浏览器入口提示。本里程碑为最终收尾，部分条目按优先级取舍完成。

---

## 2. 依赖

### 2.1 前置里程碑

- **M1-M8 全部完成**（尤其是 M2 入口页 + M5 主题 + M6 另存为 + M7 外部检测 + M8 异常处理）

### 2.2 外部依赖

无新增。

---

## 3. 交付内容

### 3.1 快捷键完善

| 快捷键 | 功能 | 实现位置 |
| --- | --- | --- |
| `Ctrl/Cmd+S` | 手动保存 | `EditorView` 顶层监听 |
| `Ctrl/Cmd+Shift+S` | 另存为 | M6 已实现，确认不与 vditor 冲突 |
| `Ctrl/Cmd+,` | 打开设置 | `EditorView` 顶层监听（macOS 风格） |
| `Esc` | 关闭设置 Drawer | Naive UI Drawer 默认支持 |
| `Esc` | 关闭 ExternalChangeDialog | Naive UI Modal 默认支持 |

**注意**：`Ctrl/Cmd+S` 可能被 vditor 占用。需在 vditor 初始化时通过配置释放：

```js
new Vditor(el, {
  ...,
  // 禁用 vditor 的 Ctrl+S 处理（让它冒泡到我们的 handler）
})
```

或实测是否冲突。

### 3.2 vditor 工具栏自定义按钮

在 `VditorEditor` 初始化时，将 M6 的「另存为」与 M5 的「设置」入口以 vditor 自定义按钮的形式加入工具栏：

```js
toolbar: [
  ...默认按钮,
  {
    name: 'save-as',
    tip: '另存为 (Ctrl/Cmd+Shift+S)',
    icon: '<svg>...</svg>',  // 保存图标
    click: () => handleSaveAs(),
  },
  {
    name: 'settings',
    tip: '设置',
    icon: '<svg>...</svg>',  // 齿轮图标
    click: () => showSettingsDrawer.value = true,
  },
]
```

`TitleBar` 的对应按钮可保留也可移除（避免重复）。建议：**vditor 工具栏放主功能按钮，TitleBar 只保留文件名 + 圆点**。

### 3.3 键盘可达性

| 元素 | aria 属性 |
| --- | --- |
| 「未保存」圆点 | `aria-label="未保存"` |
| 「文件不可用」徽标 | `aria-label="文件不可用"` |
| 「另存为」按钮 | `aria-label="另存为"` |
| 「设置」按钮 | `aria-label="设置"` |
| ExternalChangeDialog 三按钮 | 默认（Naive UI 提供） |
| BrowserGate 警告 | `role="alert"` |
| Toast 通知 | `role="status"` / `aria-live="polite"` |

**Tab 顺序**：

1. vditor 编辑区
2. vditor 工具栏按钮
3. TitleBar 操作按钮（另存为 / 设置）
4. SettingsDrawer 内表单控件

### 3.4 视觉一致性

- vditor 主题色与 Naive UI primary 对齐：通过 `vditor-overrides.css` 用 CSS 变量覆盖
- 字体：vditor 默认字体 + Naive UI 默认字体统一为系统字体栈
- 间距：EditorView 整体 padding 与 vditor 内部对齐
- 图标：vditor 工具栏图标与 TitleBar 操作按钮图标风格统一（line / filled 一致）

### 3.5 浏览器入口提示

非 Chromium 浏览器进入 `BrowserGate` 时：

- 显示全屏 / 半屏遮罩
- 文案：「请使用 Chrome / Edge / Opera / Brave 获得完整体验」
- 提供 Chromium 系浏览器下载链接（可选）
- 不禁用路由跳转，但禁用编辑器入口（用户在 EntryView 看到的「新建 / 打开」按钮置灰）

### 3.6 错误边界

```jsx
// VditorEditor 外层包 ErrorBoundary（自实现或使用 vue-error-boundary）
<ErrorBoundary onError={(err) => toast('编辑器错误：' + err.message)}>
  <VditorEditor ... />
</ErrorBoundary>
```

- vditor 初始化失败 → 友好提示「编辑器加载失败，请刷新页面」
- 运行时 vditor 异常 → 上报告错，不让整个应用崩溃

### 3.7 加载与过渡

- vditor 初始化期间显示骨架屏（避免闪烁）
- 主题切换时 vditor 实例重建 → 用 `<Transition mode="out-in">` 平滑过渡
- 路由切换加 `<Transition>` 过渡

### 3.8 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/views/EditorView.jsx` | 加入 `Ctrl/Cmd+S`、`Ctrl/Cmd+,` 监听 |
| `src/components/editor/VditorEditor.jsx` | 工具栏自定义按钮 + ErrorBoundary 包裹 |
| `src/components/editor/TitleBar.jsx` | aria-label 完善；可选移除按钮（让位给 vditor 工具栏） |
| `src/components/common/BrowserGate.jsx` | 完善非 Chromium 提示 UI |
| `src/styles/vditor-overrides.css` | vditor 主题色覆盖 |

---

## 4. 验收标准

### 4.1 快捷键

- [x] `Ctrl+S` / `Cmd+S` 触发手动保存（不弹对话框，已存在 fileHandle 时静默写入）
- [x] `Ctrl+Shift+S` / `Cmd+Shift+S` 触发另存为（M6 已验证）
- [x] `Ctrl+,` / `Cmd+,` 打开 SettingsDrawer
- [x] `Esc` 关闭 SettingsDrawer
- [x] `Esc` 关闭 ExternalChangeDialog
- [x] vditor 内置快捷键（粗体、斜体等）仍正常工作

### 4.2 工具栏

- [x] vditor 工具栏显示「另存为」「设置」自定义按钮（位置在末尾）
- [x] 自定义按钮点击触发对应功能
- [x] 按钮 tooltip 正确显示

### 4.3 可访问性

- [x] 仅用键盘可完成：打开 → 编辑 → 保存 → 关闭 全流程
- [x] Tab 顺序符合 §3.3 设计
- [x] 屏幕阅读器能识别 dirty 状态（aria-label="未保存"）
- [x] 屏幕阅读器能识别 orphaned 状态
- [x] Naive UI 组件默认 aria 属性保留

### 4.4 视觉一致性

- [x] light / dark 主题下，vditor 与 Naive UI 组件色调一致
- [x] TitleBar / vditor 工具栏 / Drawer 字体一致
- [x] 主要操作按钮（另存为、设置、vditor 工具栏按钮）图标风格统一

### 4.5 浏览器入口

- [x] Firefox / Safari 中 BrowserGate 显示友好提示
- [x] 提示文案清晰指出支持的浏览器
- [x] EntryView 的「新建」「打开」按钮在非 Chromium 中禁用（置灰 + 鼠标悬停提示）

### 4.6 错误边界

- [x] vditor 初始化失败 → 显示「编辑器加载失败，请刷新」+ 不影响其他路由
- [x] runtime error → toast 提示 + 应用不崩溃
- [x] 错误日志可在 console 中查看

### 4.7 加载体验

- [x] 路由进入 `/editor` 时显示骨架屏（短暂闪烁被消除）
- [x] 主题切换时编辑器平滑过渡（无白屏闪烁）
- [x] 路由切换有过渡动画

### 4.8 质量验收

- [x] `npm run lint` 通过
- [x] `npm run build` 通过
- [x] `npm run format` 通过
- [x] Lighthouse 评分（性能 / 可访问性 / 最佳实践）≥ 80
- [x] Bundle 大小：gzipped ≤ 200KB（vditor + naive-ui + app code）
- [x] 首屏加载时间：≤ 2s（dev 模式）/ ≤ 1s（prod build）

---

## 5. 可选子项（时间允许时再做）

按优先级排序，可单独评估：

1. **图标库集成**：vditor 工具栏自定义按钮需要 SVG 图标，可引入 `@vicons/ionicons5` 或类似
2. **快捷键自定义**：允许用户在设置中修改快捷键
3. **多语言**：当前 UI 文案硬编码中文，未来 i18n 化
4. **PWA**：支持离线安装
5. **单元测试 / E2E 测试**：引入 Vitest + @vue/test-utils + Playwright

---

## 6. 参考

- 设计文档：[04-design.md §7 §8](../04-design.md)
- 需求文档：[Phase 2 §9](../02-editor-and-experience.md#91-phase-2-§9-原待澄清问题决议) / [Phase 3 §9](../03-file-capabilities.md)
- vditor 工具栏配置：[vditor 文档](https://github.com/Vanessa219/vditor/blob/master/USAGE.md)