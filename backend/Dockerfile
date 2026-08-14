# OpenRedius backend — multi-stage uv build (docs/07)
#   docker build -f backend/Dockerfile -t openredius/backend .
FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
# --no-editable: 默认 `uv sync` 把本地项目装成 editable(venv 里只留一个指向
# /app/src 的 .pth 文件),但最终阶段只拷贝 .venv,不拷贝 src/ —— 之前这里
# 漏了这个 flag,导致成品镜像里 import openredius 直接 ModuleNotFoundError,
# 容器起不来(2026-08-14 首次真实部署才发现)。加上 --no-editable 让 uv 把包
# 装成普通(非 editable)安装,.venv 自包含,不再依赖构建阶段之外的 src/。
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13-slim
WORKDIR /app
RUN groupadd -r openredius && useradd -r -g openredius openredius
COPY --from=build --chown=openredius:openredius /app/.venv /app/.venv
COPY --from=build --chown=openredius:openredius /app/alembic.ini /app/alembic.ini
COPY --from=build --chown=openredius:openredius /app/alembic/ /app/alembic/
# scripts/ 没进 .venv(不是包代码,是运维用的独立脚本),但部署文档(docs/07)一直
# 教用户 `docker compose exec backend python scripts/create_admin.py` ——之前这里
# 没拷贝,同一次部署里跟 --no-editable 一起被发现补上。
COPY --from=build --chown=openredius:openredius /app/scripts/ /app/scripts/
ENV PATH=/app/.venv/bin:$PATH
USER openredius
EXPOSE 8000
CMD ["uvicorn", "openredius.main:app", "--host", "0.0.0.0", "--port", "8000"]
