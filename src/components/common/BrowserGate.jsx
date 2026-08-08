import { defineComponent, computed } from 'vue';
import { NAlert } from 'naive-ui';
import { hasFSAPI } from '@/utils/browser';

/**
 * 入口处浏览器能力检测（设计文档 §5.5 / Phase 2 §9 #17）。
 *
 * - 当 `window.showOpenFilePicker` 与 `window.showSaveFilePicker` 同时可用时，
 *   视为「完整支持」，**不渲染任何提示**，直接透传 children（router-view）。
 * - 当任一 API 缺失时，顶部显示「请使用 Chrome / Edge 获得完整体验」提示，
 *   **但仍然渲染 children** —— M1 阶段不阻断路由跳转，方便后续阶段调试。
 *
 * 后续（M5+）如需阻断，可改为条件渲染 children。
 */
export default defineComponent({
  name: 'BrowserGate',
  setup(_, { slots }) {
    const supported = computed(() => hasFSAPI());

    return () => (
      <div class="browser-gate">
        {!supported.value && (
          <NAlert type="warning" title="浏览器能力不足" style={{ margin: '16px' }} showIcon>
            本应用依赖 File System Access API（showOpenFilePicker / showSaveFilePicker）， 请使用
            Chrome / Edge / Opera / Brave 等 Chromium 内核浏览器获得完整体验。
          </NAlert>
        )}
        {slots.default ? slots.default() : null}
      </div>
    );
  },
});
