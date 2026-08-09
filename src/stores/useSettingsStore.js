import { ref } from 'vue';
import { defineStore } from 'pinia';
import { readJSON, writeJSON, debounce } from '@/utils/persistence';

/**
 * 用户偏好 store —— 主题、自动保存、外部轮询等可持久化设置。
 *
 * 字段 / 默认值见设计文档 §3.2 / Phase 2 §9 #1。
 *
 * 持久化策略：
 * - **写入**：`installPersistence()` 内部注册 `$subscribe`，防抖 300ms 后
 *   将当前 state 序列化写入 `localStorage['md-editor-settings']`。
 * - **读取**：由 `main.js` 调用 `hydrateSettings()` 完成；解析失败回退默认值
 *   并 `console.warn`。
 */

export const SETTINGS_STORAGE_KEY = 'md-editor-settings';
const PERSIST_DEBOUNCE_MS = 300;

/** 允许的主题值。 */
const ALLOWED_THEMES = /** @type {const} */ (['light', 'dark', 'auto']);

/**
 * 默认设置。所有字段在 schema 校验失败时回退到本对象。
 *
 * `outlineEnabled` 默认 `false`：与 vditor 的 `outline.enable` 默认值对齐，
 * 避免老用户升级看到突然多出来的大纲面板。
 */
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light',
  autoSave: true,
  autoSaveInterval: 5,
  externalWatchEnabled: true,
  externalWatchInterval: 10,
  outlineEnabled: false,
});

/**
 * 校验一段「可能是 localStorage 反序列化产物」的对象，
 * 仅保留 schema 允许的字段；非法值回退到默认。
 *
 * @param {*} raw 任意来源（可能为 null / undefined / 非法对象）
 * @returns {{ value: typeof DEFAULT_SETTINGS, usedDefault: boolean, warnings: string[] }}
 */
export function validateSettings(raw) {
  const warnings = [];
  const value = { ...DEFAULT_SETTINGS };

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    if (raw !== null && raw !== undefined) {
      warnings.push('settings payload is not a plain object');
    }
    return { value, usedDefault: true, warnings };
  }

  // theme：仅允许 'light' | 'dark' | 'auto'
  if (Object.prototype.hasOwnProperty.call(raw, 'theme')) {
    if (ALLOWED_THEMES.includes(raw.theme)) {
      value.theme = raw.theme;
    } else {
      warnings.push(`invalid theme "${String(raw.theme)}", fallback to "light"`);
    }
  }

  // autoSave：必须为 boolean
  if (Object.prototype.hasOwnProperty.call(raw, 'autoSave')) {
    if (typeof raw.autoSave === 'boolean') {
      value.autoSave = raw.autoSave;
    } else {
      warnings.push(`invalid autoSave "${String(raw.autoSave)}", fallback to true`);
    }
  }

  // autoSaveInterval：必须为正整数（1-30）
  if (Object.prototype.hasOwnProperty.call(raw, 'autoSaveInterval')) {
    const n = raw.autoSaveInterval;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 30) {
      value.autoSaveInterval = n;
    } else {
      warnings.push(`invalid autoSaveInterval "${String(n)}", fallback to 5`);
    }
  }

  // externalWatchEnabled：必须为 boolean
  if (Object.prototype.hasOwnProperty.call(raw, 'externalWatchEnabled')) {
    if (typeof raw.externalWatchEnabled === 'boolean') {
      value.externalWatchEnabled = raw.externalWatchEnabled;
    } else {
      warnings.push(
        `invalid externalWatchEnabled "${String(raw.externalWatchEnabled)}", fallback to true`,
      );
    }
  }

  // externalWatchInterval：必须为正整数（5-60）
  if (Object.prototype.hasOwnProperty.call(raw, 'externalWatchInterval')) {
    const n = raw.externalWatchInterval;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 5 && n <= 60) {
      value.externalWatchInterval = n;
    } else {
      warnings.push(`invalid externalWatchInterval "${String(n)}", fallback to 10`);
    }
  }

  // outlineEnabled：必须为 boolean
  if (Object.prototype.hasOwnProperty.call(raw, 'outlineEnabled')) {
    if (typeof raw.outlineEnabled === 'boolean') {
      value.outlineEnabled = raw.outlineEnabled;
    } else {
      warnings.push(`invalid outlineEnabled "${String(raw.outlineEnabled)}", fallback to false`);
    }
  }

  return { value, usedDefault: false, warnings };
}

export const useSettingsStore = defineStore('settings', () => {
  // ────────── state ──────────
  const theme = ref(DEFAULT_SETTINGS.theme);
  const autoSave = ref(DEFAULT_SETTINGS.autoSave);
  const autoSaveInterval = ref(DEFAULT_SETTINGS.autoSaveInterval);
  const externalWatchEnabled = ref(DEFAULT_SETTINGS.externalWatchEnabled);
  const externalWatchInterval = ref(DEFAULT_SETTINGS.externalWatchInterval);
  const outlineEnabled = ref(DEFAULT_SETTINGS.outlineEnabled);

  // 防抖写入器（实例级；installPersistence 时绑定）
  const persist = debounce((snapshot) => {
    writeJSON(SETTINGS_STORAGE_KEY, snapshot);
  }, PERSIST_DEBOUNCE_MS);

  // ────────── actions ──────────

  /**
   * 注册持久化订阅；需在 Pinia 实例化之后、且 store 已激活时调用一次。
   *
   * 必须以 `useSettingsStore().installPersistence()` 的形式调用，
   * 以便 `this.$subscribe` 可用（Pinia setup store 中 `$subscribe` 不在 setup 闭包里）。
   */
  function installPersistence() {
    // 通过 this 访问 Pinia 的 $subscribe（参见上面说明）
    this.$subscribe(
      (_mutation, state) => {
        // 仅持久化 schema 字段，避免写入无关属性
        const snapshot = {
          theme: state.theme,
          autoSave: state.autoSave,
          autoSaveInterval: state.autoSaveInterval,
          externalWatchEnabled: state.externalWatchEnabled,
          externalWatchInterval: state.externalWatchInterval,
          outlineEnabled: state.outlineEnabled,
        };
        persist(snapshot);
      },
      { detached: true },
    );
  }

  return {
    // state
    theme,
    autoSave,
    autoSaveInterval,
    externalWatchEnabled,
    externalWatchInterval,
    outlineEnabled,
    // actions
    installPersistence,
  };
});

/**
 * 从 localStorage 反序列化设置并 $patch 到 store；解析失败回退默认值。
 *
 * 应在 `app.mount('#app')` 之前调用，确保 store 已激活。
 */
export function hydrateSettings(pinia) {
  const raw = readJSON(SETTINGS_STORAGE_KEY);
  if (raw === null) return; // 首次启动 / 键不存在
  const { value, warnings } = validateSettings(raw);
  if (warnings.length > 0) {
    console.warn('[settings] hydration warnings:', warnings);
  }
  useSettingsStore(pinia).$patch(value);
}
