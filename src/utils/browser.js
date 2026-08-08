/**
 * 浏览器能力检测工具。
 *
 * File System Access API（`showOpenFilePicker` / `showSaveFilePicker`）
 * 目前仅 Chromium 系浏览器（Chrome / Edge / Opera / Brave）原生支持，
 * Firefox / Safari 暂不支持。详见 Phase 2 §9 #17。
 */

/**
 * 当前环境是否暴露了 File System Access API 的核心入口。
 *
 * 同时检查 `window.showOpenFilePicker` 与 `window.showSaveFilePicker`，
 * 两个 API 必须同时可用才视为「完整支持」。
 *
 * @returns {boolean} `true` 表示当前浏览器可调用原生文件读写。
 */
export function hasFSAPI() {
  if (typeof window === 'undefined') return false;
  return (
    typeof window.showOpenFilePicker === 'function' &&
    typeof window.showSaveFilePicker === 'function'
  );
}

/**
 * 判定当前浏览器是否为 Chromium 内核。
 *
 * 通过 UA 字符串粗略判断，覆盖：
 * - Chrome / Chromium
 * - Edge（新版 Chromium 内核）
 * - Opera / OPR
 * - Brave
 *
 * 该判断仅用于「提示文案」等弱断言场景；强约束仍以 `hasFSAPI()` 为准。
 *
 * @returns {boolean} `true` 表示当前 UA 命中 Chromium 系浏览器。
 */
export function isChromium() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  const ua = navigator.userAgent;
  // 注意：Edge / Opera / Brave 均包含 "Chrome"，需在前面先排除 Edge/Opera 再统一兜底
  return /Edg\//.test(ua) || /OPR\//.test(ua) || /Chrome\//.test(ua) || /CriOS\//.test(ua);
}
