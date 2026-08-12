import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

/**
 * 编辑器状态 store —— 单文档编辑器，无 Tab（Phase 3 §9 #9）。
 *
 * 字段 / getter / action 完整定义见设计文档 §3.1。
 *
 * 注意：默认 `dirty: true` 表示「尚未落盘的全新文档」，
 * 即便内容为空也认为「未保存」（新建状态）。`markSaved()` 会清零。
 */
export const useEditorStore = defineStore('editor', () => {
  // ────────── state ──────────
  const fileHandle = ref(/** @type {FileSystemFileHandle | null} */ (null));
  const fileName = ref('untitled.md');
  const content = ref('');
  const dirty = ref(true);
  const externalState = ref(/** @type {'clean' | 'pending' | 'orphaned'} */ ('clean'));
  const lastSavedContent = ref('');
  const lastExternalModified = ref(/** @type {number | null} */ (null));
  /**
   * M7：首次「保留」后续保存的二次确认标记。
   * - externalState === 'pending' && firstOverrideConfirmed === false → 下次保存先弹
   *   「外部已被修改，继续保存将覆盖外部内容？」用户确认后置 true，
   *   之后静默写入（§9 #10 决议）。
   * - loadFromFile / reset 时置 false（新会话无需历史标志）。
   * - 仅在进程内生效，无需持久化。
   */
  const firstOverrideConfirmed = ref(false);

  // ────────── getters ──────────
  const hasFileHandle = computed(() => fileHandle.value !== null);
  const displayName = computed(() => (dirty.value ? `${fileName.value} ●` : fileName.value));

  // ────────── actions ──────────

  /**
   * 从打开的文件加载完整状态。
   *
   * 重置 dirty / externalState；同步更新句柄、文件名、内容与 lastSavedContent
   * （用于后续 dirty 检测）。
   *
   * `lastModified`（可选）是打开瞬间文件的 mtime：调用方把它作为外部修改检测的
   * 初始 baseline 写入 store，避免 watcher 还要等首次 poll 才能建立基线。
   * 不传时 `lastExternalModified` 保持为 `null`，由 watcher 首次 poll 自然补齐。
   *
   * @param {{
   *   handle: FileSystemFileHandle,
   *   content: string,
   *   name: string,
   *   lastModified?: number,
   * }} payload
   */
  function loadFromFile({ handle, content: nextContent, name, lastModified }) {
    fileHandle.value = handle;
    fileName.value = name;
    content.value = nextContent;
    lastSavedContent.value = nextContent;
    dirty.value = false;
    externalState.value = 'clean';
    lastExternalModified.value =
      typeof lastModified === 'number' ? lastModified : lastExternalModified.value;
    firstOverrideConfirmed.value = false;
  }

  /**
   * 编辑器内容变更（vditor input 事件触发）。
   *
   * 同时更新 `content` 与 `dirty`：
   * - 与 `lastSavedContent` 不一致 → `dirty = true`
   * - 与 `lastSavedContent` 一致 → `dirty = false`
   *
   * 容许以下场景的圆点消失：
   * - undo 回滚到与上次保存一致的状态（M3 §4.1 内容回环检测）
   * - 程序内部因 markSaved / loadFromFile 之外的重置路径再写入相同内容
   *
   * @param {string} value 新的 Markdown 内容
   */
  function setContent(value) {
    content.value = value;
    dirty.value = value !== lastSavedContent.value;
  }

  /**
   * 保存成功后调用 —— 清 dirty 并刷新 lastSavedContent。
   *
   * `lastModified`（可选）是写入完成后磁盘上的文件 mtime：调用方传入时同步
   * 推进外部修改检测的 baseline，避免「自我写入 vs 外部修改」混淆——
   * 即 auto-save 后下次 poll 不会把「我们自己刚写的 mtime」误判为外部变更。
   * 不传时 `lastExternalModified` 保持当前值，下次 watch 留待后续 save / 手动
   * reloadFromHandle 同步。
   *
   * @param {{ content: string, lastModified?: number }} payload
   */
  function markSaved({ content: savedContent, lastModified }) {
    content.value = savedContent;
    lastSavedContent.value = savedContent;
    dirty.value = false;
    if (typeof lastModified === 'number') {
      lastExternalModified.value = lastModified;
    }
  }

  /**
   * 「另存为」成功后调用 —— 仅替换句柄与文件名，**不**改变 dirty。
   *
   * 原因：另存为完成后通常紧跟 `markSaved()`，由调用方决定 dirty 状态。
   *
   * @param {{ handle: FileSystemFileHandle, name: string }} payload
   */
  function updateFileHandle({ handle, name }) {
    fileHandle.value = handle;
    fileName.value = name;
  }

  /**
   * 外部文件状态变更（外部修改 / 外部删除 / 权限撤销 等）。
   *
   * @param {'clean' | 'pending' | 'orphaned'} state
   */
  function setExternalState(state) {
    externalState.value = state;
  }

  /** 文件被外部删除 / 权限撤销 —— 标记 orphaned。 */
  function markOrphaned() {
    externalState.value = 'orphaned';
  }

  /**
   * 重置为「新建空文档」状态。
   *
   * 由 `EditorView` 在 `route.query.mode === 'new'` 时调用，避免脏文档残留
   * 影响新会话。`dirty` 设为 `true` 表示「尚未落盘」的空文档。
   */
  function reset() {
    fileHandle.value = null;
    fileName.value = 'untitled.md';
    content.value = '';
    lastSavedContent.value = '';
    dirty.value = true;
    externalState.value = 'clean';
    lastExternalModified.value = null;
    firstOverrideConfirmed.value = false;
  }

  return {
    // state
    fileHandle,
    fileName,
    content,
    dirty,
    externalState,
    lastSavedContent,
    lastExternalModified,
    firstOverrideConfirmed,
    // getters
    hasFileHandle,
    displayName,
    // actions
    loadFromFile,
    setContent,
    markSaved,
    updateFileHandle,
    setExternalState,
    markOrphaned,
    reset,
  };
});
