import { defineComponent, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import Vditor from 'vditor';

/**
 * vditor 包装组件 —— 设计文档 §5.1 / M2 §3.2。
 *
 * Props：
 *   - value     初始内容（同时作为外部变化的同步源）
 *   - theme     'light' | 'dark'，映射到 vditor 的 'classic' / 'dark'
 *   - readonly  只读模式（M8 用于 orphaned 状态；M2 默认 false）
 *   - outlineEnabled  是否显示 vditor 大纲面板（默认 false；M9 子项，由设置面板控制）
 *
 * Emits：
 *   - update:value  vditor input 事件
 *   - ready         vditor 实例就绪（after 回调触发）
 *   - error         初始化失败
 *
 * 关键设计：
 *   - `value` 同步靠 `vditor.getValue()` 与新值比较，避免回环（无需 isInternalUpdate 标志）
 *   - `theme` 切换靠 `vditor.setTheme(uiTheme, contentTheme, codeTheme?, contentPath?)` 一条 API 完成：
 *       · `uiTheme`     UI 主题（工具栏 / 输入框背景，CSS 变量翻转）
 *       · `contentTheme` 内容主题（`.vditor-reset` 文字 / 块引用 / 表格 / kbd / linkcard 等
 *                       硬编码颜色，由 vditor 官方 `content-theme/*.css` 提供）
 *     两个参数必须**同时**传，否则会出现「背景变深但文字仍是深色」的对比度问题（M5 验收）。
 *     初始创建时则靠 `preview.theme.current` 选项让 vditor initUI 预调一次，免首次闪烁。
 *   - `readonly` 切换通过 `vditor.disabled()` 双向切换（M2 用不到，但接口就位）
 *   - `outlineEnabled`：
 *       · 初始显隐由 vditor 自己处理：`initUI` 内部 `setEditMode(vditor, options.mode, ...)`
 *         末尾会按 `vditor.options.outline.enable` 调一次 `vditor.outline.toggle(...)`
 *         （见 `node_modules/vditor/src/ts/toolbar/EditMode.ts:150`）。所以只要在
 *         init 选项里把 `outline: { enable: props.outlineEnabled, position: 'left' }`
 *         传对，初次挂载即落到期望状态——**不需要**在 `after` 里再手动 toggle。
 *       · 后续 prop 变化由 `watch` 监听；`outline.toggle` 仅设置 `display` 并重新
 *         渲染大纲 DOM，对已 mount 的 vditor 实例安全。
 *       · vditor toolbar 中已经移除 `'outline'` 按钮（设置抽屉接管），但
 *         `outline.toggle()` 中 `vditor.toolbar.elements.outline?.firstElementChild` 用
 *         optional-chaining 守卫，移除后该引用为 `undefined`，安全 no-op
 *         （见 `node_modules/vditor/src/ts/outline/index.ts:28`）。
 *       · `vditor.outline` / `vditor.toolbar` / `vditor.lute` 等挂在 Vditor **类实例**
 *         的 `vditor.vditor`（内部 IVditor 对象）上。Vditor 类自己仅有 `setValue` /
 *         `disabled` / `getValue` 等便捷方法（见 `node_modules/vditor/dist/index.d.ts`）。
 *         因此 watch 回调里调 `outline.toggle` 时必须先拿 `vditor.vditor`，并把它作为
 *         第一个参数传回去（vditor 内部会读 `vditor.toolbar.elements` / `vditor.currentMode`）。
 *         `focus=false` 避免抢光标。
 *   - `onBeforeUnmount` 必须调 `vditor.destroy()`，否则 vditor 内部的 DOM / 事件会泄漏
 *
 * 注：vditor 不在 `src/plugins/` 中注册（它是编辑器核心而非 UI 组件库），
 * 直接由本组件 import。CSS 由 `src/styles/index.css` `@import` 引入。
 */
export default defineComponent({
  name: 'VditorEditor',
  props: {
    value: { type: String, default: '' },
    theme: {
      type: String,
      default: 'light',
      validator: (v) => v === 'light' || v === 'dark',
    },
    readonly: { type: Boolean, default: false },
    outlineEnabled: { type: Boolean, default: false },
  },
  emits: ['update:value', 'ready', 'error'],
  setup(props, { emit }) {
    const elRef = ref(/** @type {HTMLElement | null} */ (null));
    const vditorRef = ref(/** @type {Vditor | null} */ (null));
    const initFailed = ref(false);

    /**
     * 把组件层 `theme` 映射到 vditor 的 UI 主题枚举。
     * `'light' → 'classic'`、`'dark' → 'dark'`。
     */
    function toVditorTheme(theme) {
      return theme === 'dark' ? 'dark' : 'classic';
    }

    /**
     * 把组件层 `theme` 映射到 vditor 的内容主题枚举。
     * 当前只取 `'light' | 'dark'`；其它可选 `'ant-design' | 'wechat'` 但与
     * `theme` 切换语义无关，保留扩展位（M9 体验打磨再议）。
     */
    function toVditorContentTheme(theme) {
      return theme === 'dark' ? 'dark' : 'light';
    }

    /**
     * 构造 vditor 内容主题 CSS 所在的 CDN 路径。
     * 用 `vditor.version` 拼装，避免与 `package.json` 里 vditor 版本硬编码漂移。
     *
     * vditor 默认 `cdn` 即 `https://unpkg.com/vditor@${version}`（见
     * `node_modules/vditor/src/ts/constants.ts` `Constants.CDN`），与下方构造一致。
     */
    function getContentThemePath(version) {
      return `https://unpkg.com/vditor@${version}/dist/css/content-theme`;
    }

    /**
     * 创建 vditor 实例。必须在挂载完成后调用（elRef.value 已就绪）。
     */
    function createVditor() {
      if (!elRef.value) return;
      try {
        const vditor = new Vditor(elRef.value, {
          mode: 'wysiwyg',
          theme: toVditorTheme(props.theme),
          // 让 vditor 实例撑满父容器（`.vditor-editor-container`）。
          // vditor 默认 `height: 'auto'` → `.vditor` 元素高度 = toolbar + 内容自然高度，
          // 不填剩余空间，导致 `.vditor-content`（flex: 1）只到 `min-height: 60px` 就不再长。
          // 传 '100%' 后，vditor.initUI 会设 `vditor.element.style.height = '100%'`，
          // 从而让 `.vditor-content`（`flex: 1`） / `.vditor-wysiwyg`（`flex: 1`）一并撑满。
          // width 同样默认 'auto' → 设为 '100%' 以与容器对齐。
          height: '100%',
          width: '100%',
          // vditor 默认 `cache.enable = true`，而 3.11.x 在合并选项后会校验
          // `cache.id` —— 若不提供会抛 `need options.cache.id`。
          // M2 不做自动保存，且该缓存是「keypress → localStorage」级别的简单兑底，
          // 同一 cache.id 下多文件场景会互相覆盖草稿；M3 将以 IndexedDB 接手。
          // 因此这里明确禁用，避免与未来持久化方案冲突。
          cache: { enable: false },
          // 显式精简 vditor 默认工具栏：移除上传、录音、内容主题预览、导出、
          // 开发者工具、关于、帮助。其它按钮保留以贴合常见 Markdown 编辑器体验。
          // 「more」子菜单仅保留：both（双栏 / 单栏切换）、code-theme（代码块主题）、
          // preview（即时预览）。`outline`（大纲）按钮已被设置抽屉接管，故不再放入
          // 工具栏，避免与 SettingsDrawer 产生双入口导致状态不同步。
          // 按钮名以 `node_modules/vditor/dist/index.js:14580` 默认数组为准。
          toolbar: [
            'emoji',
            'headings',
            'bold',
            'italic',
            'strike',
            'link',
            '|',
            'list',
            'ordered-list',
            'check',
            'outdent',
            'indent',
            '|',
            'quote',
            'line',
            'code',
            'inline-code',
            'insert-before',
            'insert-after',
            '|',
            'table',
            '|',
            'undo',
            'redo',
            '|',
            'fullscreen',
            'edit-mode',
            {
              name: 'more',
              toolbar: ['both', 'code-theme', 'preview'],
            },
          ],
          // vditor 3.11.x 的 highlightToolbarWYSIWYG() 会在用户选中表格 / 代码块 /
          // 图片 / 引用 / 列表项等元素时无条件调用
          //   vditor.options.customWysiwygToolbar(type, popover)
          // 但该选项在类型上声明为 `customWysiwygToolbar?(...)`，运行时未做
          // optional-chaining 守卫。未注入时就会报 `is not a function`。
          // 本项目暂不扩展浮动工具栏，提供空函数兑底，避免控制台报错。
          customWysiwygToolbar: () => {},
          // M5：初始内容主题与 `theme` prop 对齐。vditor 内部 initUI 会在创建后
          // 调用 `setContentTheme(preview.theme.current, preview.theme.path)`，
          // 因此传 `current` 就够了；`path` 不传，vditor 默认用 `${cdn}/dist/css/content-theme`
          // （与 `getContentThemePath(vditor.version)` 一致）。
          preview: {
            theme: {
              current: toVditorContentTheme(props.theme),
            },
          },
          // vditor 默认 `outline: { enable: false, position: 'left' }`，工具栏
          // Outline 按钮点击时会同步切 `options.outline.enable` 与 `outline.toggle()`。
          // 本项目已把工具栏按钮移除（见上方 toolbar 注释），大纲由设置面板控制：
          // 这里把 `enable` 直接绑到 prop。`initUI` 内部 `setEditMode` 末尾会按
          // `options.outline.enable` 调一次 `outline.toggle()`（见 `toolbar/EditMode.ts:150`），
          // 因此**初次挂载**的显隐状态由 vditor 自己 here，只需要保证 options 正确即可。
          outline: {
            enable: props.outlineEnabled,
            position: 'left',
          },
          after: () => {
            // setValue 不应触发 input 回调（仅用户操作会触发），所以不会形成回环
            vditor.setValue(props.value || '', true);
            // readonly 在 vditor.setValue 之后设置更安全（避免某些边界状态）
            if (props.readonly) vditor.disabled();
            emit('ready');
          },
          input: (val) => {
            emit('update:value', val);
          },
        });
        vditorRef.value = vditor;
        initFailed.value = false;
      } catch (err) {
        initFailed.value = true;
        console.error('[VditorEditor] init failed:', err);
        emit('error', err);
      }
    }

    /**
     * 销毁 vditor 实例，释放其内部 DOM 与事件监听。组件卸载时必调。
     */
    function destroyVditor() {
      const vditor = vditorRef.value;
      if (!vditor) return;
      try {
        vditor.destroy();
      } catch (err) {
        // destroy 在某些浏览器抛出无害异常，仅 warn 不阻断
        console.warn('[VditorEditor] destroy() failed:', err);
      }
      vditorRef.value = null;
    }

    onMounted(() => {
      createVditor();
    });

    onBeforeUnmount(() => {
      destroyVditor();
    });

    // 外部 value 变化 → 同步到 vditor（仅在两者不一致时调用，避免回环）
    watch(
      () => props.value,
      (next) => {
        const vditor = vditorRef.value;
        if (!vditor) return;
        if (next !== vditor.getValue()) {
          vditor.setValue(next || '', true);
        }
      },
    );

    // 主题变化 → vditor.setTheme 一条 API 同时切 UI 主题 + 内容主题
    //   - `theme`           UI 主题（工具栏 / 输入框背景，CSS 变量翻转）
    //   - `contentTheme`    内容主题（.vditor-reset 文字 / blockquote / table / kbd
    //                       等硬编码颜色，由 vditor 官方 content-theme/*.css 提供）
    // 两者必须同时切换，否则暗模式下会出现「背景变深但文字仍为深色」的对比度
    // 归零 bug（M5 §4.2 联动验收要求）。
    watch(
      () => props.theme,
      (next) => {
        const vditor = vditorRef.value;
        if (!vditor) return;
        try {
          vditor.setTheme(
            toVditorTheme(next),
            toVditorContentTheme(next),
            undefined,
            getContentThemePath(vditor.version),
          );
        } catch (err) {
          console.warn('[VditorEditor] setTheme failed:', err);
        }
      },
    );

    // 只读切换（M2 通常为 false；接口就位供 M8 使用）
    watch(
      () => props.readonly,
      (readonly) => {
        const vditor = vditorRef.value;
        if (!vditor) return;
        try {
          if (readonly) {
            vditor.disabled();
          } else {
            vditor.disabledCache();
          }
        } catch (err) {
          console.warn('[VditorEditor] readonly toggle failed:', err);
        }
      },
    );

    // 大纲显隐联动（设置面板控制）：
    //   - 同时同步 `vditor.options.outline.enable`，保证 vditor 内部状态与 UI 一致
    //     （即便后续会被 Mode 切换 / 浏览器内的 Outline 按钮调用读到这个值）
    //   - `outline.toggle(vditor, show, focus=false)`：focus=true 会在编辑器失焦时
    //     重新 focus 光标，初次挂载我们传 false 避免抢光标；后续切换传 false 即可，
    //     让用户的编辑焦点不被大纲操作打断
    //   - `outline` 挂在 Vditor 实例的 `vditor.vditor` 上，调 `toggle` 时需穿透。
    watch(
      () => props.outlineEnabled,
      (next) => {
        const vditor = vditorRef.value;
        if (!vditor || !vditor.vditor || !vditor.vditor.outline) return;
        try {
          if (vditor.vditor.options.outline) {
            vditor.vditor.options.outline.enable = next;
          }
          vditor.vditor.outline.toggle(vditor.vditor, next, false);
        } catch (err) {
          console.warn('[VditorEditor] outline toggle failed:', err);
        }
      },
    );

    return () => {
      if (initFailed.value) {
        // 初始化失败时显示错误占位（M2 §4.3 验收要求）
        return (
          <div
            class="vditor-editor-error"
            style={{
              padding: '16px',
              color: 'var(--n-text-color-warning, #b85c00)',
            }}
          >
            编辑器加载失败：请刷新页面重试，或检查控制台报错信息。
          </div>
        );
      }
      return (
        <div
          ref={elRef}
          class="vditor-editor-container"
          style={{ width: '100%', height: '100%', overflow: 'auto' }}
        />
      );
    };
  },
});
