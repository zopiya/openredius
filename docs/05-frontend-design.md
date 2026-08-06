# 05 · 前端设计(bun + React + TS)

## 总原则:冻结视觉层,只换数据层

原型的视觉、布局、交互、文案是验收基线(`bun run verify` 中的保真度审计是门禁)。
MVP 阶段**不做**任何视觉重构;所有改动围绕"把 mock 数据换成真实 API"。

## 现状盘点(2026-08)

- 页面仍使用旧组件:`components/{Shell,Toast,Modal,Drawer,states}.tsx`、`components/charts/*`。
- 存在未接入的新件:`components/ui/*`(ui kit)、`components/layout/Shell.tsx`、
  `src/styles/index.css`(Tailwind v4 设计令牌)、`src/lib/utils.ts`——属于中途重构产物。
- 数据缝已就位:`src/api/resources/{sessions,logs,users}.ts` 的函数签名与注释即目标 API 契约。
- 构建基线:TS7 要求移除 `baseUrl`(已修);`bun run verify` 全绿是当前门禁。

## 数据层切换(M5 核心)

1. 新增 `src/api/http.ts`:fetch 封装(baseURL=`import.meta.env.VITE_API_BASE ?? ''`,
   Bearer token 注入,401 自动 refresh 一次,统一错误解包为 `ApiError`)。
2. `src/api/resources/*` 保持**导出签名不变**,实现改为 http 调用;
   未实现的资源(devices/policies/reports/dashboard/settings)按 03 契约新增。
3. 模式开关:`VITE_API_BASE` 未设置 → 走 mock(原型演示能力保留,交互测试继续有效);
   设置后走真实后端。mock/http 双轨在资源层内用 `if (!API_BASE) return mockImpl()` 收敛。
4. 加载/错误态沿用 `components/states.tsx` 的骨架屏/空态/错误态。

## 类型与契约

- `src/api/types.ts` 的 DTO 签名冻结(页面与保真测试依赖)。
- 新增 `bun run api:gen`:`openapi-typescript ${VITE_API_BASE}/openapi.json -o src/api/schema.d.ts`;
  资源层负责 schema→DTO 映射。若后端不可达,提交生成的 schema 快照入库。
- 任何 DTO 变更必须同步更新 `docs/03-api-design.md` 并重跑 `api:gen`。

## 新增工程件

| 件 | 说明 |
|---|---|
| `src/api/auth.ts` | 登录/refresh/token 存储(sessionStorage);未登录 → `/login` |
| `src/pages/Login.tsx` | 登录页(视觉沿用设计令牌;新路由,不影响原型 8 页) |
| `src/hooks/useApi.ts` | 轻量请求 hook(loading/error/data),不引入额外状态库 |
| `vite.config.ts` | dev 增加 `/api` proxy → `http://localhost:8000`(仅 dev) |

## 测试策略

- 现有 21 个交互测试 + smoke + 保真审计:在 **mock 模式** 下必须恒绿(回归门禁)。
- 新增 `tests/api-contract.test.ts`:对 schema.d.ts 与 types.ts 做关键形状断言。
- http 模式冒烟:dev compose 起栈后手工/脚本走查 8 页(列入 M5 验收)。
- 不引入 Playwright(MVP 之外,可选)。

## Tailwind 迁移决定

`src/styles/index.css` 的令牌体系保留但**不在 MVP 推进全量迁移**(radius-admin.css 仍是
页面样式事实来源,迁移有保真风险)。收尾建议放在 M7 之后单独立项(ADR-0005)。
未接入的 `components/ui/*` 冻结,避免双轨腐化;后续迁移时统一替换。

## 约束清单(自动化开发必读)

1. 不得改动 `src/styles/radius-admin.css` 与页面既有类名/结构(保真审计)。
2. 不得改动 `src/api/types.ts` 既有类型签名;新增字段用可选属性。
3. 深链语义(`#result=失败&nas=…` 等)必须保留并有测试覆盖。
4. 依赖新增需写入本文档并说明理由;禁止引入 UI 组件库/状态管理库。
