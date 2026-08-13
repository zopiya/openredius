# 项目全面审计 — 任务清单(tasks)

> 依赖顺序执行;每项勾选即完成。证据引用见 findings.md 条目 ID。

## Phase 0 · 基线

- [x] 0.1 从 dev 切出 `feat/project-audit-m0b9`,记录基线 commit
- [x] 0.2 跑基线验证并记录:`bun run verify`、`cd backend && uv run ruff check .`、`uv run pytest -q`、`bun run e2e:http`(手动,未收编前)
- [x] 0.3 确认无密钥入库(git ls-files deploy/freeradius/certs → 仅 gen.sh)✅(已完成,记录进 build-log)

## Phase 1 · 决策门

- [x] 1.1 用户确认 Q1–Q5(ask_user),写入 clarifications.md resolutions

## Phase 2 · Git 卫生(G1–G5)

- [x] 2.1 删除本地已合并分支(除 dev;main 按 Q2)
- [x] 2.2 按 Q1 删除远程 stale 分支(逐条 `git push origin --delete`)
- [x] 2.3 按 Q2 处置 main(快进+push 或改 AGENTS.md)
- [x] 2.4 清理工作区游离物:UI-效果报告.html(S5)、audit-screenshots/ 按 Q4(S4)、dist/、*.tsbuildinfo、backend/openredius-dev.db(S6)
- [x] 2.5 .gitignore 按 Q4 补漏
- [x] 2.6 更新 AGENTS.md 项目段分支描述与现状一致(G4)

## Phase 3 · 死代码与测试锚点(S1/S2/S3/D13/D14/D21/D22/D23/D28/D29)

- [x] 3.1 删除 src/pages/Launcher.tsx(D23/S1)
- [x] 3.2 删除 src/api/mock/{devices,logs,policies,reports,sessions,users}.ts;resources/sessions.ts、reports.ts 类型改从 src/data/ 导;删除 src/api/types.ts;保留 latency.ts(S2/D22/D28/S11)
- [x] 3.3 删除 src/hooks/useApi.ts、src/lib/utils.ts(D29)
- [x] 3.4 e2e-http.mjs 收编:package.json 加 `"e2e:http"`;docs/09 登记(S3)
- [x] 3.5 修 scripts/e2e.mjs menuCount 8→9(D14);smoke.tsx、fidelity.tsx 补 /audit 路由(D13)
- [x] 3.6 按 Q4 处置 visual-audit 脚本(S4)
- [x] 3.7 跑 `bun run verify` 确认清理后全绿(AC-4 证据)

## Phase 4 · 文档批次(改文档;B3/B4/B5/B8–B16/B18、D01/D02/D03/D09/D11/D12/D20/D24/D25/D27/S8/S9)

- [x] 4.1 docs/00-overview:功能地图 8→9 页(补审计日志页)+ 设置页证书/AD 占位声明(D01/D25)
- [x] 4.2 docs/03:补 PUT /api/auth/me/password、GET /api/audit/export.csv、POST /api/sessions/reauthorize(B3/B4/D02/D03);修 alerts 形状、nas/endpoints 信封统一、health 契约(B14/B15/D27);sessions/{id}、auth-logs/{id} 标注可选(D20)
- [x] 4.3 docs/02:admin_user 字段表补 linked_account/token_version/锁定字段、last_login_at 处置(B5);删 endpoint↔vlan 关系(B10);policy_group acl_profile→acl_name(B11)
- [x] 4.4 docs/04:模块布局对齐实际(B13)、依赖表补 openpyxl/reportlab(B12)、diff 键修正(B18)
- [x] 4.5 docs/06:NAS 变更流程 reload 行为修正(B16)
- [x] 4.6 docs/08:secret_enc 双写说明(B8)、token_version 作废机制(B9)
- [x] 4.7 docs/09:测试数字修正(20 交互/13 冒烟)(D11/D12)、CI 描述按事实(S9)、e2e:http 登记(S3)
- [x] 4.8 docs/05:35→20(D09)、radius-admin.css 描述(D24)、mock 收敛说明(随 3.2)
- [x] 4.9 docs/11:审计页登记(D01)、Launcher 删除对齐(D23)
- [x] 4.10 docs/07 + 根 README:登记 ansible/ 子系统(S8);backup 双实现处置记录
- [x] 4.11 docs/12、13 状态按 Q5 处置;docs/README 状态表、README.md 数字/目录树刷新

