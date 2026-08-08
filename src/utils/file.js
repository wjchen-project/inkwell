/**
 * 文件工具 —— 扩展名校验 + File System Access API 共用的 picker types。
 *
 * 取值见 Phase 2 §9 #16 决议：`.md` + `.markdown`（不含 `.mdx` / `.txt`）。
 *
 * 本模块不依赖 Vue / Pinia，可被 `useFileSystem` composable 与 UI 组件复用。
 */

/**
 * 应用支持的 Markdown 扩展名（小写，含前导点）。
 *
 * 注意：与浏览器 picker 的 MIME 映射使用同一份常量，避免漂移。
 */
export const ALLOWED_EXTENSIONS = Object.freeze(['.md', '.markdown']);

/**
 * 判定给定文件名是否落在允许的扩展名集合内。
 *
 * 大小写不敏感；空值或非字符串统一返回 `false`。
 *
 * @param {string | null | undefined} name 文件名（如 `note.MD`、`README.markdown`）
 * @returns {boolean} 是否为允许的 Markdown 扩展名
 */
export function hasAllowedExtension(name) {
  if (!name || typeof name !== 'string') return false;
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * 构造 `showOpenFilePicker` / `showSaveFilePicker` 的 `types` 选项。
 *
 * picker 接受 `accept` 对象；MIME 统一使用 `text/markdown`，扩展名列表写在数组里。
 * 浏览器会在过滤器和默认文件名提示中使用这些信息。
 *
 * @returns {Array<{ description: string, accept: Record<string, string[]> }>}
 */
export function getMarkdownAcceptTypes() {
  return [
    {
      description: 'Markdown',
      accept: { 'text/markdown': [...ALLOWED_EXTENSIONS] },
    },
  ];
}
