# AD 直通认证 + 属性同步扩展 — plan

决策(C-001~C-003,用户已拍板):**方案 A(winbind/ntlm_auth)+ 专门域 join
账号 + mobile 优先回退 telephoneNumber**。

## 技术上下文(基于实际代码,已核实)

- AD 同步链:`AdUserEntry`(dataclass,`ldap_sync/connector.py`)→
  `ldap3_.Ldap3Connector._fetch_sync`(attributes 列表)→
  `sync.py:_process_users`(update/create 分支)→ `AccessUser`
  (`models/user.py`)→ `UserOut`/`UserDetail`(`schemas/users.py`)→
  `api/users.py:_user_out` → 前端 `schema.d.ts`(api:gen 生成)+ `Users.tsx`
  详情抽屉。
- FreeRADIUS:镜像 `freeradius/freeradius-server:3.2.10`(Debian 基底),
  entrypoint 由 overlay 的 `deploy/freeradius/entrypoint.sh` 驱动,raddb 是
  文件级 overlay(未覆盖的文件用上游默认)。PEAP 默认走 mschap 内层。
- 本任务与 nas-ap-reload 任务共享 `entrypoint.sh`/compose 文件——**先完成
  nas-ap-reload(已含 supervisor 改造),本任务在其之上叠加 winbind 逻辑**,
  两者在 dev 分支上顺序提交,避免冲突。

## 方案 A 落地方案

### 1. FreeRADIUS 容器:winbind + ntlm_auth

- **Dockerfile**:追加安装 `winbind`、`samba-common-bin`、`krb5-user`(Debian
  包名以构建时 `dpkg -S ntlm_auth`/`command -v ntlm_auth` 实测为准——skill
  Currentness Rule)。
- **mods-available/mschap**:新增 overlay 文件 = 上游 3.2.10 原文件(构建时从
  镜像里取出做基线)+ 打开 `ntlm_auth` 行,指向
  `--request-nt-key --username=%{%{Stripped-User-Name}:-%{%{User-Name}:-None}}
  --challenge=%{%{mschap:Challenge}:-00} --nt-response=%{%{mschap:NT-Response}:-00}`
  (上游默认注释里就是这条)。Dockerfile 里 `ln -sf ../mods-available/mschap
  /etc/raddb/mods-enabled/mschap` 保证启用;authenticate 侧不用改——上游
  inner-tunnel 默认已含 mschap。
- **entrypoint.sh**(在 supervisor 改造后的版本上叠加,环境变量门控:AD join
  相关变量全空 = 完全跳过,保持纯 dev 场景零影响):
  1. 生成 `/etc/krb5.conf`(REALM/KDC 来自 env,keytab 路径固定);
  2. 生成 `/etc/samba/smb.conf`(workgroup=短域名,security=ADS,winbind 最小
     配置);
  3. 幂等 join:`net ads testjoin` 通过 → 跳过;否则
     `net ads join -U '<JOIN_USER>%<JOIN_PASSWORD>'`(密码仅来自 env,不回显);
  4. 启动 `winbindd`(supervisor 子进程之一);
  5. 冒烟:`ntlm_auth --username=... --password=... --domain=...` 若 join 账号
     可用则自检(失败不阻塞启动,只告警——join 账号可能无登录权限,不能当硬门槛)。
- **join 状态持久化**:compose 挂 named volume 到 `/var/lib/samba`(secrets.tdb、
  winbindd 缓存)+ 文件卷 `/etc/krb5.keytab`;容器重建后 `testjoin` 直接通过,
  密钥不落镜像/仓库。
- **DNS/时间**:compose freeradius 服务加 `dns:`(指向 AD DNS,env 可配);
  Kerberos 时间偏移由宿主机 NTP 保证,部署文档写明要求。

### 2. 后端:属性同步扩展(方案无关,两方案都要做)

- **Alembic 迁移**:`access_user` 加 `email varchar(128) default ''`、
  `mobile varchar(32) default ''`、`description varchar(256) default ''`
  (`autogenerate` 后人工核对;既有行回填空串)。
- **connector.py**:`AdUserEntry` 加 `mail`/`mobile`/`description: str = ""`。
- **ldap3_.py**:attributes 加 `mail`/`mobile`/`telephoneNumber`/`description`;
  mobile 取值 = mobile 非空 ? mobile : telephoneNumber(C-003)。
- **sync.py**:update 分支属性元组与 create 分支构造一并加三个字段;AD 侧禁用
  映射已存在(Q-101,不动)。
- **models/user.py**:三个 `mapped_column`。
- **schemas/users.py**:`UserOut` 加三字段(`UserDetail` 继承)。
- **api/users.py**:`_user_out` 透传三字段。
- **compiler.py**:顶部注释"由 seed/AD 写"改为与实现一致(AD 直通不写
  radcheck 密码行)。
