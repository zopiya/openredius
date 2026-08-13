# UI 统一重构 — 构建日志

## 基线（阶段 0）

| 指标 | 重构前 | 重构后 |
|---|---|---|
| inline style 总量 | 317 | 245 |
| radius-admin.css | 91 行 | 29 行 |
| 页面/组件硬编码颜色 | 173 次 | 5 处（3 处深色背景白字 + charts 语义色，均属「允许保留」） |

## 各阶段实现摘要

### 阶段 1：全局基调
- `src/theme.ts` 回归 antd 默认，仅保留深色 Sider/Menu（Menu 选中态=主色 #1677ff）
- `AntdProvider` 移除 `autoInsertSpace:false`，回归 antd 规范
- 图表颜色统一 antd 语义色板（#1677ff/#ff4d4f/#faad14/#52c41a/#722ed1/#13c2c2）
- E2E「筛选」按钮选择器适配 autoInsertSpace（"筛 选"）

### 阶段 2：Shell ProLayout 化
- 角色徽标→Tag，服务状态→Badge，头像→Avatar（主色背景），header 背景/边框 token 化

### 阶段 3：组件抽取
- 新增 `TableToolbar` + `FilterField`（ProTable toolbar 风格）
- `PageHeader` 支持可选 TabBar，标题 level={4}

### 阶段 4：逐页替换（8 页 + Login）
| 页面 | 关键替换 |
|---|---|
| Settings | .kv→Descriptions，字段映射表→Table，授权弹窗→Table+radio |
| AuthLogs | 筛选栏→TableToolbar，.rtag→Tag，.kv→Descriptions，主卡片→Card |
| Users | 抽屉 .kv→Descriptions，.d-sec→Divider，子表→Table |
| Sessions | 展开行 .kv→Descriptions，主卡片→Card，筛选栏→TableToolbar |
| Dashboard | KpiCard 语义化(tone)，接入分布→Progress，告警颜色 token 化 |
| Devices | 双 tab 筛选栏→Flex+FilterField，离线提示→Alert，.d-sec-t→Divider |
| Policies | 冲突提示→Alert，.mv→Button，主卡片→Card |
| Reports | 负载 TOP6→Progress，表格 SF Mono→Typography code |
| Login | 背景/边框/阴影 token 化，logo 深色品牌色 |

### 阶段 5：CSS 清理
- radius-admin.css 91→29 行，仅保留 `.chart-svg` 系列（SVG 降级）+ `.port-grid/.port`（端口网格）
- 删除 `.tbl/.tbl-skel` 引用，单测改用 `.ant-skeleton`

## 关键 API 适配（antd 6 变更）
- `Alert.message` → `title`（废弃）
- `Divider.orientation` 文字位置 → `titlePlacement`（orientation 现为线条方向）
- `Space.direction` → `orientation`
- `Drawer.width` → `size`（阶段 A 已改）

## 保留的自定义 CSS 清单（antd 无对应组件）
1. `.chart-svg` 系列 — 图表 SVG 降级（happy-dom 测试环境无 Canvas）
2. `.port-grid/.port` — 设备抽屉端口接入网格
3. 深色侧边栏品牌区白字/白 logo（3 处 inline，深色背景必要色）

## 文案统一走查（阶段 6）

| 页面 | 菜单名 | PageHeader title | 一致性 |
|---|---|---|---|
| /dashboard | 仪表盘 | 仪表盘 | ✓ |
| /sessions | 在线会话 | 在线会话 | ✓ |
| /auth-logs | 认证日志 | 认证日志 | ✓ |
| /users | 用户管理 | 用户管理 | ✓ |
| /policies | 策略管理 | 策略管理 | ✓ |
| /devices | 设备管理 | 设备管理 | ✓ |
| /reports | 报表统计 | 报表统计 | ✓ |
| /settings | 系统设置 | 系统设置 | ✓ |

术语统一：认证日志 / 在线会话 / 报表统计 / 准入网络设备(NAS) / 终端准入清单 全站一致。
