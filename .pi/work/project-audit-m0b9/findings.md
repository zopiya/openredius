# 审计证据汇总(findings)

> 来源:三路 scout(后端漂移 / 前端漂移 / 死代码结构)+ 主会话 git 检查。2026-08-13 采集。
> 处置状态在本文件每条的 `[状态]` 标注:待处置 → 已修复(改代码/改文档)→ 按决策挂起。

## A. 后端 vs 文档漂移(19 条,无 P0)

| ID | 级 | 类别 | 差异 | 修复方向 | 状态 |
|---|---|---|---|---|---|
| B1 | P1 | 行为 | 设置页审计开关/告警总开关纯装饰:写入 audit.enabled/alerts.master,但 services/audit.py:16-34 与 alerts.py:104-133 从不读取 | 改代码(接读取路径+测试) | 待处置 |
| B2 | P1 | 字段 | GET /api/policies/{id} 缺文档承诺的下发规则预览(PolicyForm+编译属性清单);等价功能仅在 users.py:147 | 改代码(复用 compiler)+测试 | 待处置 |
| B3 | P2 | 端点 | POST /api/sessions/reauthorize(api/sessions.py:203)不在 03;前端仅文案标签无调用 | 改文档(补进 03) | 待处置 |
| B4 | P2 | 端点 | PUT /api/auth/me/password(api/auth.py:116)不在 03 | 改文档 | 待处置 |
| B5 | P2 | 字段 | 02 admin_user 字段表:last_login_at 无实现;linked_account/token_version/fail_count/first_failed_at/locked_until 未列入 | 改文档补字段表;last_login_at 删或实现 | 待处置 |
| B6 | P2 | 行为 | 02 UserRow.lastAuth=最近 radpostauth,但 UserOut 无 last_auth(前端回落 '') | 改代码(列表补 last_auth) | 待处置 |
| B7 | P2 | 行为 | 04 CoA 兜底 class 标记 backend-closed:代码只写 connectinfo_stop,class 列不动(sessions.py:271-283) | 改代码一行 | 待处置 |
| B8 | P2 | 行为 | 08"应用侧不冗余加密存储"与实现矛盾:nas_device.secret_enc 明文双写;CoA 取 secret_enc 非 radius.nas.secret | 改文档(承认双写+真实密钥来源) | 待处置 |
| B9 | P2 | 行为 | 08"jti 黑名单(内存+DB)":实现是 DB revoked_refresh_token + token_version 全量作废,更强 | 改文档(描述实际机制) | 待处置 |
| B10 | P2 | 字段 | 02 ERD endpoint↔vlan 白名单关系:Endpoint 模型无 vlan_id | 改文档删关系 | 待处置 |
| B11 | P2 | 字段 | 02 ERD policy_group↔acl_profile:模型是 acl_name 字符串,acl_profile 表零读写(死表) | 改文档(ERD 改 acl_name) | 待处置 |
| B12 | P2 | 缺文档 | openpyxl、reportlab 不在 04 依赖基线表 | 改文档 | 待处置 |
| B13 | P2 | 缺文档 | 04 模块布局 vs 实际:core 多 errors/listing/mac/ntlm/ratelimit;radius 多 nas_sync;services 12 模块与文档清单不符;jobs 仅 scheduler | 改文档 | 待处置 |
| B14 | P2 | 行为 | 03 形状:alerts 文档 AlertEvent[] 实为 {items};nas/endpoints 信封 vs policies 裸数组矛盾 | 改文档统一 | 待处置 |
| B15 | P2 | 行为 | 03 health 契约:代码多 version/uptime_s,status 可 degraded(安全超集) | 改文档 | 待处置 |
| B16 | P2 | 行为 | 06 NAS 变更流程"reload-radius 自动执行":代码仅返回 reload_required=True | 改文档(流程修正) | 待处置 |
| B17 | P2 | 行为 | 02"批量操作逐条写 audit_log":endpoints/import 只写一条汇总(devices.py:411-434) | 改代码(逐条)或改文档 | 待处置 |
| B18 | P2 | 行为 | 04 diff 键 (groupname, attribute) 实际为 (groupname, attribute, op, value) | 改文档 | 待处置 |
| B19 | P2 | 细节 | ①锁定 Reply-Message 文案与 06 表不一致;②nas_status 0.9 硬编码(可配仅告警侧);③EndpointOut 不暴露 cert_serial | ①③改代码;②改代码接配置 | 待处置 |

