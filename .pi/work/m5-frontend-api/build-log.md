# M5 前端接入真实 API — 构建日志

## 架构

```
src/api/
  config.ts            # VITE_API_BASE → mode=("mock"|"http")
  http.ts              # fetchApi(endpoint,init?) → JSON + ApiHttpError
  auth.ts              # login/logout/refresh/me,token localStorage
  schema.d.ts          # openapi-typescript@6 生成
  resources/*.ts       # 统一函数签名,mode 分发→mock static/http fetch+map
```

## 前端→后端形状映射要点

- **sessions**:acct_unique_id→session, nasporttype→method,
  duration_s→"Xh Ym", nas_name+nas_ip+nas_area→NasRow, ...
- **auth-logs**:backend.time→LogRow.time, rtag_tone→rtagClass(CSS),
  nas_name+nas_sub→nas 组合文本
- **dashboard**:kpis 六字段→KPI 卡片; buckets{accept/reject}→TrendSeries{ok/fail}
- **devices/policies/reports/settings**:逐字段映射,见资源文件

## 关键坑

1. **Mock 模式需同步初始值**:页面以 useState(STATIC_DATA) 初始化,
   useEffect 在 http 模式异步覆盖;mock 模式无 delay(原 data/ 是同步 import)。
   深链 #user=wang.lei 须等 rows 就绪,改为依赖 [rows] 而非 []。
2. **inet CAST 出 CIDR**:nasipaddress=inet,cast→"127.0.0.2/32"与 nasname 不匹配,
   后端 M4 已用 host()修;前端映射仅消费已修正的数据。
3. **openapi-typescript@7 不兼容 Node 24**:ts.factory 导出变更,
   锁定 @6 版本(`bunx openapi-typescript@6`).
4. **PeriodData 周期切换**:mock 模式 REPORT_PERIODS[period] 同步派生,
   http 模式 apiData 覆盖;fetchSummary mock→中文 key('本周')≠API 参数('week'),
   需 `apiPeriod()` 转换。

## 验收

```
bunx tsc -b --noEmit   # clean
bun run verify          # TS + smoke(13 routes) + bun test(21 pass) + fidelity(CI skip)
cd backend && uv run pytest -q && uv run pytest -m integration -q  # 150+9 pass
```
