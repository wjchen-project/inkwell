import { defineComponent } from 'vue';
import {
  NDrawer,
  NDrawerContent,
  NRadioGroup,
  NRadio,
  NSwitch,
  NSlider,
  NSpace,
  NText,
  NH3,
  NDivider,
} from 'naive-ui';
import { useSettingsStore } from '@/stores/useSettingsStore';
import packageJson from '../../../package.json';

/**
 * 设置抽屉 —— 设计文档 §5.3 / M5 §3.3 + M9 收尾。
 *
 * Props / Emits：
 *   - `show: boolean`            控制显隐（v-model:show）
 *   - `update:show(value: bool)`  抽屉内部关闭时触发
 *
 * 数据绑定：
 *   - 所有可调项直接 `v-model` 到 `useSettingsStore` 字段
 *   - 持久化由 `useSettingsStore.installPersistence()` 在 `main.js` 中注册的
 *     `$subscribe` + 300ms 防抖完成；本组件不直接操作 localStorage
 *
 * 布局（设计文档 §3.3 + M9 收尾）：
 *   - 右侧 Drawer，宽 360px
 *   - 节（自上而下）：
 *       1. 主题
 *       2. 大纲（M9 收尾：把 vditor toolbar 中的 `outline` 按钮移除后，迁移到此）
 *       3. 自动保存
 *       4. 外部修改检测
 *       5. 关于
 *   - 数值类控件（Slider）在开关关闭时禁用
 *
 * 关于区（M5 §4.1）：
 *   - 版本号从 `package.json` 读取（Vite 原生支持 JSON import）
 *   - GitHub 链接：占位仓库地址（待 Phase 5 接入实际仓库后再回填）
 */

const GITHUB_URL = 'https://github.com/earendil-works/md-editor-web';
const APP_VERSION = packageJson.version;

export default defineComponent({
  name: 'SettingsDrawer',
  props: {
    show: { type: Boolean, default: false },
  },
  emits: ['update:show'],
  setup(props, { emit }) {
    const settingsStore = useSettingsStore();

    /**
     * 关闭抽屉：仅由 Drawer 自身的 close 触发（mask / esc / X 按钮）。
     * 显隐完全由外部 `show` 控制。
     */
    function handleUpdateShow(value) {
      emit('update:show', value);
    }

    return () => (
      <NDrawer show={props.show} placement="right" width={360} onUpdateShow={handleUpdateShow}>
        <NDrawerContent title="设置" closable>
          <NSpace vertical size="large" style={{ paddingRight: '4px' }}>
            {/* ───────── 主题 ───────── */}
            <section>
              <NH3 style={{ margin: '0 0 12px' }}>主题</NH3>
              <NRadioGroup
                value={settingsStore.theme}
                onUpdateValue={(v) => {
                  settingsStore.theme = v;
                }}
              >
                <NSpace>
                  <NRadio value="light">浅色</NRadio>
                  <NRadio value="dark">深色</NRadio>
                  <NRadio value="auto">跟随系统</NRadio>
                </NSpace>
              </NRadioGroup>
            </section>

            <NDivider style={{ margin: 0 }} />

            {/* ───────── 大纲（M9 收尾）─────────
                vditor 工具栏中的 `more > outline` 按钮已移除（M9 收尾：
                从 `src/components/editor/VditorEditor.jsx` toolbar 配置去掉）。
                大纲显隐改由本开关控制：开关 → `settingsStore.outlineEnabled` →
                `EditorView` 透传 `outlineEnabled` prop → VditorEditor 调用
                `vditor.outline.toggle(vditor, next)` 完成切换。持久化复用
                M1 已就位的 `useSettingsStore.installPersistence()`。 */}
            <section>
              <NH3 style={{ margin: '0 0 12px' }}>大纲</NH3>
              <NSpace align="center" justify="space-between" style={{ width: '100%' }}>
                <NText>显示文档大纲</NText>
                <NSwitch
                  value={settingsStore.outlineEnabled}
                  onUpdateValue={(v) => {
                    settingsStore.outlineEnabled = v;
                  }}
                />
              </NSpace>
            </section>

            <NDivider style={{ margin: 0 }} />

            {/* ───────── 自动保存 ───────── */}
            <section>
              <NH3 style={{ margin: '0 0 12px' }}>自动保存</NH3>
              <NSpace vertical size="medium">
                <NSpace align="center" justify="space-between" style={{ width: '100%' }}>
                  <NText>启用</NText>
                  <NSwitch
                    value={settingsStore.autoSave}
                    onUpdateValue={(v) => {
                      settingsStore.autoSave = v;
                    }}
                  />
                </NSpace>
                <div>
                  <NSpace align="center" justify="space-between" style={{ width: '100%' }}>
                    <NText>间隔（秒）</NText>
                    <NText depth="3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {settingsStore.autoSaveInterval} 秒
                    </NText>
                  </NSpace>
                  <NSlider
                    value={settingsStore.autoSaveInterval}
                    min={1}
                    max={30}
                    step={1}
                    disabled={!settingsStore.autoSave}
                    onUpdateValue={(v) => {
                      settingsStore.autoSaveInterval = v;
                    }}
                    style={{ marginTop: '4px' }}
                  />
                </div>
              </NSpace>
            </section>

            <NDivider style={{ margin: 0 }} />

            {/* ───────── 外部修改检测 ───────── */}
            <section>
              <NH3 style={{ margin: '0 0 12px' }}>外部修改检测</NH3>
              <NSpace vertical size="medium">
                <NSpace align="center" justify="space-between" style={{ width: '100%' }}>
                  <NText>启用</NText>
                  <NSwitch
                    value={settingsStore.externalWatchEnabled}
                    onUpdateValue={(v) => {
                      settingsStore.externalWatchEnabled = v;
                    }}
                  />
                </NSpace>
                <div>
                  <NSpace align="center" justify="space-between" style={{ width: '100%' }}>
                    <NText>间隔（秒）</NText>
                    <NText depth="3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {settingsStore.externalWatchInterval} 秒
                    </NText>
                  </NSpace>
                  <NSlider
                    value={settingsStore.externalWatchInterval}
                    min={5}
                    max={60}
                    step={5}
                    disabled={!settingsStore.externalWatchEnabled}
                    onUpdateValue={(v) => {
                      settingsStore.externalWatchInterval = v;
                    }}
                    style={{ marginTop: '4px' }}
                  />
                </div>
              </NSpace>
            </section>

            <NDivider style={{ margin: 0 }} />

            {/* ───────── 关于 ───────── */}
            <section>
              <NH3 style={{ margin: '0 0 12px' }}>关于</NH3>
              <NText depth="3">md-editor-web v{APP_VERSION}</NText>
              <div style={{ marginTop: '8px' }}>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--n-primary-color)' }}
                >
                  GitHub
                </a>
              </div>
            </section>
          </NSpace>
        </NDrawerContent>
      </NDrawer>
    );
  },
});
