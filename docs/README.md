# 业务文档

`docs/` 按阶段组织 `inkwell` 的业务流程说明。
新阶段开工前先在这里立文档；流程变更时同步更新对应文件。

| 阶段 | 文档 | 状态 |
| --- | --- | --- |
| 第一阶段 · 核心编辑流程（入口 → 编辑 → 保存） | [01-core-editor-flow.md](./01-core-editor-flow.md) | 已定稿 |
| 第二阶段 · Markdown 编辑器 + 体验增强（需求调研） | [02-editor-and-experience.md](./02-editor-and-experience.md) | 已定稿 |
| 第三阶段 · 文件能力扩展（需求文档） | [03-file-capabilities.md](./03-file-capabilities.md) | 已修订（移除多文档 Tab） |
| 第四阶段 · 系统实现设计（设计文档） | [04-design.md](./04-design.md) | 已定稿 |
| 第五阶段 · 实施里程碑（9 份交付清单） | 见下表 | 已全部完成并验收通过 |

### 第五阶段里程碑拆分

| 里程碑 | 文档 | 前置 | 估时 | 状态 |
| --- | --- | --- | --- | --- |
| M1 · 基础设施 | [05-m1-infrastructure.md](./05-m1-infrastructure.md) | — | ~1 天 | ✅ 已完成 |
| M2 · 入口与编辑器骨架 | [05-m2-entry-and-editor.md](./05-m2-entry-and-editor.md) | M1 | ~2 天 | ✅ 已完成 |
| M3 · 自动保存 + 未保存指示 | [05-m3-autosave-and-indicator.md](./05-m3-autosave-and-indicator.md) | M2 | ~1 天 | ✅ 已完成 |
| M4 · 关闭拦截 | [05-m4-close-guard.md](./05-m4-close-guard.md) | M3 | ~0.5 天 | ✅ 已完成 |
| M5 · 主题 + 设置 | [05-m5-theme-and-settings.md](./05-m5-theme-and-settings.md) | M1, M2 | ~1.5 天 | ✅ 已完成 |
| M6 · 另存为 | [05-m6-save-as.md](./05-m6-save-as.md) | M2, M3, M5 | ~0.5 天 | ✅ 已完成 |
| M7 · 外部修改检测 | [05-m7-external-watch.md](./05-m7-external-watch.md) | M3, M5 | ~2 天 | ✅ 已完成 |
| M8 · 外部异常处理 | [05-m8-external-anomaly.md](./05-m8-external-anomaly.md) | M7, M6 | ~1 天 | ✅ 已完成 |
| M9 · 体验打磨 | [05-m9-polish.md](./05-m9-polish.md) | M1-M8 全部 | ~1 天 | ✅ 已完成 |

> **最终验收已通过**（截至 v1.1.3）。全部 9 个里程碑交付并验收通过。
> 依赖图：M1 → M2 → {M3, M5} → M4 / M6 → M7 → M8 → M9
> 实际开发中 M3 与 M5 可并行；M4 / M6 顺序可在 M3 / M5 后灵活。

## 文档约定

- 文件命名：`NN-<topic>.md`（`NN` 为两位序号，便于排序）
- 第五阶段使用 `05-m<N>-<topic>.md`，N 为里程碑编号
- 一篇文档聚焦一条主线流程或一个里程碑，不混杂多主题
- 文末设「参考」清单，指向相关阶段文档
- 实施里程碑文档统一结构：目标 / 依赖 / 交付内容 / 验收标准 / 参考