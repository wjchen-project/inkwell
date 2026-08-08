import { defineComponent } from 'vue';
import { NModal, NSpace, NButton, NText } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';

/**
 * 外部修改检测对话框 —— 设计文档 §5.4 / M7 §3.3 / Phase 3 §4.2。
 *
 * 行为：
 *   - 「保留我的编辑」 → emit('resolve', 'keep')：externalState = 'pending'，
 *     下次保存触发「外部已被修改，继续保存将覆盖外部内容？」二次确认（§9 #10）
 *   - 「重新加载外部」 → emit('resolve', 'reload')：读外部内容并 markSaved + clean
 *   - 「稍后处理」 → emit('resolve', 'later')：externalState = 'pending'（与 'keep'
 *     系统行为一致，仅 UX 标签差异——详见 useExternalWatcher.handleDialogResolve）
 *   - Esc / mask 点击 / × → onUpdateShow(false) → 视为 'later'（最保守路径）
 *
 * Props：
 *   - show: boolean  对话框显隐，由父组件 useExternalWatcher 控制
 *
 * Emits：
 *   - resolve(choice)  用户三选一后触发；父组件把 'keep' / 'reload' / 'later'
 *                      传给 useExternalWatcher.handleDialogResolve
 *
 * 数据：
 *   - 文件名从 useEditorStore 读取（dialog 触发时 store 必有 fileName）
 */

export default defineComponent({
  name: 'ExternalChangeDialog',
  props: {
    show: { type: Boolean, default: false },
  },
  emits: ['resolve'],
  setup(props, { emit }) {
    const editorStore = useEditorStore();

    /**
     * 把三选项之一抛给父组件。
     * @param {'keep' | 'reload' | 'later'} choice
     */
    function handleResolve(choice) {
      emit('resolve', choice);
    }

    /**
     * Esc / mask / 关闭按钮 → 视为「稍后处理」（最保守分支，不丢失用户编辑，
     * 也不强制覆盖外部）。NModal 的 onUpdateShow 在用户主动关闭时触发。
     */
    function handleUpdateShow(value) {
      if (!value) handleResolve('later');
    }

    return () => (
      <NModal
        show={props.show}
        preset="card"
        title="文件已被外部修改"
        style={{ maxWidth: '480px' }}
        closable
        onUpdateShow={handleUpdateShow}
      >
        <NText tag="p" style={{ margin: '0 0 8px' }}>
          磁盘上的文件 <code>{editorStore.fileName}</code> 已被外部程序修改。
        </NText>
        <NText tag="p" depth="3" style={{ margin: '0 0 16px' }}>
          请选择如何处理（Esc 关闭等同于「稍后处理」）。
        </NText>
        <NSpace>
          <NButton onClick={() => handleResolve('keep')}>保留我的编辑</NButton>
          <NButton type="primary" onClick={() => handleResolve('reload')}>
            重新加载外部
          </NButton>
          <NButton quaternary onClick={() => handleResolve('later')}>
            稍后处理
          </NButton>
        </NSpace>
      </NModal>
    );
  },
});
