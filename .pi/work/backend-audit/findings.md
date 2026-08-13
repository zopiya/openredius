# Backend 审计发现清单

基线:158 passed / 9 deselected(integration);ruff/format clean。
审计范围:backend/ 全部 70 个 Python 文件(≈6800 行)+ docs/00–10 + deploy/ + CI。

## 修复结果(本次已落地)

- 161 passed(+3 回归测试:编译器无策略用户拒绝、改密撤销令牌、审计 CSV 序列化),ruff/format clean。
- P1 ×3、P2 ×4、P3 ×5 已修;D4(CoA 密钥死键)已从 deploy/ 三处移除;D1 已加澄清注释。
- 新增迁移 `7f2a1c4e9b0d`(admin_user.token_version),`alembic upgrade/downgrade` 通过。

## 缺失功能补齐(第二轮,见 .pi/work/backend-gapfill/)

- **176 passed**(+15 测试),ruff/format clean,alembic 链完好。
- G1 报表导出 pdf/xlsx/csv(`services/report_export.py` + openpyxl/reportlab);顺带修复旧 csv 导出的字段 bug(`success` 恒 0)。
- G2 批量 CoA 重授权 `POST /api/sessions/reauthorize`(pyrad CoARequest)。
- G3 AD 直通 + NT-Password 委派登录:`core/ntlm.py`(手写 MD4 + 已知向量单测)、`ldap_sync.bind_auth`、委派链 Cleartext→NT→AD bind。
- G4 `/api/portal/*` 501 预留命名空间(docs/01)。
- G5 告警 `AlertSink` 协议抽象(事件总线推送化预留)。
- G6 `/api/health` 增补 version/uptime + `/api/metrics` 501 占位。
- G7 多实例 CoA 目标注释说明。
- G8 覆盖核对表见 `.pi/work/backend-gapfill/coverage.md`:docs/03 契约 100% 实现。

## P1 — 正确性/安全缺陷(已修)

| # | 位置 | 问题 | 依据 |
|---|---|---|---|
| 1 | `api/audit.py export_audit_csv` | `(r.detail_json or "").replace(...)` 在 detail_json 为 dict(JSON 列)时抛 AttributeError → 500。任何带非空 detail 的审计行都会触发;无测试覆盖 | docs/03 审计导出 |
| 2 | `radius/compiler.py compile_all` | `select(AccessUser, PolicyGroup).join(...)` 内连接把无策略组(NULL policy_group_id)的用户排除,导致其停用/锁定后**不生成** `Auth-Type := Reject`,违反 docs/02「status≠active 时保证 radcheck 存在 Reject」。AD 同步新建用户即无策略 | docs/02 状态机 |
| 3 | `api/auth.py change_my_password`、`api/admins.py update_admin` | 改密后不撤销已有 refresh token,违反 docs/08「登出/改密后旧 refresh 作废」。缺每用户 token 版本机制 | docs/08 认证机制 |

## P2 — 健壮性/一致性(已修)

| # | 位置 | 问题 |
|---|---|---|
| 4 | `services/auth.py authenticate_admin` | 失败分支 `_register_failure + raise` 重复两遍,第二段为不可达死代码(拷贝粘贴痕迹) |
| 5 | `api/devices.py delete_nas` | 删除 NAS 未校验无活跃会话(注释称「M6 强制」但未实现,且注释陈旧称「M2 无会话源」) |
| 6 | `api/users.py trigger_ad_sync` | `asyncio.ensure_future` fire-and-forget:任务未跟踪、异常被吞、复用请求级 `db.bind`、用全局 `get_settings()` 而非注入 |
| 7 | `ldap_sync/sync.py run_ad_sync` | 仅 `connector.fetch` 异常落 FAILED;`_process_users` 抛异常时任务记录永久停在 RUNNING |

## P3 — 打磨(已修)

| # | 位置 | 问题 |
|---|---|---|
| 8 | `schemas/common.py` | `Page[T]`、`Detail` 未使用(死代码) |
| 9 | `radius/compiler.py` | `_REGELD_DESC` 拼写错误(REGELD→RULE) |
| 10 | `services/reason.py reason_key_from_param` | 未知 reason 静默忽略(无 422),与其它筛选参数不一致 |
| 11 | `services/auth.py` / `core/logging.py` | 过时 docstring(auth 链声称「3. AD bind」未实现;logging 声称输出 client IP 但未输出) |

## 建议项(未改,需决策/文档对齐)

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| D1 | `nas_device.secret_enc` | ~~字段名暗示加密但存明文~~ 已加澄清注释;docs/08 称「应用侧不再冗余加密存储」,实际为 CoA 出向而保留本地副本 | 写 ADR 或修订 docs/08 承认 CoA 需本地 secret 副本;或字段重命名 `secret`(需迁移) |
| D2 | `api/devices.py list_nas/list_endpoints` | 返回 `{items,total,page,size}` 信封,docs/03 标注为 `NasRow[]`/`EndpointRow[]` 裸数组 | 前端已按信封消费(M5),以代码为准修订 docs/03 |
| D3 | `.github/workflows/ci.yml` | 缺 `pip-audit`+`bun audit` job;docs/08/09 声称 M0/M7 起存在 | 补 audit job(`continue-on-error`,标注) |
| D4 | `deploy/.env.example` + compose + README | `OPENRADIUS_RADIUS_COA_SECRET` 非真实配置键(CoA 密钥按 NAS 存于 radius.nas.secret)| ~~已移除~~ ✅ |
| D5 | `core/ratelimit.py` | `_events` dict 随唯一 IP 无界增长(单副本低风险) | 可选:定期清理空 deque / 设上限 |

## 已验证非问题(记录,不改)

- 时区:radius.* 表列均为 `timestamp without time zone`(deploy/postgres/init/schema.sql),
  服务层对 radius 表用 naive、对 public 表用 aware,处理正确。
- `TokenResponse.token_type` 多出字段、`NasBase.nasname min_length=7` 为无害偏差。
