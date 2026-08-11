import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NButton,
  NInput,
  NSpace,
  NTooltip,
  NModal,
  // 入口页卡片
  NCard,
  // M5：SettingsDrawer 用到
  NDrawer,
  NDrawerContent,
  NRadio,
  NRadioGroup,
  NSwitch,
  NSlider,
  NDivider,
  NH3,
  NText,
  create,
} from 'naive-ui';

/**
 * Naive UI —— 按需全局注册。
 *
 * 仅把当前 Markdown 编辑器会用到的组件写入 `components` 数组，
 * 未列出的组件在模板中按需局部引入即可（不会被纳入产物）。
 *
 * 新增组件时：在 `naive-ui` 中按名导入，并追加到下方的数组中。
 * 若需要图标，记得配套安装图标库（如 `@vicons/ionicons5`）并单独处理。
 */
const naive = create({
  components: [
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    NButton,
    NInput,
    NSpace,
    NTooltip,
    NModal,
    // 入口页卡片
    NCard,
    // M5：SettingsDrawer + 主题 / 自动保存 / 外部修改检测 区块
    NDrawer,
    NDrawerContent,
    NRadio,
    NRadioGroup,
    NSwitch,
    NSlider,
    NDivider,
    NH3,
    NText,
  ],
});

export default naive;
