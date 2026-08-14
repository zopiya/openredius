# OpenRedius 文档中心

本目录是 OpenRedius 项目的**唯一规划与设计事实来源**。后续开发(含 `/goal` 全自动开发)
必须以本目录文档为准;代码与文档冲突时,先修文档(Architecture Decision Record 流程),再改代码。

**"要做什么"看这里;"agent 怎么干活"看根目录 [`AGENTS.md`](../AGENTS.md) 与 [`.pi/`](../.pi/)**
(pi coding agent 配置,ADR-0007)—— 两者分工不重叠,`AGENTS.md` 不覆盖本目录的规划权威性。

## 文档索引

| 文档 | 内容 | 状态 |
|---|---|---|
| [00-overview.md](./00-overview.md) | 愿景、范围、用户、功能地图、术语表 | 定稿 |
| [01-architecture.md](./01-architecture.md) | 总体架构、组件、数据流、端口、技术选型 | 定稿 |
| [02-domain-model.md](./02-domain-model.md) | 领域模型、ERD、状态机、与 FreeRADIUS 表的映射 | 定稿 |
| [03-api-design.md](./03-api-design.md) | REST API 契约(与前端 `src/api/resources` 对齐) | 定稿 |
| [04-backend-design.md](./04-backend-design.md) | 后端设计(uv + FastAPI 模块划分、服务、任务) | 定稿 |
| [05-frontend-design.md](./05-frontend-design.md) | 前端设计(现状→目标、数据层切换策略) | 定稿 |
| [06-freeradius-integration.md](./06-freeradius-integration.md) | FreeRADIUS 集成(schema/配置/CoA/EAP/镜像) | 定稿 |
| [07-deployment.md](./07-deployment.md) | Docker 部署(dev/prod compose、镜像、备份) | 定稿 |
| [08-security.md](./08-security.md) | 安全设计(RBAC、密钥、审计、暴露面) | 定稿 |
| [09-testing-quality.md](./09-testing-quality.md) | 测试策略、验证命令、CI、验收流程 | 定稿 |
| [10-roadmap.md](./10-roadmap.md) | **里程碑 M0–M7 任务分解( `/goal` 的输入)** | 定稿 |
| [11-ui-migration.md](./11-ui-migration.md) | Ant Design 迁移计划(阶段 0–4,已升级至 v6) | 已完成 |
| [12-post-mvp-operating-model.md](./12-post-mvp-operating-model.md) | 后 MVP 能力排序、运行模型、角色演进 | 已评审(2026-08-13) |
| [13-operational-sop.md](./13-operational-sop.md) | 生产运行 SOP、变更与事件处置 | 已评审(2026-08-13) |
| [14-ci-cd.md](./14-ci-cd.md) | CI/CD workflow 全景、版本/发布策略、离线部署包 | 已评审(2026-08-13) |
| [15-ad-ldap-auth-integration.md](./15-ad-ldap-auth-integration.md) | AD 直通认证(免密码同步)+ 属性同步扩展设计 | 已实现(v0.3.0),待真实 AD 生产验收 |
| [16-nas-ap-onboarding.md](./16-nas-ap-onboarding.md) | NAS/AP 接入与热更新机制改进设计 | 已实现(v0.3.0) |
| [decisions/](./decisions/) | ADR 架构决策记录(只增不改) | 持续 |

## 如何配合 `/goal` 使用

1. `docs/10-roadmap.md` 中每个里程碑(M0–M7)都是一个自包含的工作包:目标、前置条件、
   任务清单、验收标准、验证命令俱全。
2. 发起一个 goal 时,把对应里程碑小节原文作为目标描述,并附上:"先完整阅读 docs/ 中该里程碑
   『必读文档』列表,再开始实现"。
3. 每个 goal 完成的定义 = 该里程碑**验收标准全部满足** + **验证命令全部通过** + 更新
   `docs/10-roadmap.md` 状态表 + 一次符合 Conventional Commits 的提交。
4. 若实现中发现文档错误:先提 ADR 或修订对应文档(同一提交内),再改代码。

## 文档维护规则

- 设计变更必须更新对应文档;API 契约变更必须更新 `03-api-design.md` 并重新生成前端类型。
- 重大取舍(技术栈、数据归属、协议选择)必须写 ADR(`decisions/ADR-NNNN-*.md`),格式见
  [decisions/README.md](./decisions/README.md)。
- 文档语言:中文;代码标识符、命令、配置键:英文。
- 引用版本号以 2026-08 调研为准(见各文档"版本基线"小节);升级需在 roadmap 中立项。

## 项目当前状态(2026-08-14)

- M0–M7 全部完成:前端 9 页(原型 8 页 + 审计日志)antd 6 高保真实现(20 交互测试 + 14 路由
  冒烟 + 保真审计 + 两套 Playwright E2E);后端 FastAPI 全栈(JWT/RBAC/策略编译/CoA/会话/
  日志/报表/仪表盘/告警/AD 同步);FreeRADIUS 集成(radtest 闭环);生产部署(3 Dockerfile +
  4 服务 compose + Ansible 零信任子系统 + TLS 安全头 + backup/restore);184 后端单测/API +
  9 集成全绿;CI green(frontend + backend job)。
