import { computed } from 'vue';
import { useThemeVars } from 'naive-ui';

/**
 * 把 Naive UI 当前主题的常用颜色变量暴露为响应式 ref —— M5。
 *
 * 背景：
 *   Naive UI 通过 `css-render` 在每个组件挂载时生成一个 hash 类（如
 *   `.__button-dark-abc123`），把 CSS 变量（如 `--n-color` / `--n-text-color`）
 *   挂在这个类的 style 块里，**只在该组件根元素作用域内生效**。也就是说
 *   `var(--n-color, #ffffff)` 这种写法在我们的非 Naive UI 元素（`.editor-view`、
 *   `.editor-title-bar`、EntryView 副标题 等）上**永远是 fallback 值**——
 *   主题切换后这些层完全不变（参见排查报告）。
 *
 *   `useThemeVars()` 是 Naive UI 暴露的官方 composable，返回 merged theme
 *   的 `common` 变量集（`bodyColor` / `cardColor` / `borderColor` /
 *   `textColor1` 等），对主题切换是响应式的。本 composable 只是把它再切片、
 *   转成 `ComputedRef`，方便组件 inline 绑定。
 *
 * 边界：
 *   - 必须在 `NConfigProvider` 子树中调用（`useThemeVars` 内部 inject 了
 *     `configProviderInjectionKey`）。当前所有调用点都在 `App.jsx` 的 Provider
 *     内部，满足约束。
 *   - 与 `useTheme()` 的关系：`useTheme()` 维护用户偏好与系统偏好联动
 *     (`effectiveTheme: 'light' | 'dark'`)，但**不持有实际颜色**；本 composable
 *     与之互补，分别负责「切换意图」与「切换结果」。
 *
 * 命名映射（Naive UI common vars）：
 *   - bodyColor        主背景（页面 / `.editor-view`）
 *   - cardColor        嵌入表面（`.editor-title-bar` 标题条）
 *   - borderColor      边框
 *   - dividerColor     分隔线
 *   - textColor1       主要文本（Naive UI 组件内默认）
 *   - textColor2       次要文本（NGlobalStyle 设到 body 的颜色）
 *   - textColor3       辅助文本（EntryView 副标题）
 *
 * @returns {{
 *   bodyColor: import('vue').ComputedRef<string>,
 *   cardColor: import('vue').ComputedRef<string>,
 *   borderColor: import('vue').ComputedRef<string>,
 *   dividerColor: import('vue').ComputedRef<string>,
 *   textColor1: import('vue').ComputedRef<string>,
 *   textColor2: import('vue').ComputedRef<string>,
 *   textColor3: import('vue').ComputedRef<string>,
 * }}
 */
export function useThemeStyles() {
  const themeVars = useThemeVars();

  return {
    bodyColor: computed(() => themeVars.value.bodyColor),
    cardColor: computed(() => themeVars.value.cardColor),
    borderColor: computed(() => themeVars.value.borderColor),
    dividerColor: computed(() => themeVars.value.dividerColor),
    textColor1: computed(() => themeVars.value.textColor1),
    textColor2: computed(() => themeVars.value.textColor2),
    textColor3: computed(() => themeVars.value.textColor3),
  };
}
