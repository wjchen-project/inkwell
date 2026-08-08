import { onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

/**
 * 未保存拦截 composable —— 设计文档 §6.5 / M4 §3.2 / Phase 2 §5.3 / Phase 3 §4.3。
 *
 * 行为：
 *   - `installGuard()`：
 *       1. 注册 `window.beforeunload` 监听 → dirty=true 时弹浏览器原生「离开 / 取消」
 *          （§9 #5 / #18「仅走浏览器原生 beforeunload」）
 *       2. 注册 Vue Router `beforeEach` 守卫 → 离开 `/editor` 时检查 dirty
 *          · dirty=false → 直接放行
 *          · dirty=true → 先等待自动保存完成（最长 10s 超时放行，避免卡死）
 *          · 保存完成后仍 dirty → 二次确认（见 `simulateBeforeUnload`）
 *   - `uninstallGuard()`：清理两个监听器，避免重复注册 / 泄漏
 *
 * 调用约束：
 *   - 必须在组件 `setup()` 中调用，以让 `useRouter()` 拿到路由实例
 *   - 通常在 `onMounted(() => installGuard())`；卸载由 composable 内部
 *     `onBeforeUnmount` 兜底（也允许调用方在外部显式 `uninstallGuard()`）
 *
 * 关于 `simulateBeforeUnload` 的实现选择（M4 §3.2）：
 *   - **方案 A**（`dispatchEvent(new Event('beforeunload'))`）：浏览器安全策略
 *     禁止脚本主动弹出 beforeunload UI，并且 `dispatchEvent` 是否返回 false
 *     完全由本进程注册的 `beforeunload` handler 决定（dirty 时永远
 *     `preventDefault`），无法让用户做选择——逻辑上不可行。
 *   - **方案 B**（自定义 `useDialog()` 模态）：与 §9 #18「仅浏览器原生
 *     beforeunload」决策有出入，仅在浏览器限制下作为后备。
 *   - **本实现**：使用 `window.confirm()` —— 浏览器原生确认对话框，两选项
 *     （确定 = 离开 / 取消 = 取消），UX 与 beforeunload 等价，无新增依赖，
 *     与 §9 #18「浏览器原生弹窗」精神一致。若日后需要更精细的视觉/可访问性，
 *     可平替为 Naive UI `useDialog`（仅替换 `simulateBeforeUnload` 内部即可）。
 *
 * 多次调用 `installGuard()` / `uninstallGuard()` 幂等：不会重复注册监听器，
 * 避免 HMR / 多次挂载场景下的「重复监听」控制台警告。
 *
 * @param {import('vue').Ref<boolean>} isDirtyRef 是否有未保存变更
 * @param {import('vue').Ref<boolean>} isSavingRef 自动保存是否正在进行
 * @returns {{
 *   installGuard: () => void,
 *   uninstallGuard: () => void,
 * }}
 */
export function useUnsavedGuard(isDirtyRef, isSavingRef) {
  const router = useRouter();

  // ────────── 内部状态 ──────────
  /** @type {((e: BeforeUnloadEvent) => void) | null} */
  let beforeUnloadHandler = null;
  /** @type {(() => void) | null} */
  let removeRouterGuard = null;

  /**
   * 轮询等待 predicate 返回 true，或超时放行。用于「自动保存进行中 → 等待完成」。
   *
   * @param {() => boolean} predicate
   * @param {number} timeout ms
   * @returns {Promise<void>}
   */
  function waitUntil(predicate, timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (predicate()) return resolve();
        if (Date.now() - start > timeout) return resolve(); // 超时放行，避免阻塞导航
        setTimeout(check, 100);
      };
      check();
    });
  }

  /**
   * 路由切换时的「是否离开」二次确认。
   *
   * 返回 Promise 是为了与未来可能切换到 `useDialog()` 异步模态兼容；
   * 当前实现 `window.confirm` 是同步的，包一层 `Promise.resolve` 即可。
   *
   * @returns {Promise<boolean>} true = 放行（离开），false = 阻止（取消）
   */
  function simulateBeforeUnload() {
    return Promise.resolve(window.confirm('当前文档有未保存的修改，确定要离开吗？'));
  }

  /**
   * 注册 beforeunload + 路由守卫。多次调用幂等。
   */
  function installGuard() {
    if (beforeUnloadHandler !== null) return; // 已注册 → 不重复添加

    // ── 1. beforeunload：标签关闭 / 刷新 / 退出应用 ──
    beforeUnloadHandler = (e) => {
      if (!isDirtyRef.value) return; // 无未保存 → 放行（不设置 returnValue）
      e.preventDefault();
      // 现代浏览器要求 returnValue 被设置后才显示原生确认框
      // （https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event）
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);

    // ── 2. 路由切换：编辑器页面 → 其他页面 ──
    removeRouterGuard = router.beforeEach(async (to, from) => {
      // 仅在编辑器页面拦截；其他页面之间的导航不在本 guard 管辖范围
      if (from.path !== '/editor') return true;
      // 同页面 query 变化（如 ?mode=new → ?mode=open）不触发拦截（M4 §4.1）
      if (to.path === '/editor') return true;
      // 无未保存内容 → 直接放行
      if (!isDirtyRef.value) return true;

      // 自动保存进行中 → 等待完成（最多 10s）
      if (isSavingRef.value) {
        await waitUntil(() => !isSavingRef.value, 10000);
      }
      // 保存可能清掉了 dirty（保存成功），重新判断
      if (!isDirtyRef.value) return true;

      // 仍 dirty → 二次确认
      return await simulateBeforeUnload();
    });
  }

  /**
   * 卸载监听器。多次调用幂等。
   */
  function uninstallGuard() {
    if (beforeUnloadHandler !== null) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
    if (removeRouterGuard !== null) {
      removeRouterGuard();
      removeRouterGuard = null;
    }
  }

  // 组件卸载兜底：调用方若忘记 uninstallGuard()，这里也能正确清理
  onBeforeUnmount(() => uninstallGuard());

  return { installGuard, uninstallGuard };
}
