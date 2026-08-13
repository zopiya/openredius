# 08 · 安全设计

## 威胁模型(摘要)

| 威胁 | 对策 |
|---|---|
| 未授权访问控制台 | JWT + 登录限流 + 锁定 + RBAC |
| NAS Secret 泄露 | 默认掩码、查看强制审计、传输 TLS、不写日志 |
| 越权操作(审计员改配置) | 服务端角色守卫(前端隐藏只是体验) |
| 注入(SQL/unlang/LDAP) | ORM 参数化;unlang 只消费编译产物;ldap3 过滤器转义 |
| 会话固定/重放 | access 短时效 + refresh 轮换 + jti 黑名单 |
| 供应链 | 锁文件(uv.lock/bun.lock)+ CI 依赖审计 |
| 认证引擎被绕过 | FreeRADIUS 只监听 NAS 网段;管理面不开放 1812 |

## RBAC 权限矩阵

| 能力 | admin | operator | auditor |
|---|---|---|---|
| 查看仪表盘/会话/日志/报表 | ✅ | ✅ | ✅ |
| 强制下线 | ✅ | ✅ | ❌ |
| 用户启停/分配策略 | ✅ | ✅ | ❌ |
| AD 同步触发 | ✅ | ✅ | ❌ |
| 策略 CRUD / 重排 | ✅ | ❌ | ❌ |
| 设备 CRUD / 查看 Secret | ✅ | ❌ | ❌ |
| 系统设置 / 管理员账户 | ✅ | ❌ | ❌ |
| 审计日志查询 | ✅ | ❌ | ✅ |

实现:`require_role("operator")` 依赖注入(04);JWT claims 含 `role`;
角色变更即时生效(每次请求查库校验 status,不缓存角色)。

## 认证机制

- 管理员口令:argon2id;最小长度 10;登录失败 5 次/10 分钟锁定 30 分钟(与准入策略同参数)。
- JWT:access 15 分钟(HS256,`OPENRADIUS_JWT_SECRET`),refresh 7 天,旋转式续期;
  登出后 refresh 落 DB 作废表(`revoked_refresh_token`);改密则 bump `token_version`,
  该账户全部旧 refresh 立即全量作废(比逐条 jti 黑名单更强)。
- 初始管理员:首启由 `OPENRADIUS_BOOTSTRAP_ADMIN_*` 创建,日志一次性打印提示修改。
- 登录页限流:同 IP 20 次/分钟(内存计数,单副本假设)。

## NAS Secret 管理

- 存储:`radius.nas.secret`(FreeRADIUS 读取所需,无法避免);应用侧 `nas_device.secret_enc`
  保留一份**明文**副本(`_enc` 后缀为历史误称)——CoA/Disconnect 出向 UDP 3799 需要 NAS
  密钥,且 SQLite dev 环境无 radius.nas 时必须由应用表提供;PostgreSQL 环境双写同步。
  两份副本均为明文,DB 访问权限收紧(仅 openredius/radius 角色)。
- API:`GET /api/devices/nas` 一律返回 `secret_masked`(前 4 后 4);
  `GET /api/devices/nas/{id}/secret` 返回明文,**必须**写 audit_log(action=`secret.reveal`)。
- 修改 secret = 更新 nas 表 + 触发 reload + 审计;日志与响应体中永不回显明文。

## 审计日志(audit_log)

必记事件:登录(成功/失败)、强制下线、用户启停/策略分配、策略 CRUD、设备 CRUD、
Secret 查看/修改、设置变更、AD 同步触发、管理员账户变更、radius reload。
字段:actor、action(点分动词)、target_type/target_id、detail_json(变更前后摘要)、ip、时间。
`audit.enabled` 为审计总开关(设置页),显式关闭后 `record_audit` 不落库。
保留:≥180 天;auditor/admin 可查;不提供删除 API(M7 提供归档导出)。

## 网络暴露面

- prod:仅 80/443 与 1812/1813(限 NAS 网段,防火墙/安全组)对外;
  8000/5432 仅 compose 内网。
- nginx 安全头:`X-Content-Type-Options`、`X-Frame-Options=DENY`、`Referrer-Policy`、
  CSP(静态资源同源)。
- 后端 CORS:dev 允许 localhost:5173;prod 同源(不开 `*`)。
- FreeRADIUS 与后端之间不引入额外通道(共享 DB 即边界)。

## 数据安全

- 口令字段(radcheck Cleartext-Password)仅 dev 使用;prod 建议 NT-Password(不可逆哈希)
  或 AD 直通(rlm_ldap),文档与设置页明示。
- 备份文件同数据库密级管理;backups/ 目录权限 700。
- 日志脱敏:password/secret 等敏感值一律 `***`。

## 依赖与流水线安全

- CI:`pip-audit`(uv 环境)与 `bun audit`(M0 起)。
- 镜像:基于官方 slim/alpine;不引入未知第三方镜像;freeradius 用官方镜像构建。
- 密钥只经 `.env`/secrets 注入;仓库扫描(gitleaks 可选,M7)。

## 验收清单(M7 安全门禁)

- [x] 未带 token 访问受保护 API → 401;auditor 调用写接口 → 403(自动化测试覆盖)
- [x] 登录锁定与限流测试通过
- [x] Secret 查看产生审计记录(测试断言)
- [x] CORS/安全头检查通过
- [x] 依赖审计无 high 级未处置项