**已核对一致**:RBAC 矩阵 14 处调用点、审计必记事件清单、03 端点主体、06 unlang/CoA、04 编译器产物表、配置默认值。

## B. 前端 vs 文档漂移(29 条,无 P0)

| ID | 级 | 类别 | 差异 | 修复方向 | 状态 |
|---|---|---|---|---|---|
| D01 | P1 | 缺文档 | 审计日志页(/audit)整页无文档:00/05/11/README 均无 | 改文档(8→9 页) | 待处置 |
| D02 | P1 | 缺文档 | PUT /api/auth/me/password 不在 03 | 改文档 | 待处置 |
| D03 | P1 | 缺文档 | GET /api/audit/export.csv 不在 03 | 改文档 | 待处置 |
| D04 | P1 | 缺实现 | 用户抽屉未接 GET /api/users/{account}(recent_auth/终端/规则硬编码) | 改代码 | 待处置 |
| D05 | P1 | 缺实现 | AD 同步记录未接 API(Users.tsx:447 硬编码"168 次同步") | 改代码 | 待处置 |
| D06 | P1 | 缺实现 | NAS 端口/SSID 抽屉用 src/data/devices.ts 静态数据,未接 /nas/{id}/ports|ssids | 改代码 | 待处置 |
| D07 | P1 | 缺实现 | NAS CRUD 未实现(Devices.tsx:193"添加 NAS"仅 toast;POST/PATCH/DELETE 端点后端已有) | 改代码(最大项) | 待处置 |
| D08 | P1 | 缺实现 | 告警规则未接 GET/PUT /api/settings/alert-rules(Settings.tsx 硬编码 INITIAL_RULES) | 改代码 | 待处置 |
| D09 | P1 | 数字 | 05 称"35 交互测试",实际 20 | 改文档 | 待处置 |
| D10 | P1 | 交互 | 列表筛选未服务端执行:4 页全量拉取后内存筛选,resources filters 参数从未使用 | 改代码 | 待处置 |
| D11 | P2 | 数字 | "21 交互测试"实际 20(09/README/10-roadmap) | 改文档 | 待处置 |
| D12 | P2 | 数字 | 11 称"14 路由冒烟",实际 13(09 正确) | 改文档 | 待处置 |
| D13 | P2 | 测试 | /audit 无 smoke/fidelity/e2e 覆盖 | 改代码 | 待处置 |
| D14 | P2 | 测试 | e2e.mjs:85 menuCount===8 vs 实际 9,断言已破 | 改代码 | 待处置 |
| D15 | P2 | 缺实现 | POST /api/dashboard/alerts/{id}/read 资源层已有,页面未调用 | 改代码或文档 | 待处置 |
| D16 | P2 | 交互 | 自动刷新文案(30s/15s)无实现 | 改代码或改文案 | 待处置 |
| D17 | P2 | 字段 | kpis.locked_users 未渲染(4 卡 vs 6 字段) | 改代码或文档 | 待处置 |
| D18 | P2 | 缺实现 | 设置页无告警总开关/审计开关渲染(且测试用例名义不符) | 改代码或文档 | 待处置 |
| D19 | P2 | 交互 | 导出不带筛选参数(03 要求同筛选) | 改代码 | 待处置 |
| D20 | P2 | 缺实现 | sessions/{id}、auth-logs/{id} 详情端点未接入(行内数据已够用) | 改文档(声明可选/废弃) | 待处置 |
| D21 | P2 | 测试 | api-contract.test.ts 只是字符串数组断言,字段名与 types.ts 不符,无真实形状断言 | 改代码 | 待处置 |
| D22 | P2 | 结构 | schema.d.ts 未被资源层使用;types.ts 与 data/ 类型双份定义 | 改代码(统一到 data/) | 待处置 |
| D23 | P2 | 死文件 | src/pages/Launcher.tsx 仍在,11 明文说已删 | 删文件 | 待处置 |
| D24 | P2 | 数字 | 05 称 radius-admin.css 29 行/两类,实际 ~40 行/三类 | 改文档 | 待处置 |
| D25 | P2 | 缺文档 | 设置页证书/AD-LDAP 两节硬编码表单,00/03 无对应能力 | 改文档(声明原型占位) | 待处置 |
| D26 | P2 | 缺实现 | Users/Devices"导出清单"仅 toast | 改代码(接端点或移除) | 待处置 |
| D27 | P2 | 形状 | 03 alerts 形状 AlertEvent[] vs {items} | 改文档(同 B14) | 待处置 |
| D28 | P2 | 注释 | types.ts 头部注释过时("当前由 mock 提供") | 改代码注释(随删除) | 待处置 |
| D29 | P2 | 死代码 | src/hooks/useApi.ts、src/lib/utils.ts(cn) 零引用 | 删或接入 | 待处置 |

