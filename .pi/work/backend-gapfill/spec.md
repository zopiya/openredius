# Backend 缺失功能补齐 — 规格

## 目标
把后端相对 docs/ 的全部缺失/未实现/需预留的能力补齐,使 docs/03 契约 100% 实现、
docs/01/04/07/08 提到的承诺功能落地,并为未来扩展预留接口与抽象。不跨前端 worktree。

## 差距清单(审计结论)

### A. 契约承诺但 501 / 未实现
- **G1 报表导出 pdf/xlsx** — `GET /api/reports/export` 目前仅 csv(单表),pdf/xlsx 返回 501
  (docs/03「导出」;前端 Reports 页有「导出 PDF/Excel」按钮)

### B. 文档承诺但未实现
- **G2 批量 CoA 重授权** — docs/01 数据流 4「存量会话按策略要求可选触发批量 CoA(M6+)」;
  目前只有 disconnect 单向,无 CoA-Request
- **G3 AD 直通 + NT-Password 委派登录** — docs/08「prod 建议 NT-Password 或 AD 直通(rlm_ldap)」;
  目前 admin.linked_account 仅比对 radcheck Cleartext-Password 明文

### C. 预留(未来可能需要,现在落接口/抽象)
- **G4 `/api/portal/*`** 访客门户命名空间 — docs/01「API 命名空间已预留,未实现」
- **G5 告警事件总线抽象** — docs/01「告警引擎以轮询起步,接口抽象保留推送化空间」
- **G6 `/api/health` 扩展** — docs/07「指标(M7 之后可选):/api/health 扩展 + Prometheus exporter」
- **G7 多 FreeRADIUS 实例** — docs/01「nas.server 字段与 CoA 目标已按实例可扩展」;核对 CoA 目标取 server

### D. 前端接口核对(不改前端,只核后端覆盖)
- **G8** 核对 docs/03 全部端点 + 前端 `src/api/resources/*` 实际调用,确认后端 100% 覆盖

## 验收
- 全部 `cd backend && uv run pytest -q` 通过(现有 161 + 新增)
- `uv run ruff check . && uv run ruff format --check .` 通过
- `uv run alembic upgrade head` 通过(如有迁移)
- 新端点 OpenAPI 可见、形状符合 docs/03
- 每个新功能有回归测试
