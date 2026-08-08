import { defineComponent } from 'vue';
import { RouterView } from 'vue-router';
import BrowserGate from '@/components/common/BrowserGate.jsx';

/**
 * 根组件 —— 浏览器能力检测 + 路由出口。
 *
 * 结构（设计文档 §5.5）：
 *   <BrowserGate>
 *     <RouterView />
 *   </BrowserGate>
 *
 * `BrowserGate` 在非 Chromium 浏览器顶部追加提示 banner，但不阻断路由。
 */
export default defineComponent({
  name: 'App',
  setup() {
    return () => (
      <BrowserGate>
        <RouterView />
      </BrowserGate>
    );
  },
});
