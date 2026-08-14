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
└── scripts/
    ├── backup.sh               # pg_dump → backups/(保留 14 份)
    ├── restore.sh
    └── coa_sink.py / demo_traffic.py(见 06)
```

### Ansible 运维子系统(零信任部署,ansible/)

`ansible/` 是部署到受控主机的完整运维入口(8 playbook:preflight/site/deploy/verify/
upgrade/backup/restore/teardown,详见 `ansible/README.md` 与 `ansible/DESIGN.md`):

- 与 `deploy/` 的关系:Ansible 只读引用 deploy/ 现有文件(env.j2/compose.j2 渲染),
  **不另维护一份部署逻辑**;backup/restore playbook 调用 `deploy/scripts/` 原版脚本。
- 适用场景:有 SSH 权限的受控主机;无 SSH 时仍可用本节 Docker 流程手工部署。

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

### backend/Dockerfile

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
| `OPENRADIUS_AD_*` | 可选 AD 目录同步(账号/姓名/部门等只读信息)。**不提供 802.1X 登录密码**——AD 直通认证是独立能力,设计见 [15-ad-ldap-auth-integration.md](./15-ad-ldap-auth-integration.md) |
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
docker compose -f deploy/docker-compose.yml up -d postgres     # 先起数据库

# 迁移必须在 backend 正常起来之前跑完——backend 的 FastAPI lifespan 启动时会
# 查 admin_user 表(bootstrap 首个管理员),库还没迁移直接 UndefinedTableError
# 崩溃;而 frontend 又 depends_on backend: condition: service_healthy,顺序反了
# 会卡住(2026-08-14 首次真实部署踩过,详见 v0.2.1/v0.2.2 发布记录)。
# `run --rm --no-deps` 绕开 depends_on 的健康检查门槛,起一个一次性容器专门跑迁移。
docker compose -f deploy/docker-compose.yml run --rm --no-deps backend alembic upgrade head

docker compose -f deploy/docker-compose.yml up -d              # 迁移完再起整套栈
docker compose -f deploy/docker-compose.yml logs -f backend
```

- 初始管理员:`.env` 里的 `OPENRADIUS_BOOTSTRAP_ADMIN_USER`/`_PASSWORD` 只要都
  非空,backend 首次启动(迁移完成后)会自动建号,无需额外操作;
  `scripts/create_admin.py` 只是备用/重置口令的手工工具,不是必需步骤。
- TLS:nginx 挂载证书(自签或 CA);MVP 允许 HTTP 仅内网使用,文档需警示。
- 资源基线:postgres 1C/1G、backend 1C/512M、freeradius 1C/512M(万级日认证足够)。

## 数据安全红线:首次部署 vs. 已有数据环境

**这是强制流程,不是建议。** 任何一次 `up -d`/升级操作之前,先判断这个环境是
"首次部署(全新、无数据)"还是"已有真实数据(哪怕只是升级一个次版本)",两种
情况走完全不同的路径,判断方法是跑一次业务表 count 检查:

```bash
docker compose -f deploy/docker-compose.yml exec postgres \
  psql -U postgres -d openredius -c "
SELECT 'access_user' t, count(*) FROM access_user
UNION ALL SELECT 'endpoint', count(*) FROM endpoint
UNION ALL SELECT 'nas_device', count(*) FROM nas_device
UNION ALL SELECT 'policy_group', count(*) FROM policy_group
UNION ALL SELECT 'radius.nas', count(*) FROM radius.nas
UNION ALL SELECT 'radius.radcheck', count(*) FROM radius.radcheck
UNION ALL SELECT 'radius.radacct', count(*) FROM radius.radacct
UNION ALL SELECT 'radius.radpostauth', count(*) FROM radius.radpostauth;
"
```
(离线部署把 `docker-compose.yml` 换成 `docker-compose.offline.yml` 即可,命令
本身不变;`admin_user`/`audit_log` 不算在判断范围内,因为控制台自己的 bootstrap
管理员和它产生的审计记录不算"业务测试数据"。)

- **全部为 0 → 首次部署**:说明这个环境从没跑过
  `backend/scripts/seed_demo.py`,可以放心继续初始化流程(建管理员、配 AD、
  接 NAS 等)。上线放真实流量之前必须跑一遍这个检查并确认全 0,这是强制的
  前置门槛,不是可选项。
- **任意一项非 0 → 已有数据环境(升级/redeploy)**:此时**严禁**执行以下任何
  操作,不管出于什么理由("顺手清一下"、"看着像测试数据"都不是例外):
  - 清空/截断(`TRUNCATE`)任何业务表
  - 批量 `DELETE`/`DROP TABLE`
  - 重新执行 `backend/scripts/seed_demo.py`
  - 任何形式的"重置到干净状态"操作

  升级流程只能是:加载新版本镜像 → `alembic upgrade head`(只做向后兼容的
  schema 变更,见「升级与回滚」)→ 重启服务。**数据本身一律不动**。

