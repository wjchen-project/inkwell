import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NSpace, NButton, useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useFileSystem } from '@/composables/useFileSystem';
import { useThemeStyles } from '@/composables/useThemeStyles';
import { hasFSAPI } from '@/utils/browser';

/**
 * 入口页 —— 设计文档 §4 / M2 §3.4。
 *
 * 行为：
 *   - 「新建」 → `router.push('/editor?mode=new')`；目标页 EditorView 会调用
 *     `editorStore.reset()` 复位空文档。
 *   - 「打开」 → 调 `useFileSystem.openFile()`：
 *       · 用户取消（AbortError） → 静默返回 null，无导航、无错误
 *       · 成功 → `editorStore.loadFromFile({...})` + 跳转到 `/editor?mode=open`
 *       · 失败 → useFileSystem 已经 toast，catch 兜底即可
 *       · 非 Chromium → toast「当前浏览器不支持文件选择」+ 不跳转
 *
 * 注：未保存拦截（编辑中再点新建 / 打开）由 M4 用 `useUnsavedGuard` 接入，
 * 本里程碑不拦截，避免路由跳转与状态重置提前耦合。
 */
export default defineComponent({
  name: 'EntryView',
  setup() {
    const router = useRouter();
    const message = useMessage();
    const editorStore = useEditorStore();
    const fileSystem = useFileSystem();
    const opening = ref(false);

    /**
     * M5 主题层修复：副标题「选择开始方式」以前写死 `var(--n-text-color-3, #888)`，
     * Naive UI 的 --n-text-color-3 不是全局 CSS 变量，暗模式下仍是 #888。
     * 改为读 themeStyles.textColor3（暗模式下为更亮的辅助文字色），保证跟随主题。
     */
    const themeStyles = useThemeStyles();

    function handleNew() {
      router.push({ path: '/editor', query: { mode: 'new' } });
    }

    async function handleOpen() {
      // 显式再校验一次：BrowserGate 不阻断跳转，但打开操作必须可执行
      if (!hasFSAPI()) {
        message.error('当前浏览器不支持文件选择，请使用 Chrome / Edge');
        return;
      }
      opening.value = true;
      try {
        const result = await fileSystem.openFile();
        if (!result) return; // 用户取消，no-op
        editorStore.loadFromFile({
          handle: result.handle,
          content: result.content,
          name: result.name,
        });
        await router.push({ path: '/editor', query: { mode: 'open' } });
      } catch (err) {
        // useFileSystem 已 toast；此处保留日志便于排错
        console.warn('[EntryView] open failed:', err);
      } finally {
        opening.value = false;
      }
    }

    return () => (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <NSpace vertical align="center" size="large">
          <h1 style={{ margin: 0 }}>md-editor-web</h1>
          <p style={{ margin: 0, color: themeStyles.textColor3.value }}>选择开始方式</p>
          <NSpace>
            <NButton type="primary" size="large" onClick={handleNew}>
              新建
            </NButton>
            <NButton size="large" loading={opening.value} onClick={handleOpen}>
              打开…
            </NButton>
          </NSpace>
        </NSpace>
      </div>
    );
  },
});
