# deploy/ · 部署目录(Docker / compose)

本目录承载 OpenRedius 的部署形态,按里程碑逐步落地:
dev compose(M1:postgres;M3 增加 freeradius)→ prod compose 与镜像(M7)。
设计全文见 [docs/07-deployment.md](../docs/07-deployment.md)。

> **栈集成环境:GitHub Codespaces**(经 `gh`/SSH 直连;`.devcontainer/` 声明式配置
> 暂时回退,见 ADR-0007「更新」)。M3 起手工在 Codespace 内装好 docker 依赖后,
> 跑 `docker compose -f deploy/docker-compose.dev.yml up -d`,不再需要额外的远程
> 服务器。生产部署(M7)仍面向独立服务器,连接信息届时补录于此。

## 目录规划

```
deploy/
├── docker-compose.yml          # 生产形态(postgres/freeradius/backend/frontend 四服务)
├── docker-compose.dev.yml      # 开发依赖(postgres,M1 落地;freeradius 由 M3 增加)
├── .env.example                # 部署变量模板,随 compose 落地(M3/M7)
├── postgres/
│   └── init/                   # 01-init.sh(radius schema + 官方表 + 双角色)+ schema.sql
├── freeradius/
│   ├── Dockerfile + entrypoint.sh(envsubst 注入配置)
│   ├── raddb/                  # mods-available/sql、sites-enabled/default、policy.d/
│   └── certs/gen.sh            # dev 证书生成(PEAP)
├── nginx/
│   ├── nginx.conf              # /api → backend;静态前端;安全头
│   └── Dockerfile              # 多阶段:bun build → nginx:alpine
├── backend.Dockerfile          # 多阶段:uv → python:3.13-slim
├── scripts/
│   ├── backup.sh / restore.sh  # pg_dump -Fc 备份(保留 14 份)/ 恢复
│   └── coa_sink.py / demo_traffic.py   # CoA 接收端 / 合成流量(见 docs/06)
└── backups/                    # 备份产物,已 gitignore,不入库
```

## dev 栈(M3:postgres + freeradius)

镜像基线:`freeradius/freeradius-server:latest`,构建时实测 **FreeRADIUS 3.2.10**
(git #9071ea041);本地镜像名 `openredius/freeradius`。

```bash
docker compose -f deploy/docker-compose.dev.yml up -d --build   # 首启含 postgres 初始化
docker compose -f deploy/docker-compose.dev.yml ps              # 全部 healthy

# 应用侧:迁移 + 原型数据集(含 radius schema 编译产物)
cd backend
OPENRADIUS_DATABASE_URL='postgresql+asyncpg://openredius:dev-only-openredius-password@localhost:5432/openredius' \
  uv run alembic upgrade head
OPENRADIUS_DATABASE_URL='…同上' uv run python scripts/seed_demo.py

# 认证冒烟
docker compose -f deploy/docker-compose.dev.yml exec freeradius \
  radtest li.na 'Demo-Radius-2026' localhost 0 testing123-dev      # Accept + VLAN 10
# 携 MAC 的用例用 radclient(radtest 不带 Calling-Station-Id):
docker compose -f deploy/docker-compose.dev.yml exec -T freeradius sh -c \
  'printf "User-Name=wang.lei\nUser-Password=Demo-Radius-2026\nCalling-Station-Id=3C:52:82:1A:4B:01\n" | radclient -x 127.0.0.1:1812 auth testing123-dev'

bash deploy/scripts/smoke_freeradius.sh    # radiusd -CX 配置语法校验
```

关键约定:

- **口令**:seed 演示用户统一 `Demo-Radius-2026`(radcheck Cleartext-Password,
  仅 dev);radtest 客户端密钥 `testing123-dev`(compose init 写入 radius.nas)。
- **NAS 客户端**:全部来自 `radius.nas`(后端 NAS CRUD 写入),镜像内
  `clients.conf` 清空静态客户端;`read_clients` 仅启动时读取,变更后用
  `POST /api/ops/reload-radius`(或 `OPENRADIUS_RADIUS_RELOAD_COMMAND`)重启容器。
- **证书**:挂载 `deploy/freeradius/certs/` 遮蔽上游证书目录;无证书文件时
  entrypoint 自签兜底(口令 `whatever`,对齐上游 eap tls-config)。手工生成用
  `deploy/freeradius/certs/gen.sh`。
- **schema 变更后**:radius schema 由 compose 首启初始化,结构变更(如新增
  `radpostauth.class`)需 `docker compose … down -v && up -d --build` 重建卷。

## 说明

- 本地开发全程零容器:后端默认 SQLite,前端 mock/http 代理(见 07「本地开发流」)。
- 生产 compose 服务清单、端口、健康检查与镜像构建要点见 07 对应小节。
