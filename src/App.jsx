import { defineComponent } from 'vue';
import { RouterView } from 'vue-router';
import { NMessageProvider, NDialogProvider } from 'naive-ui';
import BrowserGate from '@/components/common/BrowserGate.jsx';

/**
 * 根组件 —— 浏览器能力检测 + 路由出口 + Naive UI 全局上下文。
 *
 * 结构（设计文档 §5.5）：
 *   <BrowserGate>
 *     <NDialogProvider>
 *       <NMessageProvider>
 *         <RouterView />
 *       </NMessageProvider>
 *     </NDialogProvider>
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
 * `BrowserGate` 在非 Chromium 浏览器顶部追加提示 banner，但不阻断路由。
 */
export default defineComponent({
  name: 'App',
  setup() {
    return () => (
      <BrowserGate>
        <NDialogProvider>
          <NMessageProvider>
            <RouterView />
          </NMessageProvider>
        </NDialogProvider>
      </BrowserGate>
    );
  },
});
