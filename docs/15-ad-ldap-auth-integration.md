# 15 · AD 直通认证 + 属性同步扩展设计

## 0 · 定位与状态

**状态:设计文档,未实现。** 本文档只描述目标架构和改动点,供 `pi`(项目
coding agent,见根目录 `AGENTS.md`/`.pi/`,ADR-0007)后续实现;我(Claude Code)
这次只排查现状、写文档,不改代码。实现完成后由我负责部署到目标环境并反馈结果。

## 1 · 现状缺口(2026-08-14 复核确认)

- `POST /api/users/sync-ad`(`backend/src/openredius/api/users.py`)触发
  `ldap_sync/sync.py` 的 `run_ad_sync`:只把 AD 用户的
  `sAMAccountName`/`displayName`/`department`/`title`/`distinguishedName`/
  `whenChanged`/`userAccountControl` 同步进 `access_user` 表(见
  `ldap_sync/ldap3_.py` 的 `_fetch_sync` 属性列表),**从不写 `radcheck`**。
- 全仓库唯一往 `radcheck.Cleartext-Password` 写值的代码是
  `backend/scripts/seed_demo.py`(dev 专用种子脚本,给演示账号写共享明文密码,
  注释自己也写明"Dev/integration only")。
- `radius/compiler.py` 顶部注释说"`radcheck` `Cleartext-Password`(由 seed/AD
  写)从不被编译器碰",这句话里的"AD 写"目前是**没有对应实现的**——
  `deploy/freeradius/raddb/` 里没有任何 `ldap`/`mschap` 模块配置,`docs/06`
  「EAP 与证书」一节写的"prod/AD 模式可切 NT-Password 或 rlm_ldap 直通"只是
  一句设计意向,没有落地。
- 结论:**目前没有任何生产可用的方式,给一个 AD 同步进来的 `access_user` 提供
  802.1X 登录用的密码。** 这是这份文档要解决的核心问题。

## 2 · 目标

1. 真实用户直接用自己的 AD 域账号+密码做 802.1X 登录,OpenRedius/Postgres
   **不存储、不缓存任何密码副本或哈希**——认证请求实时转发给 AD 验证。
2. AD 同步在现有目录信息基础上,再拉取常用联系方式字段(邮箱、手机号、备注),
   落库、可在前端「用户管理」页查看。
3. 账号状态(AD 侧禁用 / OpenRedius 侧手工停用/锁定)必须能立即生效,不因为
   "密码校验交给 AD"就绕过了 OpenRedius 自己的准入策略(MAC 绑定/EDR/时间窗/
   账号锁定等)。

## 3 · 认证架构:两个方案,需要用户/pi 在实现前拍板

这是一个真实的架构取舍,不是我能替业务方单方面决定的,两个方案都写清楚:

### 方案 A(推荐):`rlm_mschap` + `ntlm_auth`(Samba winbind 域信任)

FreeRADIUS 的 `mschap` 模块配置 `ntlm_auth`,把 PEAP 内层 MSCHAPv2 的挑战/响应
转发给本机 `winbind`(Samba 组件),`winbind` 需要提前 `net ads join` 加入
`henan.jztet.com` 域,之后 `ntlm_auth` 才能代表 AD 校验 MSCHAPv2。

- **优点**:兼容 **Windows 原生 802.1X 客户端的默认配置**(PEAP + 安全密码
  EAP-MSCHAPv2 是 Windows 内置 supplicant 的默认/唯一开箱即用选项),终端侧
  零改动,这是企业 WiFi/有线 802.1X 接 AD 的行业标准做法(eduroam、大多数企业
  部署都是这个模式)。
