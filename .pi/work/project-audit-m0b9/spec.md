# 项目全面审计与成熟度提升 — 规格(Spec)

## 问题与目标

OpenRedius M0–M7 已全部完成,但项目存在三类成熟度问题:
1. **代码与文档漂移**:三路 scout 审计发现 48 条漂移(后端 19、前端 29),含文档承诺但前端未接线的功能(用户抽屉详情、AD 同步记录、NAS CRUD、告警规则)、文档没有但代码已实现的端点、测试数量错报等。
2. **仓库卫生**:12 个本地/远程陈旧分支、游离产物(UI-效果报告.html、audit-screenshots/、dist、tsbuildinfo、dev.db)、死代码(Launcher.tsx、src/api/mock 6 文件、types.ts 残链)、e2e-http 脚本未被收编。
3. **结构与文档体系**:ansible/ 子系统在 docs 中完全隐形;docs/12、13 状态"待评审";`.pi/work/` 两个未收尾目录(e2e-full-audit 26 项未勾、post-mvp 1 项未勾);AGENTS.md 分支描述与现状不符。

用户目标:
- **已实现功能代码与设计文档 1:1**(双向:文档承诺的代码都有,代码有的文档都写了)。
- 清理无用文件与分支。
- 优化项目结构、打磨细节。
- 提高产品整体成熟度。

## 范围

### 在范围内
- docs/ 00–13 + decisions/ 与代码(backend/、src/、tests/、scripts/、deploy/、ansible/)的一致性修复。
- Git 卫生:分支清理(经用户确认)、游离文件清理、.gitignore 完备性。
- 死代码删除与类型来源收敛(src/data 为 mock 单一来源)。
- 测试锚点修复:e2e-http 收编进 package.json + docs/09、菜单数断言、/audit 路由覆盖。
- 文档承诺但未接线的前端功能(按用户决策:实现或降级文档)。
- 后端 P1 行为修复(设置开关、策略预览、last_auth 等)。
- 根 README、docs/README、roadmap 状态表、AGENTS.md 项目段的现状对齐。
- `.pi/work/` 遗留目录收尾。

### 不在范围内
- M8+ 新功能实施(SLO 指标体系、变更审批、OIDC 等;评审见 Q5)。
- 真实 NAS 的 FreeRADIUS UDP 交互验证(已多次声明非目标)。
- UI 重设计、依赖大版本升级。
- 挂起缺陷(style={{ 219 处、硬编码统计数字等,P3 挂起项,单独排期)。

## 验收标准(Definition of Done)

- **AC-1 漂移闭环**:findings.md 全部漂移项逐一标注处置结果(代码修复/文档修复/按决策挂起),零未决项。
- **AC-2 基线全绿**:`bun run verify`、`cd backend && uv run ruff check . && uv run ruff format --check .`、`uv run pytest -q`、`uv run pytest -m integration -q`、`bun run e2e`、`bun run e2e:http` 全部通过。
- **AC-3 仓库卫生**:陈旧本地/远程分支按用户决策清理;工作区无未跟踪/游离产物;.gitignore 完备且无密钥入库(git ls-files 验证)。
- **AC-4 死代码清零**:删除的文件无任何引用残留(verify 全绿为证);类型单一来源( src/data/)。
- **AC-5 文档事实一致**:测试数、页面数、CI 描述、目录树、状态表与代码事实一致,无数字错报。
- **AC-6 代码修复带测试**:每个行为变更(P1/P2 改代码项)有对应回归测试或既有测试更新。
- **AC-7 工作目录收尾**:e2e-full-audit 勾选完成或归档说明;post-mvp-operating-model 按 Q5 处置;本项目目录 tasks.md 全勾。
- **AC-8 独立复核**:reviewer 派发漂移复核(spec/plan/tasks vs 实际改动),通过后才算完成。

## 假设与开放问题

- 假设:dev 是当前主线(origin/dev 同步);main 落后 45 提交,处置方式见 Q2。
- 假设:删除已合并分支可恢复(GitHub PR refs / reflog),风险低,但远程删除需用户确认。
- 开放决策 Q1–Q5 见 clarifications.md,确认后填 resolutions。
