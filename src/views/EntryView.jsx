import { defineComponent } from 'vue';
import { useRouter } from 'vue-router';
import { NSpace, NButton } from 'naive-ui';

/**
 * 入口页（M1 占位） —— 提供「新建」/「打开」按钮，逻辑后续 M2 填充。
 *
 * 设计文档 §4：当前只暴露按钮 UI；File System Access API 接入留待 M2。
 */
export default defineComponent({
  name: 'EntryView',
  setup() {
    const router = useRouter();

    const goEditor = (mode) => {
      router.push({ path: '/editor', query: { mode } });
    };

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
          <p style={{ margin: 0, color: 'var(--n-text-color-3, #888)' }}>
            M1 占位入口 · M2 接入 vditor + File System Access
          </p>
          <NSpace>
            <NButton type="primary" disabled>
              新建
            </NButton>
            <NButton disabled>打开…</NButton>
          </NSpace>
          <NButton quaternary size="small" onClick={() => goEditor('new')}>
            跳到编辑器（仅验证路由）
          </NButton>
        </NSpace>
      </div>
    );
  },
});
