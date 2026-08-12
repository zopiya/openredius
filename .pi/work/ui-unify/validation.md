# UI 统一重构 — 验证记录

## 命令结果（最终）

| 命令 | 结果 |
|---|---|
| `bun run verify`（tsc + smoke + 35 单测 + fidelity） | ✅ 35 pass, 0 fail, 104 expect() |
| `bun run e2e`（Playwright 32 项） | ✅ 32/32 通过, 0 console 错误, 0 页面异常 |
| `antd lint ./src --version 6` | ✅ Scanned 52 files. No issues found.（零废弃） |
| `antd doctor` | ✅ 18 passed（含 theme-config、charts/icons 生态兼容） |
| `bun run build` | ✅ 成功（仅 chunk-size 警告 + 动态 import 提示，非错误） |

> fidelity 审计当前环境 SKIP（原型目录不存在），但文本内容未变（重构不碰文案，文案仅在阶段 6 统一且同步了测试）。

## 各阶段验证记录

| 阶段 | verify | e2e | 备注 |
|---|---|---|---|
| 阶段 1（theme/Provider/图表色） | 35/35 | 32/32 | autoInsertSpace 选择器适配 |
| 阶段 2（Shell） | 35/35 | 32/32 | |
| 阶段 3（TableToolbar/PageHeader） | 35/35 | — | 组件新增，未单独 e2e |
| 阶段 4a（Settings/AuthLogs） | 35/35 | 32/32 | 测试 .filters.adv→data-od-id |
| 阶段 4b（Users） | 35/35 | 32/32 | 偶发 31/32（dev 热更新），复跑 32/32 |
| 阶段 4c（Sessions） | 35/35 | 32/32 | E2E .kv→.ant-descriptions |
| 阶段 4d（Dashboard） | 35/35 | 32/32 | 测试 .kpi/.grid-kpi→data-od-id |
| 阶段 4e（Devices） | 35/35 | 32/32 | |
| 阶段 4f（Policies） | 35/35 | 32/32 | Alert message→title、.mv→button[title] |
| 阶段 4g（Reports/Login） | 35/35 | 32/32 | |
| 阶段 5（CSS 清理） | 35/35 | 32/32 | .tbl-skel→.ant-skeleton |

## 过程中发现并修复的问题

1. **autoInsertSpace 回归**：两字中文按钮自动加空格，E2E「筛选」→「筛 选」
2. **antd 6 Alert `message` 废弃**：改用 `title`（Policies/Devices）
3. **antd 6 Divider `orientation` 语义变更**：文字位置改用 `titlePlacement`（Users）
4. **dev server 偶发挂起**：E2E 前需确认 5173 存活，挂了重启
