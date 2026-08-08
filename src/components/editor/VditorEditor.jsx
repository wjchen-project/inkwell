import { defineComponent, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import Vditor from 'vditor';

/**
 * vditor 包装组件 —— 设计文档 §5.1 / M2 §3.2。
 *
 * Props：
 *   - value     初始内容（同时作为外部变化的同步源）
 *   - theme     'light' | 'dark'，映射到 vditor 的 'classic' / 'dark'
 *   - readonly  只读模式（M8 用于 orphaned 状态；M2 默认 false）
 *
 * Emits：
 *   - update:value  vditor input 事件
 *   - ready         vditor 实例就绪（after 回调触发）
 *
 * 关键设计：
 *   - `value` 同步靠 `vditor.getValue()` 与新值比较，避免回环（无需 isInternalUpdate 标志）
 *   - `theme` 切换通过 `vditor.setTheme()` 完成，无需销毁重建
 *   - `readonly` 切换通过 `vditor.disabled()` 双向切换（M2 用不到，但接口就位）
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
  },
  emits: ['update:value', 'ready', 'error'],
  setup(props, { emit }) {
    const elRef = ref(/** @type {HTMLElement | null} */ (null));
    const vditorRef = ref(/** @type {Vditor | null} */ (null));
    const initFailed = ref(false);

    /**
     * 把组件层 `theme` 映射到 vditor 的内部枚举。
     */
    function toVditorTheme(theme) {
      return theme === 'dark' ? 'dark' : 'classic';
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
          // vditor 默认 `cache.enable = true`，而 3.11.x 在合并选项后会校验
          // `cache.id` —— 若不提供会抛 `need options.cache.id`。
          // M2 不做自动保存，且该缓存是「keypress → localStorage」级别的简单兑底，
          // 同一 cache.id 下多文件场景会互相覆盖草稿；M3 将以 IndexedDB 接手。
          // 因此这里明确禁用，避免与未来持久化方案冲突。
          cache: { enable: false },
          // toolbar 不指定 → 使用 vditor 内置默认全量按钮（Phase 2 §4.2 决议）
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

    // 主题变化 → 调用 vditor.setTheme()（无需重建实例）
    watch(
      () => props.theme,
      (next) => {
        const vditor = vditorRef.value;
        if (!vditor) return;
        try {
          vditor.setTheme(toVditorTheme(next));
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
