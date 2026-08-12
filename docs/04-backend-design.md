# 04 · 后端设计(uv + Python + FastAPI)

## 项目布局

```
backend/
├── pyproject.toml            # uv 管理;requires-python >=3.13
├── uv.lock
├── .python-version           # 3.13(镜像与 CI 一致;本机 3.14 亦满足 >=3.13)
├── README.md
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/             # 迁移脚本(仅 public schema)
├── src/openredius/
│   ├── __init__.py
│   ├── main.py               # app 工厂 + uvicorn 入口
│   ├── core/                 # config(pydantic-settings)/logging/security(jwt,hash)/deps/db
│   ├── models/               # SQLAlchemy 2.0 typed ORM(public.*)
│   ├── radius/               # radius schema 表映射 + 查询构建器
│   │   ├── tables.py         # radacct/radpostauth/radcheck/… 映射(schema="radius")
│   │   ├── compiler.py       # 策略编译器(见下)
│   │   └── coa.py            # pyrad Disconnect/CoA 客户端封装
│   ├── schemas/              # Pydantic DTO(与 03 契约一致)
│   ├── api/                  # 路由:auth/dashboard/sessions/logs/users/policies/devices/reports/settings/audit/ops
│   ├── services/             # session/log/report/alert/lockout/nas/endpoint 服务
│   ├── ldap_sync/            # ldap3 同步器(fixture 驱动,可脱离 AD 单测)
│   └── jobs/                 # APScheduler 装配与任务实现
├── scripts/
│   ├── seed_demo.py          # 复刻原型数据集
│   └── create_admin.py
└── tests/
    ├── unit/  api/  integration/   # 见 09
    └── conftest.py           # sqlite 内存库(app 表)+ 依赖覆盖
```

## 依赖基线(2026-08)

| 依赖 | 版本 | 用途 |
|---|---|---|
| fastapi | 0.141.x | Web 框架 |
| uvicorn[standard] | 0.52.x | ASGI |
| sqlalchemy | 2.0.x | ORM(async engine) |
| asyncpg | 最新稳定 | PG 驱动(集成/生产) |
| aiosqlite | 最新稳定 | 本地开发 SQLite 驱动(M1–M2 无需外部数据库;Postgres 集成见 07) |
| alembic | 1.19.x | 迁移 |
| pydantic / pydantic-settings | v2 | DTO / 配置 |
| pyrad | 2.5.4 | CoA/Disconnect(同步 API,线程池调用) |
| ldap3 | 2.9.1 | AD 同步(同上) |
| apscheduler | 3.x | 定时任务 |
| argon2-cffi | 最新稳定 | 管理员口令哈希 |
| PyJWT | 最新稳定 | JWT |
| httpx | 0.28.x | 测试客户端 / 出向 |
| pytest / pytest-asyncio / ruff | 最新稳定 | 测试与风格 |

## 配置(环境变量,前缀 `OPENRADIUS_`)

| 变量 | 默认(dev) | 说明 |
|---|---|---|
| `OPENRADIUS_ENV` | dev | dev/prod;prod 强制校验密钥类配置 |
| `OPENRADIUS_DATABASE_URL` | sqlite+aiosqlite:///./openredius-dev.db | 应用连接;集成/prod 换 postgresql+asyncpg://…(见 07) |
| `OPENRADIUS_JWT_SECRET` / `OPENRADIUS_JWT_ACCESS_TTL` / `_REFRESH_TTL` | dev 默认 / 15m / 7d | |
| `OPENRADIUS_RADIUS_COA_PORT` | 3799 | NAS 侧 CoA 端口 |
| `OPENRADIUS_RADIUS_COA_TIMEOUT` | 3.0s | |
| `OPENRADIUS_NAS_ONLINE_WINDOW` | 300s | NAS 在线判定窗口 |
| `OPENRADIUS_AD_URL/_BIND_DN/_BIND_PW/_BASE_DN/_FILTER` | 空=禁用 AD | ldap://… |
| `OPENRADIUS_AD_SYNC_CRON` | `*/15 * * * *` | |
| `OPENRADIUS_LOCKOUT_MAX_FAILS/_WINDOW/_DURATION` | 5 / 600s / 1800s | 与原型文案一致 |
| `OPENRADIUS_CERT_EXPIRE_WARN_DAYS` | 14 | |

