# 05 · M5 · 主题 + 设置（Theme & Settings Drawer）

> 第五阶段 · 里程碑 5 / 9
> 关联设计文档：[04-design.md §3.2 useSettingsStore](../04-design.md#32-usesettingsstore) / [§5.3 SettingsDrawer](../04-design.md#53-settingsdrawer) / [§6.4 useTheme](../04-design.md#64-usetheme)
> 关联需求：[Phase 2 §4.2 主题切换](../02-editor-and-experience.md) / [§6 设置项](../02-editor-and-experience.md#6-设置项) / [§9 #1 localStorage 持久化](../02-editor-and-experience.md) / [§9 #2 主题联动 Naive UI](../02-editor-and-experience.md) / [§9 #3 Drawer 侧滑](../02-editor-and-experience.md)

---

## 1. 目标

实现主题切换（vditor 与 Naive UI 联动，支持 `auto` 跟随系统）与设置抽屉（侧滑 Drawer）。本里程碑独立于 M3 / M4，可与之并行或交错开发。

---

## 2. 依赖

### 2.1 前置里程碑

- **M1**：stores + 路由 + 持久化基础设施
- **M2**：`VditorEditor` 主题 prop 接口就绪

### 2.2 外部依赖

无新增（Naive UI `Drawer` 已通过 M1 注册到 plugins）。

---

## 3. 交付内容

### 3.1 新增文件

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `src/composables/useTheme.js` | composable | 主题切换 + 联动（见 §3.2） |
| `src/components/editor/SettingsDrawer.jsx` | 组件 | 设置抽屉 UI（见 §3.3） |

### 3.2 `useTheme` 接口

```ts
useTheme() → {
  theme: Ref<'light' | 'dark' | 'auto'>,         // 用户偏好
  effectiveTheme: Ref<'light' | 'dark'>,          // 实际生效主题
  setTheme(theme: 'light' | 'dark' | 'auto'),
}
```

**核心逻辑**：

```
1. theme = useSettingsStore.theme  // 双向同步

2. effectiveTheme:
   if (theme === 'auto') {
     effectiveTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
     // 监听系统变化
     mediaQuery = matchMedia('(prefers-color-scheme: dark)')
     mediaQuery.addEventListener('change', () => { /* 重新计算 effectiveTheme */ })
   } else {
     effectiveTheme = theme
   }

3. setTheme(theme):
   useSettingsStore.theme = theme
   // effectiveTheme 自动通过 computed 更新
```

**联动映射**：

| effectiveTheme | vditor theme | Naive UI theme |
| --- | --- | --- |
| `'light'` | `'classic'` | `undefined`（默认） |
| `'dark'` | `'dark'` | `darkTheme` |

> `VditorEditor` 通过 `watch(effectiveTheme)` 重建实例或调用 `vditor.setTheme()`（vditor 版本支持时优先）。

### 3.3 `SettingsDrawer` 接口

```
props:
  show: boolean          // v-model:show 控制显示
emits:
  update:show(value)
sections:
  1. 主题
     <NRadioGroup v-model:value="useSettingsStore.theme">
       options: ['light', 'dark', 'auto']
     </NRadio>

  2. 自动保存
     <NSwitch v-model:value="useSettingsStore.autoSave" />
     <NSlider v-model:value="useSettingsStore.autoSaveInterval"
              :min="1" :max="30" :step="1" :disabled="!autoSave" />
     <span>{{ autoSaveInterval }} 秒</span>

  3. 外部修改检测
     <NSwitch v-model:value="useSettingsStore.externalWatchEnabled" />
     <NSlider v-model:value="useSettingsStore.externalWatchInterval"
              :min="5" :max="60" :step="5"
              :disabled="!externalWatchEnabled" />
     <span>{{ externalWatchInterval }} 秒</span>

  4. 关于（可选）
     <p>inkwell v0.0.0</p>
     <a href="...">GitHub</a>
```

布局：Naive UI `<NDrawer>` `placement="right"`，宽度 360px。

### 3.4 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/App.jsx` | 包裹 `<NConfigProvider :theme="effectiveTheme === 'dark' ? darkTheme : undefined">` |
| `src/views/EditorView.jsx` | 调用 `useTheme()`；将 `effectiveTheme` 传给 `VditorEditor` |
| `src/components/editor/TitleBar.jsx` | 加入「设置」按钮（图标），点击触发 `SettingsDrawer` |
| `src/stores/useSettingsStore.js` | `$subscribe` 注册：变更 → 防抖 300ms → `localStorage.setItem` |

---

## 4. 验收标准

### 4.1 功能验收

#### 主题切换

- [ ] SettingsDrawer 选择 `light` → vditor 主题变 `classic`，Naive UI 主题变浅色
- [ ] 选择 `dark` → vditor 主题变 `dark`，Naive UI 主题变 `darkTheme`
- [ ] 选择 `auto` → 系统浅色 → 实际为 light；系统深色 → 实际为 dark
- [ ] 系统主题变化（`auto` 模式下切换系统）→ 应用主题实时跟随
- [ ] 切换主题不影响 dirty 状态与内容

#### 设置持久化

- [ ] 修改任一设置项 → 300ms 后 `localStorage['md-editor-settings']` 更新
- [ ] 刷新页面 → 设置恢复
- [ ] 关闭浏览器再打开 → 设置仍恢复
- [ ] 设置项值类型正确（`autoSave: boolean`、`autoSaveInterval: number`）

#### 设置 UI

- [ ] Drawer 从右侧滑出（`placement="right"`）
- [ ] 自动保存开关关闭时，间隔 slider 禁用
- [ ] 外部修改检测开关关闭时，间隔 slider 禁用
- [ ] Slider 显示当前数值（如「5 秒」）
- [ ] Drawer 关闭动画流畅

#### 关于区（可选）

- [ ] 显示版本号（从 `package.json` 读取）
- [ ] GitHub 链接可点击

### 4.2 联动验收

- [ ] dark 主题下：vditor 工具栏背景色、文本色均为深色
- [ ] dark 主题下：Naive UI 组件（Switch、Slider、Drawer）均为深色
- [ ] light 主题下：vditor 与 Naive UI 均为浅色
- [ ] 切换过程中无组件颜色残留

### 4.3 性能与边界

- [ ] 主题切换不触发自动保存（避免无意义 IO）
- [ ] 主题切换不破坏 vditor 编辑状态（内容、滚动位置保持）
- [ ] `auto` 模式下系统主题变化不导致整页刷新
- [ ] localStorage 写入防抖生效：连续修改多个设置 → 仅最后一次触发 IO

### 4.4 质量验收

- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过
- [ ] `npm run format` 通过
- [ ] console 无 Naive UI 主题警告
- [ ] console 无 vditor 主题切换错误

---

## 5. 参考

- 设计文档：[04-design.md §3.2](../04-design.md#32-usesettingsstore) §5.3 §6.4
- 需求文档：[Phase 2 §4.2](../02-editor-and-experience.md) §6 §9 #1 #2 #3
- Naive UI：[Drawer](https://www.naiveui.com/zh-CN/os-theme/components/drawer) / [ConfigProvider](https://www.naiveui.com/zh-CN/os-theme/components/config-provider)