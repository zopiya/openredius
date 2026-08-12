# M5 前端接入真实 API — 完成

- [x] `src/api/config.ts`:模式开关(`VITE_API_BASE` → http,否则 mock)
- [x] `src/api/http.ts`:fetchApi 封装(Bearer token、错误体解析)
- [x] `src/api/auth.ts`:login/logout/refresh/me,localStorage 持久化
- [x] `src/pages/Login.tsx` + `src/components/AuthGuard.tsx`:
      http 模式未登录→/login;登录后回到原始路由
- [x] resources 全覆盖(8 模块双轨:mock 同步返回 / http→后端映射)
  - sessions:fetchSessions + disconnectSessions(CoA)
  - logs:fetchAuthLogs(服务端筛选参数)
  - users:fetchUsers + updateUserStatus + assignUserPolicy + syncAdNow
  - dashboard:fetchKpis/fetchTrend/fetchAlerts/readAlert
  - devices:fetchNas/fetchEndpoints + import/whitelist/revokeCert
  - policies:fetchPolicies/getPolicyForm/savePolicy/toggle/delete/reorder
  - reports:fetchSummary(period)/fetchEndpointTypes/fetchDepartments
  - settings:fetchSettings/saveSettings
- [x] 8 页全部从 `src/data/*` 直引切换到 `src/api/resources/*`
      (mock 模式保持同步初始值,http 模式异步加载;loading/error 态沿用原有骨架)
- [x] `bun run api:gen`:openapi-typescript@6 生成 `src/api/schema.d.ts`(2,274 行)
- [x] vite dev proxy:`/api` → `http://localhost:8000`
- [x] verify:TS 干净、21 交互测试全绿、冒烟 13 路由渲染通过、保真度跳过(CI 无原型)
