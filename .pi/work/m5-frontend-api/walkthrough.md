# M5 http 模式 8 页走查清单

启动: `VITE_API_BASE=http://localhost:8000 bun run dev`
(后端: compose up + `cd backend && uv run uvicorn openredius.main:app --port 8000`)

## 登录闭环
- [ ] 访问 http://localhost:5173 → 自动跳转 /login
- [ ] 输入 admin / Admin-Dev-2026 → 成功后跳转 /dashboard
- [ ] 刷新页面 → 保持登录(token 自 localStorage 恢复)
- [ ] 输入错误密码 → 显示错误提示

## 仪表盘 /dashboard
- [ ] 4 个 KPI 卡片显示真实数值(online_sessions/auth_today/成功率/NAS)
- [ ] 趋势图:今日/近 7 天切换(chart 双线更新)
- [ ] 告警流:显示 DB 记录(空则回退 fallback mock)

## 在线会话 /sessions
- [ ] 表格渲染 radacct 真实数据(含用户名/设备/VLAN/时长)
- [ ] 筛选:部门/接入方式/NAS/VLAN/认证方式生效
- [ ] 详情抽屉:完整 RADIUS 属性
- [ ] 强制下线:确认→请求后端 CoA→更新列表

## 认证日志 /auth-logs
- [ ] 渲染 radpostauth 真实数据(含归类标签)
- [ ] 筛选:结果/设备/用户/原因/EAP 生效
- [ ] 详情模态:请求/回复属性

## 用户管理 /users
- [ ] 表格渲染真实 users(含部门/策略/最后认证)
- [ ] 筛选:部门/状态/策略/关键词
- [ ] 深链:/users#user=wang.lei 打开抽屉
- [ ] AD 同步(mock 返回固定结果)

## 策略管理 /policies
- [ ] 表格渲染真实策略(含 VLAN/合规/启停态)
- [ ] 编辑抽屉:回填表单字段
- [ ] 启停/删除(mock 不落库)

## 设备管理 /devices(nas+ep)
- [ ] NAS 表格:真实设备(含在线状态/会话数)
- [ ] 深链:/devices#tab=ep 打开终端清单
- [ ] 端点列表:compliance 徽章正确

## 报表 /reports
- [ ] 环图:周期切换(今日/本周/本月)联动
- [ ] 部门准入表、终端类型图

## 系统设置 /settings
- [ ] RADIUS 端口读取真实配置(GET /api/settings)
- [ ] 保存触发 PUT /api/settings

## 深链参数(4 例)
- [ ] /auth-logs#result=失败&nas=SW-5F-01 → 筛选已预填
- [ ] /users#user=wang.lei → 用户抽屉打开
- [ ] /devices#tab=ep → 终端清单已切换
- [ ] /reports#reason=账号锁定 → 定位提示已弹出
