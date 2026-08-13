# Backend 端到端审计与打磨

## 目标
对 backend/ 全部代码对照 docs/ 做端到端功能审计,找出不足与可完善处,并修复打磨。

## 审计维度(对应文档)
1. API 契约一致性 — docs/03-api-design.md(每个端点存在、形状、权限、错误体、分页)
2. 后端设计一致性 — docs/04-backend-design.md(布局、配置键、编译器、CoA、jobs)
3. 领域模型一致性 — docs/02-domain-model.md(实体字段、状态机、命名约定、归类)
4. 安全设计 — docs/08-security.md(RBAC 矩阵、认证、Secret、审计、限流)
5. 测试覆盖 — docs/09-testing-quality.md(必测场景 1-8)
6. FreeRADIUS 集成 — docs/06(编译器产物、CoA、Class 约定)
7. 部署 — docs/07(Dockerfile、prod 强校验)

## 严重度
- P0 blocker:与文档/契约冲突,功能缺失或安全漏洞
- P1 high:正确性/安全边界问题
- P2 medium:健壮性、边界、可观测性
- P3 polish:命名、注释、代码组织、小改进

## 状态
- 基线:158 passed, 9 deselected(integration);ruff/format clean
