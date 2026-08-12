# deploy/ · 部署目录(Docker / compose)

本目录承载 OpenRedius 的部署形态,按里程碑逐步落地:
dev compose(M1:postgres;M3 增加 freeradius)→ prod compose 与镜像(M7)。
设计全文见 [docs/07-deployment.md](../docs/07-deployment.md)。

> **栈集成环境:GitHub Codespaces**(经 `gh`/SSH 直连;`.devcontainer/` 声明式配置
> 暂时回退,见 ADR-0007「更新」)。M3 起手工在 Codespace 内装好 docker 依赖后,
> 跑 `docker compose -f deploy/docker-compose.dev.yml up -d`,不再需要额外的远程
> 服务器。生产部署(M7)仍面向独立服务器,连接信息届时补录于此。

## 目录规划

```
deploy/
├── docker-compose.yml          # 生产形态(postgres/freeradius/backend/frontend 四服务)
├── docker-compose.dev.yml      # 开发依赖(postgres,M1 落地;freeradius 由 M3 增加)
├── .env.example                # 部署变量模板,随 compose 落地(M3/M7)
├── postgres/
│   └── init/                   # 01-init.sh(radius schema + 官方表 + 双角色)+ schema.sql
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

## dev 栈(M3:postgres + freeradius)

镜像基线:`freeradius/freeradius-server:latest`,构建时实测 **FreeRADIUS 3.2.10**
(git #9071ea041);本地镜像名 `openredius/freeradius`。

```bash
docker compose -f deploy/docker-compose.dev.yml up -d --build   # 首启含 postgres 初始化
docker compose -f deploy/docker-compose.dev.yml ps              # 全部 healthy

# 应用侧:迁移 + 原型数据集(含 radius schema 编译产物)
cd backend
OPENRADIUS_DATABASE_URL='postgresql+asyncpg://openredius:dev-only-openredius-password@localhost:5432/openredius' \
  uv run alembic upgrade head
OPENRADIUS_DATABASE_URL='…同上' uv run python scripts/seed_demo.py

# 认证冒烟
docker compose -f deploy/docker-compose.dev.yml exec freeradius \
  radtest li.na 'Demo-Radius-2026' localhost 0 testing123-dev      # Accept + VLAN 10
# 携 MAC 的用例用 radclient(radtest 不带 Calling-Station-Id):
docker compose -f deploy/docker-compose.dev.yml exec -T freeradius sh -c \
  'printf "User-Name=wang.lei\nUser-Password=Demo-Radius-2026\nCalling-Station-Id=3C:52:82:1A:4B:01\n" | radclient -x 127.0.0.1:1812 auth testing123-dev'

bash deploy/scripts/smoke_freeradius.sh    # radiusd -CX 配置语法校验
```

关键约定:

- **口令**:seed 演示用户统一 `Demo-Radius-2026`(radcheck Cleartext-Password,
  仅 dev);radtest 客户端密钥 `testing123-dev`(compose init 写入 radius.nas)。
- **NAS 客户端**:全部来自 `radius.nas`(后端 NAS CRUD 写入),镜像内
  `clients.conf` 清空静态客户端;`read_clients` 仅启动时读取,变更后用
  `POST /api/ops/reload-radius`(或 `OPENRADIUS_RADIUS_RELOAD_COMMAND`)重启容器。
- **证书**:挂载 `deploy/freeradius/certs/` 遮蔽上游证书目录;无证书文件时
  entrypoint 自签兜底(口令 `whatever`,对齐上游 eap tls-config)。手工生成用
  `deploy/freeradius/certs/gen.sh`。
- **schema 变更后**:radius schema 由 compose 首启初始化,结构变更(如新增
  `radpostauth.class`)需 `docker compose … down -v && up -d --build` 重建卷。

## 数据面工具(M4)

```bash
cd backend
export OPENRADIUS_DATABASE_URL='postgresql+asyncpg://openredius:dev-only-openredius-password@localhost:5432/openredius'

# 30 天合成历史(幂等:SYNTH 标记行先删后插;不碰真实 radtest 数据)
uv run python scripts/generate_history.py --days 30 --rng-seed 42

