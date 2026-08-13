# 11 · Ant Design 5 迁移计划

> **执行注记**: 本计划实际落地为 **Ant Design 6**(2026-08,见 docs/05-frontend-design.md「现状盘点」)。
> 保留原文作为历史计划记录;所有 antd 5 专属 API 与 `v5-patch-for-react-19` 均已在代码中清除。

**版本**: v0.1.0-草案  \
**依赖**: M0–M7 全部完成 · ADR-0005(Tailwind 迁移保留) \
**目标**: 在保留现有布局排版的前提下，将全部 UI 从自定义 CSS 迁移到 Ant Design 5，
停止手工维护 CSS 与组件 。

---

## 1. 现状分析

### 1.1 当前技术栈

| 层 | 技术 | 问题 |
|---|---|---|
| 样式 | `radius-admin.css`(≈800 行手写 CSS) | 无设计系统、变量散落、改一行怕崩全局 |
| 通用件 | 手写 Shell / Toast / Modal / Drawer / states | 功能弱:Modal 需手动 `.show` 类、Toast 无队列、Skeleton 无动画 |
| 表格 | 手写 `<table>`+ 手动筛选/分页 | 每页 100-300 行代码、深链 hash 解析自维护 |
| 表单 | 手写 `<input>`+`<select>` | 无校验状态绑定、无 loading 态 |
| 图表 | 内联 SVG(手算坐标点) | 趋势图/环形图代码量 200+ 行、不可配置 |
| 冻结件 | `components/ui/*`(shadcn Badge/Button/Card/Table/Toast/States) | 从未接入页面、样式与业务脱节 |

### 1.2 页面清单(9+2)

| 路由 | 页面 | 核心组件 | 复杂度 |
|---|---|---|---|
| `/login` | 登录 | Form + Input + Button | 低 |
| `/dashboard` | 仪表盘 | KPI 卡片 + TrendChart + AlertFeed + Skeleton | 中 |
| `/sessions` | 在线会话 | Table(筛选/分页/展开/行选/导出) + Drawer + 强制下线 Modal | **高** |
| `/auth-logs` | 认证日志 | Table(高级筛选) + Detail Modal | 高 |
| `/users` | 用户管理 | Table + UserDrawer + 批量操作 + AD 同步按钮 | 高 |
| `/policies` | 策略管理 | Table + 多步 Form Drawer + 拖拽排序 + 启停开关 | **高** |
| `/devices` | 设备管理 | Tabs(NAS/终端) + Table + 端口/SSID 抽屉 + Secret 明文 Modal + 批量导入 | 高 |
| `/reports` | 报表统计 | DonutChart + Table + 导出按钮 + 3 时段切换 | 中 |
| `/settings` | 系统设置 | 子导航 scrollspy + Form + AlertRules + AdminSection(表格+授权 Modal) | 高 |
| `/audit` | 审计日志(M7 后新增) | Table(动作/操作人/时间筛选) + CSV 导出 | 中 |

---

## 2. Ant Design 5 映射方案

### 2.1 布局:ProLayout 风格（不引入 Pro）

使用 **antd 原生 Layout 组件** 实现 ProLayout 同等效果，避免引入 `@ant-design/pro-layout` 的额外依赖和主题复杂度：

| 当前件 | Ant Design 件 |
|---|---|
| `Shell.tsx`(asider+topbar+content) | `Layout` + `Layout.Sider` + `Layout.Header` + `Layout.Content` |
| `side-nav` 导航链接 | `Menu`(inline mode, selectedKeys 自动同步路由) |
| `topbar-title` 页面名 | `Typography.Title` |
| `search` 搜索框 | `Input.Search`(侧边栏顶部或顶栏内) |
| `user-chip` 用户 chip | `Dropdown` + `Button`(trigger=click) |
| 侧边栏底部 "RADIUS 服务正常" | `Sider` 的 `bottom` 插槽或自定义 footer |

Sider 折叠/展开用 `Layout.Sider` 的 `collapsible` 内置——不需要自己写 CSS。

### 2.2 通用件