- 版本:v0.2.2(root README 和 pyproject.toml/package.json;main 分支 tag `v0.2.2`)——
  CI/CD 全面重构 + 离线部署包(见 14)。10.36.8.10 首次真实部署这一轮连续暴露了
  4 处此前从未被端到端验证过的部署阻断缺陷,按发现顺序:
  1. backend healthcheck 因缺 curl 恒失败(v0.2.0 发版前修复,改用 python3 urllib);
  2. FreeRADIUS base image 未锁版本(v0.2.0 发版前修复,`:latest` → `:3.2.10`);
  3. backend 镜像里 `openredius` 包实际没装上——`uv sync` 默认 editable install,
     最终阶段不拷贝 `src/`,容器一直 `ModuleNotFoundError` 崩溃重启,顺带发现
     `backend/scripts/` 也没进最终镜像(v0.2.1 修复:`--no-editable` + 补拷贝);
  4. FreeRADIUS/nginx 的 certs 卷在三份 prod compose 里都挂载成 `:ro`,但
     entrypoint 的自签证书兜底逻辑需要写文件,必然 Permission denied 崩溃重启
     (v0.2.2 修复:改成和 dev compose 一致的可写挂载)。
  另外还发现文档一直没写清楚"迁移必须先于 backend 完整启动"这个顺序(backend
  的 lifespan 会查 admin_user 表,库没迁移就查表直接崩),`docs/07-deployment.md`
  「生产运行」「离线部署」两节已补上 `docker compose run --rm --no-deps backend
  alembic upgrade head` 的正确步骤。
- 生产试点接入(2026-08-14,`10.36.8.10`):v0.2.2 部署验证通过后,复核 AD 同步
  (10.36.5.245)与 NAS/AP 接入这两条链路时,又发现两处未产品化的真实缺口——
  AD 同步不提供 802.1X 登录密码、NAS 变更后的"重载"机制大概率执行不了——均已
  写成设计文档(见 15/16),交由 pi 实现。同时把"首次部署必须无测试数据、已有
  数据环境禁止清空"这条红线正式写入
  [07-deployment.md](./07-deployment.md#数据安全红线首次部署-vs-已有数据环境)
  与 [13-operational-sop.md](./13-operational-sop.md) SOP-07。
- 版本:v0.3.0——pi 在 `dev` 分支实现了 15/16 两份设计文档:AD 直通认证
  (winbind + `ntlm_auth` 校验真实域控 MS-CHAPv2,不落库密码;PR #13)+
  `access_user` 新增 `email`/`mobile`/`description` 三列并纳入 AD 同步
  (Alembic `d4b050406f7c`)+ NAS/AP 接入热更新改用共享卷哨兵文件 + 容器内
  watcher 重启 `radiusd`(不再是 backend 容器内执行不了的 `docker kill`,
  `OPENRADIUS_RADIUS_RELOAD_COMMAND` 废弃为 `OPENRADIUS_RADIUS_RELOAD_DIR`)。
  部署前复核(Claude Code)在 `deploy/freeradius/raddb/mods-available/mschap`
  发现启用的 `ntlm_auth` 行多打了一个右花括号——展开后 `--nt-response=`
  参数被追加一个字面 `}` 字符,对接真实 Samba `ntlm_auth` 时会导致所有
  MS-CHAPv2 认证失败;pi 本地冒烟测试因为用固定输出的假 `ntlm_auth` wrapper
  没暴露这个问题。已修复(PR #14)、CI 全绿后合并。
- 版本:v0.3.1——v0.3.0 部署到 `10.36.8.10` 真机验证 NAS reload 新机制时,
  `POST /api/ops/reload-radius` 一律 500 `reload_unavailable: Permission
  denied`。根因:共享卷 `radius-reload` 由 Docker 创建为 root:root/0755,
  freeradius 容器 root 运行、backend 容器非 root(uid 999)运行,后者写不进去;
  pi 本地验证时 backend 是直接跑在 host 上(不会撞上容器间 UID 不匹配),没
  暴露这个问题。修复:freeradius 容器(root)在 entrypoint 里对共享目录
  `chmod 777`(PR #16)。这是本轮(v0.3.0→v0.3.1)第二处"设计和本地验证都对,
  只有在真实容器化生产环境里才会暴露"的缺陷,提醒以后 pi 的容器功能验证尽量
  在容器内(而不是 host 直跑)完成,才能覆盖到运行身份/权限这类差异。
- 分支:主线 `dev`(集成日常开发);`main` 发布线;无其他活跃分支(2026-08-13 项目审计清理)。
- 开发环境:GitHub Codespaces,经 `gh`/SSH 直连(ADR-0007)。