# 持续合成流量(仪表盘可见;--once 单发,--reset 清理)
uv run python ../deploy/scripts/demo_traffic.py --interval 30

# 卷重建后需重新初始化:迁移 + seed + 管理员
uv run alembic upgrade head && uv run python scripts/seed_demo.py \
  && uv run python scripts/create_admin.py admin --password '<pw>' --role admin --force
```

注意:

- `schema.sql` 或 queries.conf 补丁变更后必须 `down -v && up -d --build` 重建卷;
  卷重建会清掉管理员与全部数据(按上面顺序恢复)。
- seed_demo 在 PG 下自带最近 7 天合成历史(rng 固定);`generate_history.py`
  可再叠加 30 天(两者同用 SYNTH 标记,重跑互不污染)。
- CoA 联调:`deploy/scripts/coa_sink.py`(假 NAS,回 ACK/NAK,`--log` 落 JSONL),
  集成测试 `tests/integration/test_accounting_coa.py` 场景 13 即用例。

## 说明

- 本地开发全程零容器:后端默认 SQLite,前端 mock/http 代理(见 07「本地开发流」)。
- 生产 compose 服务清单、端口、健康检查与镜像构建要点见 07 对应小节。

---

# 生产运维手册(M7)

## 快速部署

```bash
# 1. 准备环境变量
cp deploy/.env.example deploy/.env
$EDITOR deploy/.env   # 替换全部默认口令,设 OPENRADIUS_ENV=prod

# 2. TLS 证书(二选一)
#   a) 自签(内网):不创建 deploy/nginx/certs/,容器启动时自动生成
#   b) 真实证书:将 cert.pem + key.pem 放入 deploy/nginx/certs/(推荐挂载 read-only)
mkdir -p deploy/nginx/certs
cp /path/to/your/fullchain.pem deploy/nginx/certs/cert.pem
cp /path/to/your/privkey.pem   deploy/nginx/certs/key.pem

# 3. 构建并启动
docker compose -f deploy/docker-compose.yml up -d --build

# 4. 运行数据库迁移(首次)
docker compose -f deploy/docker-compose.yml exec backend \
  alembic upgrade head

# 5. 创建初始管理员(如未设 bootstrap 变量)
docker compose -f deploy/docker-compose.yml exec backend \
  python scripts/create_admin.py admin --password '<强口令>' --role admin --force

# 6. 验证
docker compose -f deploy/docker-compose.yml ps   # 全部 healthy
curl -sk https://localhost/api/health            # {"status":"ok"}
```

## 真实 NAS 接入清单

### 1. 在 OpenRedius 注册 NAS

后台「设备管理」→ 新增 NAS,填写:
- 名称(建议含位置,如 `SW-3F-01`)
- nasname(IP 地址,必须与交换机/NAS 管理 IP 一致)
- secret(与 NAS 端 RADIUS shared secret 一致)
- 容量(交换机端口数,用于负载展示)

保存后后端自动写入 `radius.nas` 表。

### 2. NAS 端配置(以 Cisco IOS 为例)

```cisco
radius-server host <backend-host> auth-port 1812 acct-port 1813 key <secret>
aaa new-model
aaa authentication dot1x default group radius
aaa authorization network default group radius
aaa accounting dot1x default start-stop group radius
dot1x system-auth-control
```

### 3. 防火墙规则

- NAS → 服务器 UDP 1812/1813(RADIUS)
- 服务器 → NAS UDP 3799(CoA,用于强制下线)
- 管理员 → 服务器 TCP 443(HTTPS 控制台)

### 4. FreeRADIUS 重载

NAS 变更后生效:通过 API `POST /api/ops/reload-radius` 或 compose
`docker compose -f deploy/docker-compose.yml restart freeradius`。

### 5. 冒烟

```bash
# 从 NAS 可达的主机测试
docker compose -f deploy/docker-compose.yml exec freeradius \
  radtest <用户名> <密码> <服务器私网IP> 0 <nas-secret>
