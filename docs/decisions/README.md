# 架构决策记录(ADR)

规则:只增不改;推翻旧决策写新 ADR 并把旧的状态改为"已被 ADR-NNNN 取代"。

模板:

```
# ADR-NNNN · 标题
- 状态:已接受(YYYY-MM-DD)
- 背景 / 备选方案 / 决定 / 后果
```

索引:

| ADR | 主题 | 状态 |
|---|---|---|
| [0001](./ADR-0001-backend-stack.md) | 后端技术栈(uv + FastAPI) | 已接受 |
| [0002](./ADR-0002-freeradius-engine.md) | FreeRADIUS 作为认证引擎 | 已接受 |
| [0003](./ADR-0003-repo-layout.md) | 仓库布局(前端留根目录) | 已接受 |
| [0004](./ADR-0004-postgresql.md) | PostgreSQL 单库双 schema | 已接受 |
| [0005](./ADR-0005-frontend-data-layer.md) | 前端数据层切换策略 | 已接受 |
| [0006](./ADR-0006-coa-pyrad.md) | CoA 实现选用 pyrad | 已接受 |
