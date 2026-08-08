import { defineComponent } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { NSpace, NButton, NTag } from 'naive-ui';
import { useEditorStore } from '@/stores/useEditorStore';

/**
 * 编辑器页（M1 占位） —— M2 接入 vditor + TitleBar + 设置抽屉。
 *
 * 当前仅展示 useEditorStore 状态 + 路由 query 校验，便于路由链路冒烟。
 */
export default defineComponent({
  name: 'EditorView',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const editorStore = useEditorStore();

    return () => (
      <div
        style={{
          minHeight: '100vh',
          padding: '24px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <NSpace vertical size="large">
          <NSpace align="center">
            <h2 style={{ margin: 0 }}>编辑器（M1 占位）</h2>
            <NTag type="info">{route.query.mode === 'open' ? '打开模式' : '新建模式'}</NTag>
          </NSpace>

          <p style={{ margin: 0, color: 'var(--n-text-color-3, #888)' }}>
            vditor 实例将在 M2 接入。当前仅暴露 store 状态供路由链路冒烟。
          </p>

          <NSpace>
            <NTag>fileName: {editorStore.fileName}</NTag>
            <NTag type={editorStore.dirty ? 'warning' : 'success'}>
              dirty: {String(editorStore.dirty)}
            </NTag>
            <NTag>externalState: {editorStore.externalState}</NTag>
          </NSpace>

          <NSpace>
            <NButton onClick={() => editorStore.setContent('# Hello\n\nEdited!')}>
              setContent(edited)
            </NButton>
            <NButton onClick={() => editorStore.markSaved({ content: editorStore.content })}>
              markSaved
            </NButton>
            <NButton onClick={() => router.push('/')}>返回入口</NButton>
          </NSpace>
        </NSpace>
      </div>
    );
  },
});
