# 01 · 总体架构

## 拓扑

```mermaid
flowchart LR
  subgraph 终端侧
    SUP[终端 802.1X supplicant]
  end
  subgraph 接入层
    NAS[NAS 交换机 / AC / AP]
  end
  subgraph OpenRedius 部署(docker compose)
    NGX[nginx :80/:443<br/>静态前端 + /api 反代]
    BE[backend API<br/>FastAPI/uvicorn :8000]
    FR[FreeRADIUS 3.2<br/>:1812/1813 udp]
    PG[(PostgreSQL 17<br/>db: openredius<br/>schema: radius + public)]
  end
  AD[(AD / LDAP)]

  SUP -- 802.1X EAP --> NAS
  NAS -- RADIUS auth/acct udp/1812,1813 --> FR
  BE -- CoA/Disconnect udp/3799(出向) --> NAS
  FR -- rlm_sql 读写 radius.* --> PG
  BE -- SQLAlchemy 读写 public.* + radius.* --> PG
  BE -- ldap3 增量同步 --> AD
  管理员浏览器 --> NGX --> BE
  NGX -- 静态资源 --> 浏览器
```

## 组件与职责

| 组件 | 技术 | 职责 | 不管什么 |
|---|---|---|---|
| frontend | React19+TS+Vite, bun | 管理控制台 UI(原型 8 页)、筛选/交互 | 业务计算 |
| backend | Python ≥3.13, FastAPI, uv | REST API、认证/鉴权、策略编译、CoA 下发、AD 同步、定时任务、告警引擎 | RADIUS 协议处理本身 |
| freeradius | FreeRADIUS 3.2.x(官方镜像 + 本地 raddb) | EAP 认证、记账、postauth 日志、读 SQL 授权 | 管理界面逻辑 |
| postgres | PostgreSQL 17 | 唯一事实存储:FreeRADIUS 表(radius schema)+ 应用表(public schema) | — |
| nginx | nginx:alpine | TLS 终止、静态资源、`/api` 反代 | 业务逻辑 |

## 关键数据流

1. **认证**:终端 → NAS → FreeRADIUS。FreeRADIUS 依序查 `radius.radcheck`(用户检查)→
   `radius.radusergroup` + `radius.radgroupcheck`(组检查)→ 通过则回复
   `radius.radgroupreply` + `radius.radreply` 中的属性(VLAN/ACL/Session-Timeout);
   结果写 `radius.radpostauth`。
2. **会话**:NAS 发 Accounting-Start/Interim/Stop → FreeRADIUS 写 `radius.radacct`。
   在线会话 = `acctstoptime IS NULL` 的行。
3. **强制下线**:backend 取会话的 `acctsessionid` + NAS 密钥 → 构造 RFC 5176
   Disconnect-Request(pyrad)→ UDP 3799 → NAS 回 Disconnect-ACK → NAS 踢出终端并补发
   Accounting-Stop(radacct 关闭)。
4. **策略变更**:管理端写 `public.policy_group` 等 → 策略编译器同步生成
   `radius.radgroupreply/radgroupcheck/radusergroup` 行(单事务)→ 新认证即刻生效;
   存量会话按策略要求可选触发批量 CoA(`POST /api/sessions/reauthorize`,见 03)。
5. **NAS 增删**:backend 写 `radius.nas` → **重启 freeradius 容器**(rlm_sql 仅启动时
   `read_clients`,见 06)→ 新 NAS 可接入。
6. **AD 同步**:定时/手动 → ldap3 拉取增量(whenChanged)→ upsert `public.access_user` →
   联动 radcheck 启停(Auth-Type := Reject)。

## 端口与暴露面

| 端口 | 协议 | 服务 | dev 暴露 | prod 暴露 |
|---|---|---|---|---|
| 80 / 443 | tcp | nginx | 8080 | 是 |
| 8000 | tcp | backend | 仅本机 | 否(内网) |
| 5432 | tcp | postgres | 仅本机 | 否 |
| 1812/1813 | udp | freeradius | 本机回环 | 仅 NAS 网段 |
| 3799 | udp | NAS 侧 CoA 监听 | — | backend 出向 |
| 5173 | tcp | vite dev server | 本机 | — |

## 技术选型(详见 decisions/)

| 层 | 选择 | ADR |
|---|---|---|
| 后端语言/包管理 | Python ≥3.13 + uv | ADR-0001 |
| Web 框架 | FastAPI 0.141 + uvicorn | ADR-0001 |
| ORM/迁移 | SQLAlchemy 2.0 + Alembic | ADR-0004 |
| 数据库 | PostgreSQL 17,单库双 schema | ADR-0004 |
| 认证引擎 | FreeRADIUS 3.2.x 官方镜像 | ADR-0002 |
| CoA 客户端 | pyrad 2.5.4 | ADR-0006 |
| 前端 | 维持 React19+TS+Vite+bun,数据层切换 | ADR-0005 |
| 部署 | docker compose(dev/prod 两档) | 07-deployment |

## 扩展性留白(不在 MVP 实现)

- 多 FreeRADIUS 实例:`nas.server` 字段与 CoA 目标均已按实例可扩展设计。
- 事件总线:告警引擎以轮询起步,接口抽象保留推送化空间(M6+)。
- 访客 Portal / 自助改密:API 命名空间已预留(`/api/portal/*`,未实现)。
