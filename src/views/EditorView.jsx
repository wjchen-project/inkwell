import { defineComponent, watch, onBeforeUnmount, onMounted, toRef, inject, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NAlert, useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAutoSave } from '@/composables/useAutoSave';
import { useUnsavedGuard } from '@/composables/useUnsavedGuard';
import { useSaveAs } from '@/composables/useSaveAs';
import { useExternalWatcher } from '@/composables/useExternalWatcher';
import { THEME_INJECTION_KEY } from '@/composables/useTheme';
import { useThemeStyles } from '@/composables/useThemeStyles';
import VditorEditor from '@/components/editor/VditorEditor.jsx';
import TitleBar from '@/components/editor/TitleBar.jsx';
import ExternalChangeDialog from '@/components/editor/ExternalChangeDialog.jsx';

/**
 * 编辑器页 —— 设计文档 §4 / §5.1 / M2 + M3 + M4 + M5 + M6 + M7。
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
 * M4 接入：
 *   - 接收 `useAutoSave` 返回的 `isSaving` ref，连同 `editorStore.dirty` 一起
 *     传给 `useUnsavedGuard`；composable 在 onMounted 注册
 *     beforeunload + router.beforeEach 拦截，卸载时由其内部 onBeforeUnmount 兜底。
 *
 * M5 接入：
 *   - 通过 `inject(THEME_INJECTION_KEY)` 拿到 `App.jsx` 提供的 effectiveTheme ref，
 *     传给 `<VditorEditor theme={...} />`，由其内部 `watch(theme)` 触发
 *     `vditor.setTheme('classic' | 'dark')`
 *   - Naive UI 主题已在 App 根 `NConfigProvider` 中绑定；本组件不重复包裹
 *
 * M6 接入：
 *   - 注册 `keydown` 监听器响应 `Ctrl/Cmd+Shift+S` → 调 `useSaveAs().handleSaveAs()`
 *   - 与 TitleBar 的「另存为」按钮共用同一份 `useSaveAs()` 函数引用，
 *     UI 与快捷键走完全一致的保存路径（更新句柄 + markSaved + toast）
 *   - `onMounted` 注册、`onBeforeUnmount` 移除；保证多次挂载场景下不重复绑定
 *
 * M7 接入：
 *   - 调用 `useExternalWatcher(handleRef)`：基于 fileHandle 轮询 + focus 触发 +
 *     变化检测 → 自动重载 / 弹 ExternalChangeDialog / pending 静默（§9 #13）
 *   - 模板中渲染 `<ExternalChangeDialog>`，`onResolve` 走 watcher 的
 *     `handleDialogResolve('keep' | 'reload' | 'later')`
 *   - handleRef 用 `toRef(editorStore, 'fileHandle')` —— watcher 内部监听此 ref
 *     变化来启动/停止轮询（如另存为产生新句柄、reset 后变 null）
 *   - vditor 不需要 prop 联动：watcher reload 时调 `editorStore.markSaved({content})`，
 *     VditorEditor 自身的 `watch(value)` 自动调 `vditor.setValue(newContent, true)`
 *
 * M9 收尾（大纲显隐）：
 *   - 从 `useSettingsStore` 读 `outlineEnabled`，作为 prop 透传 `<VditorEditor />`；
 *     设置面板切换 → store 更新 → 本组件 re-render → 传到 vditor 实例，由其
 *     `watch(outlineEnabled)` 调 `vditor.outline.toggle()` 完成显示 / 收起。
 *   - vditor 工具栏中已不再有「大纲」按钮（VditorEditor toolbar 配置移除 `outline`），
 *     这里作为唯一控制入口，避免双入口状态不同步。
 *
 * 渲染：
 *   <TitleBar />
 *   <VditorEditor value={editorStore.content} theme={effectiveTheme}
 *     outlineEnabled={settingsStore.outlineEnabled}
 *     onUpdate:value={setContent} />
 *   <ExternalChangeDialog show={...} onResolve={...} />
 *
 * 不在当前里程碑范围：
 *   - orphaned 状态机的实际轮询响应 → M8
 */
