# 06 · FreeRADIUS 集成设计

## 版本与镜像

- 基线:FreeRADIUS **3.2.x** 官方镜像 `freeradius/freeradius-server:latest`(构建时校验
  `radiusd -v` 并记录到 deploy/README)。
- 本项目构建本地镜像 `openredius/freeradius`(`deploy/freeradius/Dockerfile`):

```dockerfile
FROM freeradius/freeradius-server:latest
COPY raddb/ /etc/raddb/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 1812/udp 1813/udp
ENTRYPOINT ["/entrypoint.sh"]
CMD ["radiusd", "-X"]
```

- `entrypoint.sh`:对 `/etc/raddb/mods-available/sql` 等清单文件执行 `envsubst`
  (仅 `$RADIUS_SQL_HOST/$RADIUS_SQL_PORT/$RADIUS_SQL_USER/$RADIUS_SQL_PASSWORD/$RADIUS_SQL_DB`),
  然后 `exec "$@"`。密钥不落仓库。

## PostgreSQL 初始化(deploy/postgres/init.sql)

1. `CREATE SCHEMA radius;`
2. 载入官方 `schema.sql`(postgresql 版)到 `radius` schema
   (radacct/radcheck/radreply/radgroupcheck/radgroupreply/radusergroup/radpostauth/nas/nasreload)。
3. `CREATE ROLE radius LOGIN PASSWORD '<env>';` + 授权 `radius` schema 全部表。
4. `ALTER ROLE radius SET search_path = radius;`(rlm_sql 连接免前缀)
5. 应用角色 `openredius` 同时拥有 `public` 与 `radius` 两 schema 的读写权(后端跨 schema join)。

## rlm_sql 关键配置(mods-available/sql)

```
sql {
    driver = "rlm_sql_postgresql"
    server = "${env:RADIUS_SQL_HOST}"
    port = ${env:RADIUS_SQL_PORT}
    login  = "${env:RADIUS_SQL_USER}"
    password = "${env:RADIUS_SQL_PASSWORD}"
    radius_db = "${env:RADIUS_SQL_DB}"
    acct_table1 = "radacct"
    acct_table2 = "radacct"
    postauth_table = "radpostauth"
    authcheck_table = "radcheck"
    authreply_table = "radreply"
    groupcheck_table = "radgroupcheck"
    groupreply_table = "radgroupreply"
    usergroup_table = "radusergroup"
    client_table = "nas"
    read_clients = yes          # 启动时从 nas 表加载客户端(v3 不支持热加载)
    post-auth { postauth = yes }
}
```

`mods-enabled/` 启用 sql 与 eap;`sites-enabled/default` 的 authorize / accounting /
post-auth 各阶段加入 `sql`,authenticate 启用 eap。

## NAS 客户端生命周期

- 设备管理 CRUD → 写 `radius.nas`(nasname=IP, shortname=名称, secret, type, description)。
- **变更后必须重启 freeradius 容器**(`read_clients` 仅启动时读取)。后端流程:
  1. 写库成功;2. 调用 `POST /api/ops/reload-radius`(docker socket 可用则自动
  `docker restart openredius-freeradius`,否则响应提示手动重启);3. 前端 toast 说明。
- 删除 NAS 前校验无活跃会话(03 已定义)。

## 策略消费:unlang 设计(authorize,在 sql 之后)

策略编译器把策略组写入 `radgroupcheck/radgroupreply`(见 04)。运行时由自定义块
`policy-openredius`(sites-enabled/default authorize 内,sql 之后)消费:

1. 取当前用户生效策略标记(应用库 public 侧为事实来源):
   `%{sql: SELECT flags_csv FROM public.v_user_policy_flags WHERE account = '%{SQL-User-Name}'}`
   → 写入暂存属性 `control:Tmp-String-0`(格式 `mac,edr,time:08:00-20:00`)。
   视图 `v_user_policy_flags` 由 Alembic 维护(取 enabled、priority 最高的策略组)。
2. 逐标记检查(失败即 reject,并设 `reply:Class = "reason=<key>"` 与中文 Reply-Message):
   - `mac` → 该用户名下 endpoints 无此 MAC → `reason=mac-unbound`
   - `edr` → endpoints.compliance='bad' → `reason=non-compliant`
   - `time:` → `%{Time}` 窗口外 → `reason=time-policy`
   - 证书过期(eap-tls 场景)→ endpoints.cert_not_after < now → `reason=cert-expired`
3. MAC 规范化:统一大写并把 `-`/`.` 转 `:`(SQL 函数 `public.norm_mac(text)`,Alembic 建)。

实施注:unlang 内联 SQL 的转义与 `%{...}` 展开须在 M3 用 `radiusd -XC` 实测修正;
本文件给出的语义是验收标准,语法细节允许调整(变更需回写本文档)。

### M3 实测修正记录(语义不变,语法与实现如下)

- **用户标识**:mod_authorize 结束时 rlm_sql 会 `sql_unset_user` 清掉
  SQL-User-Name,后续模块无法引用;内联 SQL 一律改用
  `LOWER('%{User-Name}')`(rlm_sql 的 escape 会转义引号等非法字符,账号侧
  统一小写存储)。
- **MAC 检查**:仅在请求携带 Calling-Station-Id 时执行(radtest 不带;真实
  802.1X NAS 必带),缺省视为通过。
