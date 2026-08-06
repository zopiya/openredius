# ADR-0001 · 后端技术栈:uv + Python + FastAPI

- 状态:已接受(2026-08-06)

## 背景

用户指定 uv + Python。需要选定框架/ORM/驱动组合,满足:异步 API、OpenAPI 自动生成
(前端契约)、与 FreeRADIUS 生态(pyrad/ldap3 均为 Python 库)协同。

## 备选

1. **FastAPI + SQLAlchemy 2.0 + Alembic**:异步成熟、OpenAPI 一等公民、生态最全。
2. Django + DRF:全家桶但异步/轻量度不足,OpenAPI 需三方,管理后台自带但本项目 UI 已有。
3. Litestar:优秀但生态与团队熟悉度低于 FastAPI。

## 决定

FastAPI 0.141 + uvicorn;SQLAlchemy 2.0(async)+ asyncpg;Alembic 迁移;
pydantic-settings 配置;APScheduler 任务;uv 管理依赖(`requires-python >=3.13`)。

## 后果

- 正面:OpenAPI 直出供前端 codegen;async 与 CoA/LDAP 线程池模型清晰;招聘/维护门槛低。
- 代价:需自建 admin/迁移纪律(Django 自带项);APScheduler 单副本假设(见 04)。
