# Backend 缺失功能补齐 — 方案

## G1 报表导出 pdf/xlsx

- 依赖:`openpyxl`(xlsx)、`reportlab`(pdf,内置 STSong-Light 中文 CID 字体,零字体资产)。
- 实现 `services/report_export.py`:三个模块(失败原因分布 summary、终端类型 endpoint-types、
  部门准入 departments)导出为多工作表 xlsx / 多节 pdf / csv(保持现状单表兼容或扩展为完整)。
- `api/reports.py` 的 `report_export` 分派到 xlsx/pdf/csv;`format` 参数校验,未知仍 501。
- 响应:`StreamingResponse` + `Content-Disposition` + 正确 media type。
- 测试:每个 format 生成非空字节、含关键字;`format=bogus` 仍 422/501。

## G2 批量 CoA 重授权

- pyrad 已支持 `CoARequest`(code 43)。复用 `radius/coa.py` 的发送骨架,抽象
  `_send_packet(code, ...)`,`disconnect_session` 传 DisconnectRequest,新增
  `reauthorize_session` 传 CoARequest(属性 User-Name/NAS-IP-Address/Acct-Session-Id/
  Calling-Station-Id + `Message-Authenticator` 语义由 pyrad 处理)。
- 新增 `POST /api/sessions/reauthorize` `{ session_ids, confirm }` → `{ reauthorized, failed }`,
  复用 sessions.py 的并发 fan-out + 审计;权限 operator+(同 disconnect)。
- 策略变更联动不强制(文档「可选」),仅在 compile 摘要中预留字段说明,避免隐式副作用。
- 测试:mock 发送函数断言 CoARequest code;端点返回形状。

## G3 AD 直通 + NT-Password 委派登录

- `services/auth.py` 的 `_verify_access_user_password` 扩展为三级:
  1. radcheck `Cleartext-Password`(现有,明文比对)
  2. radcheck `NT-Password`(新增,NTLM 哈希比对)
  3. AD bind(新增,ldap3 绑定 `ad_bind_dn` 模板或 sAMAccountName@域,仅当 `ad_url` 配置)
- 新增 `core/ntlm.py`:纯 Python MD4(RFC 1320)+ `ntlm_hash(password)` =
  `md4(password.encode("utf-16-le")).hexdigest()`,单测用已知向量
  (`""`→`31d6cfe0d16ae931b73c59d7e0c089c0`、`"password"`→`8846f7eaee8fb117ad06bdd830b7586c`)。
- 新增 `ldap_sync/` 内 `bind_auth(url, bind_dn, password) -> bool`(ldap3 Connection auto_bind
  成功即通过;失败返回 False 不抛)。
- 登录链顺序:本地 password_hash → Cleartext → NT-Password → AD bind。
- 测试:fixture 注入假 connector/bind,覆盖 NT 哈希比对 + AD 成功/失败分支。

## G4 /api/portal/* 预留

- 新增 `api/portal.py` + `schemas/portal.py`:`GET/POST /api/portal/*` 返回
  `501 {error:{code:"not_implemented"}}`,并在 OpenAPI 可见(挂到 api_router,prefix=/portal)。
- 注释标明 docs/01 预留的访客 Portal / 自助改密命名空间。

## G5 告警事件总线抽象

- `services/alerts.py` 的 `_emit` 落库逻辑抽为 `AlertSink` 协议(`async def emit(...)`),
  默认 `DbAlertSink`(现行为),`_emit` 改为调用 sink;预留推送 sink 替换点。
- 不改变现有告警行为,纯抽象重构 + 现有告警测试保持绿。

## G6 /api/health 扩展

- `/api/health` 增补 `version`(openredius.__version__)、`db`、`radius_config` 外再加
  `uptime_s`(进程启动时间)。预留 `/api/metrics`(Prometheus text)返回 501 占位
  (docs/07「M7 之后可选」),不引 prometheus 客户端依赖。

## G7 多 FreeRADIUS 实例核对

- 确认 `nas.nasname` + `nas.server`(radius.nas.server 字段)与 CoA 目标解耦:
  CoA 目标当前取 `device.nasname`(IP)。核对 `radius/tables.py` 的 nas 映射含 `server` 列
  (已含),在 `coa.py` 目标注释中说明「按 server 字段可扩展」;不改运行时行为。

## G8 前端接口覆盖核对

- 生成 docs/03 端点 ↔ 后端路由对照表写入 `.pi/work/backend-gapfill/coverage.md`,
  标注已实现/501/预留;前端 `resources/*` 调用端点与后端逐一对齐。

## 依赖变更

- `uv add openpyxl reportlab`(backend)。
- 其余零新增(CoA/ldap3/pyrad 已具备;MD4 手写)。
