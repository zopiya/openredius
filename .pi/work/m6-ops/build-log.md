# M6 运维能力 — 构建日志

## 实现

### AD 同步引擎(fixture-driven)

`backend/src/openredius/ldap_sync/`:

- `connector.py`:AdConnector(抽象 fetch+close)+AdUserEntry 数据类。
  测试注入 `_MockConnector`,生产用 `Ldap3Connector`(ldap3 + anyio.to_thread 卸载)。
- `sync.py`:`run_ad_sync(db, settings, connector, triggered_by, actor)`。
  - 创建 `ad_sync_job`(RUNNING→SUCCESS/FAILED)
  - `whenChanged` 增量:取上次成功 job 的 `finished_at`→LDAP filter
  - `_process_users`:AD entries→三分支
    - **added**:不在 local DB 的→新建 ACTIVE
    - **updated**:属性变更(name/dept/title/ad_dn)→刷新
    - **disabled**:AD disabled 标记 OR local DB 有但 AD 无→置 DISABLED
  - local 用户(非 AD source)不碰
  - 跳过 bootstrap_admin(与 own 账户冲突)
  - 完成后→compile_policies(触发 radius sync)

`ldap3_.py`:真实 LDAP 实现。ldap3 Connection 同步 API,`_safe_str()/_safe_uac()`
容错缺失属性。`Ldap3ConnectorCtor` 工厂。

### API 端点

`api/users.py` 新增(权限:admin):

- `POST /sync-ad`:返回 `AdSyncResult{triggered,message}`,fire-and-forget
  后台任务(each future 使用独立的 db session)。
- `GET /sync-records`:AdSyncJob 分页列表(按 started_at 倒序)
- `GET /sync-records/{id}`:详情(含 error)

### 调度器

`jobs/scheduler.py`:
- `_run_ad_sync_cron(settings)`:cron 调度的 AD sync(triggered_by=CRON)
- `OPENRADIUS_AD_URL` 空则跳过(不注册 job)

### 告警 enabled gate

`services/alerts.py`:`_rule(key)` 现在检查 `rule.enabled`→False 时返回 None,
所有调用点(nas_watchdog/lockout_sweeper/cert_scan)通过 None 检查自然跳过。

## 验收

```bash
cd backend && uv run ruff check .       # All checks passed
uv run pytest -q                        # 158 passed
uv run pytest -m integration -q         # 9 passed
cd .. && bun run verify                 # TS + smoke + 21 pass
```

## 关键设计选择

- **Fixture-driven AD**:AdConnector Protocol 允许单元测试注入 mock 数据,
  不依赖真实 LDAP 服务器。
- **whenChanged 增量**:只取上次成功同步时间之后变更的 AD 条目,
  首次运行拉全量。
- **同步只禁用不删除**:AD 同步从不禁用本地账户,仅置 DISABLED(可恢复+审计追踪)。
- **fire-and-forget POST sync-ad**:立即返回,后台执行;调用方轮询 sync-records。
