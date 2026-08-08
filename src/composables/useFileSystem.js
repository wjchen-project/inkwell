import { useMessage } from 'naive-ui';
import { getMarkdownAcceptTypes } from '@/utils/file';
import { hasFSAPI } from '@/utils/browser';

/**
 * File System Access API 封装 composable —— 设计文档 §6.1。
 *
 * 暴露方法（均返回 Promise）：
 * - `openFile()` — 弹出系统「打开」对话框，读取 Markdown 文件，返回 `{ handle, content, name }`
 * - `saveFile(handle, content)` — 用已有句柄静默写入（无对话框）
 * - `saveAsFile(content, suggestedName)` — 弹出系统「另存为」对话框，返回新句柄
 * - `getMetadata(handle)` — 读取元信息（lastModified / size），供 M7 外部轮询使用
 *
 * 错误分类（影响 M7 / M8）：
 * - `openFile` / `saveAsFile` 暴露「用户取消」接口：
 *   - `AbortError` → 视为用户取消，**静默返回 null**，调用方无需提示
 *   - 业务错误（NotFound / NotAllowed / Security / 其他 IO）→ toast 后 throw
 * - `saveFile` 不弹对话框，统一走「toast + return false」契约（避免调用方重复 toast）
 *   - AbortError / NotFoundError / NotAllowedError / SecurityError / 其他 IO → toast（或静默）后 return false
 *   - 参数错误（handle === null）→ throw TypeError
 *
 * 调用方应据此选择控制流：
 *   - `openFile` / `saveAsFile` 用 `if (!result)` 判取消 / 失败
 *   - `saveFile` 用 `if (ok)` 判成功 / 失败
 *
 * 注意：必须在组件 `setup()` 中调用本 composable，以让 `useMessage()` 拿到
 * 上层 `NMessageProvider` 的上下文。
 */
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
   *   - **业务错误**（NotFound / NotAllowed / Security / 其他 IO）→ 内部 toast 后 `return false`
   *   - **静默取消**（AbortError）→ 无 toast，`return false`
   *   - **参数错误**（handle === null）→ `throw TypeError`（属于调用方 bug，
   *     由调用方在调用前用 `editorStore.hasFileHandle` 守卫）
   *
   * 之所以选择「toast + return false」而非「toast + throw」：调用方（例如 `TitleBar`）
   * 已经在 UI 层处理「业务失败」与「参数错误」用不同的代码路径；让 toast 与控制流解耦，
   * 能避免「调用方重复 toast」或「漏 toast」的契约漏洞。
   *
   * 约定：调用方需自行判断「是否需要弹保存路径」（`fileHandle === null` 时走 `saveAsFile`）。
   *
   * @param {FileSystemFileHandle | null} handle
   * @param {string} content 完整 Markdown 内容
   * @returns {Promise<boolean>} 成功 `true`；业务错误 / AbortError `false`
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
      return true;
    } catch (err) {
      // AbortError：来自 `createWritable` 权限收回等场景，无须打扰用户
      if (err && err.name === 'AbortError') return false;
      if (err && err.name === 'NotFoundError') {
        message.error('保存失败：文件已被外部删除');
        return false;
      }
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        message.error('保存失败：文件权限已被撤销');
        return false;
      }
      const detail = (err && (err.message || err.name)) || 'unknown error';
      message.error(`保存失败：${detail}`);
      return false;
    }
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
    getMetadata,
  };
}
