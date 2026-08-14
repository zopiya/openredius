# AD 直通认证 + 属性同步 — clarifications

## 待决(需用户确认后才能开工,对应设计文档 §3/§5)

| # | 问题 | 结论(2026-08-14 用户拍板) |
|---|---|---|
| C-001 | 认证方案 A 还是 B | **方案 A**:rlm_mschap + ntlm_auth(Samba winbind 域信任)。兼容 Windows 原生 802.1X supplicant(PEAP-MSCHAPv2),终端零改动。 |
| C-002 | 域 join 账号 | **已与 AD 管理员对齐,将提供专门的 join 账号**(最小权限:单独委派"添加工作站到域",不复用 radius 只读账号)。凭据经 `deploy/.env` → compose env → freeradius 容器注入,不落仓库/镜像;join 状态(secrets.tdb/keytab)落在专用 volume。 |
| C-003 | 手机号 AD 属性 | **优先 `mobile`,空则回退 `telephoneNumber`**(同步时 mobile 非空取 mobile,否则取 telephoneNumber)。 |

## 已核实(无需用户决策,记录结论)

| # | 问题 | 结论 | 依据 |
|---|---|---|---|
| Q-101 | §4:AD 侧禁用是否已映射本地 disabled | **已覆盖,无需改码**。`sync.py:_process_users` 对 `entry.disabled`(UAC 0x2)的账号写 `status=DISABLED` + 审计 `user.ad_disable`;增量窗口内不在 AD 结果的账号同样禁用。 | `ldap_sync/sync.py` |
| Q-102 | `radius/compiler.py` 对 radcheck 的所有权边界 | 编译器只拥有 `Auth-Type` 行;新方案不写 `Cleartext-Password`/`NT-Password`,与编译器所有权无冲突;顶部注释"由 seed/AD 写"需要改成准确描述(实施时改注释)。 | `radius/compiler.py` |
| Q-103 | `access_user` 新列默认值 | 空串默认(`email varchar(128) default ''` 等),与 dept/title 风格一致;既有行回填为空串,不猜数据。 | docs/15 §5 表格 |
| Q-104 | 认证方案运行时与 authorize 的衔接 | authenticate 阶段外置密码校验,authorize 的 `policy-openredius`/编译器 `Auth-Type := Reject` 均先于 authenticate,无需改动(设计文档 §4)。 | docs/06、compiler.py |
| Q-105 | AD 直通依赖的 AD 连接信息 | 复用现有 `OPENRADIUS_AD_URL/_BIND_DN/_BIND_PW/_BASE_DN` 语义;FreeRADIUS 侧用 `RADIUS_AD_*` 经 envsubst 注入(与 `RADIUS_SQL_*` 模式一致);方案 A 另加域 join 专用变量(名由实现定)。 | config.py、entrypoint.sh |
| Q-106 | EAP 方法匹配(方案 B 前提) | PEAP-GTC / TTLS-PAP 由 eap 模块配置支持;文档已说明 Windows 默认 supplicant 不支持,方案 B 需要客户端可控——正是 C-001 的决策依据。 | docs/15 §3 |
