# 00 · 愿景与范围

## 一句话定位

**OpenRedius 是一套现代化的企业内网 802.1X 准入认证(NAC)管理系统**:以 FreeRADIUS 为认证引擎,
提供用户/策略/设备/终端的集中管理、在线会话管控、认证审计、报表统计与告警,通过 Docker 一键部署。

## 背景

- 已交付物:8 页高保真前端原型(React 19 + TS + Vite + bun),由 HTML 设计稿 1:1 移植,
  视觉/交互/数据形态已冻结(保真度审计是回归门禁)。
- 缺口:无后端、无真实 RADIUS 集成、无部署形态。本项目补齐后端(uv + Python)、
  FreeRADIUS 集成与 Docker 部署,并把前端从 mock 数据切换到真实 API。

## 目标用户与角色

| 角色 | 场景 | 权限(详见 08-security) |
|---|---|---|
| 网络管理员(运维) | 日常管理用户/设备/策略,强制下线,排障 | admin / operator |
| 安全管理员 | 策略与合规基线、审计 | admin |
| 审计员 | 只读查看日志、报表、审计记录 | auditor |

## 功能地图(与原型 8 页一一对应)

| 页面 | 路由 | 核心能力 | 后端支撑 |
|---|---|---|---|
| 仪表盘 | `/dashboard` | KPI、趋势图、告警流(深链跳转) | KPI/趋势/告警 API |
| 在线会话 | `/sessions` | 活跃会话列表、筛选、详情(RADIUS 属性)、批量强制下线、CSV 导出 | radacct 查询 + CoA Disconnect |
| 认证日志 | `/auth-logs` | Accept/Reject 明细、高级筛选、失败原因、详情模态 | radpostauth 查询 + 原因归类 |
| 用户管理 | `/users` | 账号列表、批量启用/停用、分配策略组、AD 同步、同步记录、用户抽屉 | 用户 CRUD + 状态机 + LDAP 同步 |
| 策略管理 | `/policies` | 策略组 CRUD、优先级排序、启停、下发属性(VLAN/ACL/时限/限速/合规要求) | 策略编译器 → FreeRADIUS 组属性 |
| 设备管理 | `/devices` | NAS 清单(状态/负载/Secret)、端口/SSID 抽屉、终端准入清单(合规/白名单/证书) | NAS CRUD(nas 表)+ 终端 CRUD |
| 报表统计 | `/reports` | 失败原因聚合(今日/本周/本月)、终端类型占比、部门准入表、导出 | 聚合查询 |
| 系统设置 | `/settings` | RADIUS 端口/参数、告警开关、管理员账户、审计开关 | 设置持久化 + 应用 |

## 非目标(MVP 明确不做)

- 不做终端侧 agent/准入客户端(合规状态靠既有 EDR/证书信号录入,不做主动采集)。
- 不做 802.1X supplicant 分发与配置推送。
- 不做访客 Portal 自助注册页(guest 策略组保留,Portal 列入后续)。
- 不做 DHCP 管理、不做多地域/多实例联邦(架构不排斥,见 01)。
- 不实现自研 RADIUS 协议栈:认证引擎只用 FreeRADIUS(ADR-0002)。

## 术语表

| 术语 | 含义 |
|---|---|
| NAS | Network Access Server,接入设备(交换机/无线 AC/AP),RADIUS 客户端 |
| 802.1X | 端口准入协议;EAP 方法承载认证(EAP-TLS 证书、PEAP-MSCHAPv2 账号密码) |
| MAB | MAC Authentication Bypass,MAC 白名单旁路认证 |
| CoA / DM | RFC 5176 Change-of-Authorization / Disconnect-Message,NAS 监听 UDP 3799,用于强制下线/动态改授权 |
| radacct / radpostauth | FreeRADIUS SQL 模块的计费(会话)表 / 认证日志表 |
| radcheck / radreply | 用户级检查属性 / 回复属性表(授权来源) |
| radgroupcheck / radgroupreply / radusergroup | 组级检查/回复属性、用户-组关系表 |
| VLAN 下发 | Access-Accept 携带 Tunnel-Private-Group-Id 指定终端入网 VLAN |
| AD | Active Directory;本项目支持 LDAP 增量同步用户目录 |
| 策略组 | OpenRedius 的授权单元,编译为 FreeRADIUS 组属性(radgroupreply 等) |

## 版本基线(2026-08 调研)

FreeRADIUS 3.2.x(官方镜像 `freeradius/freeradius-server`)、PostgreSQL 17、
Python ≥3.13、FastAPI 0.141、SQLAlchemy 2.0、Alembic 1.19、pyrad 2.5.4、ldap3 2.9.1、
bun 1.3.14、React 19、Vite 8、TypeScript 7。
