import { defineComponent, provide } from 'vue';
import { RouterView } from 'vue-router';
import {
  NMessageProvider,
  NDialogProvider,
  NConfigProvider,
  NGlobalStyle,
  darkTheme,
} from 'naive-ui';
import BrowserGate from '@/components/common/BrowserGate.jsx';
import { useTheme, THEME_INJECTION_KEY } from '@/composables/useTheme';

/**
 * 根组件 —— 浏览器能力检测 + 路由出口 + Naive UI 全局上下文 + 主题注入。
 *
 * 结构（设计文档 §5.5 + M5 §3.4 + 主题层修复）：
 *   <BrowserGate>
 *     <NConfigProvider :theme="effectiveTheme === 'dark' ? darkTheme : null">
 *       <NGlobalStyle />              ← 负责 body 背景 / 文字 / 字体 / 过渡
 *       <NDialogProvider>
 *         <NMessageProvider>
 *           <RouterView />
 *         </NMessageProvider>
 *       </NDialogProvider>
 *     </NConfigProvider>
 *   </BrowserGate>
 *
 * 为什么需要在 App 根包 Provider：
 *   - `src/plugins/naive.js` 通过 `create({ components })` 仅把 `NMessageProvider`
 *     等注册为**组件**（即 JSX 中可引用），并不等于提供了上下文。
 *   - 子组件（如 EntryView / EditorView / TitleBar）以及 `useFileSystem` 等
 *     composable 都会调用 `useMessage()`，必须能在祖先链上找到 `<n-message-provider />`
 *     实例，否则 Naive UI 会抛 `No outer <n-message-provider /> founded`。
 *   - 同样地，`NDialogProvider` 现在挂上后，M3+ 引入 `useDialog()` 时无需再调整根。
 *
 * M5 主题注入：
 *   - `useTheme()` 在 App 层调用一次，避免 `matchMedia` 监听器被多处注册
 *   - `effectiveTheme` 通过 `provide(THEME_INJECTION_KEY, ...)` 共享给子树；
 *     `EditorView` 通过 `inject(THEME_INJECTION_KEY)` 拿到同一份 ref 并传给 vditor
 *   - `darkTheme` 由 Naive UI 提供；浅色主题传 `null`（沿用默认）
 *
 * `<NGlobalStyle>` 是 Naive UI 提供的副作用组件（无 DOM 输出），挂载后会
 * 读取 merged theme 的 `bodyColor` / `textColor2` 等并设到 `document.body`：
 *   - `body.style.backgroundColor = bodyColor`（暗模式：rgb(16, 16, 20)）
 *   - `body.style.color = textColor2`
 *   - `body.style.fontFamily/fontSize/lineHeight`
 *   - `body.style.transition = 'color/background-color .3s ...'`（平滑过渡）
 *   - `body.setAttribute('n-styled', '')`（防多实例冲突）
 *   Naive UI 的 `--n-color` 不是全局 CSS 变量（仅在每个组件的 hash 类作用域
 *   内生效），所以无法用 CSS 写法「一次性」覆盖；NGlobalStyle 是官方正解。
 *   非 body 层的背景（如 `.editor-view` / `.editor-title-bar`）仍由
 *   `useThemeStyles()` 暴露的 `bodyColor` / `cardColor` 等内联绑定。
 *
 * `BrowserGate` 在非 Chromium 浏览器顶部追加提示 banner，但不阻断路由。
 */
export default defineComponent({
  name: 'App',
  setup() {
    const { effectiveTheme } = useTheme();
    // 共享 effectiveTheme ref 给 EditorView（vditor 主题联动）
    provide(THEME_INJECTION_KEY, effectiveTheme);

    return () => {
      const naiveTheme = effectiveTheme.value === 'dark' ? darkTheme : null;
      return (
        <BrowserGate>
          <NConfigProvider theme={naiveTheme}>
            <NGlobalStyle />
            <NDialogProvider>
              <NMessageProvider>
                <RouterView />
              </NMessageProvider>
            </NDialogProvider>
          </NConfigProvider>
        </BrowserGate>
      );
    };
  },
});
