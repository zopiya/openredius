# 端到端全量测试 — 缺陷与修复状态

> R1 摸底完成(三 reviewer 并行)→ R2 修复完成 → 待 R3 回归。
> 验证基线:后端 `pytest -q` 173 passed / ruff 绿;前端 `bun run verify` 35 pass;
> `bun scripts/e2e-http.mjs` **41/41 全绿**(真实后端 + Postgres)。

## R1 缺陷清单(完整)

### P1 — 已全部修复 ✅

| # | 缺陷 | 修复 |
|---|---|---|
| 1 | Reports 页 http 白屏(`r.ok.replace` 数字当字符串) | `Number(String(r.ok).replace(/,/g,''))` 归一化 |
| 2 | 全站写操作 UI 未接线(假 toast) | Users/Policies/Devices/Settings 写操作接真实资源层函数;Sessions/AuthLogs/Reports 导出接 `downloadFile` |
| 3 | 审计日志无前端入口 | 新增 `src/api/resources/audit.ts` + `src/pages/AuditLogs.tsx` + 路由 `/audit` + 菜单(admin/auditor) |
| 4 | 管理员角色变更无二次确认 | `modal.confirm` 二次确认(提权/降权均确认) |

### P2 — 已全部修复 ✅

| # | 缺陷 | 修复 |
|---|---|---|
| 5 | Shared Secret 查看失真(只显示掩码) | NasRow 加 id + `getNasSecret(id)`;点击眼睛调 `/nas/{id}/secret` 显示明文,secret.reveal 审计落库 |
| 6 | RBAC 前后端不一致 | 前端:Sessions 强制下线按角色隐藏(canKick);后端:users/policies/devices 只读端点 `current_admin`→`require_role`(users→admin+operator,policies/devices→admin);同步更新 2 个测试断言 |
| 7 | Users 字段错配(device_count/last_auth) | `endpoint_count` 映射 + UserRow 加 `policyId`(策略组筛选/分配用真实策略 id) |
| 8 | 报表导出假占位 | `exportReport(format,period)` 接 `/reports/export` 触发下载 |

### P3 — 部分修复,部分挂起

| # | 缺陷 | 状态 |
|---|---|---|
| 9 | 苹果品牌色残留(charts) | ✅ 已清(#6e6e73/#86868b/#e8e8ed/#1d1d1f/#424245/SF Pro → antd 语义色) |
| 14 | 策略启停未接线/无删除入口 | ✅ 启停接 `togglePolicy`;新增删除按钮(modal.confirm) |
| 15 | session.disconnect 审计 target 为 null | ✅ 补 `target_type="session"` + `target_id=unique_id` |
| 16 | 管理员撤销用 window.confirm | ✅ 改 antd `modal.confirm` |
| 10 | `style={{` 219 处(阈值 40) | ⏸ 挂起:历史 UI 迁移遗留,量大且多为布局性 inline style,不影响功能 |
| 11 | 硬编码统计数字(1,286/1,472/12,713/37) | ⏸ 挂起:需后端补统计端点或前端按列表 total 改造,单独排期 |
| 12 | 三态缺失(Dashboard/Policies/Devices-EP/Reports/Settings) | ⏸ 挂起:体验增强,4 个列表页已有三态,其余为表单/图表页 |
| 13 | toast 统一 message.info 无语义色 | ⏸ 挂起:需改 `useToast` 签名 + 全站调用点,单独排期 |
| 16 | 面包屑重复(顶栏+页头两份) | ⏸ 挂起:纯视觉,低优先级 |

## 非缺陷(记录)

- DeptBarChart.tsx 消费 number 正确,无需改。
- 后端写端点普遍带 `audit.record_audit`,无「写端点缺审计」。
- AD 同步未配置时 503 前置拒绝不落审计(需 AD 配置才能测),观察项。
- E2E 有 1 条瞬时 401(未登录访问受保护 API 的正常守卫行为),非缺陷。

## R3 待办

1. 全量回归:后端 pytest + 前端 verify + e2e-http 再跑一遍(已在 R2 收尾跑过,41/41)。
2. 复核 RBAC 越权矩阵(前端隐藏 + 后端 403)在 UI 层生效。
3. 出验收报告(对照 spec.md DoD)。
