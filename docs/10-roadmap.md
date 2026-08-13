# 10 · 里程碑路线图(/goal 工作包)

每个里程碑自包含:目标、必读文档、任务、验收标准、验证命令。
执行顺序 M0 → M7;除标注外不可并行(前端联调依赖后端契约)。

## 状态总览

| 里程碑 | 名称 | 状态 | 完成日期 |
|---|---|---|---|
| M0 | 仓库基线与工程脚手架 | ✅ | 2026-08-06 |
| M1 | 后端骨架与基础设施 | ✅ | 2026-08-12 |
| M2 | 领域模型与 CRUD API | ✅ | 2026-08-12 |
| M3 | FreeRADIUS 集成 | ✅ | 2026-08-12 |
| M4 | 会话/日志/报表/仪表盘数据面 | ✅ | 2026-08-12 |
| M5 | 前端接入真实 API | ✅ | 2026-08-12 |
| M6 | 运维能力(AD 同步/告警/任务) | ✅ | 2026-08-12 |
| M7 | 生产部署与安全加固 | ✅ | 2026-08-12 |
| M8 | 运行基线与可观测性 | ⏳ 待立项 | — |
| M9 | 策略与配置变更治理 | ⏳ 待立项 | — |
| M10 | 身份、终端与运营生态集成 | ⏳ 待立项 | — |
| M11 | 多站点与高可用 | ⏳ 按规模触发 | — |

---

## 后续规划(M8–M11)

M0–M7 的完成范围维持不变。M8 起不是既定实施承诺；每个里程碑在启动前须将目标、
SLO、责任人、依赖系统和验收命令细化为本文件同等粒度的工作包。

| 里程碑 | 优先级 | 目标 | 前置条件 |
|---|---|---|---|
| M8 | P0 | 指标/SLO、告警响应、恢复验证;HTTP E2E 基线已由 v0.1.0 收尾(见 09),M8 负责纳入发布门禁 | 确认服务负责人和值班方式 |
| M9 | P0 | 策略/NAS/核心设置的预演、审批、灰度和回退 | M8 的观测与证据闭环 |
| M10 | P1 | OIDC/SAML、终端生命周期、SIEM/工单 webhook | 已确定 IdP 与外部系统边界 |
| M11 | P2 | 多站点、RADIUS 池、调度高可用与灾备 | 有明确容量或单点风险触发条件 |

完整的取舍、角色模型和完成信号见 [12-post-mvp-operating-model.md](./12-post-mvp-operating-model.md)，
日常操作见 [13-operational-sop.md](./13-operational-sop.md)。

---

## M0 · 仓库基线与工程脚手架

**目标**:修复构建、确立仓库布局与 CI,为自动化开发铺路。

**必读文档**:README.md(本目录)、05、09、ADR-0003。

**任务**:

- [x] 修复 `tsconfig.app.json` TS7 `baseUrl` 报错(2026-08-06 已完成)
- [x] 提交当前工作区改动(2026-08-06 完成:refactor / fix / docs 三笔提交)
- [x] 建立目录骨架:`backend/`(占位 README)、`deploy/`(占位 README)、`.github/workflows/ci.yml`(2026-08-06 完成)
- [x] `.gitignore` 增补:`.env`、`backend/.venv`、`backend/.pytest_cache`、`deploy/backups`、`*.pyc`(2026-08-06 完成)
- [x] 根目录 `.env.example`(键见 04/07,值全为 dev 默认)(2026-08-06 完成)
- [x] CI:frontend job(`bun run verify`);backend job 占位(M1 起生效)(2026-08-06 完成)
- [x] ~~`.devcontainer/`:GitHub Codespaces 开发环境~~(2026-08-12 引入后当天回退,
      实测影响 `gh`/SSH 直连 Codespace 的日常使用方式;核心决定不变,见
      ADR-0007「更新」;重新设计后再引入)
- [x] 保真审计脚本可移植性修复:原型 HTML 路径硬编码在设计机 macOS 目录,导致
      CI/Codespace 上 `bun run verify` 恒失败;2026-08-12 改为缺失时告警跳过,
      支持 `OPENRADIUS_PROTO_DIR` 指向原型副本(见 09)