- **配置偏差说明**:设计文档 §6 列了 `core/config.py` 需加域 join env——实测
  结论是 join 只发生在 freeradius 容器,backend 不消费这些变量,故 join 配置
  走 compose env(`RADIUS_AD_*` 前缀,与 `RADIUS_SQL_*` 模式一致),backend 的
  `OPENRADIUS_AD_*` 保持只读同步语义不动。此为对文档文件清单的合理偏离,
  在 build-log 记录。

### 3. 前端

- `schema.d.ts`:`bun run api:gen`(起本地 backend 后重新生成)。
- `src/api/resources/users.ts`:`UserDetailData` 类型加三字段。
- `src/pages/Users.tsx`:详情抽屉 Descriptions 加「邮箱/手机号/备注」行
  (列表页不加,避免列爆炸——设计文档 §5 允许)。

### 4. 文档同步

- `docs/06`「EAP 与证书」:改写为已实现的方案 A(winbind/ntlm_auth 直通,
  dev 仍 radcheck Cleartext-Password)。
- `docs/02`:`access_user` 字段表加三列。
- `docs/08`「数据安全」:口令字段结论改为实际方案(prod=AD 直通不落库)。
- `docs/07` 环境变量表:`OPENRADIUS_AD_*` 行更新 + 新增 `RADIUS_AD_*` join
  变量说明。
- `deploy/README.md`、`deploy/.env.example`:AD join 配置段。

## 被否决的替代方案

- 方案 B(rlm_ldap bind):用户已按客户端群体拍板否决(标准 Windows 域内机器)。
- 复用 radius 只读账号做 join:设计文档明确反对,用户确认走专门账号。
- 本地缓存密码哈希(NT-Password):违背目标 1(不存任何密码副本)。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 本地无真实 AD,无法全量验收 AC-1~AC-4 | 本地做到:镜像构建、`radiusd -XC` 配置校验、winbind/join 逻辑脚本审查 + 假 ntlm_auth 冒烟(证明模块接线);真实 AD 验收按 validation.md 清单交用户部署时执行 |
| 上游 mschap 配置随 3.2.x 版本漂移 | overlay 文件以当前基线 3.2.10 的实机文件为准(构建时提取),升级流程(06 已有 smoke 脚本)覆盖 |
| join 密码出现在进程参数(短暂) | `net ads join -U user%pass` 的固有行为;容器内仅 root 可见,凭据仅经 env 注入;文档注明风险与替代(交互式 join) |
| winbindd 与 supervisor 协同 | winbindd 作为受监督子进程,退出自动拉起;radiusd 重启不连带 winbindd(join 状态在磁盘) |
| 迁移回填 | 空串默认值,无历史数据猜测;迁移可回退(downgrade 掉列) |

## 验证策略

1. `cd backend && uv run pytest -q` + `ruff check`(单测:test_ad_sync.py 扩
   新字段断言;users API 响应断言)。
2. Alembic:`upgrade head` 在 SQLite(本地)与 PG(dev 栈)各跑一遍;
   `downgrade -1` 可回退。
3. 镜像构建 + `radiusd -XC` + 容器健康;env 门控(未配 AD 变量时行为与旧版
   一致,dev 栈回归)。
4. 假 ntlm_auth 冒烟:替换脚本恒成功 → radtest 用无 radcheck 行账号能
   Accept,证明 eap→mschap→ntlm_auth 接线(仅本地接线验证,不冒充真实 AD
   结论)。
5. `bun run verify`(前端)。
6. 真实 AD 验收清单(部署环节,用户执行):AC-1~AC-4 逐条 + 证据格式,写入
   validation.md。

## 影响文件

- `deploy/freeradius/Dockerfile` · `deploy/freeradius/entrypoint.sh` ·
  `deploy/freeradius/raddb/mods-available/mschap`(新增)
- `deploy/docker-compose.yml`/`.ghcr.yml`/`.offline.yml` · `deploy/.env.example` ·
  `deploy/README.md`
- `backend/src/openredius/models/user.py` + `backend/alembic/versions/<new>.py`
- `backend/src/openredius/ldap_sync/{connector,ldap3_,sync}.py`
- `backend/src/openredius/schemas/users.py` · `backend/src/openredius/api/users.py`
- `backend/src/openredius/radius/compiler.py`(注释)
- `backend/tests/unit/test_ad_sync.py` · `backend/tests/api/test_users.py`
- `src/api/schema.d.ts` · `src/api/resources/users.ts` · `src/pages/Users.tsx`
- `docs/02` · `docs/06` · `docs/07` · `docs/08`