## Phase 5 · 后端代码批次(改代码;B1/B2/B6/B7/B17/B19)

- [x] 5.1 设置开关接入读取路径:services/audit.py 读 audit.enabled、services/alerts.py 读 alerts.master + 开/关两态测试(B1)
- [x] 5.2 GET /api/policies/{id} 补下发规则预览(复用 radius/compiler)+ 测试(B2)
- [x] 5.3 GET /api/users 列表补 last_auth(radpostauth 最近记录)+ 测试(B6)
- [x] 5.4 CoA 兜底补 class 标记 backend-closed + 测试(B7)
- [x] 5.5 nas_status 0.9 阈值接配置 + 测试(B19②)
- [x] 5.6 EndpointOut 补 cert_serial(B19③)
- [x] 5.7 endpoints/import 逐条审计(B17)+ 测试
- [x] 5.8 锁定 Reply-Message 文案对齐 06 表(B19①)
- [x] 5.9 跑 `uv run ruff check .` + `uv run pytest -q` 确认

## Phase 6 · 前端接线批次(按 Q3;D04/D05/D06/D07/D08/D10/D15/D16/D17/D18/D19/D21/D26)

- [x] 6.1 用户抽屉接 GET /api/users/{account}(recent_auth/终端列表/下发规则)(D04)
- [x] 6.2 AD 同步记录接 GET /api/users/sync-records(D05)
- [x] 6.3 NAS 端口/SSID 抽屉接 /api/devices/nas/{id}/ports|ssids(D06)
- [x] 6.4 告警规则接 GET/PUT /api/settings/alert-rules(D08)
- [x] 6.5 列表筛选服务端执行:users/sessions/auth-logs/devices 传 filters(D10)
- [x] 6.6 导出带筛选参数:sessions/auth-logs(D19)
- [x] 6.7 设置页渲染审计/告警总开关(D18,与 5.1 联动)
- [x] 6.8 Dashboard 接 alerts/{id}/read + locked_users 展示(D15/D17)
- [x] 6.9 自动刷新:实现 setInterval 或改文案(D16)
- [x] 6.10 NAS CRUD:新增/编辑/删除表单 + POST/PATCH/DELETE 接线(D07,最大项)
- [x] 6.11 api-contract.test.ts 真实形状断言 + 类型统一到 src/data(D21/D22)
- [x] 6.12 Users/Devices 导出清单按钮:接端点或移除(D26)
- [x] 6.13 跑 `bun run verify` + `bun run e2e` + `bun run e2e:http` 确认

## Phase 7 · 结构收尾

- [x] 7.1 ansible backup/restore j2 模板改为调用 deploy/scripts 原版(消除双实现)+ 验证模板渲染
- [x] 7.2 scripts/ 用途注释或 README(各脚本一句话说明)
- [x] 7.3 findings.md 全条目状态回填;build-log.md 补批次记录

## Phase 8 · 验证与收尾

- [x] 8.1 全量基线重跑:`bun run verify`、ruff、`uv run pytest -q`、`uv run pytest -m integration -q`、`bun run e2e`、`bun run e2e:http`(AC-2)
- [x] 8.2 e2e-full-audit 收尾:勾完 26 项 + R3 验收报告(AC-7)
- [x] 8.3 post-mvp-operating-model 收尾(按 Q5)(AC-7)
- [x] 8.4 docs/README 状态表、10-roadmap 状态行更新
- [x] 8.5 分批次提交(Conventional Commits),合并回 dev(参考 git skill 分支表)
- [x] 8.6 派发 reviewer 漂移复核(对照 spec AC 逐条 + git diff)(AC-8)
- [x] 8.7 validation.md 落档;本项目 tasks.md 全勾
