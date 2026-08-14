# AD 直通认证 + 属性同步扩展 — spec

来源设计文档:`docs/15-ad-ldap-auth-integration.md`(状态:设计文档,本次实现)。

## 问题与用户目标

现状(2026-08-14 文档复核 + 本轮代码核实):

- AD 同步(`ldap_sync/sync.py`)只落目录信息,从不写 `radcheck`;全仓库唯一写
  `Cleartext-Password` 的是 dev 种子脚本;`deploy/freeradius/raddb/` 无 ldap/
  mschap 模块配置。
- 结论成立:**没有任何生产可用方式给 AD 同步账号提供 802.1X 登录密码**。

目标:

1. 真实用户用 AD 域账号+密码做 802.1X 登录,OpenRedius/Postgres **不存储、
   不缓存任何密码副本或哈希**;认证实时转发给 AD 验证。
2. AD 同步扩展拉取邮箱/手机号/备注,落库并在前端「用户管理」可查看。
3. 账号状态(AD 禁用 / 本地停用/锁定)与准入策略(MAC 绑定/EDR/时间窗)继续
   生效,不被"密码校验外置"绕过。

## 范围

### In scope

- FreeRADIUS 认证方案落地方案 A 或 B(见 clarifications C-001,待用户拍板)。
- `access_user` 新增 `email`/`mobile`/`description` 三列(Alembic 迁移)。
- AD 同步链路扩展:`AdUserEntry`、`ldap3_._fetch_sync`、`sync.py` upsert。
- API 响应(`UserOut`/`UserDetail`)与前端用户详情展示。
- §4 核实:`sync.py` 对 AD 侧禁用账号的映射是否已覆盖(已核实:现有逻辑已把
  `userAccountControl ACCOUNTDISABLE` 映射为 `status=disabled` + 审计,无需
  补码——见 clarifications Q-101)。
- 文档同步:`docs/06`(EAP 与证书一节)、`docs/02`(access_user 字段表)、
  `docs/08`(数据安全一节)、`docs/07`(AD 环境变量说明,若引入新变量)。

### Out of scope

- 密码缓存/哈希存储(明确禁止)。
- 准入策略运行时逻辑改动(compiler/unlang 不动)。
- 锁定/停用状态机改动(现有 `Auth-Type := Reject` 机制保留)。
- CoA、计费、报表等与认证方式无关的链路。

## 功能需求

- **FR-001** 802.1X 认证密码校验交由 AD(方案 A:winbind/ntlm_auth;方案 B:
  rlm_ldap simple bind),本地不落密码/哈希。
- **FR-002** 每次认证实时校验,无本地缓存(改密码后立即生效)。
- **FR-003** `access_user.status` 非 active 时 FreeRADIUS 先拒绝(现有
  `Auth-Type := Reject` 机制,不改造);AD 侧禁用经同步映射为本地 disabled
  (现有逻辑,已核实)。
- **FR-004** authorize 阶段 `policy-openredius` 逻辑不变,MAC/EDR/时间窗/证书
  检查照常(不因认证方式改变而绕过)。
- **FR-005** `access_user.email/mobile/description` 列(Alembic 迁移);AD 同步
  拉取并写入;`UserOut`/`UserDetail` 返回;前端用户详情抽屉展示。
- **FR-006** 相关配置与密钥经环境变量注入(不落仓库/镜像);`.env.example`
  补充;compose 若需要则同步。
- **FR-007** 文档 02/06/07/08 与实现一致(去掉"设计意向"措辞)。

## 验收标准(映射设计文档 §7)

| 编号 | 标准 | 文档条目 |
|---|---|---|
| AC-1 | 真实 AD 账号,`radcheck` 无其行,域密码真机 802.1X → Access-Accept | §7.1 |
| AC-2 | AD 改密码后旧密码失败、新密码成功(实时转发证明) | §7.2 |
| AC-3 | 账号 disabled/locked(本地或 AD 同步)后一律 Access-Reject | §7.3 |
| AC-4 | MAC 绑定/时间窗/EDR 策略照常生效 | §7.4 |
| AC-5 | AD 同步后 email/mobile/description 有值,控制台可查看 | §7.5 |
| AC-6 | docs/02/06/08 已同步为实际方案 | §7.6 |

本地验证边界:AC-1~AC-4 需真实 AD(10.36.x)或测试 AD,本地用测试 LDAP 容器
(方案 B)/ 配置校验 `radiusd -XC`(方案 A)做到可验证的最大程度,剩余由用户在
部署环节按 validation.md 的对照清单验收;AC-5/AC-6 本地全量验证。

## 待决问题(clarifications)

见 `clarifications.md`:C-001(方案 A/B)、C-002(方案 A 的域 join 账号权限)、
C-003(手机号属性名)。**开工前必须由用户确认,不自行拍板。**
