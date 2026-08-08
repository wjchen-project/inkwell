# 05 · M2 · 入口与编辑器骨架（Entry & Editor Skeleton）

> 第五阶段 · 里程碑 2 / 9
> 关联设计文档：[04-design.md §4 路由设计](../04-design.md#4-路由设计) / [§5.1 VditorEditor](../04-design.md#51-vditoreditor) / [§5.2 TitleBar](../04-design.md#52-titlebar) / [§6.1 useFileSystem](../04-design.md#61-usefilesystem)
> 关联需求：[Phase 2 §4.2 vditor 集成](../02-editor-and-experience.md) / [Phase 3 §4.1 另存为基础](../03-file-capabilities.md#41-另存为-save-as) / [Phase 3 §9 #15](../03-file-capabilities.md) 默认文件名 / [§9 #16](../03-file-capabilities.md) 扩展名

---

## 1. 目标

搭建 `EntryView`（新建 / 打开按钮）与 `EditorView`（编辑器页外壳），集成 vditor 与 File System Access API，让「新建 → 编辑 → 手动保存」的最短路径跑通。本里程碑**不**实现自动保存、关闭拦截、主题切换——这些分别在 M3-M5 完成。

---

## 2. 依赖

### 2.1 前置里程碑

- **M1**（基础设施）：stores / 路由 / 工具就绪

### 2.2 外部依赖（需安装）

```bash
npm i vditor@^X.Y.Z    # 版本由 Phase 2 §9 #7 决议：caret 范围
```

> 注：vditor 不在 `src/plugins/`（它不是组件库，是编辑器核心），直接由 `VditorEditor` 组件 import。其 CSS 由 `styles/index.css` `@import` 引入。

---

## 3. 交付内容

### 3.1 新增文件

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `src/views/EntryView.jsx` | 页面组件 | 入口选择页：「新建」「打开」两个按钮 |
| `src/views/EditorView.jsx` | 页面组件 | 编辑器页外壳：标题栏 + vditor |
| `src/components/editor/VditorEditor.jsx` | 组件 | vditor 包装：生命周期 + 事件桥接（见 §3.2） |
| `src/components/editor/TitleBar.jsx` | 组件 | 顶部标题栏（M2 仅显示文件名，圆点等 M3 加入） |
| `src/composables/useFileSystem.js` | composable | File System Access API 封装（见 §3.3） |
| `src/utils/file.js` | 模块 | 扩展名验证（`.md` / `.markdown`） |

### 3.2 `VditorEditor` 接口

```
props:
  value: string           // 初始内容（用于 setValue）
  theme: 'light' | 'dark' // vditor 主题（'classic' / 'dark' 映射）
  readonly: boolean       // 只读模式（M8 用于 orphaned 状态）
emits:
  update:value(value)     // vditor input 事件
  ready()                 // 实例就绪
行为：
  onMounted:
    new Vditor(el, { mode: 'wysiwyg', theme: ..., toolbar: 默认全量,
                     after: () => { setValue(value); emit('ready') },
                     input: (val) => emit('update:value', val) })
  onUnmounted:
    vditor.destroy()      // 必调，避免内存泄漏
watch(value):
  仅当 value !== 当前实例值时调用 setValue
  用 isInternalUpdate 标志位防止回环
```

### 3.3 `useFileSystem` 接口

```ts
{
  openFile(): Promise<{ handle, content, name } | null>,
    // showOpenFilePicker({ types: [{ accept: { 'text/markdown': ['.md','.markdown'] } }] })
    // 用户取消 → 返回 null
    // 权限拒绝 → toast + null

  saveFile(handle, content): Promise<boolean>,
    // handle.createWritable() → write(content) → close()
    // 成功 → true；失败 → toast + false

  saveAsFile(content, suggestedName): Promise<{ handle, name } | null>,
    // showSaveFilePicker({ suggestedName, types: [...] })
    // 用户取消 → null
    // 成功后返回新句柄与文件名

  getMetadata(handle): Promise<{ lastModified, size }>,
    // handle.getFile() → 返回的 File 对象读取 lastModified / size
}
```

错误分类（影响后续 M7-M8）：
- `AbortError` → 视为取消，静默
- `NotFoundError` → 文件被外部删除（M8 处理）
- `NotAllowedError` / `SecurityError` → 权限撤销（M8 处理）
- 其他 → toast + throw

### 3.4 `EditorView` 行为

```
挂载时：
  根据 route.query.mode:
    'new' → useEditorStore 直接初始化（空内容、dirty=true、fileHandle=null）
    'open' → 假设进入前已完成 loadFromFile（M2 由 EntryView「打开」流程保证）

渲染：
  <TitleBar />
  <VditorEditor value={content} theme={...} onUpdate:value={setContent} />
  （自动保存、轮询、拦截等在 M3+ 接入）
```

### 3.5 修改文件

| 路径 | 变更 |
| --- | --- |
| `src/router/routes.js` | `/` → 懒加载 `EntryView`；`/editor` → 懒加载 `EditorView` |
| `src/styles/index.css` | `@import 'vditor/dist/index.css';`（如未引入） |
| `package.json` | 增加 `vditor` 依赖 |
| `src/stores/useEditorStore.js` | 可能微调：`loadFromFile` 同时清 `lastExternalModified = null`（保持与 M1 一致即可） |

---

## 4. 验收标准

### 4.1 功能验收

#### 入口页（EntryView）

- [ ] `/` 渲染两个按钮：「新建」「打开」
- [ ] 「新建」点击 → `router.push('/editor?mode=new')`
- [ ] 「打开」点击 → 触发 `useFileSystem.openFile()`
- [ ] 「打开」成功 → `useEditorStore.loadFromFile({...})` + `router.push('/editor?mode=open')`
- [ ] 「打开」用户取消 → 无路由跳转、无错误提示
- [ ] 「打开」非 Chromium 浏览器 → `openFile` 抛错 → toast「当前浏览器不支持文件选择」
- [ ] 「打开」文件选择器仅显示 `.md` / `.markdown`（实测或看 picker types）

#### 编辑器页（EditorView）

- [ ] `/editor?mode=new` → 进入空编辑器，标题栏显示 `untitled.md`
- [ ] `/editor?mode=open` → 进入已加载内容的编辑器，标题栏显示实际文件名
- [ ] 编辑区为 vditor WYSIWYG 实例（带工具栏）
- [ ] 切换路由离开 `/editor` → vditor 实例被 `destroy()`（无 console warning / 内存泄漏）

#### vditor 集成

- [ ] vditor 模式为 WYSIWYG
- [ ] 工具栏显示默认全量按钮
- [ ] 中文 UI（Phase 2 §4.2 #8 决议）
- [ ] 用户输入文字 → `update:value` 事件触发 → `useEditorStore.setContent` → `content` 与 `dirty` 更新
- [ ] `value` prop 外部变化（如 `loadFromFile`）→ vditor 内容更新；不触发回环
- [ ] 切换 theme prop → vditor 实例重建（或调用 setTheme，依赖 vditor 版本支持情况）

#### File System Access

- [ ] `openFile` 接受 `.md` + `.markdown`
- [ ] `saveFile` 写入已有句柄成功 → 返回 `true`
- [ ] `saveAsFile` 弹保存对话框，默认文件名 = 当前 `fileName`
- [ ] `saveAsFile` 取消 → 返回 `null`，状态不变
- [ ] 写入失败 → toast「保存失败：<原因>」

#### 手动保存路径（M2 不含自动保存）

- [ ] 用户编辑 → 内容变更
- [ ] 用户通过 vditor 工具栏的「保存」按钮（或编程触发 `saveFile`）→ 内容写入磁盘
- [ ] 写入成功后 `dirty=false`
- [ ] 写入失败后 `dirty` 保持，`lastSavedContent` 不变

### 4.2 持久化状态

- [ ] `useEditorStore.fileHandle` 在路由切换 / 刷新后丢失（这是预期的，本里程碑不持久化 handle）
- [ ] `useSettingsStore` 配置跨路由切换持久（M1 已验证）

### 4.3 错误处理

- [ ] `useFileSystem.saveFile(null, content)` → 抛 TypeError 或自动改走 `saveAsFile`（明确策略）
- [ ] vditor 初始化抛错 → EditorView 显示错误占位「编辑器加载失败」
- [ ] 文件权限撤销（M8 之前不主动处理，但保存会抛错）→ toast 提示

### 4.4 质量验收

- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过（vditor CSS 应被构建产物包含）
- [ ] `npm run format` 通过

---

## 5. 参考

- 设计文档：[04-design.md §4](../04-design.md#4-路由设计) §5.1 §5.2 §6.1
- 需求文档：[02-editor-and-experience.md §4.2](../02-editor-and-experience.md) / [03-file-capabilities.md §4.1](../03-file-capabilities.md#41-另存为-save-as)
- vditor 官方：[github.com/Vanessa219/vditor](https://github.com/Vanessa219/vditor)