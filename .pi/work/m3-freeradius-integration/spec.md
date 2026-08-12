# M3 · FreeRADIUS 集成 — spec

## 目标

真实认证闭环:radtest/radclient 通过,策略编译下发生效,NAS 表驱动客户端。
roadmap M3 全部任务;验收见 roadmap(Compose 栈 + radtest + pytest -m integration)。

## 范围与关键设计决策

### 1. radius schema 表映射(`radius/tables.py`)

- SQLAlchemy Core Table:radcheck/radreply/radgroupcheck/radgroupreply/radusergroup/nas
  (列按 deploy/postgres/init/schema.sql 官方结构;radacct/radpostauth 属 M4)。
- **schema 参数化**:`build_radius_metadata(schema)` — PG 下 `"radius"`;SQLite 下
  `None`(表落主库),使编译器逻辑可进单测套件(09 场景 1)。

### 2. 策略编译器(`radius/compiler.py`,替代 M2 占位)

全量幂等编译 `compile_all`(单事务,diff by 键,写 audit `policy.compile`):

| 来源 | 产物 |
|---|---|
| enabled 策略 | `radgroupreply`(groupname=`policy_<slug>`):Tunnel-Type=VLAN(:=)、Tunnel-Medium-Type=IEEE-802(:=)、Tunnel-Private-Group-Id=<vid>(:=);Filter-Id(acl≠空)、Session-Timeout、WISPr-Bandwidth-Max-Up/Down(mbps→bps)|
| 策略标记 | `radgroupcheck`:`OpenRedius-Flags := mac,edr,time,cert`(04 组级标记;运行时事实来源仍是 public 视图,06)|
| 用户分配 | `radusergroup`(account, policy_<slug>, priority)|
| status=locked | radcheck `Auth-Type := Reject` + radreply `Class := reason=account-locked`、`Reply-Message := Account locked` |
| status=disabled | 同上 Class `reason=account-disabled` |
| 策略停用 | 该组产物经 diff 删除(保留定义)|

触发点:policy 保存/启停/reorder/delete、users 批量状态/分配、ops 全量重编。
SQLite(dev)下跳过 radius 写入(dialect 守卫),占位审计照写。

### 3. NAS → radius.nas 同步

devices API 写库后同步 radius.nas(nasname=IP、shortname=name、secret、type、
description);删除 NAS 同步删行。响应 `reload_required=true`(已硬编码,语义成立:
read_clients 仅启动时读取)。

### 4. ops API

- `POST /api/ops/reload-radius`(03 已有契约,admin):执行
  `OPENRADIUS_RADIUS_RELOAD_COMMAND`(dev=`docker compose -f deploy/docker-compose.dev.yml restart freeradius`);
  未配置 → `{mode:"manual"}` 提示手动;审计 `ops.reload_radius`。
- `POST /api/ops/compile`(M3 新增,03 内联注记):全量重编,幂等。

### 5. FreeRADIUS 镜像与配置(`deploy/freeradius/`)

- Dockerfile:`freeradius/freeradius-server:latest` + COPY raddb 覆盖层 + entrypoint;
  构建后记录 `radiusd -v` 到 deploy/README。
- entrypoint.sh:envsubst(仅 RADIUS_SQL_* 5 变量)→ 对 sites-enabled/default 做
  带锚点 sed 补丁(authorize 插 `sql`+`policy-openredius`、accounting/post-auth 插
  `sql`,含 Post-Auth-Type REJECTED 内,保证拒绝也落 radpostauth);锚点缺失即
  `exit 1`(fail fast,`radiusd -XC` 冒烟兜底)。
- policy.d/openredius:按 06 消费 `v_user_policy_flags`(flags_csv=mac,edr,time:HH:MM-HH:MM,cert):
  - mac:无 CSID 匹配 endpoints → reject `reason=mac-unbound`
  - edr:compliance='bad' → `reason=non-compliant`
  - time:UTC 当前时刻窗外 → `reason=time-policy`(窗口比较在 SQL 内做,unlang 只做分支)
  - cert:cert_not_after < now(仅在有值时)→ `reason=cert-expired`
  - 拒绝时 `reply:Class=reason=<key>` + 中文 Reply-Message;06 实施注允许语法调整。
- certs/gen.sh:自签 CA + server 证书(CN=OpenRedius-Dev,SAN=localhost/127.0.0.1),
  输出 ca.pem/server.pem/server.key;eap 用上游默认配置(certdir 指向同名文件)。

### 6. dev compose

freeradius 服务(build ./freeradius、1812/1813 udp、RADIUS_SQL_* env、
depends_on postgres healthy、healthcheck `radiusd -CX` 配置校验)。
postgres init 增补:dev 测试客户端 `127.0.0.1/testing123-dev` 写入 radius.nas
(首启即存在,radtest 直连)。

### 7. seed_demo 增补

- 所有演示用户写 radcheck `Cleartext-Password := <SEED_USER_PASSWORD>`(PG only,
  常量口令文档化;seed 清 radius 编译产物但保留 nas 表)。
- seed 结束调 compile_all。

### 8. 迁移 3

视图 v_user_policy_flags 增补 `cert` 标记(require_cert);flags_csv 顺序
mac,edr,time:…,cert。

### 9. radtest 与 MAC 绑定冲突(验收调整,需回写 roadmap)

radtest 固定携带 Calling-Station-Id=02:00:00:00:00:01(待容器实测确认),而
wang.lei(rd 策略)有 mac 绑定标记 → 字面 `radtest wang.lei` 会被正确拒绝
(mac-unbound)。验收改为双路径:
1. `radtest li.na …`(staff 策略无标记)→ Accept + VLAN-10;
2. `radclient` 携 `Calling-Station-Id=3C:52:82:1A:4B:01` 测 wang.lei → Accept + VLAN-20。
(若实测 radtest 不带 CSID,mac 标记在 CSID 缺省时视为通过,验收回到字面命令——以实测为准。)

### 10. 集成测试(pytest -m integration,09 场景 9–11)

- 前置:compose 栈在跑;缺栈 skip(非 fail)。
- 9:radtest li.na Accept + Tunnel-Private-Group-Id;radclient wang.lei(绑定 MAC)Accept。
- 10:API 停用 wang.lei → Reject;锁定 → Reject 且 Class=account-locked;恢复。
- 11:API 给 staff 策略设置已过去的时间窗 → radtest li.na Reject reason=time-policy;恢复。
- pyproject:`addopts = -m "not integration"`(默认套件排除,`-m integration` 显式跑)。

## 延后项

- CoA 客户端 + coa_sink(04/06,M4 会话下线)、demo_traffic.py(M4)、
  radpostauth/radacct 映射与合成历史(M4)、EAP-TLS 客户端证书全链路(06 可选项)。

## 验收命令

见 roadmap M3 验收节 + `cd backend && uv run pytest -m integration -q`。