- **时间窗**:窗口提取与比较合并在一条 SQL 内(`regexp_replace` + `BETWEEN`,
  `now() AT TIME ZONE 'UTC'`),unlang 只做分支;正则不能写 `{2}` 量词——
  花括号会破坏 `%{...}` 配对,用 `[0-9][0-9]` 等价替换。
- **Class 入库**:Class 属性是 octets,rlm_sql 直接存会落 0x-hex;编译器与
  unlang 拒绝路径同时写 string 镜像属性 `OpenRedius-Deny-Reason`
  (dictionary.openredius,本地属性号 3001),radpostauth 的 class 列经
  queries.conf 的 `class.column_name/reply_xlat` 机制记录该镜像值;
  sql 模块 `safe_characters` 追加 `=`,保证 `reason=<key>` 原样入库。
- **sql 模块配置**:必须 `$INCLUDE ${modconfdir}/sql/main/postgresql/queries.conf`
  (否则 authorize/group 查询全部缺失);配置段定义在 include 之前无法覆盖
  include 内同名段,需改 queries.conf 时用 Dockerfile sed。
- **sites 补丁**:entrypoint 用分区感知 awk 向 default 站点插入
  `sql`/`policy-openredius`(authorize `files` 后)、`sql`(accounting `detail`
  后、post-auth 顶部与 Post-Auth-Type REJECT 内),锚点缺失即启动失败;
  v3.2.10 的拒绝段名为 `Post-Auth-Type REJECT`(非 REJECTED)。
- **自定义字典**:radgroupcheck 的组级标记属性 `OpenRedius-Flags`(本地属性号
  3000,仅 control 面)需 `dictionary.openredius` 定义并经主 dictionary
  `$INCLUDE`,否则 rlm_sql 解析组属性失败拒绝认证。
- **其他**:镜像内二进制为 `freeradius`(补 `radiusd` 符号链接);配置目录权限
  收紧至 755/644(FreeRADIUS 安全检查拒绝 group-writable);`clients.conf`
  覆盖为空客户端列表(NAS 表单一来源,避免与内置 localhost 客户端冲突);
  挂载 certs 目录遮蔽上游证书时,entrypoint 自签兜底。

## 失败原因 Class 约定(与 02 归类一致)

| 场景 | Class 来源 |
|---|---|
| 账号锁定 | 编译器写 radreply:`Class = "reason=account-locked"`, `Reply-Message = "Account locked (…)"` |
| MAC 未绑定 / 时间策略 / 不合规 / 证书过期 | unlang 拒绝路径设置 |
| 密码错误 | FreeRADIUS 原生拒绝;后端按 Reply-Message 正则归类 |
| Accept | Class 可携带策略快照(可选) |

radpostauth 的 `class` 列默认记录 `%{reply:Class}`(v3.2 post-auth 查询已含),无需改表。

## EAP 与证书(dev)

- `deploy/freeradius/certs/gen.sh`(openssl):自签 CA + 服务器证书(CN=OpenRedius-Dev,
  SAN 含 localhost),输出 ca.pem/server.pem/server.key → 挂载 `/etc/raddb/certs`。
- eap 模块启用 `peap` 与 `tls` 子模块;dev 演示以 PEAP-MSCHAPv2 为主
  (radcheck 存 `Cleartext-Password`;prod/AD 模式可切 NT-Password 或 rlm_ldap 直通)。
- EAP-TLS 完整链路(客户端证书)列为 M3 验收可选项,不阻塞主线。

## CoA / Disconnect(RFC 5176)

- 方向:backend → NAS UDP/3799(NAS 需开启 CoA server;配置样例见 deploy/README
  的"真实 NAS 接入清单")。
- Disconnect-Request 属性:`User-Name`、`NAS-IP-Address`、`Acct-Session-Id`
  (建议同时携带 `Calling-Station-Id` 增强匹配)。
- 响应:Disconnect-ACK(成功)/ Disconnect-NAK(失败,读 Error-Cause)/ 超时。
  实现与兜底见 04 CoA 客户端。
- dev 验证替代物:`deploy/scripts/coa_sink.py`(pyrad 假 NAS CoA 监听,回 ACK),
  供无真实设备时做集成测试。

## 演示与联调数据

- `backend/scripts/seed_demo.py`:原型数据集(见 02/04)+ 最近 7 天 radpostauth/radacct
  合成历史(量级:日均 ~2k 认证、失败占比 ~8%,按 02 归一类分布)。
- `deploy/scripts/demo_traffic.py`:持续模式每 N 秒写入合成认证/计费事件,
  让仪表盘"30 秒自动刷新"可见(仅 dev 使用,默认关闭)。
- 真实闭环:容器内 `radtest`(示例:
  `docker compose exec freeradius radtest wang.lei <pwd> localhost 0 testing123-dev`)。

## 参考(调研原始来源)

- 官方 PostgreSQL schema:`raddb/mods-config/sql/main/postgresql/schema.sql`(GitHub master)
- sql 模块配置:`raddb/mods-available/sql`(含 `read_clients`/`client_table` 语义:仅启动读取)
- 官方镜像用法:Docker Hub `freeradius/freeradius-server`(COPY raddb/ 到 /etc/raddb)
- RFC 5176(Dynamic Authorization Extensions to RADIUS)
- pyrad(pyradius/pyrad, PyPI 2.5.4):CoAPacket/DisconnectPacket 支持已确认