**验收**:

```bash
bun run verify      # 全绿
git status          # 干净
```

---

## M1 · 后端骨架与基础设施

**目标**:uv 项目可运行,JWT 登录可用,compose 起 postgres,迁移框架就位。

**必读文档**:03、04、07、08(认证节)、ADR-0001/0004。

**任务**:

- [x] `backend/` uv 项目(pyproject,依赖见 04 基线),src 布局 `openredius` 包(2026-08-12 完成)
- [x] FastAPI app 工厂、`/api/health`、JSON 日志、request_id、异常处理(03 错误体)(2026-08-12 完成)
- [x] pydantic-settings 配置(04 表);prod 模式强校验(2026-08-12 完成)
- [x] SQLAlchemy async engine + Alembic(仅 public schema)(2026-08-12 完成)
- [x] `admin_user` 模型 + 迁移;argon2 哈希;JWT login/refresh/logout/me(03)(2026-08-12 完成)
- [x] `require_role` 守卫;审计日志模型与中间件钩子(M2 全面启用)(2026-08-12 完成)
- [x] `deploy/docker-compose.dev.yml` + `deploy/postgres/init/`(radius schema + 官方
      schema.sql + 双角色,见 06)——**Codespaces 栈集成用**(docker-in-docker,
      ADR-0007),本地纯 SQLite 开发不依赖(2026-08-12 完成)
- [x] `scripts/create_admin.py`、bootstrap 管理员逻辑(2026-08-12 完成)
- [x] pytest 骨架:health/login/refresh/角色守卫用例(2026-08-12 完成,31 用例)
- [x] CI backend job 生效(uv sync + ruff + pytest)(2026-08-12 完成)
- [x] 迁移 2668af2e944a 枚举值清单修正:M2 引入 enum_column(持久化 value)后同步改为
      小写枚举值;native_enum=False 不产生 DB 层 CHECK,该修正为 DDL 无操作,
      不影响任何现有库(2026-08-12,M2 期间)

**验收**:

```bash
cd backend && uv sync && uv run alembic upgrade head && uv run pytest -q   # 本地 SQLite
uv run uvicorn openredius.main:app --port 8000 &  # curl /api/health 与 login 冒烟
bun run verify   # 前端不回归
# compose 产物供 Codespaces 栈集成使用,Postgres 验证并入 M3(见 07「栈集成环境」)
```

---

## M2 · 领域模型与 CRUD API

**目标**:02 的应用实体全部落地,API 按 03 提供,seed 复刻原型数据集。

**必读文档**:02、03、04、08(RBAC)。

**任务**:

- [x] 模型+迁移:access_user、policy_group、vlan、acl_profile、nas_device、endpoint、
      ad_sync_job、alert_rule、alert_event、audit_log、system_setting(迁移 cf9a9b67326d;
      枚举列统一持久化 value 而非 SQLAlchemy 默认的 name,与 02/06 的字面值一致——
      models/base.enum_column;M1 迁移的枚举值清单同步对齐——native_enum=False
      不产生 DB 层 CHECK,属 DDL 无操作,不影响现有库)
- [x] 视图 `v_user_policy_flags` + 函数 `norm_mac`(06;仅 postgresql 方言创建,04 明示)
- [x] 各资源 CRUD/批量 API(03):users/policies/devices(nas+endpoints)/settings/audit
      + 管理员账户 CRUD(admins);延后项:users/sync-ad、sync-records(M6)、
      nas/{id}/ports|ssids(M6 会话域)、用户详情“最近认证/下发规则预览”
      (需 radpostauth/编译产物,M3/M4)、nas status 筛选(M6 派生,M2 参数保留但不生效)
- [x] 策略保存即触发“编译占位”(policy.compile 审计行,detail.status=placeholder;真编译 M3)
- [x] `scripts/seed_demo.py`:原型数据集(10 用户/5 策略/8 NAS/8 终端/字典+告警规则+设置)
- [x] 服务端筛选/分页/排序(03 约定;core/listing 通用层)
- [x] RBAC 全覆盖;写操作审计全覆盖(08 必记事件均落库,secret 明文不入审计)
- [x] pytest:每资源 CRUD + 边界(重名、删除约束、MAC 规范化);共 89 用例