**未接入端点清单(前端)**:users/{account}、sync-records×2、nas/{id}/ports|ssids、nas CRUD×3、alert-rules×2、sessions/{id}、auth-logs/{id}、alerts/{id}/read。

## C. 死代码 / 结构 / 文件

| ID | 项 | 证据 | 建议 | 状态 |
|---|---|---|---|---|
| S1 | src/pages/Launcher.tsx | 无路由、零引用、docs/11 称已删 | 删除 | 待处置 |
| S2 | src/api/mock/{devices,logs,policies,reports,sessions,users}.ts | 运行时零引用;类型与 src/data/ 完全重复;仅 types.ts type re-export 残链 | 删除;resources/sessions.ts:9、reports.ts:17 改从 data/ 导;types.ts 删除;latency.ts 保留 | 待处置 |
| S3 | scripts/e2e-http.mjs | 41 项断言全绿但无 package.json 入口、docs 零引用(仅 .pi/work 提及);tasks.md 0.4 合并计划未执行 | 收编:package.json 加 e2e:http + docs/09 登记 | 待处置 |
| S4 | scripts/visual-audit*.mjs + audit-screenshots/ | 一次性审计产物;硬编码绝对路径;audit-screenshots/ 未入库未 gitignore | 按 Q4 处置 | 待处置 |
| S5 | UI-效果报告.html(2.4MB) | 已 gitignore,工作区游离 | 本地删除 | 待处置 |
| S6 | dist/、tsconfig.*.tsbuildinfo、backend/openredius-dev.db | 均已 gitignore,正常构建产物 | 本地清理(可选) | 待处置 |
| S7 | deploy/freeradius/certs/*.key | git ls-files 确认仅 gen.sh 入库,无密钥泄露 | 无需处置 | ✅ 已确认 |
| S8 | ansible/ 文档隐身 | docs/ 全目录 grep ansible 零命中;根 README 目录树无;backup.sh.j2/restore.sh.j2 与 deploy/scripts 双实现(违反自家 DESIGN.md 原则) | docs/07 + README 登记;双实现改引用或文档明示 | 待处置 |
| S9 | docs/09 CI 描述过时 | backend job 已启用(非占位);audit job(pip-audit+bun audit)未落地 | 改文档(按事实描述)或补 audit job | 待处置 |
| S10 | backend portal.py | 501 占位,有测试、docs/01+12 明文描述 | 保留 | ✅ 已确认 |
| S11 | 类型三副本 | SessionRow/PeriodData/DonutRow 在 data/、api/mock/、components/charts/Donut.tsx 各一份 | 随 S2 收敛到 data/ | 待处置 |
| S12 | alembic | 5 revisions 线性无缺口,alembic heads 单 head 确认 | 无需处置 | ✅ 已确认 |

## D. Git 卫生

| ID | 项 | 事实 | 处置 |
|---|---|---|---|
| G1 | 本地分支 | dev(当前)、main(落后 45)、docs/v0.1.0-changelog、feat/ansible-deploy、feat/backend-audit、feat/ui-migration、feat/ui-v6 —— 除 dev 外全部已合并进 dev | 删除除 dev 外全部(按 Q1/Q2) |
| G2 | 远程分支 | origin/fix/auth-session-audit、fix/http-401-refresh-retry、feat/ui-v6、feat/ui-migration、feat/ansible-deploy、feat/post-mvp-operating-model 全部 0-1 提交未合入 dev 且内容已在 dev | 删除(按 Q1) |
| G3 | main | origin/main 落后 dev 45 提交;无 tag | 按 Q2 处置 |
| G4 | AGENTS.md 项目段 | "Only branch is main today"与现状(dev 为主线)不符 | 改 AGENTS.md |
| G5 | 无 tag | v0.1.0 无 tag | 可选:打 v0.1.0 tag(按 Q2 一并) |

## E. .pi/work 遗留

- **e2e-full-audit/**:26 项未勾,但 findings.md 显示 R1/R2 已完成、e2e-http 41/41 全绿;实际剩余 R3(全量回归+验收报告)。→ 本审计 Phase 8 勾完并归档。
- **post-mvp-operating-model-p3a7/**:1 项未勾("评审并确认 M8 范围/SLO/责任人")→ 按 Q5 处置;docs/12、13 状态"待评审"随 Q5 更新。

## F. 处置汇总(2026-08-13,全部闭环)

- **B1** ✅ 改代码:audit.enabled/alerts.master 接入 record_audit 与 DbAlertSink.emit;开/关两态测试。
- **B2** ✅ 改代码:GET /api/policies/{id} 返回 PolicyDetail.compiled_rules(复用 _desired_group_rows)+ 测试。
- **B3/B4/D02/D03** ✅ 改文档:03 补 reauthorize、me/password、audit/export.csv。
- **B5** ✅ 改文档:02 admin_user 字段表补 token_version/fail_count/first_failed_at/locked_until/linked_account;删 last_login_at。
- **B6** ✅ 改代码:GET /api/users 列表带 last_auth(subquery 批量)+ 测试。
- **B7** ✅ 改文档:04 CoA 兜底标记为 connectinfo_stop(class 不动,保 reason 标记)。
- **B8/B9** ✅ 改文档:08 secret_enc 双写如实说明;refresh 作废机制改为 token_version + revoked_refresh_token 描述。
- **B10/B11** ✅ 改文档:02 ERD 删 endpoint↔vlan、policy_group↔acl_profile 关系;acl_name 直引。
- **B12/B13/B18** ✅ 改文档:04 依赖表补 openpyxl/reportlab;模块布局对齐实际;diff 键四元组。
- **B14/B15/D27** ✅ 改文档:03 列表形状统一信封;alerts {items};health 契约扩展。
- **B16** ✅ 改文档:06 NAS 变更流程改为"后端不自动重启,操作方调用 reload-radius"。
- **B17** ✅ 改代码:endpoints/import 逐条 audit_log + 测试。
- **B19** ✅ ①改代码(锁定文案 Account locked);②改代码(NAS_HIGH_LOAD_RATIO 配置)+ 测试;③改代码(EndpointOut.cert_serial)+ 测试。
- **D01** ✅ 改文档:00/11/README 功能地图 8→9 页(审计日志页)。
- **D04/D05/D06/D07/D08** ✅ 改代码:用户抽屉/同步记录/端口抽屉/NAS CRUD/告警规则全部接线(Q3 决策)。
- **D09/D11/D12/D24** ✅ 改文档:20 交互/14 冒烟/css 描述。
- **D10** ✅ 改代码:四页列表服务端筛选(含标签→枚举映射)。
- **D13/D14** ✅ 改代码:smoke/e2e/e2e-http 补 /audit;menuCount 8→9。
- **D15/D17** ✅ 改代码:Dashboard 告警点击标已读;locked_users 并入告警卡 footer。
- **D16** ✅ 改代码:Dashboard 30s / Sessions 15s 轮询(http 模式);mock 文案改"演示数据"。
- **D18** ✅ 改代码:设置页渲染告警/审计总开关(与后端开关联动)。
- **D19** ✅ 改代码:两导出带当前筛选参数。
- **D20** ✅ 改文档:03 详情端点标注"列表行内数据已够用,保留给深度排查"。
- **D21/D22** ✅ 改代码:api-contract.test.ts 真实形状断言;类型收敛 src/data;schema.d.ts 重新生成。
- **D23/D28/D29/S1/S2** ✅ 删文件:Launcher、api/mock 六文件、types.ts、useApi、utils。
- **D25** ✅ 改文档:00 注明设置页证书/AD-LDAP 为原型占位,后续立项。
- **D26** ✅ 改代码:移除 Users/Devices『导出清单』按钮(03 无端点,不新增未契约功能)。
- **S3** ✅ e2e:http 收编进 package.json + docs/09 登记。
- **S4/S5/S6** ✅ 删除:visual-audit 脚本、audit-screenshots/、UI-效果报告.html、dist、tsbuildinfo。
- **S7/S10/S12** ✅ 确认无需处置(certs 未入库/portal 有意占位/alembic 单 head)。
- **S8** ✅ docs/07 + README 登记 ansible/;backup/restore j2 改薄封装调用 deploy/scripts 正典。
- **S9** ✅ docs/09 CI 段按事实(backend job 已启用;audit job 标注后续项);ci.yml push 监听补 dev。
- **G1/G2/G3/G5** ✅ 本地 5 分支 + 远程 6 分支删除;main 快进 dev;v0.1.0 tag(用户确认)。
- **G4** ✅ AGENTS.md 项目段:dev 主线 / main 发布线 / 验证命令现状。
- **E** ✅ e2e-full-audit 勾完归档(见其 report.md);post-mvp 定稿(Q5)。
