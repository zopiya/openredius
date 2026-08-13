# UI 统一重构 — 规范

## 问题与目标

当前 8 页 + 登录 + 布局已完成 antd 6 迁移，但存在大量「自定义 CSS」残留，偏离 antd 设计语言：

- **296 处 inline style**（`style={{...}}`）散落 11 个文件，含 150+ 次硬编码颜色
- **91 行自定义 CSS**（`radius-admin.css`）——`.kv`/`.rtag`/`.mv`/`.rank-row`/`.bar-*` 等可用 antd 组件替代
- 视觉基调是「苹果风」（#0071e3 蓝、SF Pro 字体、#e8e8ed 边框、18px 大圆角），与 antd 默认设计语言不一致
- Menu / 页头 / 工具栏 / 卡片各页实现不统一，未对齐 Ant Design Pro 设计模式

**目标**：全部 UI 页面的语言、视觉、风格统一到 antd 默认设计语言 + Ant Design Pro 布局模式，尽量消除自定义 CSS。

## 范围

### 范围内（In scope）

- `src/theme.ts`、`src/providers/AntdProvider.tsx`
- 8 页（Dashboard/Sessions/AuthLogs/Users/Policies/Devices/Reports/Settings）
- `src/pages/Login.tsx`
- `src/components/Shell.tsx`、`PageHeader.tsx`、`charts/*`
- `src/styles/radius-admin.css`
- 测试与脚本适配（仅当渲染结构变化导致选择器失效时）

### 范围外（Out of scope）

- `src/api/**`、`AuthGuard.tsx`、后端 —— 一律不动
- 业务逻辑、数据流、路由、深链语义 —— 一律不动
- 新增功能、新增页面 —— 本次是纯视觉/组件重构

## 关键决策（用户已确认）

| 决策 | 结论 |
|---|---|
| 主色 | **换成 #1677ff（antd 默认蓝）**，放弃 #0071e3 |
| 侧边栏 | **保持深色**（ProLayout 经典风格），统一到 antd 深色 token |
| 自定义 CSS 边界 | **接受极少量必要自定义**（SVG 图表降级、端口网格、图表 tooltip 等 antd 无对应组件处） |
| 字体/圆角/文本色/状态色 | **回归 antd 默认**（放弃 SF Pro 特指、18px 大圆角、苹果灰阶） |

## 颜色迁移映射（全局基准）

| 语义 | 旧值（苹果风） | 新值（antd 6 默认 token） |
|---|---|---|
| 主色 | #0071e3 | `colorPrimary` #1677ff |
| 主文本 | #1d1d1f | `colorText` rgba(0,0,0,.88) |
| 次级文本 | #424245 | `colorTextSecondary` rgba(0,0,0,.65) |
| 三级文本 | #6e6e73 | `colorTextTertiary` rgba(0,0,0,.45) |
| 占位/禁用 | #86868b | `colorTextQuaternary` rgba(0,0,0,.25) |
| 主边框 | #d2d2d7 | `colorBorder` #d9d9d9 |
| 次级边框 | #e8e8ed | `colorBorderSecondary` #f0f0f0 |
| 页面背景 | #f5f5f7 | `colorBgLayout` #f5f5f5 |
| 错误 | #dc2626 | `colorError` #ff4d4f |
| 警告 | #eab308 | `colorWarning` #faad14 |
| 成功 | #16a34a | `colorSuccess` #52c41a |
| 深色侧边栏 | #0F1923 | antd 深色 token（`#001529` 体系） |

> 上表是**语义映射**，不是逐字 sed 替换。落地时优先用「语义组件 + token」，而非把新色值硬编码进 inline style。

## 功能需求

### FR-1 主题回归 antd 默认设计语言
- `theme.ts` 删除全部苹果风 token（colorText 系列自定义、borderRadius 8、Card borderRadiusLG 18、SF Pro fontFamily、自定义 boxShadow、Table headerBg 等）
- 仅保留：深色 Sider 相关 token（`Layout.siderBg`、`Menu.darkItem*` 系列）
- `ConfigProvider` 不再 `button={{ autoInsertSpace: false }}`（回归 antd 默认，两字中文按钮自动加空格是 antd 规范行为）
- 验收：`antd doctor` theme-config 通过；全站无 #0071e3 / #1d1d1f / #e8e8ed 等苹果风色值硬编码