已知缺口(不在这次实现,记录下来避免以后重复纠结):项目目前没有一个"一键清空
业务数据、保留 schema"的脚本。万一真的出现"环境不慎跑过 demo 数据、但确实还
没上线,需要清成干净态"这种场景(注意:**仅限首次部署前**,已有真实数据的环境
永远不适用),现在只能手工写 SQL 逐表清。如果这个场景以后频繁出现,可以让 pi
补一个专门脚本,但要求脚本本身有醒目的二次确认(比如要求手工输入环境名称或者
一次性随机确认码才能执行),防止误用到已有真实数据的环境上。

配套的运行 SOP 见 [13-operational-sop.md](./13-operational-sop.md) SOP-07。

## 备份与恢复

- `deploy/scripts/backup.sh`:`pg_dump -Fc`(含 radius+public 两 schema),gzip,
  按日期命名,保留 14 份;建议 crontab 每日。
- `restore.sh`:先停 backend/freeradius → `pg_restore --clean --if-exists` → 重启。
- 自动化入口:Ansible playbook(`ansible/playbooks/backup.yml` / `restore.yml`)封装同样的
  deploy/scripts 脚本(见上「Ansible 运维子系统」),无 SSH 环境用 crontab + 脚本即可。
- M7 验收包含一次完整备份/恢复演练记录。

## 日志与监控

- 全部容器 stdout/stderr,docker json-file(单节点);backend JSON 日志含 request_id。
- freeradius `-X` 日志量大,prod 建议降为 `-f`(entrypoint 按 OPENRADIUS_ENV 切换)。
- 指标(M7 之后可选):/api/health 扩展 + Prometheus exporter;MVP 不引入。

## 升级与回滚

- 镜像打 tag(语义化版本 + git short sha);compose 引用 tag 而非 latest(prod)。
- 回滚 = 切回旧 tag + `up -d`;数据库迁移要求向后兼容一个版本(Alembic 迁移需可回退)。

## 离线部署(GitHub Release)

面向**目标机完全不能访问 ghcr.io / 任何镜像仓库**的场景。每个 `vX.Y.Z` tag 会自动触发
`.github/workflows/release.yml`,把该版本的三个应用镜像 + `postgres:17-alpine` +
compose + 配置 + 安装脚本打成一个 `openredius-offline-<version>.tar.gz`,发布到仓库的
GitHub Release 页面(公开可下载,长期有效,区别于 `images-export-fallback.yml` 那种
3 天过期的应急 Actions 产物)。完整的 workflow 全景与设计边界见
[14-ci-cd.md](./14-ci-cd.md)。

目标机前提:已装好 Docker Engine ≥ 24 + compose v2 插件(这一步本包不覆盖)。

```bash
# 1. 从 GitHub Release 页面下载 openredius-offline-<version>.tar.gz(+ .sha256 校验)
tar xzf openredius-offline-<version>.tar.gz
cd openredius-offline-<version>
sha256sum -c CHECKSUMS.sha256          # 完整性校验(可选但建议)

# 2. 把镜像 tar 全部 docker load 回本地(全程不联网、不 pull)
./install.sh

# 3. 配置(TAG/IMAGE_OWNER 已预填,只需改口令;FRONTEND_HTTP_PORT/_HTTPS_PORT
#    默认 80/443,目标机这两个端口被别的服务占用时记得改)
cp .env.example .env && $EDITOR .env

# 4. 先起数据库,迁移必须在 backend 正常启动之前跑完——backend 的 FastAPI
#    lifespan 启动时会查 admin_user 表(自动建初始管理员),库还没迁移直接
#    UndefinedTableError 崩溃退出;而 frontend 又 depends_on backend:
#    condition: service_healthy,顺序反了会一直卡住(2026-08-14 首次真实部署
#    踩过这个坑)。`run --rm --no-deps` 绕开健康检查门槛,起一次性容器专门跑迁移。
docker compose -f docker-compose.offline.yml up -d postgres
docker compose -f docker-compose.offline.yml run --rm --no-deps backend alembic upgrade head

# 5. 迁移完再起整套栈;OPENRADIUS_BOOTSTRAP_ADMIN_USER/_PASSWORD(.env 里)
#    非空的话 backend 首次启动会自动建管理员,不用手工建号
docker compose -f docker-compose.offline.yml up -d
docker compose -f docker-compose.offline.yml ps   # 全部 healthy 为止

# 6.(可选)没在 .env 里配 bootstrap 口令,或要重置管理员密码,再手工建/改:
docker compose -f docker-compose.offline.yml exec backend \
  python scripts/create_admin.py admin --password '<强口令>' --role admin --force

# 7. 上线放真实流量之前,必须跑一遍「数据安全红线」一节的业务表 count 检查,
#    确认是首次部署且全 0——这一步是强制的,不是可选项。
```

之后的运维(TLS 证书、备份/恢复、NAS 接入、故障排查)与「生产运行」一节完全一致——离线包
只是换了镜像的来源(本地 tar vs. registry pull),服务清单、端口、健康检查、备份脚本都是
同一套。升级新版本 = 下载新的 offline 包、重复第 2–3 步(数据库迁移向后兼容,见上「升级与回滚」)。
**升级前先跑「数据安全红线」一节的 count 检查——只要不是全 0,就是已有数据环境,
升级流程绝不能碰数据本身。**