| 当前件 | Ant Design 5 件 | 说明 |
|---|---|---|
| `Toast.tsx`(单例 toast) | `App.useApp().message` | 内建队列、duration、type(success/error/warning/info) |
| `Modal.tsx`(手写叠层+动画) | `Modal` | confirm/prompt 内置、异步关闭(onOk return Promise) |
| `Drawer.tsx`(右侧抽屉) | `Drawer` | 支持多步(multi-level drawer)、表单内嵌 |
| `states.tsx`(骨架屏/空态/错误) | `Skeleton` / `Empty` / `Result` | Avatar/Table/Form 形变骨架内置 |
| `ui/badge.tsx`(冻结) | `Tag` / `Badge` | 颜色枚举一致(success/warning/error/processing/default) |
| `ui/button.tsx`(冻结) | `Button` | 全部变体(primary/dashed/text/link/danger + loading) |
| `ui/table.tsx`(冻结) | `Table` | **迁移核心收益**(见 2.3) |
| `ui/form.tsx`(冻结) | `Form` + `Form.Item` | 内建校验、layout=vertical/horizontal、loading |
| `ui/tabs.tsx`(冻结) | `Tabs` | 设备管理 NAS/终端切换 |
| `ui/card.tsx`(冻结) | `Card` | 仪表盘 KPI 卡 / 设置页分区 |
| `ui/overlay.tsx`(冻结) | `Popover` / `Tooltip` | 辅助信息、提示 |

### 2.3 Table——最大单项收益

当前每页表格 **100–300 行手写 JSX**，手工实现:排序、筛选、分页、行展开、行选择、导出、深链 hash 解析。Ant Table 声明式覆盖:

```tsx
// 迁移前(Sessions.tsx):~200 行手写 table + 筛选条
// 迁移后:
<Table
  rowKey="acct_unique_id"
  columns={columns}
  dataSource={data}
  loading={loading}
  pagination={{ pageSize: 50, showSizeChanger: true }}
  onChange={(pagination, filters, sorter) => { /* 触发API */ }}
  expandable={{ expandedRowRender: (row) => <SessionDetail row={row} /> }}
  rowSelection={{ selectedRowKeys, onChange }}
/>
```

列定义仅需描述:

```tsx
const columns: ColumnsType<SessionRow> = [
  { title: '用户', dataIndex: 'name', sorter: true, render: (v, r) => <><b>{v}</b><br/>{r.username}</> },
  { title: 'MAC', dataIndex: 'mac', width: 150 },
  { title: '接入方式', dataIndex: 'method', filters: [{ text:'有线', value:'wired' }, { text:'WiFi', value:'wifi' }] },
  { title: '时长', dataIndex: 'duration_s', sorter: true, render: (v) => formatDuration(v) },
  // ...
];
```

筛选状态从 URL hash 迁移到 `Table` 的 `filters`/`defaultFilteredValue`，不再手写 hash 解析。

### 2.4 图表——@ant-design/charts

| 当前件 | Ant Design Charts |
|---|---|
| `TrendChart.tsx`(内联 SVG,10 分钟/1 小时间隔手动计算) | `@ant-design/charts` `Line`(smooth, area, 自动刻度) |
| `Donut.tsx`(环形占比,SVG path 手算弧度) | `@ant-design/charts` `Pie`(donut 模式,内置 label/legend) |

仪表盘 KPI 卡片用 `Card` + `Statistic`。

### 2.5 主题——保持现有视觉风格

Ant Design 5 的 **Design Token** 机制允许精确映射现有 CSS 变量到 antd 主题:

