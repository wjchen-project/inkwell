import { defineComponent, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NAlert, useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import VditorEditor from '@/components/editor/VditorEditor.jsx';
import TitleBar from '@/components/editor/TitleBar.jsx';

/**
 * 编辑器页 —— 设计文档 §4 / §5.1 / M2 §3.4。
 *
 * 挂载时根据 `route.query.mode` 处理：
 *   - `mode=new`  → `editorStore.reset()`，复位空文档状态（句柄 null、dirty=true）
 *   - `mode=open` → 假设 EntryView 已调用 `editorStore.loadFromFile(...)`，本组件不重复
 *
 * 渲染：
 *   <TitleBar />
 *   <VditorEditor value={editorStore.content} theme={...} onUpdate:value={setContent} />
 *
 * 不在 M2 范围（M3+ 接入）：
 *   - useAutoSave / useExternalWatcher / useUnsavedGuard
 *   - 主题切换（目前固定 'light'，M5 useTheme 接管 settingsStore.theme）
 *   - SettingsDrawer / 另存为按钮（M6）
 */
export default defineComponent({
  name: 'EditorView',
  setup() {
    const route = useRoute();
    const editorStore = useEditorStore();
    const settingsStore = useSettingsStore();
    const message = useMessage();

    /**
     * 监听 `route.query.mode` 变化，统一处理「首次挂载」与「同路由 query 变更」两种入口。
     *
     * 为什么用 `watch` 而不是 `onMounted`：
     *   - Vue Router 默认对「同 path、不同 query」的导航（例如
     *     `/editor?mode=open` → `/editor?mode=new`）不会重新挂载组件，也不会再次
     *     触发 `onMounted`。如果使用 `onMounted`，将来从 EditorView 内触发的「新建」、
     *     「打开」等就近跳转就会漏过 reset。
     *   - `immediate: true` 保证首次进入 `/editor?mode=new` 时也走一次 reset。
     *
     * 行为：
     *   - mode='new' → `editorStore.reset()` 复位空文档
     *   - mode='open' / 缺省 → 不动 store，假设 EntryView 已经写入
     */
    watch(
      () => route.query.mode,
      (mode) => {
        if (mode === 'new') {
          // EntryView 仅做导航；这里负责「新建语义」的最终落实
          editorStore.reset();
        }
        // 'open' / 缺省：维持 EntryView 写入的 store 状态不变
      },
      { immediate: true },
    );

    /**
     * vditor 初始化失败兜底：上方 toast + console 已由 VditorEditor 处理，
     * 此处补一条用户可读提示，确保使用者了解。
     */
    function handleVditorError(err) {
      message.error('编辑器加载失败，请刷新重试');
      console.error('[EditorView] vditor init error:', err);
    }

    /**
     * vditor 主题：M2 固定 light（M5 由 useTheme 接管 `settingsStore.theme === 'dark'` 分支）。
     */
    const vditorTheme = 'light';

    return () => {
      const mode = route.query.mode === 'open' ? 'open' : 'new';
      return (
        <div
          class="editor-view"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'var(--n-color, #ffffff)',
          }}
        >
          <TitleBar />
          <div
            class="editor-view__body"
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              padding: '0 16px 16px',
            }}
          >
            {mode === 'open' && !editorStore.hasFileHandle ? (
              <NAlert type="warning" title="打开状态异常" style={{ marginTop: '16px' }} showIcon>
                当前未加载任何文件句柄。请返回入口重新打开 Markdown 文件。
              </NAlert>
            ) : (
              <VditorEditor
                value={editorStore.content}
                theme={vditorTheme}
                readonly={editorStore.externalState === 'orphaned'}
                onUpdate:value={(val) => editorStore.setContent(val)}
                onError={handleVditorError}
              />
            )}
          </div>
          {/* M2 调试参考：当前主题设置（用于 M5 接入前肉眼确认） */}
          <div
            style={{
              padding: '4px 16px',
              fontSize: '12px',
              color: 'var(--n-text-color-3, #888)',
              borderTop: '1px solid var(--n-border-color, #e6e6e6)',
            }}
          >
            settings.theme = {settingsStore.theme}（M5 接入 vditor 主题联动）
          </div>
        </div>
      );
    };
  },
});
