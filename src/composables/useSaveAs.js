import { ref } from 'vue';
import { useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useFileSystem } from '@/composables/useFileSystem';

/**
 * 「另存为」composable —— 设计文档 §6.1 / 04-design.md §7.3 / M6 §3.2-3.3。
 *
 * 行为：
 * 1. 调 `useFileSystem.saveAsFile(content, suggestedName)` 弹系统「另存为」对话框
 * 2. 用户选择路径 + 文件名 → 返回 `{ handle, name }` → 写入新位置
 *    → `editorStore.updateFileHandle({ handle, name })` + `markSaved({ content })`
 *    → toast「另存为成功」
 * 3. 用户取消（AbortError → `null`）→ 无变化、无 toast
 * 4. 写入失败（其他 IO / NotAllowed / NotFound）→ `useFileSystem` 内部已 toast，
 *    状态保留（脏数据未丢失，dirty 不动）
 *
 * 与 `useAutoSave` 的差异（M3 §3.2）：
 * - 无防抖：用户主动行为，不引入额外延迟
 * - 无重试：手动触发的单次操作，一次失败就显式提示即可（重试属于自动保存范畴）
 * - 无权限请求：另存为走 `showSaveFilePicker`，浏览器在新句柄上自动授予 readwrite
 *
 * 与「保存」按钮的差异（TitleBar.handleSave）：
 * - 「保存」走 `saveFileWithPermission(handle, content)` —— 复用旧句柄
 * - 「另存为」走 `saveAsFile(content, suggestedName)` —— 弹对话框 + 新句柄
 *
 * 并发约束：
 * - `isSavingAs` 作为「防双击」标记：单次 `handleSaveAs` 周期内重复触发直接吞掉。
 * - 与 `useAutoSave` 并发时各自写不同 handle（自动保存复用旧句柄、另存为用新句柄），
 *   无写冲突；唯一的数据竞争窗口是「自动保存写到一半 + 另存为成功 → 新句柄替换旧
 *   句柄」，此时旧句柄的写入会在后台完成（`useAutoSave` 已捕获旧 handle 引用），
 *   落到旧文件——这是合理的（用户当前另存为后的「当前文件」是新句柄，旧文件
 *   上的写入属于完成先前的保存意图）。
 *
 * 调用约束：
 * - 必须在组件 `setup()` 中调用，以让 `useMessage()` 拿到上层 `NMessageProvider`。
 *
 * @returns {{
 *   handleSaveAs: () => Promise<void>,
 *   isSavingAs: import('vue').Ref<boolean>,
 * }}
 */
export function useSaveAs() {
  const editorStore = useEditorStore();
  const fileSystem = useFileSystem();
  const message = useMessage();

  const isSavingAs = ref(false);

  async function handleSaveAs() {
    // 防双击 / 防快捷键连按：单次触发周期内重复触发直接吞掉。
    if (isSavingAs.value) return;
    isSavingAs.value = true;

    try {
      // 把当前内容快照传给 saveAsFile 作为写入内容；
      // suggestedName 沿用当前 fileName（'untitled.md' 或实际文件名），符合 §F-SA-7。
      const result = await fileSystem.saveAsFile(editorStore.content, editorStore.fileName);

      // 用户取消（AbortError → null）：保留 dirty，不弹错误。
      if (!result) return;

      // 写入成功：先替换句柄与文件名，再清 dirty。
      // 注意 markSaved 在 updateFileHandle 之后调用，让「当前内容」与「当前句柄」
      // 对应同一个文件——这样如果用户在系统对话框弹出期间又输入了内容，
      // markSaved({content}) 时 fileName/handle 已指向新路径，语义自洽。
      // （实际上 dialog 关闭后的 editorStore.content 仍是最新值，不影响 M6 验收。）
      editorStore.updateFileHandle({ handle: result.handle, name: result.name });
      editorStore.markSaved({ content: editorStore.content });
      message.success('另存为成功');
    } catch (err) {
      // useFileSystem.saveAsFile 已在错误路径上 toast「另存为失败：<原因>」，
      // 此处仅落日志便于排错，不重复 toast（避免刷屏）。
      console.warn('[useSaveAs] saveAs failed:', err);
    } finally {
      isSavingAs.value = false;
    }
  }

  return { handleSaveAs, isSavingAs };
}
