# OpenRedius · 准入认证控制台 v0.3.3

OpenRedius 是一个企业内网 **RADIUS / 802.1X 准入管理后台**,提供用户生命周期管理、
策略编排、NAS 纳管、CoA 强制下线、实时仪表盘与告警等完整运维能力。

后端:Python 3.13 + FastAPI + SQLAlchemy 2(PostgreSQL) \
前端:React 19 + TypeScript + Vite(高保真 HTML 原型移植) \
打包:后端 uv / 前端 bun · 全栈 Docker Compose 一键部署 \
测试:184 后端单测/API + 9 集成 + 20 前端交互 · ruff clean · CI 绿

## 文档

所有文档在 [`docs/`](./docs/):

| 文档 | 内容 |
|---|---|
| [README](./docs/README.md) | 文档索引 |
| [10-roadmap](./docs/10-roadmap.md) | **里程碑(当前:M0–M7✅；M8 起待立项)** |
| [00-overview](./docs/00-overview.md) | 项目介绍与范围 |
| [01-architecture](./docs/01-architecture.md) | 总体架构 |
| [02-domain-model](./docs/02-domain-model.md) | 准入域模型(用户/策略/设备/会话/告警) |
| [03-api-design](./docs/03-api-design.md) | REST API 契约 |
| [04-backend-design](./docs/04-backend-design.md) | 后端架构与设计决策 |
| [05-frontend-design](./docs/05-frontend-design.md) | 前端设计 |
| [06-freeradius-integration](./docs/06-freeradius-integration.md) | FreeRADIUS 集成 |
| [07-deployment](./docs/07-deployment.md) | 部署设计(Docker Compose + Ansible) |
| [08-security](./docs/08-security.md) | 安全设计与验收清单 |
| [09-testing-quality](./docs/09-testing-quality.md) | 测试策略与质量门禁 |
| [12-post-mvp-operating-model](./docs/12-post-mvp-operating-model.md) | 后续能力与运行模型(已评审) |
| [13-operational-sop](./docs/13-operational-sop.md) | 生产运行 SOP(已评审) |
| [decisions/](./docs/decisions/) | 架构决策记录(ADR) |

## 快速开始

### 本地开发(零容器)

```bash
# 后端(SQLite 默认)
cd backend && uv sync && uv run alembic upgrade head
uv run uvicorn openredius.main:app --reload --port 8000

# 前端(Vite 代理 /api → localhost:8000)
bun install && bun run dev

# 验证
bun run verify && (cd backend && uv run pytest -q)
```

### 栈集成(Postgres + FreeRADIUS)

```bash
docker compose -f deploy/docker-compose.dev.yml up -d --build
cd backend
OPENRADIUS_DATABASE_URL='postgresql+asyncpg://openredius:dev-only-openredius-password@localhost:5432/openredius' \
  uv run alembic upgrade head && uv run python scripts/seed_demo.py
uv run pytest -m integration -q
```

### 生产部署

```bash
cp deploy/.env.example deploy/.env && $EDITOR deploy/.env
docker compose -f deploy/docker-compose.yml up -d --build
# 详见 deploy/README.md 生产运维手册
```

## 目录结构

```
openredius/
├── backend/                    # Python 后端
│   ├── src/openredius/         #   应用包(api/core/models/radius/services/jobs/ldap_sync)
│   ├── tests/                  #   158 单测/API + 9 集成
│   ├── alembic/                #   数据库迁移
│   ├── Dockerfile              #   多阶段:uv build → python:3.13-slim
│   └── pyproject.toml
├── deploy/                     # 部署资产
│   ├── docker-compose.yml      #   生产(4 服务:postgres/freeradius/backend/frontend)
│   ├── docker-compose.dev.yml  #   开发(postgres + freeradius)
│   ├── nginx/                  #   TLS 终结 + 安全头 + 静态前端
│   ├── freeradius/             #   FreeRADIUS 镜像 + raddb
│   ├── postgres/init/          #   schema.sql + 角色初始化
│   ├── scripts/                #   backup.sh / restore.sh / coa_sink.py / demo_traffic.py
│   └── README.md               #   生产运维手册
├── ansible/                    # Ansible 零信任部署子系统(8 playbook,受控主机交付)
├── src/                        # 前端(React 19 + TypeScript + Vite)
│   ├── pages/                  #   9 功能页(仪表盘/会话/日志/用户/策略/设备/报表/设置/审计)
│   ├── api/                    #   API 层(config/http/auth/resources,mock↔http 双轨)
│   └── components/             #   Shell/Toast/PageHeader/charts
├── docs/                       # 项目文档
├── .pi/                        # Coding agent 配置(skills/agents/prompts)
└── AGENTS.md                   # Agent 协作规则(自动加载)
```

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | FastAPI(Starlette + Pydantic) |
| ORM | SQLAlchemy 2.0(async) + Alembic |
| 数据库 | PostgreSQL 17(prod)/aiosqlite(dev) |
| 认证 | JWT(HS256,access 15m/refresh 7d)+ argon2id |
| RADIUS | FreeRADIUS 3.2.10(rlm_sql)+ pyrad 2.5.4(CoA) |
| AD 同步 | ldap3(Python,whenChanged 增量) |
| 作业调度 | APScheduler(AsyncIOScheduler) |
| 前端 | React 19 + TypeScript + Vite + bun |
| 反向代理 | nginx(TLS 自签)+ 安全头 |
| 打包 | Docker Compose(4 服务:postgres/freeradius/backend/nginx) |

## 验证与质量

```bash
bun run verify              # tsc + 14 路由冒烟 + 20 交互测试 + 保真度审计
(cd backend && uv run ruff check . && uv run ruff format --check .)
(cd backend && uv run pytest -q)             # 184 单测/API
(cd backend && uv run pytest -m integration -q) # 9 集成
bun run e2e                  # Playwright E2E(mock 模式)
bun run e2e:http             # Playwright E2E(http 模式,需完整栈)
```

## 许可

内部项目,未对外开源。
