# ADR-0004 · PostgreSQL 17 单库双 schema(public + radius)

- 状态:已接受(2026-08-06)

## 背景

FreeRADIUS SQL 模块与 OpenRedius 应用需要共享用户/会话/日志数据。

## 备选

1. **单库双 schema**:跨 schema JOIN 原生可用(报表需要 radacct ⋈ 部门);一套备份。
2. 双库(radius / openredius):隔离彻底但跨库 JOIN 不可行,报表只能在应用层拼装。
3. SQLite:不满足 FreeRADIUS 生产要求与并发记账。

## 决定

PostgreSQL 17,数据库 `openredius`;`radius` schema 放 FreeRADIUS 官方表(结构冻结,
由官方 schema.sql 初始化),`public` schema 放应用表(Alembic 管理)。
FreeRADIUS 用独立角色 `radius`(search_path=radius);应用角色双 schema 读写。

## 后果

- 正面:报表/会话查询单条 SQL 完成;权限最小化;迁移边界清晰。
- 代价:radius schema 升级需跟随 FreeRADIUS 版本(记录于 06 参考)。
