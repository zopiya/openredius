# docs/03 端点覆盖核对(G8)

图例:✅ 后端已实现 · ⚠️ 后端实现但前端(main 基线)未接 · 🆕 本轮新增 · 🔒 预留(501)

## 认证与会话

| 方法 路径 | 后端 | 前端调用 | 状态 |
|---|---|---|---|
| POST /api/auth/login | auth.py | ✅ | ✅ |
| POST /api/auth/refresh | auth.py | ✅ | ✅ |
| POST /api/auth/logout | auth.py | ✅ | ✅ |
| GET /api/auth/me | auth.py | ✅ | ✅ |
| PUT /api/auth/me/password | auth.py | ❌ | ✅ |
| GET/POST/PATCH/DELETE /api/auth/admins | admins.py | ❌ | ✅ |

## 仪表盘

| 方法 路径 | 后端 | 前端 | 状态 |
|---|---|---|---|
| GET /api/dashboard/kpis | dashboard.py | ✅ | ✅ |
| GET /api/dashboard/trend | dashboard.py | ✅ | ✅ |
| GET /api/dashboard/alerts | dashboard.py | ✅ | ✅ |
| POST /api/dashboard/alerts/{id}/read | dashboard.py | ❌ | ✅ |

## 会话

| 方法 路径 | 后端 | 前端 | 状态 |
|---|---|---|---|
| GET /api/sessions | sessions.py | ✅ | ✅ |
| GET /api/sessions/{acct_unique_id} | sessions.py | ❌ | ✅ |
| POST /api/sessions/disconnect | sessions.py | ✅ | ✅ |
| POST /api/sessions/reauthorize | sessions.py | ❌ | 🆕 |
| GET /api/sessions/export.csv | sessions.py | ❌ | ✅ |

## 认证日志

| 方法 路径 | 后端 | 前端 | 状态 |
|---|---|---|---|
| GET /api/auth-logs | auth_logs.py | ✅ | ✅ |
| GET /api/auth-logs/{id} | auth_logs.py | ❌ | ✅ |
| GET /api/auth-logs/export.csv | auth_logs.py | ❌ | ✅ |

## 用户

| 方法 路径 | 后端 | 前端 | 状态 |
|---|---|---|---|
| GET /api/users | users.py | ✅ | ✅ |
| GET /api/users/{account} | users.py | ❌ | ✅ |
| POST /api/users/status | users.py | ✅ | ✅ |
| POST /api/users/policy | users.py | ✅ | ✅ |
| POST /api/users/sync-ad | users.py | ✅ | ✅ |
| GET /api/users/sync-records(/{id}) | users.py | ❌ | ✅ |

## 策略

| 方法 路径 | 后端 | 前端 | 状态 |
|---|---|---|---|
| GET /api/policies | policies.py | ✅ | ✅ |
| GET/POST/PUT/PATCH/DELETE /api/policies(/{id}) | policies.py | ❌(写) | ✅ |
| POST /api/policies/reorder | policies.py | ✅ | ✅ |

## 设备

| 方法 路径 | 后端 | 前端 | 状态 |
|---|---|---|---|
| GET /api/devices/nas | devices.py | ✅ | ✅ |
| POST/PATCH/DELETE /api/devices/nas(/{id}) | devices.py | ❌ | ✅ |
| GET /api/devices/nas/{id}/secret | devices.py | ❌ | ✅ |
| GET /api/devices/nas/{id}/ports|ssids | devices.py | ❌(mock) | ✅ |
| GET /api/devices/endpoints | devices.py | ✅ | ✅ |
| POST/PATCH /api/devices/endpoints(/{mac}) | devices.py | ❌(写) | ✅ |
| POST /api/devices/endpoints/import | devices.py | ✅ | ✅ |
| DELETE /api/devices/endpoints/{mac}/whitelist | devices.py | ✅ | ✅ |
| POST /api/devices/endpoints/{mac}/revoke-cert | devices.py | ✅ | ✅ |

## 报表

| 方法 路径 | 后端 | 前端 | 状态 |
|---|---|---|---|
| GET /api/reports/summary | reports.py | ✅ | ✅ |
| GET /api/reports/endpoint-types | reports.py | ✅ | ✅ |
| GET /api/reports/departments | reports.py | ✅ | ✅ |
| GET /api/reports/export?format=csv\|xlsx\|pdf | reports.py | ❌(纯 toast) | 🆕 xlsx/pdf |

## 设置 / 审计 / 运维

| 方法 路径 | 后端 | 前端 | 状态 |
|---|---|---|---|
| GET/PUT /api/settings | settings.py | ✅(get) | ✅ |
| GET/PUT /api/settings/alert-rules | settings.py | ❌ | ✅ |
| GET /api/audit(+/export.csv) | audit.py | ❌ | ✅ |
| GET /api/health | ops.py | — | ✅(扩展 version/uptime) |
| POST /api/ops/reload-radius | ops.py | ❌ | ✅ |
| POST /api/ops/compile | ops.py | ❌ | ✅ |

## 预留(本轮新增)

| 方法 路径 | 说明 |
|---|---|
| /api/portal/{path:path} | 🔒 访客门户/自助改密(docs/01)501 |
| /api/metrics | 🔒 Prometheus(docs/07)501 |

## 结论

docs/03 契约端点后端 **100% 实现**;本轮补齐 xlsx/pdf 导出、reauthorize、
AD 直通/NT-Password、portal/metrics 预留。前端 main 基线未接的写操作端点
(NAS CRUD/Secret/ports/ssids、策略写、用户详情、sync-records、告警已读、审计、
reload/compile)属前端 worktree 职责,后端契约就绪。
