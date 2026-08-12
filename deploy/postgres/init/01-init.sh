#!/bin/bash
# PostgreSQL 初始化(见 docs/06「PostgreSQL 初始化」):
#   1. radius schema + 官方 FreeRADIUS 表
#   2. 双角色:radius(FreeRADIUS 专用)、openredius(应用,Alembic 迁移执行者)
# 由 postgres 镜像 docker-entrypoint-initdb.d 机制在首启执行;.sh 形式以支持
# 从环境变量注入角色口令(纯 .sql 不做变量替换)。
set -euo pipefail

echo ">>> creating radius schema + application roles"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE SCHEMA radius;

    -- FreeRADIUS 专用角色(search_path=radius,rlm_sql 连接免前缀)
    CREATE ROLE radius LOGIN PASSWORD '${RADIUS_SQL_PASSWORD}';
    ALTER ROLE radius SET search_path = radius;

    -- 应用角色:public(Alembic)+ radius 双 schema 读写(跨 schema join)
    CREATE ROLE openredius LOGIN PASSWORD '${OPENRADIUS_DB_PASSWORD}';
    ALTER ROLE openredius SET search_path = public, radius;
EOSQL

echo ">>> loading FreeRADIUS schema into radius schema"
{
    echo "SET search_path TO radius;"
    cat "$(dirname "$0")/schema.sql"
} | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"

echo ">>> granting privileges"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT USAGE ON SCHEMA radius TO radius, openredius;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA radius TO radius;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA radius TO radius;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA radius TO openredius;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA radius TO openredius;
    -- Alembic 迁移在 public schema 建应用表
    GRANT USAGE, CREATE ON SCHEMA public TO openredius;

    -- FreeRADIUS 的 unlang 内联 SQL(policy-openredius)以 radius 角色读
    -- public 侧视图/函数/表;表由 openredius(Alembic)在此之后创建,
    -- 故用 default privileges 而非直接 GRANT(docs/06)。
    ALTER DEFAULT PRIVILEGES FOR ROLE openredius IN SCHEMA public
        GRANT SELECT ON TABLES TO radius;
    ALTER DEFAULT PRIVILEGES FOR ROLE openredius IN SCHEMA public
        GRANT EXECUTE ON FUNCTIONS TO radius;
EOSQL

echo ">>> seeding dev RADIUS test client (radtest from localhost)"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SET search_path TO radius;
    INSERT INTO nas (nasname, shortname, type, secret, description)
    VALUES ('127.0.0.1', 'dev-radtest', 'other', 'testing123-dev',
            'OpenRedius dev smoke-test client (radtest); managed by compose init');
EOSQL

echo ">>> postgres init complete"