**验收**:

```bash
cd backend && uv run alembic upgrade head && uv run python scripts/seed_demo.py
uv run pytest -q   # 新增用例全绿
# OpenAPI 校验:curl -s localhost:8000/api/openapi.json | python3 -m json.tool > /dev/null
```

---

## M3 · FreeRADIUS 集成

**目标**:真实认证闭环——radtest 通过,策略编译下发生效,NAS 表驱动客户端。

**必读文档**:06(全部)、04(编译器)、02(映射)、07(dev compose)。

**任务**:

- [x] `deploy/freeradius/`:Dockerfile、entrypoint(envsubst)、raddb(sql/eap/sites/policy.d)
      (基线 3.2.10;实测修正全部回写 06「M3 实测修正记录」)
- [x] certs/gen.sh 生成 dev 证书;PEAP 可用(另加 entrypoint 自签兜底)
- [x] dev compose 增加 freeradius 服务(依赖 postgres healthy,healthcheck radiusd -CX)
- [x] 策略编译器(04 表):policy_group/user → radgroupreply/radgroupcheck/radusergroup/radcheck
      (幂等 diff,SQLite 无 radius 表时跳过;单测覆盖 09 场景 1)
- [x] 用户停用/锁定联动 `Auth-Type := Reject` + radreply Class
      (+ OpenRedius-Deny-Reason 镜像属性,radpostauth.class 明文可归类)
- [x] NAS CRUD → radius.nas + reload 接口(OPENRADIUS_RADIUS_RELOAD_COMMAND,manual 兜底)
- [x] unlang `policy-openredius`(mac/edr/time/cert 检查与 Class 约定;语法调整见 06 回写)
- [x] 集成测试(pytest -m integration):09 场景 9–11(7 用例,栈缺失自动 skip)
- [x] radiusd 配置语法校验流程(deploy/scripts/smoke_freeradius.sh)

**验收**(Codespaces 终端执行,docker-in-docker,见 07「栈集成环境」):

```bash
docker compose -f deploy/docker-compose.dev.yml up -d --build
docker compose -f deploy/docker-compose.dev.yml exec freeradius \
  radtest wang.lei '<seed 密码>' localhost 0 testing123-dev   # Access-Accept + VLAN 属性
# 停用 wang.lei(API)后再 radtest → Access-Reject
cd backend && uv run pytest -m integration -q
```

---

## M4 · 会话/日志/报表/仪表盘数据面

**目标**:所有"读真实数据"的接口完成,CoA 强制下线可用(含 sink 测试)。

**必读文档**:02(映射/归类)、03、04(CoA/jobs)、06(CoA/演示数据)。

**任务**:

- [x] 会话服务:active radacct ⋈ 元数据 → SessionRow;筛选;导出 CSV
- [x] CoA 客户端(pyrad,04)+ `POST /api/sessions/disconnect` + 兜底关账
      (ACK/NAK/timeout 三路径实测;NAK 携带 Error-Cause 译名)
- [x] 认证日志服务:radpostauth ⋈ 用户 → LogRow;归类器(02 表);详情;导出
- [x] 报表:summary(period)/endpoint-types/departments(03;export 501 至 M7)
- [x] 仪表盘:kpis/trend/alerts;告警规则表与 alert_event(去重窗口内不重发)
- [x] jobs:nas_watchdog、lockout_sweeper、cert_scan、alert_gc(APScheduler 随
      lifespan 启停;`OPENRADIUS_JOBS_ENABLED` 可关)
- [x] seed_demo 增加 7 天合成历史;demo_traffic.py(另 scripts/generate_history.py
      30 天幂等,SYNTH 标记可重跑)
- [x] coa_sink.py;集成测试:09 场景 12–13
- [x] pytest:归类器/报表聚合/KPI 计算(146 单测/API + 9 集成)

**验收**:

```bash
cd backend && uv run pytest -q && uv run pytest -m integration -q
# curl /api/dashboard/kpis、/api/sessions、/api/auth-logs?reason=账号锁定 形状符合 03
```

