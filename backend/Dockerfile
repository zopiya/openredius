# OpenRedius backend — multi-stage uv build (docs/07)
#   docker build -f backend/Dockerfile -t openredius/backend .
FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --frozen --no-dev

FROM python:3.13-slim
WORKDIR /app
RUN groupadd -r openredius && useradd -r -g openredius openredius
COPY --from=build --chown=openredius:openredius /app/.venv /app/.venv
COPY --from=build --chown=openredius:openredius /app/alembic.ini /app/alembic.ini
COPY --from=build --chown=openredius:openredius /app/alembic/ /app/alembic/
ENV PATH=/app/.venv/bin:$PATH
USER openredius
EXPOSE 8000
CMD ["uvicorn", "openredius.main:app", "--host", "0.0.0.0", "--port", "8000"]
