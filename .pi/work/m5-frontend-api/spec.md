# M5 前端接入真实 API — 实施说明

## 策略

- 类型别名不变:`src/api/types.ts` 签名保持,`src/data/*` mock 数据保持;
  映射/取数在 `src/api/resources/*` 内完成。
- 模式开关:`VITE_API_BASE` 存在 → http;否则 mock(全兼容现有 CI)。
- 8 页逐页改造:从 `src/data/` 直引改为 `src/api/resources/` 单入口(保留 loading/error UI)。

## 架构

```
src/api/
  config.ts            # VITE_API_BASE → mode=("mock"|"http")
  http.ts              # fetchApi(endpoint, init?) → JSON + error
  auth.ts              # login / logout / refresh / me / token 存储
  resources/*.ts       # 对外统一函数签名,内部按 mode 分发→完成 map
```

## 前端→后端形状映射要点

- sessions: acct_unique_id(→session), username+name+dept, mac=callingstationid,
  method 用 nasporttype 推导, nas_name+nas_area+nas_ip+nas_port, vlan+nvl(vlan_label),
  auth_method, duration_s→"Xh Ym" 字符串, status, filter_id, session_timeout, start
- auth-logs: username+name+dept(join), mac=callingstationid, nasipaddress→nas_name(join),
  reply→result, reason_key→label+signature, authdate→time
- users: 映射到 UserRow(name/account/dept/status/policy/title/devices/lastAuth);
  recent_auth 来自 detail
- dashboard: kpis 六字段→KPI 卡片; trend buckets→chart series; alerts→告警列表
- policies: PolicyOut→PolicyRow(id/name/sub/scope/eap/vlan/compliance/on)
- devices: NasOut→NasRow; EndpointOut→EndpointRow
- reports: summary(donut)/endpoint-types/departments
- settings: GET/PUT /api/settings
