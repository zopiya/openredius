# 项目全面审计 — 实施计划(Plan)

## 技术上下文(实际仓库,非想象)

- 主线 `dev`(与 origin/dev 同步);`main` 落后 45 提交。无 tag。分支策略见 AGENTS.md/`.pi/skills/git`(不直接提交主线,走 feat/* 分支)。
- 前端 bun(`bun run verify` = tsc + smoke + bun test + http.test + fidelity);后端 uv(pytest 173 用例 + ruff)。e2e-http 41 项全绿但未收编。
- docs/ 是唯一设计事实来源;冲突时先修文档(ADR 流程),再改代码 —— 但本次审计按漂移方向逐个定:文档错→修文档,代码缺→修代码。
- 关键约束:`docs/decisions/` 只增不改;`docs/12`、`13` 状态"待评审"与 Q5 联动;`.pi/work/` 文件随分支合并入库。

## 方法

1. **证据先行**(已完成):三路 scout 产出 48 条漂移 + 结构/文件清单 + git 检查,全部落 findings.md。
2. **决策门**:5 个决策点(Q1–Q5)先由用户确认,记录在 clarifications.md,再动手。远程分支删除、main 处置、NAS CRUD 实现方向属于不可自行决定的项。
3. **分批落地**:git 卫生 → 死代码 → 文档批次 → 代码批次 → 前端接线 → 结构收尾 → 全量验证,每批独立提交(Conventional Commits),批次间跑对应验证。
4. **验证兜底**:每个改代码项带回归测试;最终全量基线重跑 + reviewer 漂移复核(AC-8,Guard-worthy:公共 API/文档变更 + 分支删除)。

## 执行分支策略

- 从 `dev` 切 `feat/project-audit-m0b9`,所有批次提交在该分支;完成后合并回 `dev`(参考 e2e-full-audit 先例的 merge 提交惯例)。
- 远程分支删除单独执行,与代码提交无关。

## 批次设计(依赖顺序)

```
Phase 2 git 卫生 ─┐
Phase 3 死代码 ────┼─ 独立,可并行推进
                  │
Phase 4 文档批次 ──┼─ 依赖 Phase 1 决策(Q3/Q5 影响文档口径)
Phase 5 后端代码 ──┤
Phase 6 前端接线 ──┴─ 依赖 Phase 3(S2 类型收敛在前)
Phase 7 结构收尾 ─── 依赖 Phase 4/6
Phase 8 验证收尾 ─── 依赖全部
```

## 关键风险与缓解

| 风险 | 缓解 |
|---|---|
| 远程分支误删 | 仅删 0 提交未合入(内容已在 dev)的分支;先列清单给用户确认;GitHub PR refs 可恢复 |
| 前端接线(6.x 批)引入回归 | 每项接真实端点后跑对应测试;http.test.ts + e2e:http 兜底;接线前基线全绿作为对照 |
| NAS CRUD(最大项)超时 | 后端端点已存在,只做前端表单+接线;若超出会话则按 .pi/work 恢复 |
| 文档批次改 03 契约引发测试失效 | 03 改动均为"记录现状"型(补端点/修形状),不改代码行为;api-contract.test 在 6.11 一并修正 |
| mock 层删除破坏类型 | 删除后立即跑 `bun run verify`;类型全部收敛到 src/data/ |
| 设置开关接线改变生产行为 | 默认值保持"开"(与现状一致),仅新增读取路径;测试覆盖开/关两态 |

## 验证策略

- 每批次:`bun run verify`(前端批次)/ `uv run pytest -q` + `ruff`(后端批次)。
- 最终:`bun run verify` + ruff + pytest + integration + `bun run e2e` + `bun run e2e:http` 全绿(AC-2)。
- 独立复核:派发 `.pi/agents/reviewer.md`,对照 spec.md AC 逐条 + git diff 复核漂移闭环与文档数字(AC-8)。

## 交付物

- findings.md 全条目状态闭环;clarifications.md 决策记录;build-log.md 批次记录;validation.md 命令结果。
- docs/ 体系刷新(状态表、数字、登记 ansible/);README 数字与目录树准确;AGENTS.md 分支描述修正。
- `.pi/work/e2e-full-audit` 与 `post-mvp-operating-model` 收尾。