| 当前 CSS 变量 | Ant Design Token |
|---|---|
| `--fg`(主文字,#1a1a1a) | `colorText` |
| `--fg-2`(次要文字) | `colorTextSecondary` |
| `--muted`(辅助文字) | `colorTextTertiary` |
| `--accent`(品牌蓝) | `colorPrimary` |
| `--bg`(页面底色) | `colorBgLayout` |
| `--surface`(卡片底色) | `colorBgContainer` |
| `--rule`(边框) | `colorBorderSecondary` |
| `--shadow`(卡片阴影) | `boxShadow` |
| `--radius`(圆角) | `borderRadius` |

通过 `ConfigProvider` 注入:

```tsx
<ConfigProvider theme={{
  token: {
    colorPrimary: '#2957B2',
    borderRadius: 6,
    fontFamily: 'inherit',
  },
  components: {
    Layout: { siderBg: '#0F1923' },
    Menu: { darkItemBg: '#0F1923', darkItemSelectedBg: '#1A2C42' },
    Table: { headerBg: '#FAFBFC' },
  },
}}>
  <App />
</ConfigProvider>
```

迁移后 `radius-admin.css` 可删除约 90%——仅保留设计令牌映射和深色侧边栏等微调。

---

## 3. 迁移阶段

### 阶段 0:基础设施(1 天)

不碰任何页面，只做环境准备:

| # | 任务 | 产出 |
|---|---|---|
| 0.1 | `bun add antd @ant-design/icons @ant-design/charts` | 依赖锁入 bun.lock |
| 0.2 | 创建 `src/theme.ts`——ConfigProvider 主题配置 | 设计令牌映射 + 组件 token |
| 0.3 | 创建 `src/providers/AntdProvider.tsx`——包裹 `App` | 全局 ConfigProvider + App(useApp) |
| 0.4 | 更新 `src/main.tsx`:最外层插入 AntdProvider | 保留 ToastProvider 到阶段 3 |
| 0.5 | 确保 `bun run verify` 在引入 antd 后依然全绿 | 依赖解析无冲突 |

### 阶段 1:布局与通用件(1–2 天)

| # | 任务 | 说明 |
|---|---|---|
| 1.1 | 用 `Layout`+`Sider`+`Menu`+`Header` 重写 `Shell.tsx` | 保留侧边栏深色风格；menu selectedKeys 自动同步路由；顶栏实名+下拉不变 |
| 1.2 | 删除 `components/Toast.tsx` → 全局 `App.useApp().message` | 移除 ToastProvider 包装 |
| 1.3 | Modal / Drawer 改用 antd 内置件 | 页面中手工 `div.modal-overlay` → `<Modal open={…} />` |
| 1.4 | 删除 `components/ui/*`(冻结件) | 保留 charts 目录到阶段 4 |
| 1.5 | `Login.tsx` 用 `Form`+`Input`+`Button` 重写 | loading 态、校验信息 antd 原生支持 |
| 1.6 | 更新 smoke / interaction 测试 | class 选择器部分需适配 antd DOM 结构 |

### 阶段 2:表格类页面(2–3 天)——按复杂度顺序

每个页面逐页迁移，保真度审计(MOCK 模式)作为门禁，需求改造同时完成:

| 优先级 | 页面 | 关键改造点 |
|---|---|---|
| **P0** | Dashboard | Card+Statistic(KPI)、Skeleton 替换骨架屏、Alert 列表→List |
| **P0** | Sessions | Table(展开详情/行选/分页/筛选/导出) + 下线 Modal |
| **P1** | AuthLogs | Table(高级筛选) + 详情 Modal |
| **P1** | Users | Table(批量操作) + Drawer(用户详情+最近认证+端点+下发规则) + 同步 AD 按钮 |
| **P1** | Policies | Table + Drawer(多步表单) + 拖拽排序(`@dnd-kit` 或 Table row drag) + Switch 启停 |
| **P2** | Devices | Tabs + Table * 2(NAS/终端) + 端口/SSID 子表 + Secret 查看 Modal |
| **P2** | Reports | Donut + Table + Radio.Group 时段切换 + Export 按钮 |
| **P2** | Settings | 子导航 scrollspy→Anchor + Form(端口校验) + AdminSection(表格+Modal) |

每页迁移验收:在该页 mock 数据下，所有交互测试通过。

### 阶段 3:图表(1 天)

| # | 任务 |
|---|---|
| 3.1 | 仪表盘趋势图:`TrendChart`(内联 SVG)→`@ant-design/charts` `Line` |
| 3.2 | 报表环形图:`Donut`(SVG 手算)→`@ant-design/charts` `Pie`(donut) |
| 3.3 | 删除 `components/charts/` 目录 |

### 阶段 4:清理(0.5 天)

| # | 任务 |
|---|---|
| 4.1 | 删除 `src/styles/radius-admin.css`(保留主题 token 映射至 theme.ts) |
| 4.2 | 删除 `src/styles/index.css`(Tailwind v4 令牌，已不再使用) |
| 4.3 | 删除 `components/Toast.tsx` / `components/Modal.tsx` / `components/states.tsx` |
| 4.4 | 更新 `docs/05-frontend-design.md` 至迁移后状态 |
| 4.5 | 更新 smoke / fidelity / interaction 测试的阈值(bun run verify 全绿) |
| 4.6 | 全量走查:8 页 + 登录 + 授权 + 改密 + 深链 |

---

## 4. 与现有 SOP 的衔接

迁移不影响已有的业务逻辑和 API 层:

- `src/api/auth.ts` :JWT/refresh/me/fetchMe/fetchApi——**不动**
- `src/api/resources/*.ts` :8 资源模块返回类型——**不动**
- `AuthGuard` :路由守卫——**不动**
- 后端全部 API——**不动**

只改变组件渲染层和样式。登录后的默认落地 `/dashboard`、侧边栏角色过滤、顶栏下拉（修改密码/退出）、管理员与权限授权——全部保留，用 Ant Design 组件重实现。

---

## 5. 测试策略

| 测试类型 | 影响 | 对策 |
|---|---|---|
| 交互测试(20 用例) | class 选择器可能失效 | 适配 antd DOM 结构、或改用 `data-testid` |
| 烟雾测试(14 路由) | 页面可以 SSR 渲染 | 保持，antd 组件 SSR 兼容 |
| 保真度审计 | class 名/文案变化 | 更新审计基线，接受可控偏差 |
| API 契约测试 | 无影响 | 不动 |
| 后端 173+9 用例 | 无影响 | 不动 |

---

## 6. 文件级变更清单

```text
新增:
  src/theme.ts                    # Ant Design 5 ConfigProvider 主题令牌
  src/providers/AntdProvider.tsx  # 包装件(ConfigProvider + App)

重写:
  src/components/Shell.tsx        # Layout + Menu + Dropdown + Input.Search
  src/pages/Login.tsx             # Form + Input.Password + Button
  src/pages/Dashboard.tsx         # Row/Col + Card + Statistic + Skeleton + List
  src/pages/Sessions.tsx          # Table + Modal + Button
  src/pages/AuthLogs.tsx          # Table + Modal
  src/pages/Users.tsx             # Table + Drawer + Button + Select
  src/pages/Policies.tsx          # Table + Drawer(Form) + Switch + Button
  src/pages/Devices.tsx           # Tabs + Table * 2 + Modal + Upload
  src/pages/Reports.tsx           # Pie + Table + Radio.Group + Button
  src/pages/Settings.tsx          # Anchor + Form + Card + Table + Modal
  src/components/charts/*.tsx     # → @ant-design/charts

删除:
  src/components/Toast.tsx
  src/components/Modal.tsx
  src/components/Drawer.tsx
  src/components/states.tsx
  src/components/ui/*
  src/styles/radius-admin.css
  src/styles/index.css
  src/pages/Launcher.tsx(已在M7删除)
```

---

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| antd 5 包体积 | Tree shaking + 按需加载页面(lazy import) |
| 交互测试 class 选择器失效 | 改用 `getByText`/`getByRole`，配合 `data-testid` |
| 保真度审计差异过大 | 接受 CSS class 层面的合理偏差，文案/结构/交互不变 |
| 迁移进度拖慢主功能 | 按阶段分 PR 提交，每个阶段独立可合入 |
| antd 主题与原型视觉不一致 | 用 ConfigProvider token 精确映射，保留深色侧边栏等关键特征 |

---

## 8. 开发与审计循环（强制流程）

每个阶段的每个页面**必须**走完至少 3 轮循环才视为完成:

```text
第 1 轮:实现 → 验证 → 发现问题 → 记录
第 2 轮:修正 → 验证 → 发现残余问题 → 记录
第 3 轮:修正 → 验证 → 全部通过 → 进入下一页面
```

### 8.1 实现规则

1. **不确定就去查 Ant Design 官方文档**，绝不猜测 API 签名或 prop 名称:
   - 组件参考:https://5x.ant.design/components/overview-cn
   - 每个组件页有「代码演示」折叠面板——展开看源码，复制即用
   - `ConfigProvider` 主题 token 列表:https://5x.ant.design/docs/react/customize-theme-cn
2. **优先用 antd 内置功能**，不要绕开手写:
   - 表格排序/筛选/分页 → Table 的 `onChange` + `sorter`/`filters` prop
   - 表单校验 → Form.Item 的 `rules`
   - 异步操作 loading → Button 的 `loading` prop + Modal 的 `confirmLoading`
3. **保留现有业务逻辑不动**:
   - `src/api/auth.ts` / `src/api/http.ts` / `src/api/resources/*.ts` 不改
   - `AuthGuard` 不改
   - 页面内状态管理逻辑尽量保持不变，只换组件壳

### 8.2 审计检查清单（每轮执行）

```text
[ ] bun run verify 全绿（tsc + smoke + test + fidelity）
[ ] 页面在 mock 模式(http 不启动)下无白屏、无 Console 报错
[ ] 页面在 http 模式下正常渲染真实数据
[ ] 所有交互逻辑保留:筛选/分页/展开/二次确认/抽屉/深链/状态流转
[ ] Table columns: sorter/filters/render 的行为与预期一致
[ ] Form:校验信息正确显示、提交 loading 态正常
[ ] Modal/Drawer:打开/关闭/遮罩点击/异步确认均正常
[ ] 侧边栏:当前页高亮、角色过滤正确
[ ] 顶栏:用户信息正确、下拉菜单(修改密码/退出)可用
[ ] 主题:侧边栏深色风格保留、品牌色正确、圆角/间距协调
[ ] 删除的文件确实不再被任何地方 import
```

### 8.3 审计失败处理

- 如果是 antd 组件用法错误 → 查官方文档修正，不自行绕路
- 如果是测试期望过时 → 先更新测试，再确认功能正常
- 如果是 antd 与现有逻辑冲突 → 记录到 `docs/11-ui-migration.md` 的风险表
- 同一问题在第 3 轮仍未解决 → 暂停，标记为 BLOCK 并说明原因

### 8.4 质量门禁

每个阶段完成后:

```bash
bun run verify   # tsc + smoke + test + fidelity —— 必须全绿
(cd backend && uv run ruff check . && uv run pytest -q)  # 后端不回归
```

提交信息格式:`feat(ui): 阶段 N——<页面名> Ant Design 迁移`

---

## 9. 启动提示语

以下提示语可以粘贴到新的 pi 会话中启动完整的 UI 迁移:

> 执行 OpenRedius Ant Design 5 UI 迁移。
>
> **项目根目录**:`/workspaces/openredius`
>
> **必读文档**:`docs/11-ui-migration.md`（完整阅读后再动手）
>
> **核心约束**:
> 1. 每个阶段每个页面至少 3 轮 audit 循环:实现 → bun run verify → 对照审计清单检查 → 修正 → 再来
> 2. 任何不确定的 antd API 用法，先去 https://5x.ant.design/components/overview-cn 查文档，绝不猜测
> 3. `src/api/` 层和 `AuthGuard` 不动；后端代码不动
> 4. `bun run verify` 必须在每轮循环后全绿
>
> **审计检查清单**（每页每轮必过）:
> ```text
> [ ] bun run verify 全绿
> [ ] mock 模式无白屏/无 Console 报错
> [ ] http 模式正常渲染真实数据
> [ ] 所有交互:筛选/分页/展开/确认/抽屉/深链
> [ ] Table:列定义正确、排序/筛选可用
> [ ] Form:校验+提交 loading
> [ ] Modal/Drawer:开关/遮罩/异步确认
> [ ] 侧边栏:当前页高亮+角色过滤
> [ ] 顶栏:用户信息+下拉(修改密码/退出)
> [ ] 主题:深色侧边栏+品牌色+间距协调
> [ ] 删除的文件不被 import
> ```
>
> **执行顺序**:
> - 阶段 0:依赖安装 + theme.ts + AntdProvider + main.tsx
> - 阶段 1:Shell.tsx(布局) → Login.tsx → 删除 Toast/Modal/states/ui
> - 阶段 2:按 P0→P1→P2 逐页迁移(Dashboard→Sessions→AuthLogs→Users→Policies→Devices→Reports→Settings)
> - 阶段 3:@ant-design/charts 替换内联 SVG
> - 阶段 4:清理 radius-admin.css + index.css + 更新 docs/05 + 全量走查
>
> **提交**:每个阶段完成后单独 commit(P0/P1/P2 可每页 commit)，格式 `feat(ui): 阶段N——页面名`
