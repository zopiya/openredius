# 03 · REST API 契约

本文件是前后端唯一契约。前端 `src/api/resources/*` 中的注释与下表一一对应;
后端 FastAPI 自动导出 OpenAPI(`/api/openapi.json`),前端类型由此生成(见 05)。

## 通用约定

- 前缀:`/api`;JSON;UTF-8;时间 ISO8601(UTC)。
- 认证:`Authorization: Bearer <access_token>`(除 `POST /api/auth/login` 与 `/api/health`)。
- 列表:`GET /api/<res>?page=1&size=50&sort=-created_at&<filters>` →
  `{ "items": [...], "total": n, "page": 1, "size": 50 }`。
  MVP 会话/日志等原型一次性全量返回的接口保留"无分页全量"语义(size 上限 500),筛选参数服务端执行。
- 错误体:`{ "error": { "code": "string", "message": "human", "details": {} } }`;
  HTTP 状态:400 校验 / 401 未认证 / 403 无权限 / 404 / 409 冲突 / 422 语义校验 / 429 限流。
- 批量动作统一返回 `{ "affected": n }`(或语义化计数,如 `{ "disconnected": n }`)。
- 写操作一律写 audit_log(见 08)。

## 认证与会话(控制台)

| 方法 路径 | 说明 | 权限 |
|---|---|---|
| `POST /api/auth/login` `{username,password}` → `{access_token, refresh_token, expires_in, user}` | 登录;失败计数与锁定(5 次/10 分钟锁 30 分钟) | 公开(限流) |
| `POST /api/auth/refresh` `{refresh_token}` → 同上 | 刷新 | 公开 |
| `POST /api/auth/logout` | 作废 refresh(jti 黑名单) | 登录 |
| `GET /api/auth/me` → `{username, display_name, role}` | 当前管理员 | 登录 |
| `GET/POST /api/auth/admins`、`PATCH/DELETE /api/auth/admins/{id}` | 管理员账户 CRUD(设置页) | admin |

## 仪表盘

| 方法 路径 | 响应 | 备注 |
|---|---|---|
| `GET /api/dashboard/kpis` | `{ online_sessions, auth_today, auth_success_rate_today, nas_online, nas_total, locked_users }` | KPI 卡片 |
| `GET /api/dashboard/trend?range=today|7d` | `{ buckets: [{t, accept, reject}] }` | today=10 分钟粒度;7d=1 小时 |
| `GET /api/dashboard/alerts?limit=20` | `AlertEvent[]`(含 `link` 深链,与原型 `to` 一致) | 告警流 |
| `POST /api/dashboard/alerts/{id}/read` | 标记已读 | operator+ |

## 在线会话

| 方法 路径 | 前端映射 | 说明 |
|---|---|---|
| `GET /api/sessions?dept=&method=&nas=&vlan=&auth=&q=` | `fetchSessions` | active radacct 组装 `SessionRow[]`;筛选服务端执行 |
| `GET /api/sessions/{acct_unique_id}` | 详情(RADIUS 属性) | 含完整属性 |
| `POST /api/sessions/disconnect` `{ session_ids: string[], confirm: true }` | `disconnectSessions` | 逐个发 CoA Disconnect;返回 `{ disconnected, failed: [{id, reason}] }` |
| `GET /api/sessions/export.csv?...` | CSV 导出 | 同筛选参数 |

`session_ids` 使用 radacct 的 `acctuniqueid`(稳定唯一)。

## 认证日志

| 方法 路径 | 说明 |
|---|---|
| `GET /api/auth-logs?result=&nas=&user=&reason=&eap=&from=&to=&page=&size=` | radpostauth 组装 `LogRow[]`;`reason` 用 02 的归类键 |
| `GET /api/auth-logs/{id}` | 详情模态数据(请求/回复属性) |
| `GET /api/auth-logs/export.csv?...` | 导出 |

## 用户管理

