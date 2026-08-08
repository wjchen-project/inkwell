import { defineComponent, ref, computed } from 'vue';
import { NSpace, NButton, NTag, useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useFileSystem } from '@/composables/useFileSystem';
import { useSaveAs } from '@/composables/useSaveAs';
import { useSaveOverride } from '@/composables/useSaveOverride';
import { useThemeStyles } from '@/composables/useThemeStyles';
import SettingsDrawer from '@/components/editor/SettingsDrawer.jsx';

/**
 * 编辑器顶部标题栏 —— 设计文档 §5.2 / M2 + M3 + M5 + M6 + M7。
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
 * M6 新增：
 *   - 「另存为」按钮：调 `useFileSystem.saveAsFile(content, fileName)` 弹系统
 *     「另存为」对话框，写入成功后 `editorStore.updateFileHandle` + `markSaved`。
 *     用户取消（AbortError → null）静默无变化，失败由 `useFileSystem` toast。
 *   - 按钮常驻可用（无 `canSaveAs` 禁用条件）：用户即使在非 dirty 状态下也想
 *     另存一份到新路径（M6 §3.3 标注「可选」；这里倾向「始终可点」，与 VSCode
 *     / Word 等主流编辑器一致）。
 *   - 快捷键 `Ctrl/Cmd+Shift+S` 由 `EditorView` 顶层 `keydown` 监听触发，
 *     调用同一个 `useSaveAs().handleSaveAs()`（不在 TitleBar 重复注册监听）。
 *
 * M7 新增：
 *   - 外部状态徽标：pending → 橙色「外部已修改」/ orphaned → 红色「文件不可用」；
 *     clean 不渲染（避免噪声）。orphaned 为 M8 写入的占位状态（M7 不主动产出）。
 *   - 「保存」按钮接入 `useSaveOverride().ensureOverrideConfirmed()`：pending 状态
 *     下写入前弹「外部已被修改，继续保存将覆盖外部内容？」二次确认，与
 *     `useAutoSave.triggerSave` 共享同一份 `firstOverrideConfirmed` 标记（§9 #10）。
 *   - 「保存」按钮在 orphaned 状态下禁用——M7 仅占位禁用逻辑，M8 补完整流程
 *     （强制另存为通道、状态恢复 UI 等）。
 *
 * 不在本里程碑范围：
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
     * M6：另存为入口。`handleSaveAs` 与 `isSavingAs` 由 composable 提供，
     * 「另存为」按钮的 `onClick` 与 `loading` 状态都从这里取。
     * `EditorView` 的 `Ctrl/Cmd+Shift+S` 快捷键走同一个函数引用，避免
     * 两处复制粘贴产生漂移。
     */
    const { handleSaveAs, isSavingAs } = useSaveAs();

    /**
     * M7：手动保存也需遵守「保留外部修改」二次确认。与 `useAutoSave.triggerSave`
     * 共享同一份 `useSaveOverride` —— 任一路径首次确认后置 firstOverrideConfirmed，
     * 后续保存（自动 / 手动）均静默写入（§9 #10）。
     */
    const { ensureOverrideConfirmed } = useSaveOverride();

    /**
     * 「保存」按钮的可用条件：
     *   - 有句柄（无句柄时按钮隐藏，走 useAutoSave 首存另存为）
     *   - 有未保存变更
     *   - 不在保存中
     *   - M7：文件未被外部孤立（orphaned 状态下禁用常规保存，强制走另存为路径；
     *     M8 会补完整的处理流程，本里程碑仅禁用按钮 + 占位徽标）
     */
    const canSave = computed(
      () =>
        editorStore.hasFileHandle &&
        editorStore.dirty &&
        !saving.value &&
        editorStore.externalState !== 'orphaned',
    );

    async function handleSave() {
      if (!editorStore.hasFileHandle) return;
      // M7：pending 状态下先弹二次确认；用户取消则早退，saving 不需要再走流程。
      const confirmed = await ensureOverrideConfirmed();
      if (!confirmed) return;
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
          {/* M7：外部状态徽标。
              - clean：默认隐藏（状态正常不占用视觉空间）
              - pending：warning 橙色「外部已修改」（仍有外部修改未被同步）
              - orphaned：error 红色「文件不可用」（M8 处理，本里程碑仅占位） */}
          {editorStore.externalState === 'pending' ? (
            <NTag size="small" type="warning" aria-label="外部已被修改">
              外部已修改
            </NTag>
          ) : null}
          {editorStore.externalState === 'orphaned' ? (
            <NTag size="small" type="error" aria-label="文件不可用">
              文件不可用
            </NTag>
          ) : null}
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
          {/* M6：另存为 —— 常驻可用（不依赖 hasFileHandle，也不依赖 dirty），
              用户可以在任意状态下把内容写到新路径。quaternary 与「设置」对齐，
              视觉上让「保存」（primary）依然是主操作。loading 与快捷键复用
              useSaveAs 的 isSavingAs，保证 UI 与实际状态一致。 */}
          <NButton
            size="small"
            quaternary
            onClick={handleSaveAs}
            loading={isSavingAs.value}
            aria-label="另存为"
          >
            另存为
          </NButton>
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
