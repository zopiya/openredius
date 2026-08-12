# 07 · 部署设计(Docker)

## 前置条件与环境策略

- **开发环境:GitHub Codespaces**,日常经 `gh`/SSH 直连使用(ADR-0007)。声明式
  `.devcontainer/` 配置实测有问题、已回退(ADR-0007「更新」)——当前手工在
  Codespace 内装 Python 3.13 + uv、bun、docker 依赖;不再需要连接一台额外的
  远程服务器这个核心判断不变。
- **M0–M2(后端默认 SQLite,见 04;前端 mock/http 代理)不依赖任何容器**,Codespace
  内或本机(无 Docker 也可)均可直接跑通。
- **栈集成(Postgres + FreeRADIUS + radtest/CoA,M3 起)在 Codespace 终端内直接执行**
  `docker compose -f deploy/docker-compose.dev.yml up -d`(手工装好 docker 依赖后),
  无需 SSH、无需额外服务器(见下「栈集成环境」)。
- 生产部署(M7)仍面向独立的生产 Linux 服务器,流程见下「生产运行」,不受本节影响。

## 目录布局

```
deploy/
├── docker-compose.yml          # 生产形态(全栈)
├── docker-compose.dev.yml      # 开发依赖(postgres + freeradius)
├── .env.example                # 部署变量模板
├── postgres/
│   └── init/                   # 01-schema.sql(radius schema + 官方表)02-roles.sql
├── freeradius/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── raddb/                  # mods-available/sql、sites-enabled/default、policy.d/
│   └── certs/gen.sh
├── nginx/
│   ├── nginx.conf              # /api → backend;静态前端;安全头
│   └── Dockerfile              # 多阶段:bun build → nginx:alpine
├── backend.Dockerfile          # 多阶段:uv → python:3.13-slim
└── scripts/
    ├── backup.sh               # pg_dump → backups/(保留 14 份)
    ├── restore.sh
    └── coa_sink.py / demo_traffic.py(见 06)
```

## 服务清单(prod compose)

| 服务 | 镜像 | 端口 | 依赖 | 健康检查 |
|---|---|---|---|---|
| postgres | postgres:17-alpine | 5432(内部) | — | pg_isready |
| freeradius | openredius/freeradius(本地构建) | 1812/1813 udp → NAS 网段 | postgres | 启动日志含 `Ready to process requests` |
| backend | openredius/backend(本地构建) | 8000(内部) | postgres | GET /api/health |
| frontend | openredius/frontend(本地构建) | 80/443 | backend | wget / |

dev compose 只含 postgres + freeradius(+ 可选 adminer:8081),
后端与前端在本机跑(`uv run uvicorn`、`bun run dev`,vite 代理 /api)。

## 镜像构建要点

### backend.Dockerfile

```dockerfile
FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --frozen --no-dev

FROM python:3.13-slim
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH
EXPOSE 8000
CMD ["uvicorn", "openredius.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### frontend(nginx)

- 阶段 1:`oven/bun:1` → `bun install --frozen-lockfile && bun run build`。
- 阶段 2:`nginx:alpine`,COPY dist/ + nginx.conf。
- 构建时注入 `VITE_API_BASE`(prod 留空走同源 /api)。

## 环境变量(deploy/.env)

| 变量 | 用途 |
|---|---|
| `POSTGRES_PASSWORD` / `OPENRADIUS_DB_PASSWORD` / `RADIUS_SQL_PASSWORD` | 三个角色口令 |
| `OPENRADIUS_JWT_SECRET` | 必填(prod 校验长度 ≥32) |
| `OPENRADIUS_BOOTSTRAP_ADMIN_USER/_PASSWORD` | 首次启动创建初始管理员 |
| `OPENRADIUS_ENV=prod` | 后端运行模式 |
| `OPENRADIUS_AD_*` | 可选 AD |
| `NAS_UDP_EXPOSE=1812-1813` | radius 端口映射 |

`.env` 永不入库;`.env.example` 提供全部键与注释。

## 开发流(M0–M2,零 Docker;Codespace 内或本机均可)

```bash
# 前端(mock 模式)
bun install && bun run dev
# 后端(本地 SQLite,无需容器)
cd backend && uv sync && uv run alembic upgrade head && uv run python scripts/seed_demo.py
uv run uvicorn openredius.main:app --reload --port 8000
# 前端(http 模式)
VITE_API_BASE=http://localhost:8000 bun run dev
```

## 栈集成环境(Codespaces,ADR-0007)

栈集成测试(M3 起)直接在 Codespace 终端执行,docker-in-docker 提供运行时,
不再需要额外服务器或 SSH:

```bash
docker compose -f deploy/docker-compose.dev.yml up -d --build   # postgres + freeradius
cd backend && OPENRADIUS_DATABASE_URL='postgresql+asyncpg://…' \
  uv run pytest -m integration -q
```

- Codespaces 默认对已监听端口自动转发,手工确认 5173(前端)/8000(后端)/
  5432(postgres)转发状态即可,浏览器直接打开转发地址,无需手工端口转发命令。
- 若发布前需要在真实生产型服务器上复现,仍可 `ssh <server>` 后执行同样的 compose
  命令;此路径为可选的最后验证,不再是 M3 起步的必经步骤。

## 生产运行

```bash
cp deploy/.env.example deploy/.env && $EDITOR deploy/.env
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml logs -f backend
```

- TLS:nginx 挂载证书(自签或 CA);MVP 允许 HTTP 仅内网使用,文档需警示。
- 资源基线:postgres 1C/1G、backend 1C/512M、freeradius 1C/512M(万级日认证足够)。

## 备份与恢复

- `deploy/scripts/backup.sh`:`pg_dump -Fc`(含 radius+public 两 schema),gzip,
  按日期命名,保留 14 份;建议 crontab 每日。
- `restore.sh`:先停 backend/freeradius → `pg_restore --clean --if-exists` → 重启。
- M7 验收包含一次完整备份/恢复演练记录。

## 日志与监控

- 全部容器 stdout/stderr,docker json-file(单节点);backend JSON 日志含 request_id。
- freeradius `-X` 日志量大,prod 建议降为 `-f`(entrypoint 按 OPENRADIUS_ENV 切换)。
- 指标(M7 之后可选):/api/health 扩展 + Prometheus exporter;MVP 不引入。

## 升级与回滚

- 镜像打 tag(语义化版本 + git short sha);compose 引用 tag 而非 latest(prod)。
- 回滚 = 切回旧 tag + `up -d`;数据库迁移要求向后兼容一个版本(Alembic 迁移需可回退)。