### FR-2 语义色全部 token 化 / 组件化
- 组件内不再出现十六进制颜色字面量（图表 SVG 降级、端口网格等「允许保留」处除外）
- 文本色 → `Typography.Text type="secondary"/"tertiary"` 或 `theme.useToken()` 的 token
- 状态色 → `Tag`/`Badge`/`Alert`/`Progress` 的语义化 `status`/`color` 属性
- 边框/背景/分隔 → `Card`/`Divider`/token

### FR-3 自定义 CSS 类 → antd 组件
- `.kv` 键值对 → `Descriptions`（`column` + `size="small"`）
- `.rtag` 失败原因标签 → `Tag`（`color` 语义映射 warn/danger/info/muted）
- `.mv` 移动按钮 → `Button type="text" size="small"`
- `.rank-row`/`.bar-row`/`.bar-track`/`.bar-fill` → `Progress`（`size="small"`/`percent`/`status`）+ `Flex`
- `.sub` 副标题 → `Typography.Text type="secondary"`
- `.tbl` 抽屉内子表 → 保留轻量 Table（antd `Table size="small"`）或保留 `.tbl`（若子表超轻量）
- `.filters.adv` 高级筛选带 → antd 展开区样式（Collapse 或 Space）
- `.truncate` → `Typography.Text ellipsis` 或 `Tooltip`
- `.d-sec`/`.d-sec-t` 抽屉分区 → `Divider orientation="left"` + `Typography.Text strong`
- 允许保留：`.chart-svg`（SVG 降级）、`.port-grid`/`.port`（antd 无对应）、图表 tooltip 定制

### FR-4 inline style 全面收敛
- 布局类 inline style → `Flex`/`Space`/`Row`+`Col`/`Divider`
- 间距 → antd 组件的 `gap`/`gutter`/`margin` 属性或 token 化 `padding`/`margin`
- 目标：每个页面 inline style 数量降到个位数（仅剩 antd 组件不支持的极少数布局微调）
- 验收：`grep -c "style={{" src/pages/*.tsx` 总量从 296 降至 <40

### FR-5 Pro 布局统一（ProLayout / PageContainer / ProTable 风格）
- **Shell**：品牌区用 antd 语义化（logo 方块 + `Typography`），底部状态用 `Sider` footer 语义；header 的搜索框/用户下拉对齐 Pro 顶栏；角色徽标用 `Tag`
- **PageHeader**：保持现有面包屑+标题+描述+操作区，去掉 inline style（用 token + Space/Flex），标题用 `Typography.Title level={4}` 语义
- **表格页工具栏**：Sessions/Users/Devices/AuthLogs 的「筛选栏 + 操作按钮」统一为一个 `TableToolbar` 组件（参考 ProTable toolbar：左标题/筛选、右操作），消除各页重复的筛选栏 inline style
- **卡片统一**：页面内容 Card 统一 `variant="borderless"` 或统一 border 样式，gutter 统一 16，卡片 `extra` 统一用法

### FR-6 语言/文案统一
- 术语统一：如「认证日志/在线会话/报表统计」等页面名与菜单名一致
- 按钮/提示文案语气统一（动词开头、无多余标点）
- 组件 `placeholder`/`title`/`description` 措辞统一
- 验收：E2E 深链文案断言全部通过（文案改动需同步 E2E 与单测）

### FR-7 验证门禁（每阶段）
- `bun run verify`：35 单测 + smoke 全绿
- `bun run e2e`：32 项全绿，0 console 错误
- `antd lint ./src --version 6`：零废弃
- `antd doctor`：全过
- `bun run build`：成功

## 非功能需求

- **可维护性**：不新增自定义 CSS 文件；`radius-admin.css` 缩减到仅保留「允许保留」清单
- **一致性**：相同语义用相同组件（失败标签只能是 `Tag`，键值对只能是 `Descriptions`）
- **fidelity 约束**：文本内容不变（原型 12 字 chunk 对比）；旧 class 名（kv/rtag 等）已在 fidelity allowlist，删除安全

## 验收标准（用户视角）

1. 任意页面打开，视觉是「标准 antd + Pro」风格：蓝 #1677ff、antd 灰阶、antd 圆角/字体
2. 找不到 #0071e3 / #1d1d1f / #e8e8ed 等苹果风色值（除允许保留处）
3. 每个页面 inline style ≤ 个位数
4. Menu 深色、页头/工具栏/卡片全站统一
5. 全部验证命令绿