配置文件仅 `.env`(不入库);`.env.example` 在仓库根目录维护。

## 策略编译器(核心服务)

输入:`policy_group` 及用户分配;输出(单事务幂等 upsert/delete):

| 策略字段 | FreeRADIUS 产物 |
|---|---|
| vlan_id | `radgroupreply`: `Tunnel-Type=VLAN`, `Tunnel-Medium-Type=IEEE-802`, `Tunnel-Private-Group-Id=<vid>` |
| acl_name ≠ 无 | `radgroupreply`: `Filter-Id=<acl>` |
| session_timeout_s | `radgroupreply`: `Session-Timeout=<s>` |
| rate_limit_mbps | `radgroupreply`: `WISPr-Bandwidth-Max-Up/Down=<bps>` |
| require_cert | `radgroupcheck`: 证书存在性约束(见 06 policy-flags) |
| require_mac_bind / require_edr / time_window | 组级标记属性,由 06 的 unlang 策略消费 |
| enabled=false | 删除该组全部编译产物(保留定义) |
| 用户分配 | `radusergroup(username, groupname=policy_<slug>, priority)` |
| 用户停用/锁定 | `radcheck`: `Auth-Type := Reject` |

规则:编译幂等,以 `(groupname, attribute)` 为键做 diff;每次编译写 audit_log。

## CoA 客户端(radius/coa.py)

- pyrad `DisconnectPacket`;属性:`User-Name`、`NAS-IP-Address`、`Acct-Session-Id`、
  可选 `Calling-Station-Id`;目标 = NAS IP : `OPENRADIUS_RADIUS_COA_PORT`;密钥 = nas.secret。
- 同步 IO → `anyio.to_thread` 包装;批量并发上限 8;超时/重试 1 次。
- 结果:ACK→成功;NAK→失败(记 Error-Cause);超时→`timeout`。
- 成功后 10s 内轮询 radacct 确认 stop;未 stop 则兜底写
  `acctstoptime=now(), acctterminatecause='Admin-Reset'`(class 标记 backend-closed)。

## 定时任务(jobs/)

| 任务 | 周期 | 职责 |
|---|---|---|
| `lockout_sweeper` | 60s | 到期解锁;新 Reject 计数触发锁定 |
| `cert_scan` | 每小时 | 终端证书到期扫描 → compliance + warn 告警 |
| `nas_watchdog` | 60s | last_seen/负载 → offline/高负载告警(10 分钟去重) |
| `ad_sync` | cron 可配 | 增量同步 |
| `alert_gc` | 每日 | 清理 90 天前已读告警 |

调度器随 app lifespan 启动;prod 单副本假设(多副本需外置调度,M7 注记)。

## 横切约定

- 依赖注入:`core/deps.py` 提供 `get_db`、`current_admin`、角色守卫 `require_role(...)`。
- 日志:JSON 格式,每请求 `request_id`;认证/写操作必记 audit_log。
- 异常:业务异常 `ApiError(code, status, message)`,全局 handler 转 03 错误体。
- 时间:DB 一律 UTC。
- Alembic autogenerate 仅 public schema(include_schema 过滤 radius);
  PG 专属对象(`v_user_policy_flags` 视图、`norm_mac` 函数)仅 postgresql 方言条件创建,
  SQLite 本地环境自动跳过(它们只被服务器侧 FreeRADIUS 消费)。
- `seed_demo.py` 数据集与原型一致(10 用户 / 5 策略 / 8 NAS / 8 终端 / 报表基线),
  作为前端联调与集成测试的共同夹具。
