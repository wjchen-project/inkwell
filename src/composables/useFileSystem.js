import { useMessage } from 'naive-ui';
import { getMarkdownAcceptTypes } from '@/utils/file';
import { hasFSAPI } from '@/utils/browser';

/**
 * File System Access API 封装 composable —— 设计文档 §6.1。
 *
 * 暴露方法（均返回 Promise）：
 * - `openFile()` — 弹出系统「打开」对话框，读取 Markdown 文件，返回 `{ handle, content, name }`
 * - `saveFile(handle, content)` — 用已有句柄写入（无对话框），返回 `{ ok, error }`
 * - `saveAsFile(content, suggestedName)` — 弹出系统「另存为」对话框，返回新句柄
 * - `requestPermission(handle, mode?)` — 主动调用 `handle.requestPermission({ mode })`，
 *   弹出系统授权框；返回 `boolean` 表示是否授予
 * - `saveFileWithPermission(handle, content)` — `saveFile` 的封装：首次失败若属权限
 *   错误，自动调一次 `requestPermission`，授权成功再重试一次写入；适合自动保存 / 手动
 *   保存按钮的统一入口
 * - `getMetadata(handle)` — 读取元信息（lastModified / size），供 M7 外部轮询使用
 *
 * 错误分类（影响 M7 / M8）：
 * - `openFile` / `saveAsFile` 暴露「用户取消」接口：
 *   - `AbortError` → 视为用户取消，**静默返回 null**，调用方无需提示
 *   - 业务错误（NotFound / NotAllowed / Security / 其他 IO）→ toast 后 throw
 * - `saveFile` / `saveFileWithPermission` 统一走「toast + return { ok, error }」契约：
 *   - `error.name === 'AbortError'` → 静默，`ok=false`
 *   - `NotFoundError` → toast「文件已被外部删除」后 `ok=false`
 *   - `NotAllowedError` / `SecurityError` → toast「文件权限已被撤销」后 `ok=false`
 *   - 其他 IO → toast「保存失败：<reason>」后 `ok=false`
 *   - 参数错误（handle === null）→ throw TypeError
 *
 * 调用方应据此选择控制流：
 *   - `openFile` / `saveAsFile` 用 `if (!result)` 判取消 / 失败
 *   - `saveFile` / `saveFileWithPermission` 用 `result.ok` 判成功 / 失败，
 *     通过 `result.error?.name` 区分错误类型以决定后续动作
 *
 * 注意：必须在组件 `setup()` 中调用本 composable，以让 `useMessage()` 拿到
 * 上层 `NMessageProvider` 的上下文。
 */

/** 视为「权限类错误」的 DOMException name，供 requestPermission 触发条件判定。 */
const PERMISSION_ERROR_NAMES = /** @type {const} */ (['NotAllowedError', 'SecurityError']);

function isPermissionError(err) {
  return !!(err && PERMISSION_ERROR_NAMES.includes(/** @type {any} */ (err).name));
}

