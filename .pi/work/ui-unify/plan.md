# UI 统一重构 — 技术方案

## 技术上下文（已读源码确认）

- **栈**：bun + React 19 + antd 6.6.0 + @ant-design/charts 2.6.7 + react-router
- **当前状态**：8 页 + 登录 + Shell 已 antd 组件化，但残留 296 处 inline style + 91 行自定义 CSS
- **门禁**：`bun run verify`（tsc + smoke + 35 单测 + fidelity[当前环境 SKIP]）、`bun run e2e`（32 项 + 0 console 错误）、`antd lint --version 6`、`antd doctor`
- **fidelity 审计**：对比原型文本（12 字 chunk）+ class 集合；旧 class（kv/rtag/port-grid 等）已在 `CLASS_ALLOWLIST`，删除安全；**文本内容必须不变**
- **测试选择器**：单测/E2E 已用 antd 选择器（`.ant-*`、`button:has-text`），改 inline style 不影响，但**改组件结构/文案会影响**

## 架构方案

### 分层收敛策略（按优先级）

1. **语义组件优先**：失败标签→`Tag`、键值对→`Descriptions`、进度→`Progress`、文本→`Typography`
2. **token 引用次之**：`theme.useToken()` 取 `token.colorText`/`token.colorBorder`/`token.colorPrimary` 等
3. **布局组件兜底**：`Flex`/`Space`/`Row`+`Col`/`Divider` 替代手写 flex/gap
4. **允许保留**：SVG 图表降级样式、`.port-grid` 端口网格、图表 tooltip 定制（antd 无对应）

### 1. theme.ts 回归 antd 默认

```ts
const theme: ThemeConfig = {
  components: {
    Layout: { siderBg: '#001529', headerBg: '#fff' },
    Menu: {
      darkItemBg: '#001529',
      darkItemSelectedBg: '#1677ff',      // Pro 深色菜单选中态 = 主色
      darkItemSelectedColor: '#fff',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemHoverBg: 'rgba(255,255,255,0.08)',
    },
  },
};
```

- 删除：colorPrimary 自定义、colorText* 系列、borderRadius、fontFamily（SF Pro）、boxShadow、Card/Button/Table/Input/Select/Form/Tag/Tabs 等全部组件 token —— 全部回归 antd 默认
- 保留：深色 Sider/Menu token（这是「深色侧边栏」决策所需的最小配置）

### 2. AntdProvider 回归默认

- 移除 `button={{ autoInsertSpace: false }}` —— 回归 antd 规范（两字中文按钮自动加空格：「登录」→「登 录」）
- 移除 `locale` 之外的任何自定义
- **连带影响**：所有 `button:has-text("登录")`/`"筛选"`/`"重置"`/`"保存"`/`"取消"`/`"编辑"`/`"删除"`/`"导出"` 等选择器需改为带空格文本或 `data-od-id`。E2E `scripts/e2e.mjs` + 单测 `tests/interactions.test.tsx` 需同步

### 3. 组件抽取

**`TableToolbar`**（新，参考 ProTable toolbar）——统一 Sessions/Users/Devices/AuthLogs 的「筛选 + 操作」区：

```tsx
<TableToolbar
  filters={[{ label: '部门', ... }]}   // 或 children 直接放 Form.Item
  actions={<Button>…</Button>}
/>
```

内部用 `Form layout="inline"` + `Form.Item label="…"`（antd 标准筛选表单）+ `Space`，彻底替代各页手写 `div flex + label style={fontSize 11.5} + Select` 的重复结构。

**`PageHeader`** 增强：去掉 inline style，用 `theme.useToken()` + `Flex` + `Typography.Title level={4}`；支持可选 `tabs`（TabBar，Pro PageContainer 特征）。

### 4. 各页面改动要点

| 页面 | 关键替换 |
|---|---|
| Dashboard | KPI 卡片 inline 色→token；`.kpi`/`.grid-kpi` 类→`Card`+`Statistic`；趋势图颜色 #0071e3→#1677ff |
| Sessions | 筛选栏→`TableToolbar`；`.kv`→`Descriptions`（展开行）；`.mv`→`Button type="text"`；卡片圆角 18→默认 |
| AuthLogs | 筛选栏→`TableToolbar`；`.rtag`→`Tag color=`；`.kv`→`Descriptions`；`.filters.adv`→折叠展开 |
| Users | 筛选栏→`TableToolbar`；`.kv`→`Descriptions`；Drawer 内子表保留轻量 Table |
| Policies | 抽屉 `.kv`→`Descriptions`；`.d-sec`→`Divider`；Steps/Switch 保持 |
| Devices | 筛选栏→`TableToolbar`；`.port-grid`（保留）+ token 化；`.kv`→`Descriptions` |
| Reports | `.rank-row`/`.bar-*`→`Progress`+`Flex`；环图/柱状图颜色→antd 色板；表格保留 |
| Settings | `.kv`→`Descriptions`；表单分组用 Card；`.mv`→`Button`；锚点保持 |
| Login | 已有 Alert/Form，去剩余 inline style，背景用 `colorBgLayout` |
| Shell | 品牌区/底部状态/用户下拉 token 化；角色用 `Tag`；菜单选中态随 theme |

### 5. radius-admin.css 最终形态

仅保留「允许保留」清单：
- `.chart-svg` 系列（SVG 降级图表）
- `.port-grid`/`.port`（端口网格）
- 图表 tooltip 定制（如有）

删除：`.kv`/`.rtag`/`.mv`/`.sub`/`.rank-*`/`.bar-*`/`.tbl`/`.tbl-skel`/`.d-sec`/`.d-sec-t`/`.filters.adv`/`.truncate`/`.mono`/`.map-tbl` 等全部可用 antd 替代的类。

> 注意：`.tbl`/`.tbl-skel` 被单测 `tests/interactions.test.tsx` 引用为选择器，删除时需同步改测试。

## 数据/接口变化

无。`src/api/**`、`AuthGuard`、路由、深链语义不动。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| autoInsertSpace 回归 → 大量按钮选择器失效 | 专项任务：先改 Provider，再全局 grep 选择器同步 E2E + 单测 |
| 296 处 inline style 逐一改，回归风险高 | 分页逐页改，每页后 `bun run verify`；每 3 页后跑 E2E |
| 文本内容变化 → fidelity（CI 环境）失败 | 重构不碰文案；文案只在 FR-6 统一时改，且同步测试 |
| `.tbl` 删除破坏单测选择器 | 删 CSS 前先改测试选择器 |
| 图表颜色 #1677ff 在 SVG 降级里需同步 | TrendChart/Donut/DeptBarChart 的颜色常量统一改为 #1677ff + antd 色板 |

## 验证策略

- 每阶段结束：`bun run verify` 全绿
- 关键阶段（Provider/Shell/每页）：`bun run e2e` 全绿
- 最终：`antd lint --version 6` + `antd doctor` + `bun run build`
- 逐页完成后 `grep -c "style={{"` 核对 inline style 收敛
