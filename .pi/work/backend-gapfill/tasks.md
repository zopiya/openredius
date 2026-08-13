# Backend 缺失功能补齐 — 任务清单(全部完成)

## 依赖
- [x] 0.1 `uv add openpyxl reportlab`

## G1 报表导出 pdf/xlsx
- [x] 1.1 `services/report_export.py`:三模块 → xlsx(多表)/ pdf(多节)/ csv
- [x] 1.2 `api/reports.py` export 分派 + `format` 校验 + StreamingResponse
- [x] 1.3 测试:pdf/xlsx/csv 非空 + 含关键字;bogus format 501

## G2 批量 CoA 重授权
- [x] 2.1 `radius/coa.py` 抽象发送函数 + `reauthorize_session`(CoARequest)
- [x] 2.2 `api/sessions.py` `POST /reauthorize` + schema + 审计
- [x] 2.3 测试:CoARequest code + 端点形状

## G3 AD 直通 + NT-Password 委派登录
- [x] 3.1 `core/ntlm.py` 手写 MD4 + `ntlm_hash` + 单测(已知向量)
- [x] 3.2 `ldap_sync` 内 `bind_auth`(ldap3 bind 校验)
- [x] 3.3 `services/auth.py` 委派链扩展 Cleartext→NT-Password→AD bind
- [x] 3.4 测试:NT 哈希 + AD 成功/失败

## G4–G7 预留
- [x] 4.1 `api/portal.py` 501 占位路由(根 + catch-all)
- [x] 5.1 `services/alerts.py` AlertSink 协议抽象(DbAlertSink 默认)
- [x] 6.1 `/api/health` 增补 version/uptime + `/api/metrics` 501 占位
- [x] 7.1 coa.py 多实例 server 注释说明(不改行为)

## G8 覆盖核对
- [x] 8.1 生成 coverage.md(docs/03 端点 ↔ 后端路由 ↔ 前端调用对照)

## 验证
- [x] 9.1 ruff check + format
- [x] 9.2 `uv run pytest -q` 全绿(176 passed / 9 deselected)
- [x] 9.3 `uv run alembic upgrade head`(token_version 迁移在链)
- [x] 9.4 OpenAPI 冒烟:reports/export、sessions/reauthorize、portal、metrics、health 可见
