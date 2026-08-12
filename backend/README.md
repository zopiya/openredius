# backend/ · OpenRedius 后端

本目录是 **uv + Python(FastAPI)** 后端项目,于 **M1 里程碑**(后端骨架与基础设施)实现,
当前仅为占位骨架。

- 项目布局、依赖基线、配置表、策略编译器、CoA 客户端与定时任务设计:
  见 [docs/04-backend-design.md](../docs/04-backend-design.md)
- REST API 契约:见 [docs/03-api-design.md](../docs/03-api-design.md)
- 任务分解与验收:见 [docs/10-roadmap.md](../docs/10-roadmap.md) M1

开发环境为 GitHub Codespaces(`.devcontainer/`,ADR-0007)。默认 SQLite(aiosqlite)
即可运行 M1–M2 全部功能与测试,零容器;PostgreSQL + FreeRADIUS 栈集成(M3 起)
在 Codespace 内经 docker-in-docker 调试,不再需要远程服务器,见
[docs/07-deployment.md](../docs/07-deployment.md)。

M1 落地后的目录形态(src 布局,`openredius` 包):

```
backend/
├── pyproject.toml / uv.lock / .python-version
├── alembic.ini + alembic/          # 迁移(仅 public schema)
├── src/openredius/
│   ├── main.py                     # app 工厂 + uvicorn 入口
│   ├── core/  models/  radius/  schemas/  api/  services/  ldap_sync/  jobs/
├── scripts/                        # seed_demo.py / create_admin.py
└── tests/                          # unit / api / integration
```
