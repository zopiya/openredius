# M4 build log(会话/日志/报表/仪表盘数据面)

## 实测记录(2026-08-12,docker-in-docker + PG17 + FreeRADIUS 3.2.10)

### 数据面真实数据验证(30 天合成历史)
- `generate_history.py --days 30`:~60k radpostauth + ~33k radacct(日均 ~2k,
  失败 ~8%,按 02 归一类比例分布);SYNTH 标记幂等可重跑。
- `kpis`:online_sessions / auth_today / 成功率 / nas_online / locked_users 全部
  有值;`trend` today=10 分钟、7d=1 小时粒度,空桶补齐。
- `auth-logs`:radpostauth ⋈ 用户/NAS,归类器先 Class 后 Reply-Message,
  `reason=账号锁定`(中文或 key)过滤生效;CSV 导出带审计。
- `reports/summary` 三周期 donut、`departments` 部门准入率、`endpoint-types`
  终端类型占比;`export` 501(M7)。
- 仪表盘 alerts + read;jobs(nas_watchdog/lockout/cert_scan/alert_gc)单测覆盖,
  去重窗口内不重发。

### CoA / 计费闭环(09 场景 12–13)
- `acctclient` Start→radacct 行(acctstoptime NULL),Stop→关账。
- `coa_sink.py`(pyrad 假 NAS)收 Disconnect-Request 回 ACK;
  `POST /api/sessions/disconnect` 经后端 pyrad 客户端发出,sink 收到
  User-Name/Acct-Session-Id,后端兜底关账(Admin-Reset + backend-closed)。
- CoA 三路径(ACK/NAK+Error-Cause/timeout)单元实测通过。

## 关键坑与修复(已回写 docs/06)
1. **postauth 只写 4 列**:sed 扩 callingstationid/nasipaddress + schema 加列。
2. **class 子段只开 reply_xlat → accounting INSERT 缺值报 UNDEFINED COLUMN**:
   需同时开 `packet_xlat` 且 radacct 加 class 列。
3. **官方计费 INSERT 用 ON CONFLICT(AcctUniqueId) + NULLIF**:acctuniqueid 需
   UNIQUE;acctstoptime/acctterminatecause/framedip/v6 系列须可空——否则 NOT NULL
   冲突静默丢计费。
4. **`CAST(inet AS varchar)` 得 CIDR(`127.0.0.2/32`)**:与 nasname 等值连接失配;
   统一 `ip_text()`(PG `host()` / SQLite 原样)。
5. **pyrad wheel 无字典**:自带最小 radius.dict;`coa_sink` 回包须设 reply.source/fd。
6. **BigInteger 主键在 SQLite 不自动 rowid**:`with_variant(Integer,"sqlite")`。
7. **SQLite `/` 整数除法**:SQLAlchemy `/` 会补 `+0.0`,用 `//`(trend 分桶)。
8. **jobs 会干扰测试**:`jobs_enabled=false` 注入 API/集成 settings。
9. **history off-by-one**:`days` 须含今日(`-(days-1)` 起),否则 today 全 0。

## 验收
```
uv run pytest -q               # 146 passed, 9 deselected
uv run pytest -m integration -q  # 9 passed(场景 9–13)
curl /api/dashboard/kpis /api/sessions /api/auth-logs?reason=账号锁定  # 形状符合 03
```

## 评审后修复(2026-08-12,reviewer 意见)

- W1 归类器增 account-disabled 桶(账号已停用),消除"显示其他但过滤不可见"
  的口径黑洞;02 归类表同步。
- W2 文档对齐:radpostauth 不落 Reply-Message,归类运行时仅 Class;02/06
  改为"正则回退为未来扩展保留",原生拒绝计其他(不再承诺密码错误归类)。
- W3 lockout 仅作用于 ACTIVE 账号(DISABLED 不再被锁→解锁"复活")。
- W4 06 记录 RFC 5176 ACK 丢失边角(重试 NAK 405 记 failed,会话实际已断)。
- nit:disconnect 批量上限 50(串行关账防代理超时)、去掉误导性 duration
  排序别名、alerts read 补审计、06 修正 class 列旧描述。
- 复验:pytest 150 + integration 9 全绿,ruff 干净;bun verify 21 绿。
