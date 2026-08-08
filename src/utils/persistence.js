/**
 * localStorage 安全读写工具。
 *
 * 主要用于「设置偏好」等需要跨刷新保留的轻量状态；提供：
 * - 写入端：捕获 QuotaExceededError / SecurityError 等异常；
 * - 读取端：处理 JSON 解析失败（回退 `null`，由调用方决定降级策略）；
 * - 防抖工具：避免 `$subscribe` 高频触发时频繁 IO。
 *
 * 详见设计文档 §6.4 / Phase 2 §9 #1。
 */

/**
 * 判定当前环境是否可访问 localStorage。
 *
 * 部分隐私模式 / iframe 沙箱会抛 SecurityError，需要提前兜底。
 *
 * @returns {boolean}
 */
export function hasLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const probe = '__md_editor_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * 从 localStorage 读取 JSON；解析失败或键缺失时回退 `null`。
 *
 * @param {string} key 键名
 * @returns {*} 解析后的对象 / 数组 / 基础类型；任何异常均返回 `null`
 */
export function readJSON(key) {
  if (!hasLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[persistence] failed to read "${key}":`, err);
    return null;
  }
}

/**
 * 向 localStorage 写入 JSON；写入失败（如配额超限）时返回 `false`。
 *
 * @param {string} key 键名
 * @param {*} value 任意可被 `JSON.stringify` 序列化的值
 * @returns {boolean} 是否写入成功
 */
export function writeJSON(key, value) {
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[persistence] failed to write "${key}":`, err);
    return false;
  }
}

/**
 * 防抖函数 —— 在「停止触发 N ms」后才执行回调。
 *
 * 用于 `$subscribe` 写入策略：编辑过程中高频触发，但只在空闲 300ms 后落盘。
 *
 * @param {Function} fn 要防抖的函数
 * @param {number} wait 空闲时长（毫秒）
 * @returns {Function} 包装后的函数，附带 `cancel()` 方法可取消待执行任务
 */
export function debounce(fn, wait) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  const wrapped = (...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}
