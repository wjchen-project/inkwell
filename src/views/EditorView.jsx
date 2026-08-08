import { defineComponent, watch, onBeforeUnmount, toRef } from 'vue';
import { useRoute } from 'vue-router';
import { NAlert, useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAutoSave } from '@/composables/useAutoSave';
import VditorEditor from '@/components/editor/VditorEditor.jsx';
import TitleBar from '@/components/editor/TitleBar.jsx';

/**
 * 编辑器页 —— 设计文档 §4 / §5.1 / M2 + M3。
 *
 * 挂载时根据 `route.query.mode` 处理：
 *   - `mode=new`  → `editorStore.reset()`，复位空文档状态（句柄 null、dirty=true）
 *   - `mode=open` → 假设 EntryView 已调用 `editorStore.loadFromFile(...)`，本组件不重复
 *
 * M3 接入：
 *   - 调用 `useAutoSave(editorStore.content)`：
 *     · 监听 vditor input → store.content 变化 → 防抖 → 自动保存
 *     · 首存走 saveAsFile；后续走 saveFile；失败 1s/2s/4s 退避重试
 *   - 卸载时由 composable 内部清理 pending timer；onBeforeUnmount 仅做日志。
 *
 * 渲染：
 *   <TitleBar />
 *   <VditorEditor value={editorStore.content} theme={...} onUpdate:value={setContent} />
 *
 * 不在当前里程碑范围：
 *   - useExternalWatcher / useUnsavedGuard → M7 / M4
 *   - 主题切换（目前固定 'light'，M5 useTheme 接管 settingsStore.theme）
 *   - SettingsDrawer / 另存为按钮 → M5 / M6
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
     * M3：接入自动保存。composable 内部管理 watch + 防抖 + 重试 + 卸载清理。
     *
     * 这里必须用 `toRef(store, 'content')` 把 store 上的属性转成显式 Ref：
     * Pinia setup store 返出的 ref 在通过 proxy 访问时会自动 unwrap 成普通值，
     * 直接传 `editorStore.content` 会拿到 string 原值，丢给 `watch()` 后被当作
     * 不可追踪的 primitive，watcher 永远不会触发 —— 这是个陷阱。
     */
    const contentRef = toRef(editorStore, 'content');
    useAutoSave(contentRef);

    /**
     * vditor 初始化失败兜底：上方 toast + console 已由 VditorEditor 处理，
     * 此处补一条用户可读提示，确保使用者了解。
     */
    function handleVditorError(err) {
      message.error('编辑器加载失败，请刷新重试');
      console.error('[EditorView] vditor init error:', err);
    }

    /**
     * 卸载钩子：useAutoSave 已通过 onBeforeUnmount 自行清理 pending timer。
     * 这里仅留日志锚点，便于未来排查「卸载时机 / 半保存」之类问题。
     */
    onBeforeUnmount(() => {
      console.debug('[EditorView] unmounted');
    });

    /**
     * vditor 主题：当前固定 light（M5 由 useTheme 接管 `settingsStore.theme === 'dark'` 分支）。
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
          {/* 调试参考：当前主题设置（用于 M5 接入前肉眼确认） */}
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
