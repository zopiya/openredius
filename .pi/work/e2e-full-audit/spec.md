# 端到端全量测试 — 规格(Spec)

## 目标

对 OpenRedius(dev 分支)做一次**全面、可交付**的端到端验证,覆盖三个维度:

1. **维度 1 — 全功能端到端**:所有页面、所有功能点,从 UI 操作 → 后端 API → 数据库变更 → 审计日志 → 前端反馈,全链路验证。
2. **维度 2 — 全角色全工作流审计**:三种角色(admin/operator/auditor)的完整 SOP 工作流、RBAC 越权矩阵、审计日志完整性。
3. **维度 3 — 交互体验**:人性化、友好、高效——反馈、一致性、空/错/载态、防误操作、可访问性。

## 范围

### 测试对象(9 页面)

| 路由 | 页面 | 可见角色 |
|---|---|---|
| /login | 登录 | 全部 |
| /dashboard | 仪表盘 | admin/operator/auditor |
| /sessions | 在线会话 | admin/operator/auditor |
| /auth-logs | 认证日志 | admin/operator/auditor |
| /users | 用户管理 | admin/operator |
| /policies | 策略管理 | admin |
| /devices | 设备管理 | admin |
| /reports | 报表统计 | admin/operator/auditor |
| /settings | 系统设置 | admin |

### 角色(AdminRole)

- **admin(管理员)**:全部功能 + 系统设置 + Shared Secret 查看。
- **operator(运维)**:读全部 + 强制下线 + 用户启停/策略分配 + AD 同步。
- **auditor(审计)**:仪表盘/会话/日志/报表,仅查看与导出 + 审计日志查询。

### 后端(11 组资源)

auth / admins / dashboard / sessions / auth-logs / users / policies / devices / reports / settings / ops / audit。

## 环境

完整栈已就绪(postgres + freeradius + backend:8000 + frontend:5173 http 模式)。
测试账号另行创建:admin_test / operator_test / auditor_test(见 tasks.md)。

## 验收标准(Definition of Done)

1. **维度 1**:每页每个功能点均有"操作→结果"断言,全链路通过;无 5xx;写操作后 DB/审计一致。
2. **维度 2**:RBAC 越权矩阵 100% 覆盖,零越权(前端不可见 + 后端 403);三角色 SOP 无阻塞;
   审计日志完整性 100%(每类写操作必产生 audit_log,字段 actor/action/target 正确)。
3. **维度 3**:交互清单全部通过;危险操作均有二次确认;空/错/载三态齐全;无硬编码颜色/样式回归。
4. 基线验证命令全绿:后端 `pytest -q` + `ruff`,前端 `bun run verify`;新增 http 模式 E2E 脚本全绿。
5. 三轮(摸底→修复复测→回归确认)各有报告,最终《验收报告》达到上述 1-4 才视为完成。

## 非目标

- 不改产品需求、不新增功能(发现缺陷时先记录,是否修复由用户按优先级决定)。
- FreeRADIUS 与 NAS 的真实 UDP 交互(需真实 NAS,不在此次范围;仅验证编译/CoA 封装层)。
