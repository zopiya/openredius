# ADR-0005 · 前端数据层:冻结视觉,resources 层 mock→http 双轨切换

- 状态:已接受(2026-08-06)

## 背景

前端是 1:1 高保真移植,有保真度审计门禁;同时存在未完成的 Tailwind/UI-kit 重构。

## 决定

1. MVP 冻结视觉层与组件结构;radius-admin.css 为样式事实来源。
2. `src/api/resources/*` 为唯一数据缝:导出签名不变,实现按 `VITE_API_BASE`
   在 mock/http 间切换。
3. OpenAPI(openapi-typescript)生成类型,映射到既有 DTO,页面不感知。
4. Tailwind 令牌体系(index.css)与 components/ui 暂停推进,M7 后另立项。

## 后果

- 正面:保真回归风险最小;交互测试持续有效;前后端可并行开发(mock 不阻塞)。
- 代价:双轨代码需维护到 mock 退役(M7 后决定);UI-kit 冻结期有轻微腐化风险。