```

## CoA(coa_sink / 强制下线)配置

### 假 NAS 接收端(调试用)

```bash
cd backend
uv run python ../deploy/scripts/coa_sink.py --port 3799 --secret '<coa-secret>' --log coa.log
```

### 生产配置

后端需要的 CoA 参数:
- `OPENRADIUS_RADIUS_COA_SECRET`:与 NAS 共享密钥一致
- `OPENRADIUS_RADIUS_COA_PORT`:NAS 端 CoA 监听端口(默认 3799)
- NAS 端必须启用 CoA(如 Cisco: `aaa server radius dynamic-author client ...`)

验证:
```bash
# 查看在线会话 → 记下 session_id
curl -sk -H "Authorization:Bearer <token>" https://localhost/api/sessions?status=active
# 强制下线
curl -sk -X POST -H "Authorization:Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"session_ids":["<session_id>"],"reason":"管理员手动"}' \
  https://localhost/api/sessions/disconnect
```

## 备份与恢复

### 每日备份(crontab)

```bash
# 服务器 crontab
0 3 * * * cd /opt/openredius && \
  POSTGRES_PASSWORD='<pwd>' OPENRADIUS_DB_PASSWORD='<pwd>' \
  bash deploy/scripts/backup.sh >> /var/log/openredius-backup.log 2>&1
```

### 恢复

```bash
cd /opt/openredius
FORCE=1 RESTORE_METHOD=compose bash deploy/scripts/restore.sh ./backups/openredius-202608xx.dump.gz
```

恢复后 `docker compose -f deploy/docker-compose.yml ps` 确认全部 healthy。

## 故障排查

### 后端不健康

```bash
docker compose -f deploy/docker-compose.yml logs backend | tail -50
# 常见:OPENRADIUS_JWT_SECRET 长度不足(prod 需 ≥32)
#       OPENRADIUS_DATABASE_URL 拼写或权限错误
```

### FreeRADIUS 不启动

```bash
docker compose -f deploy/docker-compose.yml logs freeradius | tail -50
# 常见:clients.conf 拼写错误、radius.nas 未写入
# 配置校验:docker compose ... exec freeradius radiusd -CX
```

### NAS 认证失败

1. 检查 `radius.nas` 是否有该 NAS 的 IP
2. secret 是否与 NAS 端一致(GET /api/devices/nas/{id}/secret 查看)
3. 用户状态:GET /api/users?account=<用户名> 确认 status=active
4. 策略分配:确认用户已绑定策略,且策略处于启用状态
5. 时间策略:若启用了时间窗口,确认当前在允许时段内

### nginx TLS 证书过期

自签证书有效期 365 天;过期后删除 `deploy/nginx/certs/` 目录并重启容器:

```bash
rm deploy/nginx/certs/*.pem
docker compose -f deploy/docker-compose.yml up -d --force-recreate frontend
```

## 依赖审计

### Python

```bash
uvx pip-audit   # No known vulnerabilities found
```

### JavaScript

```bash
bun audit
# 12 undici 漏洞:来自 openapi-typescript@6 开发依赖
# 影响面:仅 dev/build 工具链;prod 前端为静态文件,不加载 undici
# 处置:接受风险,openapi-typescript@6 锁定(M5 reviewer NIT);定期 bun update
```

## 安全清单(docs/08 验收)

- [x] JWT + 登录限流 + 锁定 + RBAC(实现:core/security + api/auth + deps)
- [x] NAS Secret 默认掩码(前4后4)+ 查看强制审计
- [x] 服务端角色守卫(require_role 依赖注入)
- [x] ORM 参数化查询(全部 SQLAlchemy select/insert/update)
- [x] JWT 短 access(15m)+ refresh 轮换 + jti 黑名单
- [x] 锁文件:uv.lock / bun.lock
- [x] FreeRADIUS 只监听 NAS 网段(compose NAS_UDP_EXPOSE 控制)
- [x] nginx TLS(self-signed)+ HSTS + CSP + X-Frame-Options + 其它安全头
- [x] 备份/恢复脚本;演练记录见 docs/08
- [x] Argon2id + 最小口令长度 10
- [x] 依赖审计(pip-audit 无漏洞;bun 12 dev 漏洞,不可利用)
- [x] 审计日志覆盖:登录/下线/用户启停/策略CRUD/设备CRUD/Secret查看/AD同步/管理员变更