- **代价**:
  - `deploy/freeradius/Dockerfile` 需要安装 `samba-common-bin`/`winbind`
    (或等价包),镜像变大,攻击面变大。
  - 需要"加入域"的操作,**必须有一个具备"将工作站加入域"权限的账号**——
    ⚠️ **明确提醒**:这通常和用来做只读 LDAP 查询的 `radius` bind 账号权限
    模型不同(加入域权限通常需要 `Domain Admins` 或被单独委派的"添加工作站到
    域"权限)。不建议为了省事直接复用现有的 `radius`/`JZT_600998` 账号来做
    join——最小权限原则下,应该找 AD 管理员单独确认或新开一个专门的 join 账号。
    实现前需要用户去和 AD 管理员对齐这一点。
  - freeradius 容器需要能解析 AD 域名(DNS 指向域控 `10.36.5.245` 或企业
    DNS)、和 AD 时间同步在合理误差内(Kerberos 时间敏感,建议容器挂载宿主机
    NTP 或显式配 NTP client)。
  - 容器重建/迁移后域信任状态如何保持(join 是有状态操作,不是纯配置文件)
    需要在 entrypoint 里设计幂等的"已 join 则跳过,未 join 则执行"逻辑,
    并且 join 密钥的存储方式要和现有 `.env` 密钥管理方式一致(不进镜像、不
    进仓库)。

### 方案 B(轻量,但对客户端有要求):`rlm_ldap` 直接 bind

PEAP 内层如果用 **EAP-GTC** 或者干脆用 **EAP-TTLS/PAP**(而不是 MSCHAPv2),
用户输入的密码会以明文/近明文形式送进 TLS 隧道,FreeRADIUS 可以直接用
`rlm_ldap` 拿这个账号密码去 AD 做一次 **simple bind**(复用现有
`OPENRADIUS_AD_URL`/`_BASE_DN` 的连接方式,但 bind DN/密码换成终端用户自己
输入的),bind 成功即视为密码正确。

- **优点**:不需要 winbind、不需要域 join,配置和现有的 `ldap3_.py` AD 只读
  同步是同一路数据源,理解成本低。
- **限制**:⚠️ **Windows 自带的 802.1X 有线/无线客户端默认只支持
  PEAP-MSCHAPv2**(和证书类的 EAP-TLS),不支持 EAP-GTC/EAP-TTLS-PAP 作为
  内层方法——要用方案 B,要么终端全部换成支持这些方法的第三方 supplicant
  (运维成本高,尤其是存量 Windows 域内机器不现实批量改),要么客户端本来就不是
  标准 Windows 桌面(比如可控的定制终端/Linux/特定品牌网络设备的 supplicant)。

### 怎么选

**先确认目标客户端群体是不是标准的、未做特殊 supplicant 配置的 Windows 域内
机器**——如果是(大概率是,鉴于这是企业内网 AD 场景),选**方案 A**;如果客户端
可控、愿意/已经配置了非默认 EAP 方法,方案 B 更省事、更安全(不需要域 join
这种高权限操作)。这一点需要用户或 pi 在开工前明确一次,文档不替业务方拍板。

## 4 · 账号状态与 OpenRedius 策略如何联动

不管选哪个认证方案,FreeRADIUS 的 **authenticate 阶段**只是把"密码对不对"这一
判断转交给 AD/winbind,**authorize 阶段的 `policy-openredius` 逻辑(docs/06)不受
影响、照常跑**——MAC 绑定/EDR/时间窗/证书这些检查依然基于 `access_user`/
`endpoint`/`policy_group` 的本地数据判定,和密码验证方式解耦。

`access_user.status` 的锁定/停用逻辑(`docs/02` 状态机)也不受影响:`compiler.py`
已经保证 `status != active` 时写 `radcheck: Auth-Type := Reject`,这条在
authorize 阶段先于 authenticate 执行,AD 密码再正确也会被这条拦下——**这部分
逻辑不需要改**,新方案只是让"密码正确与否"这一步不再依赖本地 `radcheck`
存储密码,不影响账号状态管控链路。

**需要新增的逻辑**:AD 侧账号被禁用(`userAccountControl` 里的
`ACCOUNTDISABLE` 位)时,`sync.py` 目前是怎么处理的需要确认——如果现有增量
同步已经会把 AD 禁用映射成 `access_user.status = disabled`,这里不用改;如果
没有这个映射,需要补上,否则会出现"AD 已经禁用了这个人,但 OpenRedius 这边
状态没同步导致 MSCHAPv2/LDAP bind 层面 AD 会直接拒绝(变相生效),但 OpenRedius
的审计/告警侧看不到明确的'该账号已禁用'状态"这种体验不一致的问题。这一点
pi 实现时需要顺带核实 `sync.py` 现有逻辑并按需补齐。

## 5 · AD 属性同步扩展

`access_user` 表新增三列(Alembic 迁移):

| 新列 | 类型 | 来源 AD 属性 | 说明 |
|---|---|---|---|
| `email` | `varchar(128) default ''` | `mail` | |
| `mobile` | `varchar(32) default ''` | `mobile` 或 `telephoneNumber` | ⚠️ 需要和 AD 管理员确认这家 AD 用哪个属性存手机号,两家企业习惯不同,不要凭经验假设 |
| `description` | `varchar(256) default ''` | `description` | AD 原生的自由文本字段,通常放备注/职责说明 |

改动点:

- `backend/src/openredius/ldap_sync/ldap3_.py`:`_fetch_sync` 的
  `attributes=[...]` 列表加上 `mail`/`mobile`(或确认后的实际属性名)/
  `description`;`AdUserEntry`(`ldap_sync/connector.py`,需要确认具体文件名)
  这个 dataclass/TypedDict 加对应字段。
- `backend/src/openredius/ldap_sync/sync.py`:upsert 逻辑(新建/更新
  `access_user` 那两处,`sync.py:205`/`232`/`252` 附近)把新字段一并写入。
- `backend/src/openredius/models/user.py`:`AccessUser` 加三个
  `mapped_column`,配一条 Alembic 迁移(`alembic revision --autogenerate` 之后
  人工核对)。
- `backend/src/openredius/schemas/users.py`:`UserOut`(或对应的响应模型)加
  这三个字段。
- 前端:`src/pages/Users.tsx` 的用户详情/列表要不要露出这几个字段,建议先跟
  实际 UI 需求对一下(至少详情弹窗里加,列表页可选,避免表格列爆炸)。

## 6 · 落地涉及的文件清单(供 pi 参考,不是这次要改的)

- `deploy/freeradius/raddb/mods-available/{ldap,mschap}`(新增/改配置,取决于
  选哪个方案)
- `deploy/freeradius/Dockerfile`(方案 A 需要装 samba-winbind 相关包,entrypoint
  加幂等的 `net ads join` 逻辑)
- `deploy/freeradius/entrypoint.sh`(域 join / winbind 启动逻辑)
- `backend/src/openredius/core/config.py`(方案 A 需要额外的域 join 相关 env,
  比如 `OPENRADIUS_AD_DOMAIN`/`OPENRADIUS_AD_JOIN_USER`/`_JOIN_PASSWORD`,
  具体命名由 pi 实现时定;现有 `OPENRADIUS_AD_URL/_BIND_DN/_BIND_PW/_BASE_DN`
  继续用于只读同步,不受影响)
- `backend/src/openredius/ldap_sync/{ldap3_.py,sync.py,connector.py}`
- `backend/src/openredius/models/user.py` + 一条 Alembic 迁移
- `backend/src/openredius/schemas/users.py`
- `src/pages/Users.tsx`
- `docs/06-freeradius-integration.md`「EAP 与证书」一节需要同步改写成实际实现
  的方案(目前那句"prod/AD 模式可切…"是过时的意向描述,实现后要更新)
- `docs/02-domain-model.md` 的 `access_user` 字段表加三个新列
- `docs/08-security.md`「数据安全」一节那句"口令字段…prod 建议 NT-Password
  或 AD 直通"也要同步更新成实际结论

## 7 · 验收标准

1. 一个真实 AD 账号,`radius.radcheck` 里**没有**任何该账号的行,用 AD 域密码
   通过真机 802.1X 认证,FreeRADIUS 侧拿到 `Access-Accept`。
2. 该账号在 AD 侧改密码后,旧密码认证失败、新密码认证成功——证明确实是每次
   实时转发验证,不是缓存了旧密码的哈希。
3. 该账号被 `access_user.status` 设为 `disabled`/`locked`(或 AD 侧禁用,视
   §4 的同步逻辑是否补齐)后,不管密码是否正确,均 `Access-Reject`。
4. 该账号的 MAC 绑定/时间窗/EDR 等策略(如已配置)照常生效,不受认证方式改变
   影响。
5. 触发一次 AD 同步后,`access_user.email`/`mobile`/`description` 有值,
   控制台「用户管理」能查看这几个字段。
6. `docs/06-freeradius-integration.md`/`docs/08-security.md`/
   `docs/02-domain-model.md` 已同步更新为实际实现的方案(不再是"设计意向"
   措辞)。
