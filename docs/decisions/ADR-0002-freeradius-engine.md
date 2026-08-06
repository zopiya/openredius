# ADR-0002 · 认证引擎选用 FreeRADIUS

- 状态:已接受(2026-08-06)

## 背景

系统需要工业级 RADIUS/EAP 能力(PEAP/EAP-TLS、记账、CoA、NAS 客户端管理)。

## 备选

1. **FreeRADIUS 3.2(官方 docker 镜像)**:事实标准,SQL 后端完善,社区文档充分。
2. 自研 Python RADIUS 栈(pyrad 服务端):EAP 状态机/PEAP 隧道实现成本极高,不可接受。
3. 其他(如 Cisco ISE 等商业 NAC):与"现代化管理系统 + 容器化 + 开放"目标不符。

## 决定

FreeRADIUS 3.2.x 作为唯一认证引擎,OpenRedius 后端作为管理/控制面,
通过共享 PostgreSQL(radius schema)与 CoA 出向集成。

## 后果

- 正面:认证正确性由成熟引擎保证;radacct/radpostauth 天然满足会话/日志/报表需求。
- 代价:受 v3 限制(客户端仅启动时加载 → NAS 变更需重启容器);unlang 学习成本;
  集成测试需要容器环境。均已纳入 06/07 设计。
