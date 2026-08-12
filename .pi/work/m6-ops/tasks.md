# M6 运维能力(AD 同步/告警/任务) — 完成

- [x] `ldap_sync/connector.py`:AdConnector 抽象 + AdUserEntry 数据类(可脱离真实 AD 测试)
- [x] `ldap_sync/sync.py`:run_ad_sync——whenChanged 增量、三分支(added/updated/disabled)、
      错误捕获→FAILED job、去重(AD→local 映射)、ad_dn 追踪、编译触发
- [x] `ldap_sync/ldap3_.py`:ldap3 同步连接器(+ anyio.to_thread 线程卸载);
      UAC 0x2→disabled 标记
- [x] `api/users.py` 增:
  - `POST /api/users/sync-ad`→异步后台 AdSyncResult
  - `GET /api/users/sync-records`→job 分页列表
  - `GET /api/users/sync-records/{id}`→单条详情
- [x] `jobs/scheduler.py` 增 ad_sync cron(job + Ldap3ConnectorCtor;
      OPENRADIUS_AD_URL 空则跳过)
- [x] `services/alerts.py`:_rule() 尊重 enabled 字段(False→None,跳过触发)
- [x] `schemas/users.py`:新增 AdSyncResult / AdSyncJobOut
- [x] tests:8 用例——三分支 added/updated/disabled、local 不碰、AD disabled、noop、
      connector 异常→FAILED、job 记录(158→158 单测/API→166 单测/API)
