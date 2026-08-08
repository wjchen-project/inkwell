import { useDialog } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';

/**
 * 「保留外部修改」后续保存的二次确认辅助 —— M7 §3.4 / §9 #10 / §9 #13。
 *
 * 适用场景：
 *   - 用户打开文件后外部程序修改了文件
 *   - 用户在 ExternalChangeDialog 选了「保留我的编辑」或「稍后处理」
 *   - externalState 置为 'pending'
 *   - 下次保存（自动或手动）需要先弹「外部已被修改，继续保存将覆盖外部内容？」，
 *     用户确认后才写入；首次确认后 firstOverrideConfirmed 置 true，之后静默写入
 *
 * 提供 `ensureOverrideConfirmed()`，调用方在写入前调用：
 *   - externalState !== 'pending' 或 firstOverrideConfirmed === true → 直接返回 true
 *   - 否则弹 Naive UI warning 模态，返回 Promise<boolean>：用户确认 → true 并
 *     置 firstOverrideConfirmed = true；用户取消 / 关闭 → false
 *
 * 调用约束：
 *   - 必须在组件 `setup()` 中调用，让 `useDialog()` 拿到上层 `NDialogProvider` 上下文
 *   - 当前 `App.jsx` 已在 `NConfigProvider` 下挂载 `NDialogProvider`（M5 收尾注释）
 *
 * 设计权衡：
 *   - 不放入 `useEditorStore` 是为了避免 store 直接依赖 Naive UI；用独立 composable
 *     保持 store 纯净（纯响应式状态）。
 *   - 不复用 `useUnsavedGuard.simulateBeforeUnload` 的 `window.confirm` 方案——
 *     二次确认是关于「保存」的领域决策，需要更好的视觉与可访问性（Esc 关闭等价取消、
 *     Enter 默认确认等），NModal 更合适。
 *
 * @returns {{ ensureOverrideConfirmed: () => Promise<boolean> }}
 */
export function useSaveOverride() {
  const editorStore = useEditorStore();
  const dialog = useDialog();

  /**
   * @returns {Promise<boolean>} true = 用户确认可写 / 不需要确认；false = 用户取消
   */
  async function ensureOverrideConfirmed() {
    // 不在 pending 状态 → 无需确认
    if (editorStore.externalState !== 'pending') return true;
    // 已经确认过一次 → 静默
    if (editorStore.firstOverrideConfirmed) return true;

    return new Promise((resolve) => {
      /** 防止 onPositiveClick / onNegativeClick / onClose 多路回调重复 resolve */
      let resolved = false;
      const settle = (value) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      dialog.warning({
        title: '外部已被修改',
        content: '磁盘上的文件已被外部程序修改。继续保存将覆盖外部内容，确定要继续吗？',
        positiveText: '继续保存',
        negativeText: '取消',
        // closable 默认 true：允许 mask 点击 / Esc / × 关闭 → 等同 negativeText
        onPositiveClick: () => settle(true),
        onNegativeClick: () => settle(false),
        onClose: () => settle(false),
      });

      // 注意：onPositiveClick 在弹窗关闭之前触发，onClose 在弹窗关闭之后触发；
      // 我们用 `resolved` 标记保证 resolve 只被调用一次。
      // onClose 在用户点 positiveText / negativeText 后也会触发（正常关闭路径），
      // settle(false) 在 resolved=true 时无效，所以即便三次回调都触达也只 resolve 一次。
    }).then((confirmed) => {
      // 用户确认 → 置 firstOverrideConfirmed = true，本进程内后续保存静默写入
      if (confirmed) {
        editorStore.firstOverrideConfirmed = true;
      }
      return confirmed;
    });
  }

  return { ensureOverrideConfirmed };
}