---

## M5 · 前端接入真实 API

**目标**:8 页在 http 模式下渲染真实数据;mock 模式回归全绿;登录闭环。

**必读文档**:05(全部)、03、09(前端)。

**任务**:

- [x] `src/api/http.ts` + `src/api/auth.ts` + `src/pages/Login.tsx` + 路由守卫
- [x] resources 全量补齐:devices/policies/reports/dashboard/settings(03 契约)
- [x] 既有 sessions/logs/users 资源切 http(双轨开关,签名不变)
- [x] `bun run api:gen`(openapi-typescript)+ schema 快照入库;契约测试
- [x] vite dev proxy /api → :8000
- [ ] http 模式 8 页走查脚本/清单(含深链 4 例)
- [x] 保真审计、20 交互测试、冒烟在 mock 模式恒绿

**验收**:

```bash
bun run verify                                   # mock 模式全绿
VITE_API_BASE=http://localhost:8000 bun run dev  # 8 页真实数据走查记录
```

---

## M6 · 运维能力(AD 同步 / 告警完善 / 任务)

**目标**:AD 增量同步、同步记录、告警规则开关与文案与原型一致。

**必读文档**:04(ldap_sync/jobs)、03(users/sync)、08。

**任务**:

- [x] ldap3 同步器(fixture 驱动):映射、增量(whenChanged)、三分支结果、异常记录
- [x] `POST /api/users/sync-ad`(异步)+ 同步记录 API + cron 调度
- [x] 告警:规则开关生效、事件文案与深链(原型 ALERTS 形态)、已读
- [x] 锁定引擎:从 radpostauth 计失败 → 锁定/自动解锁(参数见 04)
- [x] 设置页后端:RADIUS 端口/CoA 端口持久化;变更触发 reload 提示
- [x] pytest:同步三分支、锁定/解锁、告警去重

**验收**:

```bash
cd backend && uv run pytest -q
# 手工:设置页开关 → alert_rules 变更;sync-ad → 同步记录出现
```

---

## M7 · 生产部署与安全加固

**目标**:干净环境一条命令起全栈;安全门禁全过;文档收尾;发布 v0.1.0。

**必读文档**:07、08(验收清单)、09。

**任务**:

- [x] prod compose(四服务)+ 三个 Dockerfile 全部可构建
- [x] nginx TLS(自签)+ 安全头;backend CORS prod 配置
- [x] backup.sh/restore.sh + 一次真实演练记录
- [x] 08 验收清单逐项自动化/手工核验
- [x] 依赖审计(pip-audit/bun audit)处置记录
- [x] 运行手册:deploy/README(真实 NAS 接入清单、CoA 配置样例、故障排查)
- [x] 版本号 v0.1.0;根 README 更新为项目级文档(链接 docs/)

**验收**:

```bash
# 干净目录演练
cp deploy/.env.example deploy/.env  # 填密钥
docker compose -f deploy/docker-compose.yml up -d --build
# 浏览器走查 8 页 + 登录 + 强制下线;备份/恢复演练通过
bun run verify && (cd backend && uv run pytest -q)
```

---

## 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| FreeRADIUS unlang 内联 SQL 语法细节 | M3 延期 | 语义已冻结(06),语法允许迭代;`radiusd -XC` 先行验证 |
| 无真实 NAS/AD | 集成验证受限 | coa_sink + demo_traffic + radtest 容器内闭环;真实设备清单入运行手册 |
| TS7/Vite8 新工具链兼容问题 | 前端构建波动 | 依赖锁 bun.lock;CI 恒跑 verify |
| ~~本机无 Docker/PostgreSQL~~(已解决,2026-08-12) | ~~本地跑不了栈集成~~ | 已改用 GitHub Codespaces + docker-in-docker(ADR-0007,07「栈集成环境」);M0–M2 仍可零容器跑 |
| Codespaces 配额/网络(docker-in-docker 拉镜像慢) | 栈集成偶发变慢/失败 | 优先用官方轻量镜像;必要时预热/缓存镜像层;超时重试 |
| 原型保真回归 | 验收失败 | 05 约束清单 + verify 门禁恒绿 |
