# 05 · 前端设计(bun + React + TS + Ant Design 6)

## 总原则

原型的视觉、布局、交互、文案是验收基线(`bun run verify` 中的保真度审计是门禁)。
M0–M7 阶段已完成 Ant Design 5 UI 迁移计划(docs/11-ui-migration.md)，全部 8 页 + 登录
+ 布局均已使用 antd 组件重写；随后已升级至 **Ant Design 6**(见下方「现状盘点」)。

## 现状盘点(2026-08,Ant Design 6 升级后更新)

- 已升级 **Ant Design 6**(`antd@6.6.0` + `@ant-design/icons@6.3.2`)，移除
  `@ant-design/v5-patch-for-react-19`；`antd lint --version 6` 零废弃、`antd doctor` 18 项全通过。
- 参考 Ant Design Pro 设计模式：统一 `PageHeader` 组件(面包屑+标题+描述+操作区)取代 8 页手写页头；
  Shell 顶栏改为面包屑导航；Dashboard KPI 卡片 Pro 化(`KpiCard`:图标底色块+大数值+footer 对比)。
- 8 页 + 登录 + 布局全部迁移至 antd 组件(Table/Form/Modal/Drawer/Card 等)。
- `src/theme.ts` 承载设计令牌映射(品牌色、深色侧边栏、圆角、间距等)。
- `src/providers/AntdProvider.tsx` 提供全局 ConfigProvider + App(useApp)。
- 图表使用 `@ant-design/charts`(浏览器) + SVG 降级(测试环境)。
- `src/styles/radius-admin.css` 缩减至仅保留仍被引用的自定义 CSS 类(图表降级 SVG、
  抽屉子表、端口网格、失败原因标签等)；`src/styles/index.css`(Tailwind v4) 已删除。
- 旧自定义组件(`Modal.tsx`/`Drawer.tsx`/`states.tsx`/`components/ui/*`)已删除；
  `Toast.tsx` 内部已切换至 `App.useApp().message`。
- mock 模式 35 交互测试全绿；`bun run verify` 全绿；Playwright E2E 32 项检查全绿(`bun run e2e`)。

## 组件映射

| 原组件 | Ant Design 替代 |
|---|---|
| 手写 `<table>` + 筛选 | `Table`(columns/sorter/filters/pagination/rowSelection/expandable) |
| 手写 `<input>`/`<select>` | `Form` + `Form.Item` / `Input` / `Select` |
| Shell(侧边栏+顶栏) | `Layout` + `Layout.Sider` + `Menu` + `Layout.Header` |
| Toast | `App.useApp().message` |
| Modal | `Modal` |
| Drawer | `Drawer` |
| 骨架屏/空态/错误 | `Skeleton` / `Empty` / `Result` |
| 内联 SVG 图表 | `@ant-design/charts` `Line` / `Pie`(浏览器)；SVG 降级(测试) |
| 按钮 | `Button`(primary/danger/loading) |
| 标签/徽章 | `Tag` |
| 开关 | `Switch` |
| 分段控件 | `Segmented` |
| Tabs | `Tabs` |

## 数据层

- `src/api/auth.ts` / `src/api/http.ts` / `src/api/resources/*` 不变(mock/http 双轨)。
- `AuthGuard` 不变。
- 后端全部 API 不变。

## 测试策略

- 35 交互测试 + smoke + 保真审计：`bun run verify` 全绿。
- `tests/api-contract.test.ts`：schema.d.ts 与 types.ts 关键形状断言。
- 深链语义(`#result=失败&nas=…` 等)保留并有测试覆盖。

## 约束清单

1. 不得改动 `src/api/` 层与 `AuthGuard`。
2. 不得改动 `src/api/types.ts` 既有类型签名；新增字段用可选属性。
3. 依赖新增需写入本文档并说明理由。
4. 不确定的 antd API 用法先去 https://ant.design/components/overview-cn 查文档。
