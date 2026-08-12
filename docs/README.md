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

## 项目当前状态(2026-08-12)

- 前端原型:8 页高保真移植完成,21 个交互测试 + 冒烟 + 保真度审计全部通过(见根目录 README)。
- 后端 / 部署 / 集成:未开始,按 roadmap M1 起步。
- 开发环境:GitHub Codespaces(`.devcontainer/`,ADR-0007)——容器内含 Python 3.13 +
  uv、docker-in-docker,bun/uv 由 `post-create.sh` 安装。M0–M2(SQLite + mock)零容器
  即可跑;M3 起的栈集成(Postgres + FreeRADIUS)直接在 Codespace 终端起
  `deploy/docker-compose.dev.yml`,不再需要远程服务器 + SSH(见 07)。
