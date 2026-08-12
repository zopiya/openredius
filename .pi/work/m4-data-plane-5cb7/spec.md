# M4 · 会话/日志/报表/仪表盘数据面

**目标**:所有"读真实数据"的接口完成,CoA 强制下线可用(含 sink 测试)。

**必读**:02(映射/归类)、03(契约)、04(CoA/jobs)、06(CoA/演示数据)、09(场景 12–13)。

**分支**:`feat/m4-data-plane`。**基线**:main(M3 已合入,CI 绿)。

## 范围(roadmap M4 九项任务)

1. 会话服务:active radacct ⋈ access_user/nas_device/policy → `SessionRow`;筛选
   (dept/method/nas/vlan/auth/q);详情(按 acctuniqueid);CSV 导出。
2. CoA 客户端(`radius/coa.py`,pyrad 2.5.4,线程池)+ `POST /api/sessions/disconnect`
   + ACK 后轮询 radacct,未 stop 兜底关账(`Admin-Reset`,标记 backend-closed)。
3. 认证日志:radpostauth ⋈ access_user → `LogRow`;失败原因归类器(02 表,先
   Class 后 Reply-Message);详情;CSV 导出。
4. 报表:`reports/summary?period`、`endpoint-types`、`departments`(03)。
5. 仪表盘:`kpis`、`trend?range=today|7d`、`alerts?limit` + `alerts/{id}/read`。
6. jobs(APScheduler):lockout_sweeper(60s)、cert_scan(1h)、nas_watchdog(60s)、
   alert_gc(每日);调度器随 lifespan 启停。告警引擎产出 alert_event(去重窗口)。
7. `scripts/generate_history.py`:30 天合成历史(09 量级);seed_demo 追加最近 7 天
   (06);`deploy/scripts/demo_traffic.py` 持续模式。
8. `deploy/scripts/coa_sink.py`(pyrad 假 NAS);集成测试 09 场景 12–13。
9. pytest:归类器 / 报表聚合 / KPI 计算。

## 关键设计

- **radius 表读**:沿用 `radius/tables.py` 的 `build_radius_metadata`(PG=radius
  schema,SQLite=主库),新增 radacct/radpostauth Core 表。读服务统一走
  `radius_readable(db)` 探测;SQLite 单测库无 radius 表时返回空页/零值,不 500。
- **归类器** `services/reason.py`:纯函数,优先看 `class` 的 `reason=<key>`,
  回退 Reply-Message 正则;输出(归一类中文、键、tone)。单测覆盖 02 全部类。
- **CoA**:`pyrad.client.Client` + `DisconnectPacket`;属性 User-Name、
  NAS-IP-Address、Acct-Session-Id、Calling-Station-Id;`anyio.to_thread` 包装;
  重试 1 次;ACK/NAK(Error-Cause)/timeout;并发上限 8。
- **NAS 在线判定**:`nas_online_window`(默认 300s)内有 radpostauth/radacct 记录。
- **锁定引擎**:lockout_sweeper 扫最近 window 内 Reject(radpostauth)≥max_fails →
  status=locked + locked_until;到期自动解锁。阈值取 settings(02/04)。
- **告警去重**:同 rule_key+subject 在去重窗口(默认 10 分钟)内不重复产生 event。
- **DTO 命名**:与 03 一致(`SessionRowOut` 等);前端 M5 由 OpenAPI 生成。

## 验收

```bash
cd backend && uv run pytest -q && uv run pytest -m integration -q
# curl /api/dashboard/kpis、/api/sessions、/api/auth-logs?reason=账号锁定 形状符合 03
```

## 实测前置(已确认)

- 3.2.10 的 postauth_query 仅写 username/pass/reply/authdate/class;
  callingstationid/nasipaddress 需经 Dockerfile sed 扩展该 INSERT 并给
  schema.sql 的 radpostauth 加 `nasipaddress` 列(calledstationid/
  callingstationid 已有)。schema 变更 → compose 需 `down -v` 重建。
- radtest 无 Calling-Station-Id/NAS-IP-Address → xlat 落空串,归类与展示
  需容忍空值。

## 风险与注记

- 合成历史写 radius schema(PG 专属);SQLite 侧 API 返回空而不报错。
- pyrad 为同步阻塞,必须线程池调用,避免阻塞事件循环。
- CoA 兜底关账仅在 ACK 后执行;NAK/timeout 不关账(前端提示失败原因)。
