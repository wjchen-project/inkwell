import { defineComponent, ref, computed } from 'vue';
import { NSpace, NButton, NTag, useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useFileSystem } from '@/composables/useFileSystem';
import { useThemeStyles } from '@/composables/useThemeStyles';
import SettingsDrawer from '@/components/editor/SettingsDrawer.jsx';

/**
 * 编辑器顶部标题栏 —— 设计文档 §5.2 / M2 + M3 + M5。
 *
 * M2 已就位：
 *   - 文件名（dirty 时由 store.displayName 附加 `●` 文本兜底，但 UI 主指示
 *     由 M3 引入的独立圆点接管）
 *   - 「保存」按钮：调用 `useFileSystem.saveFile()`
 *   - 「返回」按钮：回到 `/`（M4 之前不做未保存拦截）
 *
 * M3 新增：
 *   - 「未保存」圆点：v-if `dirty`，使用 Naive UI primary 主题色（§9 #8），
 *     `aria-label="未保存"`（§8 可访问性）
 *
 * M5 新增：
 *   - 「设置」按钮：点击打开 `SettingsDrawer`，右侧 Drawer 滑出（placement="right"，
 *     width=360，参见 SettingsDrawer.jsx 与设计文档 §5.3）
 *   - SettingsDrawer 状态（`show`）由 TitleBar 本地维护，不入 store；
 *     「设置 UI 状态」不属于跨组件共享数据，无需放进 Pinia
 *
 * 不在本里程碑范围：
 *   - 外部状态徽标（pending / orphaned）→ M7 / M8
 *   - 另存为按钮 → M6
 *   - 「自动保存中」loading 指示 → 当前由 vditor 内置指示 + store.dirty 协同
 */
export default defineComponent({
  name: 'TitleBar',
  setup() {
    const editorStore = useEditorStore();
    const fileSystem = useFileSystem();
    const message = useMessage();
    const saving = ref(false);
    const showSettings = ref(false);

    /**
     * M5 主题层修复：拿到 Naive UI 当前主题的颜色变量，绑定到
     * `.editor-title-bar` 的 background / borderBottom。
     * 详见 `src/composables/useThemeStyles.js`。
     */
    const themeStyles = useThemeStyles();

    /**
     * 「保存」按钮的可用条件：有句柄 + 已有未保存变更 + 当前不在保存中。
     * 无句柄时自动保存首次走「另存为」（由 useAutoSave 接管），手动按钮隐藏。
     */
    const canSave = computed(() => editorStore.hasFileHandle && editorStore.dirty && !saving.value);

    async function handleSave() {
      if (!editorStore.hasFileHandle) return;
      saving.value = true;
      try {
        // 使用 saveFileWithPermission：首次写入遇到权限错误时会自动请求一次写权限。
        // 授权后重试仍失败 → 使用 FileSystem 已 toast 过 + 给出“需要手动保存”以外的上下文。
        const { ok, permissionRequested, permissionGranted } =
          await fileSystem.saveFileWithPermission(editorStore.fileHandle, editorStore.content);
        if (ok) {
          editorStore.markSaved({ content: editorStore.content });
          message.success('保存成功');
          return;
        }
        // saveFileWithPermission 返回 false
        if (permissionRequested && !permissionGranted) {
          message.warning('未授予写入权限，已取消保存。请在浏览器弹窗中点击「允许」后重试。');
        }
        // 其他错误场景 useFileSystem 内部已 toast，这里仅留日志便于排错
      } catch (err) {
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
          // M5 主题层修复：同 EditorView 的 `--n-color` 问题——
          // Naive UI CSS 变量仅在每个组件 hash 类作用域内生效，
          // 这里改为读 themeStyles.cardColor / borderColor 并内联绑定。
          borderBottom: `1px solid ${themeStyles.borderColor.value}`,
          background: themeStyles.cardColor.value,
        }}
      >
        <NSpace align="center" size="small">
          {/* M3：未保存圆点（primary 主题色，独立渲染以保证 a11y） */}
          {editorStore.dirty ? (
            <span
              class="editor-title-bar__dirty-dot"
              role="status"
              aria-label="未保存"
              title="有未保存的修改"
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--n-primary-color, #18a058)',
              }}
            />
          ) : null}
          <span style={{ fontWeight: 500 }}>{editorStore.fileName}</span>
          {/* 外部状态：M3 暂时保留 NTag 便于肉眼观察；M7/M8 接入更精细的徽标 */}
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
            // 无句柄时手动保存按钮隐藏：首次保存由 useAutoSave 走 saveAsFile。
            // 保留一个 info tag 表达「新建文档」语义，避免右侧空白。
            <NTag size="small" type="info">
              新建文档（首次保存将弹出对话框）
            </NTag>
          )}
          {/* M5：设置按钮 + SettingsDrawer（状态本地维护） */}
          <NButton
            size="small"
            quaternary
            onClick={() => {
              showSettings.value = true;
            }}
            aria-label="打开设置"
          >
            设置
          </NButton>
          <NButton size="small" quaternary onClick={() => history.back()}>
            返回
          </NButton>
        </NSpace>
        <SettingsDrawer
          show={showSettings.value}
          {...{
            'onUpdate:show': (v) => {
              showSettings.value = v;
            },
          }}
        />
      </div>
    );
  },
});
