# M4 tasks — 全部完成(2026-08-12)

- [x] radius/tables.py:radacct/radpostauth Core 映射(INET variant、class 列、
      radius_table/ip_text/radius_meta/radius_readable helpers)
- [x] schema.sql + Dockerfile sed:postauth INSERT 扩 callingstationid/nasipaddress;
      class 子段开 packet_xlat;radacct +class 列、acctuniqueid UNIQUE、
      可空化官方 NULLIF 列;framedipv6address DEFAULT '::'
- [x] services/reason.py:失败原因归类器(02 表)+ 6 单测
- [x] services/sessions.py + api/sessions.py:list(筛选)/detail/export.csv
- [x] radius/coa.py:pyrad Disconnect(自带 radius.dict、线程池、重试、ACK/NAK/timeout)
- [x] POST /api/sessions/disconnect:逐个 CoA + 兜底关账 + 审计(含 not-found)
- [x] services/authlogs.py + api/auth_logs.py:list(归类筛选)/detail/export.csv
- [x] services/reports.py + api/reports.py:summary/endpoint-types/departments/501
- [x] services/dashboard.py + api/dashboard.py:kpis/trend/alerts/read
- [x] services/alerts.py:nas_watchdog/lockout_sweeper/cert_scan/alert_gc + 去重
- [x] jobs/scheduler.py:APScheduler 随 lifespan 启停(jobs_enabled 可关)
- [x] services/history.py + scripts/generate_history.py(30 天,SYNTH 标记幂等)
- [x] seed_demo 追加 7 天历史;deploy/scripts/demo_traffic.py(--once/--reset)
- [x] deploy/scripts/coa_sink.py(回包 source/fd 修正)
- [x] user detail recent_auth;NAS 列表 status/active_sessions/load_pct 派生 + filter
- [x] 集成测试 09 场景 12(acct start/stop)与 13(CoA sink 断线+关账)
- [x] 文档回写:roadmap/03/04/06/09、deploy/README、.env.example、build-log