| 方法 路径 | 前端映射 | 说明 |
|---|---|---|
| `GET /api/users?dept=&status=&policy=&q=` | `fetchUsers` | `UserRow[]` |
| `GET /api/users/{account}` | 用户抽屉 | 含最近认证、终端列表、策略下发规则 |
| `POST /api/users/status` `{ accounts: [], action: "enable"|"disable" }` | `updateUserStatus` | 联动 radcheck |
| `POST /api/users/policy` `{ accounts: [], policy_id }` | `assignUserPolicy` | 改 radusergroup |
| `POST /api/users/sync-ad` | `syncAdNow` | 立即触发增量同步(异步任务)→ `AdSyncResult` |
| `GET /api/users/sync-records` | 同步记录抽屉 | `ad_sync_job[]` |
| `GET /api/users/sync-records/{id}` | 失败任务原因 | |

## 策略管理

| 方法 路径 | 说明 |
|---|---|
| `GET /api/policies` | `PolicyRow[]`(按 priority) |
| `GET /api/policies/{id}` | `PolicyForm` + 下发规则预览(编译后的 FreeRADIUS 属性清单) |
| `POST /api/policies` / `PUT /api/policies/{id}` | 新建/保存(保存即编译下发;名称必填等服务端校验) |
| `PATCH /api/policies/{id}` `{enabled}` | 启停(停用=编译产物移除,保留定义) |
| `POST /api/policies/reorder` `{ order: [id...] }` | 优先级重排 |
| `DELETE /api/policies/{id}` | 仅允许删除未被引用的策略 |

## 设备管理

| 方法 路径 | 说明 |
|---|---|
| `GET /api/devices/nas?type=&area=&status=` | `NasRow[]`(状态/负载实时派生) |
| `POST /api/devices/nas` / `PATCH /api/devices/nas/{id}` | 增改(写 radius.nas;触发 freeradius 重启流程,返回 `reload_required`) |
| `DELETE /api/devices/nas/{id}` | 移除客户端(校验无活跃会话) |
| `GET /api/devices/nas/{id}/secret` | 明文 Secret(强制审计,见 08) |
| `GET /api/devices/nas/{id}/ports` | 端口抽屉数据(按会话聚合) |
| `GET /api/devices/nas/{id}/ssids` | SSID 抽屉数据 |
| `GET /api/devices/endpoints?type=&comp=&q=` | `EndpointRow[]` |
| `POST /api/devices/endpoints` / `PATCH /api/devices/endpoints/{mac}` | 录入/编辑(白名单、绑定用户) |
| `POST /api/devices/endpoints/import` `{ macs: [] }` | 批量导入 MAC |
| `DELETE /api/devices/endpoints/{mac}/whitelist` | 移出白名单 |
| `POST /api/devices/endpoints/{mac}/revoke-cert` | 吊销证书记录(置 bad + 审计) |

## 报表统计

| 方法 路径 | 说明 |
|---|---|
| `GET /api/reports/summary?period=today|week|month` | `{ sub, total, fail: DonutRow[] }`(口径与原型一致) |
| `GET /api/reports/endpoint-types` | `ETYPE_ROWS` 形状 |
| `GET /api/reports/departments?period=` | 部门准入表 |
| `GET /api/reports/export?format=pdf|xlsx&...` | 导出(M7 前返回 501 + toast 文案可接受) |

## 系统设置

| 方法 路径 | 说明 |
|---|---|
| `GET /api/settings` | 全量设置(RADIUS 端口/CoA 端口、告警总开关与子项、审计开关) |
| `PUT /api/settings` | 保存;核心端口变更要求 `{ confirm: true }`,返回 `radius_reload_required` |
| `GET /api/settings/alert-rules` / `PUT /api/settings/alert-rules` | 告警规则开关与阈值 |

## 审计

| 方法 路径 | 说明 |
|---|---|
| `GET /api/audit?action=&actor=&from=&to=&page=` | 审计查询(auditor+) |

## 运维

| 方法 路径 | 说明 |
|---|---|
| `GET /api/health` | `{status:"ok", db, radius_config}`(无鉴权) |
| `POST /api/ops/reload-radius` | 触发 freeradius 容器重启(仅 admin;docker 可用时) |

## OpenAPI → 前端类型

后端响应 schema 命名与本文档 DTO 一致(`SessionRowOut` 等);`bun run api:gen` 生成
`src/api/schema.d.ts`,资源层做映射,**页面使用的 `src/api/types.ts` 类型签名保持不变**
(保真度测试依赖它们)。