export default defineComponent({
  name: 'EditorView',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const editorStore = useEditorStore();
    const settingsStore = useSettingsStore();
    const message = useMessage();

    /**
     * M5：从 App.jsx 注入 effectiveTheme ref（'light' | 'dark'）。
     * App 层 `useTheme()` 已经维护了 system 监听器，本组件只是消费者。
     * `inject()` 默认值用 `ref('light')` 兜底，避免 App 漏 provide 时崩溃。
     */
    const effectiveTheme = inject(THEME_INJECTION_KEY, /** @type {any} */ (ref('light')));

    /**
     * M5 主题层修复：取 Naive UI 当前主题的常用颜色变量，绑定到 `.editor-view` /
     * `.editor-view__body` 等非 Naive UI 组件的 inline style 上。
     * 详见 `src/composables/useThemeStyles.js` 的说明。
     */
    const themeStyles = useThemeStyles();

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
     *
     * 同时把返回的 `isSaving` 暴露给 M4 的 `useUnsavedGuard`，让路由守卫
     * 能在自动保存进行中先等待完成、再判断 dirty。
     */
    const contentRef = toRef(editorStore, 'content');
    const { isSaving } = useAutoSave(contentRef);

    /**
     * M4：未保存拦截。把 `dirty` 与 `isSaving` 两个 ref 交给 composable，
     * 在 `onMounted` 安装（保证 router 实例就绪后再注册守卫，避免 setup 阶段
     * 任何 microtask 提前触发导航守卫的边角情况）；卸载由 composable 内部
     * `onBeforeUnmount` 兜底。
     *
     * `dirty` 同样用 `toRef` 转显式 Ref，理由同 contentRef。
     */
    const isDirtyRef = toRef(editorStore, 'dirty');
    const guard = useUnsavedGuard(isDirtyRef, isSaving);
    onMounted(() => {
      guard.installGuard();
    });

    /**
     * 「直接进入 /editor」防御：
     *
     * 场景：
     *   - 用户刷新 `/editor?mode=open` 页面 → Pinia 状态被重置（fileHandle === null），
     *     但 URL 仍带 `?mode=open`。原行为是渲染 NAlert「当前未加载任何文件句柄」。
     *   - 用户从外部链接 / 书签直接进入 `/editor?mode=open` → 同上。
     *
     * 行为：跳转到首页 `/`，让用户走 EntryView 重新选择「新建 / 打开」。
     * 使用 `router.replace` 而非 `router.push`：不在浏览器历史留下 `/editor` 条目，
     * 避免「返回」键又把用户带回空编辑器。
     *
     * 为什么不用 `mode === 'new'` 路径：新建场景下 fileHandle 本来就是 null，
     * 不应跳转——用户期望看到空白编辑器。
     *
     * 拦截避开：
     *   没有句柄时 `dirty` 没有实际意义（没有可保存的内容），重定向不应该
     *   触发「未保存拦截」二次确认。跳转前先调 `guard.uninstallGuard()` 卸下
     *   beforeunload + 路由 beforeEach 守卫，router.replace 即被允许放行。
     *   这是 M-direct-entry fix 的核心修正。
     *
     * 触发：
     *   - `onMounted` —— 首次挂载（直接 URL 进入 / 刷新）
     *   - watch `route.query.mode` —— 同 path 不同 query 的导航（防御未来追加
     *     in-app 跳转路由，比如「从 TitleBar 触发重新打开」）
     *
     * 注意：保留模板中的 NAlert「打开状态异常」分支——若 redirect 被路由 guard 拦截
     * 或渲染时机异常，仍能给用户一个可视提示，不至于呈现一片空白。
     */
    function redirectIfDirectEntryMissingHandle() {
      if (route.query.mode === 'open' && !editorStore.hasFileHandle) {
        // 卸下拦截：无句柄的「未保存」不是真的未保存，导航不应被拦截
        guard.uninstallGuard();
        // .catch 抑制 NavigationFailure：被守卫拦截等情况不需要污染控制台
        router.replace('/').catch(() => {});
      }
    }
    onMounted(redirectIfDirectEntryMissingHandle);
    watch(() => route.query.mode, redirectIfDirectEntryMissingHandle);

    /**
     * M6：「另存为」入口。`handleSaveAs` 与 TitleBar 「另存为」按钮共用，
     * 保证快捷键与点击行为完全一致。`isSavingAs` 当前未在本视图消费
     * （TitleBar 用作按钮 loading），但保留返回以便未来做状态徽标。
     */
    const { handleSaveAs } = useSaveAs();

    /**
     * M6：监听 `Ctrl/Cmd+Shift+S` 触发「另存为」。
     *
     * 匹配规则：
     *   - `(e.ctrlKey || e.metaKey)` —— Windows/Linux 用 Ctrl，macOS 用 Cmd
     *   - `e.shiftKey` —— 必须按住 Shift（与 vditor 可能占用的 Ctrl+S 区分）
     *   - `e.key === 'S' || e.key === 's'` —— shift 状态下 `e.key` 通常为 'S'；
     *     接受 's' 作为防御性 fallback（少数键盘布局 / 输入法场景）
     *
     * 行为：
     *   - `e.preventDefault()` 阻止浏览器默认（Firefox 上 Save Page As 之类）
     *   - `handleSaveAs()` 内部有 `isSavingAs` 防双击，连按快捷键不会重复触发
     *
     * 注意：vditor 自带 `Ctrl+S` 触发「保存页面」等浏览器默认行为，但
     * `Ctrl+Shift+S` 不会与 vditor 冲突（M6 §3.4 决议）。
     */
    function handleKeydown(e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        handleSaveAs();
      }
    }

    // 在 onMounted 注册监听；onBeforeUnmount 清理，避免 HMR / 重复挂载产生
    // 多次绑定的 console 警告。监听器闭包在 setup 阶段创建一次，复用同一份。
    onMounted(() => {
      window.addEventListener('keydown', handleKeydown);
    });

    /**
     * M7：外部修改检测 watcher。
     * - `handleRef` 用 `toRef` 拿到 store 上的 ref 视图 —— watcher 内部 watch
     *   此 ref，handle 变化时自动启停轮询（如「另存为」产生新句柄）。
     * - 首次打开已有 handle 的文件 → `immediate: true` 让 watch 同步启动轮询。
     * - 卸载由 composable 内部 `onBeforeUnmount` 清理 interval + focus 监听。
     */
    const handleRef = toRef(editorStore, 'fileHandle');
    const externalWatcher = useExternalWatcher(handleRef);

    /**
     * vditor 初始化失败兜底：上方 toast + console 已由 VditorEditor 处理，
     * 此处补一条用户可读提示，确保使用者了解。
     */
    function handleVditorError(err) {
      message.error('编辑器加载失败，请刷新重试');
      console.error('[EditorView] vditor init error:', err);
    }

    /**
     * 卸载钩子：
     * - useAutoSave 已通过 onBeforeUnmount 自行清理 pending timer
     * - useUnsavedGuard 已通过 onBeforeUnmount 自行清理 beforeunload + 路由守卫
     * - M6：清理 keydown 监听器
     * - 仅留日志锚点，便于未来排查「卸载时机 / 半保存」之类问题
     */
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleKeydown);
      console.debug('[EditorView] unmounted');
    });

    return () => {
      const mode = route.query.mode === 'open' ? 'open' : 'new';
      return (
        <div
          class="editor-view"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            // M5 主题层修复：Naive UI 的 --n-color 不是全局 CSS 变量（仅在
            // 每个组件的 hash 类作用域内生效），这里必须读 themeStyles.bodyColor
            // 以保证暗模式下 `.editor-view` 背景随之翻深。
            background: themeStyles.bodyColor.value,
          }}
        >
          <TitleBar />
          <div
            class="editor-view__body"
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              // 不设 padding：让 vditor 自带 toolbar 边缘与 TitleBar / 窗口边缘对齐，
              // 去除内外不必要留白。
            }}
          >
            {mode === 'open' && !editorStore.hasFileHandle ? (
              <NAlert type="warning" title="打开状态异常" style={{ marginTop: '16px' }} showIcon>
                当前未加载任何文件句柄。请返回入口重新打开 Markdown 文件。
              </NAlert>
            ) : (
              <VditorEditor
                value={editorStore.content}
                theme={effectiveTheme.value}
                readonly={editorStore.externalState === 'orphaned'}
                outlineEnabled={settingsStore.outlineEnabled}
                onUpdate:value={(val) => editorStore.setContent(val)}
                onError={handleVditorError}
              />
            )}
          </div>
          {/* M7：外部修改检测对话框。由 useExternalWatcher 控制显隐，onResolve
              走 watcher 的 handleDialogResolve('keep' | 'reload' | 'later')。 */}
          <ExternalChangeDialog
            show={externalWatcher.showDialog.value}
            {...{
              onResolve: (choice) => externalWatcher.handleDialogResolve(choice),
            }}
          />
        </div>
      );
    };
  },
});
