import { defineComponent, ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NSpace, NButton, useMessage } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';
import { useFileSystem } from '@/composables/useFileSystem';
import { useThemeStyles } from '@/composables/useThemeStyles';
import { hasFSAPI } from '@/utils/browser';
import { THEME_INJECTION_KEY } from '@/composables/useTheme';

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

    const effectiveTheme = inject(THEME_INJECTION_KEY, ref('light'));
    const themeStyles = useThemeStyles();

    function handleNew() {
      router.push({ path: '/editor', query: { mode: 'new' } });
    }

    async function handleOpen() {
      if (!hasFSAPI()) {
        message.error('当前浏览器不支持文件选择，请使用 Chrome / Edge');
        return;
      }
      opening.value = true;
      try {
        const result = await fileSystem.openFile();
        if (!result) return;
        editorStore.loadFromFile({
          handle: result.handle,
          content: result.content,
          name: result.name,
        });
        await router.push({ path: '/editor', query: { mode: 'open' } });
      } catch (err) {
        console.warn('[EntryView] open failed:', err);
      } finally {
        opening.value = false;
      }
    }

    return () => {
      const pageBg = effectiveTheme.value === 'dark' ? '#18181c' : '#f0f0f0';
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: pageBg,
            transition: 'background 0.3s',
          }}
        >
          <NCard hoverable style={{ width: '420px' }} content-style={{ padding: '36px 16px' }}>
            <NSpace vertical size="large">
              <div style={{ textAlign: 'center' }}>
                <img src="/favicon.svg" alt="" width="72" height="72" />
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '28px',
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                inkwell
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  lineHeight: 1.6,
                  textAlign: 'center',
                  color: themeStyles.textColor3.value,
                }}
              >
                简洁的 Web 端 Markdown 编辑器，支持本地文件读写
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <NSpace vertical size="medium" style={{ width: '80%' }}>
                  <NButton
                    type="primary"
                    size="large"
                    block
                    onClick={handleNew}
                    aria-label="新建文档"
                  >
                    新建
                  </NButton>
                  <NButton
                    size="large"
                    block
                    loading={opening.value}
                    onClick={handleOpen}
                    aria-label="打开本地文件"
                  >
                    打开…
                  </NButton>
                </NSpace>
              </div>
            </NSpace>
          </NCard>
        </div>
      );
    };
  },
});