export function useFileSystem() {
  const message = useMessage();

  /**
   * 调用前确认 File System Access API 可用，否则抛出明确错误并 toast。
   *
   * `BrowserGate` 已经做了一次能力检测，但调用方可能绕开它直接使用本 composable，
   * 所以此处再做一次兜底。
   */
  function ensureFSAPI() {
    if (hasFSAPI()) return;
    message.error('当前浏览器不支持文件操作，请使用 Chrome / Edge');
    const err = new Error('File System Access API is unavailable');
    err.name = 'UnsupportedBrowserError';
    throw err;
  }

  /**
   * 把底层异常映射成「toast 文案 + 重新抛出」。`AbortError` 单独处理（不提示）。
   *
   * @param {Error & { name?: string }} err
   * @param {string} prefix 用户可读前缀（如「打开文件失败」「保存失败」）
   */
  function reportAndThrow(err, prefix) {
    if (err && err.name === 'AbortError') return err; // 调用方负责判 null
    const detail = (err && (err.message || err.name)) || 'unknown error';
    message.error(`${prefix}：${detail}`);
    return err;
  }

  /**
   * 打开本地 Markdown 文件。
   *
   * @returns {Promise<{ handle: FileSystemFileHandle, content: string, name: string } | null>}
   *          用户取消时返回 `null`；其他错误经 toast 后抛出。
   */
  async function openFile() {
    ensureFSAPI();
    try {
      const [handle] = await window.showOpenFilePicker({
        types: getMarkdownAcceptTypes(),
        multiple: false,
        excludeAcceptAllOption: false,
      });
      const file = await handle.getFile();
      const content = await file.text();
      return { handle, content, name: file.name };
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw reportAndThrow(err, '打开文件失败');
    }
  }

  /**
   * 用已有句柄写入内容（不弹对话框）。
   *
   * 错误出口契约（与 `openFile` / `saveAsFile` 不同，请注意区分）：
   *   - **业务错误**（NotFound / NotAllowed / Security / 其他 IO）→ 内部 toast 后
   *     `return { ok: false, error }`，错误对象原样保留供上层判断（用于 requestPermission 触发）
   *   - **静默取消**（AbortError）→ 无 toast，`return { ok: false, error }`（error.name === 'AbortError'）
   *   - **参数错误**（handle === null）→ `throw TypeError`（属于调用方 bug，
   *     由调用方在调用前用 `editorStore.hasFileHandle` 守卫）
   *
   * 之所以选择「toast + return」而非「toast + throw」：调用方（例如 `TitleBar` /
   * `useAutoSave`）需要在 UI 层处理「业务失败」与「参数错误」用不同的代码路径；
   * 让 toast 与控制流解耦，同时通过 `error` 字段暴露错误类型，便于上层决定
   * 「是否需要触发 `requestPermission`」或「是否继续退避重试」。
   *
   * 约定：调用方需自行判断「是否需要弹保存路径」（`fileHandle === null` 时走 `saveAsFile`）。
   * 自动保存 / 手动保存两条路径推荐使用 `saveFileWithPermission` 封装，自动处理权限请求。
   *
   * @param {FileSystemFileHandle | null} handle
   * @param {string} content 完整 Markdown 内容
   * @returns {Promise<{ ok: boolean, error: Error | null }>}
   * @throws {TypeError} 当 `handle` 为 null 时抛出
   */
  async function saveFile(handle, content) {
    if (!handle) {
      throw new TypeError(
        'saveFile requires a valid FileSystemFileHandle (use saveAsFile for new files)',
      );
    }
    try {
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return { ok: true, error: null };
    } catch (err) {
      // 统一捕获，保证 error 对象能回到上层；同时根据 name 决定是否 toast。
      if (err && err.name === 'AbortError') {
        // 静默：权限回收等场景，避免打扰用户
        return { ok: false, error: /** @type {Error} */ (err) };
      }
      if (err && err.name === 'NotFoundError') {
        message.error('保存失败：文件已被外部删除');
        return { ok: false, error: /** @type {Error} */ (err) };
      }
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        message.error('保存失败：文件权限已被撤销');
        return { ok: false, error: /** @type {Error} */ (err) };
      }
      const detail = (err && (err.message || err.name)) || 'unknown error';
      message.error(`保存失败：${detail}`);
      return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /**
   * 主动请求句柄的写入权限。`showOpenFilePicker()` 只授予读权限，第一次
   * `createWritable()` 时 Chromium 才弹出写权限框；如果当时用户没注意（典型场景：
   * 自动保存在用户停止打字后触发），就会被取消，导致「权限被撤销」。
   *
   * 调用本方法会显式弹一次权限框；用户授权后返回 `true`，拒绝 / 浏览器无该 API 时
   * 返回 `false`。多次调用幂等：浏览器已记录的状态会立刻返回对应值而不再弹 UI。
   *
   * @param {FileSystemFileHandle} handle
   * @param {'read' | 'readwrite'} [mode='readwrite']
   * @returns {Promise<boolean>}
   */
  async function requestPermission(handle, mode = 'readwrite') {
    if (!handle) {
      throw new TypeError('requestPermission requires a valid FileSystemFileHandle');
    }
    if (typeof handle.requestPermission !== 'function') {
      // 极少数 Chromium 版本可能尚未实现 requestPermission；安全降级为 false
      return false;
    }
    try {
      const status = await handle.requestPermission({ mode });
      return status === 'granted';
    } catch (err) {
      // requestPermission 自身抛错（如 handle 在其他 tab 被回收）按失败处理
      console.warn('[useFileSystem] requestPermission failed:', err);
      return false;
    }
  }

  /**
   * 带权限请求的写入封装 —— 自动保存 / 手动保存的推荐入口。
   *
   * 流程：
   * 1. 调 `saveFile` 写入
   * 2. 若失败且错误属于权限类（`NotAllowedError` / `SecurityError`），调一次
   *    `requestPermission({ mode: 'readwrite' })` 弹出系统授权框
   * 3. 授权成功 → 再调一次 `saveFile`（这一步成功通常不会再 toast「保存失败」）
   * 4. 任何一步失败 → 原样返回最后一次 `saveFile` 的 `{ ok, error }`，便于上层判断
   *
   * 注意：`requestPermission` 的结果由浏览器持久化（按 handle 维度）。一次授权
   * 后后续保存无需再弹；用户拒绝后再次调用本方法通常也会立即返回 `false`，不再打扰。
   *
   * 副作用：
   * - 第一次 `saveFile` 失败时由 `saveFile` 内部 toast「保存失败：文件权限已被撤销」
   * - `requestPermission` 自身不 toast，依赖系统授权框
   * - 第二次 `saveFile` 若仍失败（极少见，比如授权后句柄被外部删除），会再 toast 一次
   *
   * @param {FileSystemFileHandle} handle
   * @param {string} content
   * @returns {Promise<{ ok: boolean, error: Error | null, permissionRequested: boolean, permissionGranted: boolean }>}
   *          字段 `permissionRequested` / `permissionGranted` 便于上层做差异化提示
   *          （如「未授予写入权限，请手动保存」）。
   */
  async function saveFileWithPermission(handle, content) {
    let result = await saveFile(handle, content);
    if (result.ok) {
      return { ...result, permissionRequested: false, permissionGranted: false };
    }
    if (!isPermissionError(result.error)) {
      // 非权限错误（如 NotFoundError / 其他 IO）→ 不请求权限，原样上抛
      return { ...result, permissionRequested: false, permissionGranted: false };
    }
    // 权限类错误：尝试一次授权
    const granted = await requestPermission(handle, 'readwrite');
    if (!granted) {
      return {
        ok: false,
        error: result.error,
        permissionRequested: true,
        permissionGranted: false,
      };
    }
    // 授权成功，重试一次写入
    const retry = await saveFile(handle, content);
    return { ...retry, permissionRequested: true, permissionGranted: true };
  }

  /**
   * 弹出系统「另存为」对话框，把内容写入新位置。
   *
   * `suggestedName` 默认 `untitled.md`；当 `handle.name` 已存在时优先沿用，
   * 这样「打开 A → 另存为」仍以 A 命名，符合 §F-SA-7。
   *
   * @param {string} content
   * @param {string} [suggestedName]
   * @returns {Promise<{ handle: FileSystemFileHandle, name: string } | null>}
   */
  async function saveAsFile(content, suggestedName) {
    ensureFSAPI();
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName || 'untitled.md',
        types: getMarkdownAcceptTypes(),
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      const name = handle.name || suggestedName || 'untitled.md';
      return { handle, name };
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw reportAndThrow(err, '另存为失败');
    }
  }

  /**
   * 读取文件元信息（用于 M7 外部修改轮询）。
   *
   * @param {FileSystemFileHandle} handle
   * @returns {Promise<{ lastModified: number, size: number }>}
   */
  async function getMetadata(handle) {
    if (!handle) {
      throw new TypeError('getMetadata requires a valid FileSystemFileHandle');
    }
    const file = await handle.getFile();
    return { lastModified: file.lastModified, size: file.size };
  }

  return {
    openFile,
    saveFile,
    saveAsFile,
    requestPermission,
    saveFileWithPermission,
    getMetadata,
  };
}
