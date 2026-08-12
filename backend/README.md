# backend/ · OpenRedius 后端

本目录是 **uv + Python(FastAPI)** 后端项目,于 **M1 里程碑**(后端骨架与基础设施)落地。

- 项目布局、依赖基线、配置表、策略编译器、CoA 客户端与定时任务设计:
  见 [docs/04-backend-design.md](../docs/04-backend-design.md)
- REST API 契约:见 [docs/03-api-design.md](../docs/03-api-design.md)
- 任务分解与验收:见 [docs/10-roadmap.md](../docs/10-roadmap.md) M1

开发环境为 GitHub Codespaces,经 `gh`/SSH 直连(`.devcontainer/` 声明式配置暂时
回退,见 ADR-0007「更新」)。默认 SQLite(aiosqlite)即可运行 M1–M2 全部功能与
测试,零容器;PostgreSQL + FreeRADIUS 栈集成(M3 起)在 Codespace 内手工装
docker 依赖后调试,见 [docs/07-deployment.md](../docs/07-deployment.md)。

## 快速开始(本地 SQLite,零容器)

```bash
uv sync
uv run alembic upgrade head
# 首启时由 OPENRADIUS_BOOTSTRAP_ADMIN_USER/_PASSWORD 自动创建初始管理员
uv run uvicorn openredius.main:app --reload --port 8000
# 或手工创建管理员:
uv run python scripts/create_admin.py <username> --role admin
```

## 验证

```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest -q                 # 单元 + API(不含 integration 标记)
uv run pytest -m integration -q  # 栈集成,M3 起
```

## M1 落地形态(src 布局,`openredius` 包)

```
backend/
├── pyproject.toml / uv.lock / .python-version
├── alembic.ini + alembic/          # 迁移(仅 public schema)
├── src/openredius/
│   ├── main.py                     # app 工厂 + uvicorn 入口
│   ├── core/                       # config/logging/security/db/deps/errors/ratelimit
│   ├── models/                     # admin_user / audit_log / revoked_refresh_token
│   ├── schemas/                    # Pydantic DTO(与 03 契约一致)
│   ├── api/                        # auth(login/refresh/logout/me)+ ops(health)
│   └── services/                   # auth(锁定/轮换)/ audit / bootstrap
├── scripts/create_admin.py
└── tests/                          # unit / api(M3 起增加 integration)
```

M2+ 将按 04 的完整布局扩充 `radius/`、`services/`(各资源)、`ldap_sync/`、`jobs/`。
