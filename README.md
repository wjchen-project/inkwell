# inkwell

> 简洁的 Web 端 Markdown 编辑器，本地优先，所见即所得。

![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite)
![Naive UI](https://img.shields.io/badge/Naive_UI-2.44-2080f0)
![vditor](https://img.shields.io/badge/vditor-3.11-1e88e5)
![Node](https://img.shields.io/badge/Node-%5E22.18%20%7C%7C%20%3E%3D24.12-339933?logo=node.js)
![Private](https://img.shields.io/badge/status-private-lightgrey)

`inkwell`（墨水瓶）是一个面向个人写作场景的 Web 端 Markdown 编辑器：界面克制、功能聚焦、文件留在本地。所有数据走浏览器原生的 File System Access API，授权后可像原生应用一样直接覆盖保存 `.md` 文件，无需上传到任何后端。

## ✨ 特性

- **📝 Markdown 编辑** — 基于 [vditor](https://github.com/Vanessa219/vditor) 内核，支持所见即所得（WYSIWYG）、即时渲染（IR）、分屏预览（SV）三种模式，行内格式 / 代码块 / 表格 / 任务列表 / 数学公式 / 流程图开箱即用
- **📂 本地文件读写** — 走 File System Access API，首次保存会弹出系统保存对话框；授权后再次保存直接覆盖原文件，零拷贝
- **💾 自动保存** — 防抖写入 + 1s/2s/4s 退避重试，失败有 toast 提示；首次自动保存会引导用户先「另存为」
- **🌗 暗色模式** — 浅色 / 深色 / 跟随系统三档，Naive UI + vditor 主题层全栈联动
- **⚙️ 设置抽屉** — 主题、自动保存间隔、外部修改检测间隔、大纲、关于
- **💿 另存为** — 一键创建副本（`Ctrl/Cmd + Shift + S`）
- **🔔 外部修改检测** — 后台轮询 `lastModified`，文件被外部改动时弹窗三选项：保留本地 / 重新加载 / 稍后
- **🛡️ 未保存拦截** — 关闭标签页、刷新、路由切换时都会被拦截确认
- **🎨 工具栏精简** — 移除上传 / 录音 / 导出 / DevTools / 关于 / 帮助等冗余按钮，保留高频编辑动作

## 🧱 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | Vue 3.5（Composition API + **JSX**，无 `<template>` / `<script setup>`） |
| 构建 | Vite 8 |
| 路由 | Vue Router 5 |
| 状态 | Pinia 4（Composition Store） |
| UI 库 | Naive UI 2（按需全局注册） |
| 编辑器内核 | vditor 3.11 |
| 工程化 | ESLint 10（flat config）+ Oxlint + Oxfmt |
| 文件能力 | 浏览器原生 File System Access API |

## 🚀 快速开始

### 环境要求

- **Node.js** `^22.18.0 || >=24.12.0`
- **包管理器** npm
- **浏览器** Chromium 内核（Chrome / Edge / Brave 等 ≥86）—— 本地文件读写依赖 File System Access API

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 3. 生产构建
npm run build

# 4. 本地预览生产产物
npm run preview
```

### 提交流程

```bash
npm run format   # Oxfmt 格式化 src/
npm run lint     # Oxlint + ESLint（均带 --fix）
```

## 📖 使用指南

### 入口页

打开应用后会看到一张极简卡片，提供两个动作：

- **新建** — 进入空白文档，编辑后首次保存会弹出系统保存对话框
- **打开…** — 选择本地 `.md` 文件加载，授权后可直接覆盖保存

> ⚠️ 编辑中再点「新建 / 打开」会触发未保存拦截确认（来自 M4 的 `useUnsavedGuard`）。

### 编辑器

| 区域 | 作用 |
| --- | --- |
| 标题栏 | 显示文档名 / 状态徽标（外部已修改 / 新建 / 文件名）+ 保存 / 另存为 / 设置 / 返回按钮；未保存时显示橙色圆点 |
| 工具栏 | vditor 精简后的常用编辑按钮 + 三种模式切换（WYSIWYG / IR / SV） |
| 编辑区 | Markdown 实时编辑；WYSIWYG 模式下排版与最终渲染一致 |
| 大纲（可选） | 设置中开启后显示在编辑区左侧，实时跟随光标位置 |

### 键盘快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl / Cmd + S` | 保存（手动） |
| `Ctrl / Cmd + Shift + S` | 另存为 |

### 设置

点击标题栏的 ⚙️ 打开设置抽屉：

- **主题** — 浅色 / 深色 / 跟随系统
- **大纲** — 开启后在编辑区左侧显示文档大纲
- **自动保存** — 开关 + 间隔滑块（1–30 秒）
- **外部修改检测** — 开关 + 轮询间隔滑块（5–60 秒）
- **关于** — 版本号 + 仓库链接

所有设置自动持久化到 `localStorage`。

## 🗂️ 项目结构

```
inkwell/
├── src/
│   ├── views/         # 页面级组件（EntryView / EditorView）
│   ├── components/    # 通用组件（含 editor/ 编辑器专属）
│   ├── composables/   # 组合式函数（useFileSystem / useAutoSave / useTheme / ...）
│   ├── stores/        # Pinia stores（useEditorStore / useSettingsStore）
│   ├── plugins/       # 第三方组件注册（Naive UI）
│   ├── router/        # 路由
│   ├── utils/         # 工具函数
│   └── styles/        # 全局样式
├── public/            # 静态资源（favicon）
├── docs/              # 设计文档（按阶段组织）
├── AGENTS.md          # AI 协作者 / 维护者指南
├── eslint.config.js   # ESLint flat config
├── vite.config.js     # Vite 配置
└── package.json
```

完整目录与约定见 [AGENTS.md](./AGENTS.md)；设计背景与里程碑见 [docs/](./docs/README.md)。

## 🌐 浏览器兼容性

| 浏览器 | 编辑器 | 本地文件读写 |
| --- | --- | --- |
| Chrome / Edge / Brave（≥86） | ✅ | ✅ |
| Firefox | ✅ | ⚠️ 编辑器可用，但 File System Access API 暂未启用，文件读写受限 |
| Safari | ✅ | ⚠️ 同上 |

## 📌 路线图

详见 [AGENTS.md §6](./AGENTS.md#6-待补齐--路线图持续更新)。已完成 M1–M9 里程碑（基础脚手架 / 编辑器接入 / 自动保存 / 关闭拦截 / 主题 / 另存为 / 外部修改检测 / 异常处理 / 体验打磨），后续待补：Markdown 解析库、IndexedDB、测试框架、国际化等。

## 📄 许可

本项目为私有工程（`private: true`），不对外发布。
