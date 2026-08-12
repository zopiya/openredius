# deploy/ · 部署目录(Docker / compose)

本目录承载 OpenRedius 的部署形态,当前仅为占位骨架,按里程碑逐步落地:
dev compose(M3)→ prod compose 与镜像(M7)。设计全文见
[docs/07-deployment.md](../docs/07-deployment.md)。

> **栈集成环境:GitHub Codespaces**(`.devcontainer/`,docker-in-docker,ADR-0007)。
> M3 起直接在 Codespace 终端跑 `docker compose -f deploy/docker-compose.dev.yml up -d`,
> 不再需要额外服务器与 SSH。生产部署(M7)仍面向独立服务器,连接信息届时补录于此。

## 目录规划

```
deploy/
├── docker-compose.yml          # 生产形态(postgres/freeradius/backend/frontend 四服务)
├── docker-compose.dev.yml      # 开发依赖(postgres + freeradius),M3 落地
├── .env.example                # 部署变量模板,随 compose 落地(M3/M7)
├── postgres/
│   └── init/                   # 01-schema.sql(radius schema + 官方表)02-roles.sql(双角色)
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

## 说明

- 本地开发全程零容器:后端默认 SQLite,前端 mock/http 代理(见 07「本地开发流」)。
- 生产 compose 服务清单、端口、健康检查与镜像构建要点见 07 对应小节。
