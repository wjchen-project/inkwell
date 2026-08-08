import { defineComponent, ref, computed } from 'vue';
import { NSpace, NButton, NTag, useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useFileSystem } from '@/composables/useFileSystem';

/**
 * 编辑器顶部标题栏 —— 设计文档 §5.2 / M2 §3.4。
 *
 * M2 范围：
 *   - 文件名显示（来自 `useEditorStore.displayName`，dirty 时附加 `●`，但圆点
 *     颜色区分留待 M3，本里程碑仅依赖 store 自带的纯文本后缀）
 *   - 「保存」按钮：调用 `useFileSystem.saveFile()`；无句柄（新建未保存）时隐藏
 *   - 「返回」按钮：回到 `/`（M4 之前不做未保存拦截）
 *
 * 不在 M2 范围（M3+ 接入）：
 *   - dirty 圆点的颜色定制（Phase 2 §9 #8 决议：primary 主题色）
 *   - 外部状态徽标（pending / orphaned）
 *   - 「设置」按钮（SettingsDrawer）
 *   - vditor 工具栏集成（另存为 / 设置按钮）
 */
export default defineComponent({
  name: 'TitleBar',
  setup() {
    const editorStore = useEditorStore();
    const fileSystem = useFileSystem();
    const message = useMessage();
    const saving = ref(false);

    /**
     * 「保存」按钮的可用条件：有句柄 + 已有未保存变更 + 当前不在保存中。
     */
    const canSave = computed(() => editorStore.hasFileHandle && editorStore.dirty && !saving.value);

    async function handleSave() {
      if (!editorStore.hasFileHandle) return;
      saving.value = true;
      try {
        const ok = await fileSystem.saveFile(editorStore.fileHandle, editorStore.content);
        if (ok) {
          editorStore.markSaved({ content: editorStore.content });
          message.success('保存成功');
        }
      } catch (err) {
        // useFileSystem 已经 toast 过；此处仅记录以便排错
        console.warn('[TitleBar] save failed:', err);
      } finally {
        saving.value = false;
      }
    }

    return () => (
      <div
        class="editor-title-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--n-border-color, #e6e6e6)',
          background: 'var(--n-color-embedded, #fafafa)',
        }}
      >
        <NSpace align="center" size="small">
          {/* 文件名（dirty 时由 store 自动附加 ●） */}
          <span style={{ fontWeight: 500 }}>{editorStore.displayName}</span>
          {/* M2 调试期保留 store 状态标签，方便肉眼观察 — 后续阶段可视情移除 */}
          <NTag size="small" type={editorStore.externalState === 'clean' ? 'default' : 'warning'}>
            external: {editorStore.externalState}
          </NTag>
        </NSpace>
        <NSpace align="center" size="small">
          {editorStore.hasFileHandle ? (
            <NButton
              type="primary"
              size="small"
              onClick={handleSave}
              disabled={!canSave.value}
              loading={saving.value}
            >
              保存
            </NButton>
          ) : (
            <NTag size="small" type="info">
              新建文档（M2 暂未支持另存为）
            </NTag>
          )}
          <NButton size="small" quaternary onClick={() => history.back()}>
            返回
          </NButton>
        </NSpace>
      </div>
    );
  },
});
