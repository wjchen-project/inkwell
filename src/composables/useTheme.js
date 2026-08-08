import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useSettingsStore } from '@/stores/useSettingsStore';

/**
 * 主题切换 composable —— 设计文档 §6.4 / M5 §3.2 / Phase 2 §9 #2。
 *
 * 返回：
 *   - `theme`          双向绑定的用户偏好（'light' | 'dark' | 'auto'）
 *                      读取返回当前 store 值；写入会同步到 `useSettingsStore.theme`
 *   - `effectiveTheme` 实际生效主题（'light' | 'dark'），由 `theme` 与系统偏好计算
 *                      是只读的 ref，可被传给 vditor / Naive UI 等下游消费者
 *   - `setTheme(value)` 写入用户偏好的便捷函数
 *
 * 系统主题联动（仅在 `theme === 'auto'` 时）：
 *   - 初始化时读 `window.matchMedia('(prefers-color-scheme: dark)').matches`
 *   - 通过 `MediaQueryList.addEventListener('change', ...)` 监听系统主题变化
 *     → 重新计算 `effectiveTheme`
 *   - `theme` 切离 `auto` 时立即 remove 监听器，避免空挂载
 *
 * 设计抉择：
 *   - 仅在 `App.jsx` 调用一次（`setup()` 中同步调用）。`effectiveTheme` 通过
 *     `provide / inject`（THEME_INJECTION_KEY）共享给 `EditorView`，
 *     避免 `matchMedia` 监听器被多处注册造成重复回调。
 *   - 与 M5 §3.4「EditorView 调用 useTheme」略有偏差——以"避免系统监听器重复"为目标，
 *     把 `useTheme` 收敛到根组件；`EditorView` 通过 `inject(THEME_INJECTION_KEY)`
 *     拿到同一份 `effectiveTheme` ref，行为等价。
 *
 * 调用约束：
 *   - 必须在组件 `setup()` 中调用
 *   - Pinia 实例必须在调用前已激活（`main.js` 中 `app.use(pinia)` 在 `App` mount 之前完成，
 *     `hydrateSettings()` 会先恢复主题）
 *
 * @returns {{
 *   theme: import('vue').WritableComputedRef<'light' | 'dark' | 'auto'>,
 *   effectiveTheme: import('vue').ComputedRef<'light' | 'dark'>,
 *   setTheme: (value: 'light' | 'dark' | 'auto') => void,
 * }}
 */

/** `MediaQueryList` 的 media query 字符串；`auto` 模式下使用。 */
const SYSTEM_DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** inject key —— 用于跨组件共享同一份 effectiveTheme ref。 */
export const THEME_INJECTION_KEY = /** @type {unique symbol} */ (Symbol('md-editor:theme'));

export function useTheme() {
  const settingsStore = useSettingsStore();

  // ────────── 用户偏好（双向绑定 store）──────────
  const theme = computed({
    get: () => settingsStore.theme,
    set: (value) => {
      settingsStore.theme = value;
    },
  });

  // ────────── 系统偏好（auto 模式下才被引用）──────────
  const systemPrefersDark = ref(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(SYSTEM_DARK_MEDIA_QUERY).matches,
  );

  /** @type {MediaQueryList | null} */
  let mediaQuery = null;
  /** @type {((e: MediaQueryListEvent) => void) | null} */
  let mediaListener = null;

  function attachMediaListener() {
    if (mediaQuery) return; // 已附加（避免重复 add）
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    mediaQuery = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY);
    // 立即同步一次 —— 处理「auto 状态在 hydrate 时错过了初始值」的边界
    systemPrefersDark.value = mediaQuery.matches;
    mediaListener = (e) => {
      systemPrefersDark.value = e.matches;
    };
    mediaQuery.addEventListener('change', mediaListener);
  }

  function detachMediaListener() {
    if (mediaQuery && mediaListener) {
      mediaQuery.removeEventListener('change', mediaListener);
    }
    mediaQuery = null;
    mediaListener = null;
  }

  // ────────── 实际生效主题 ──────────
  const effectiveTheme = computed(() => {
    if (theme.value === 'auto') {
      return systemPrefersDark.value ? 'dark' : 'light';
    }
    return theme.value === 'dark' ? 'dark' : 'light';
  });

  // ────────── 维护系统监听器：theme === 'auto' 时 attach，否则 detach ──────────
  watch(
    () => theme.value,
    (next, prev) => {
      if (next === 'auto') {
        attachMediaListener();
      } else if (prev === 'auto') {
        detachMediaListener();
      }
    },
    { immediate: true },
  );

  /**
   * 主动写入用户偏好。等价于 `theme.value = value`，提供显式 API 以匹配
   * 设计文档 §3.2 `setTheme(theme)` 签名。
   */
  function setTheme(value) {
    settingsStore.theme = value;
  }

  // 组件卸载兜底：根组件（App.jsx）通常不卸载，但保留 onBeforeUnmount
  // 以便未来在子树中调用本 composable 时不会泄漏 MediaQueryList 监听器。
  onBeforeUnmount(() => {
    detachMediaListener();
  });

  return {
    theme,
    effectiveTheme,
    setTheme,
  };
}
