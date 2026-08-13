# 05 · 前端设计(bun + React + TS + Ant Design 6)

## 总原则

原型的视觉、布局、交互、文案是验收基线(`bun run verify` 中的保真度审计是门禁)。
M0–M7 阶段已完成 Ant Design 5 UI 迁移计划(docs/11-ui-migration.md)，全部 9 页(含审计日志)+ 登录
+ 布局均已使用 antd 组件重写；随后已升级至 **Ant Design 6**(见下方「现状盘点」)。

## 现状盘点(2026-08,Ant Design 6 默认设计语言统一后更新)

- 已升级 **Ant Design 6**(`antd@6.6.0` + `@ant-design/icons@6.3.2`)，移除
  `@ant-design/v5-patch-for-react-19`；`antd lint --version 6` 零废弃、`antd doctor` 18 项全通过。
- **回归 antd 默认设计语言**：主色 #1677ff、默认灰阶/圆角/字体、语义色(#ff4d4f 错误/
  #faad14 警告/#52c41a 成功)；两字中文按钮自动加空格(autoInsertSpace 默认)。
- 参考 Ant Design Pro 设计模式：统一 `PageHeader`(面包屑+标题+描述+操作区)取代 8 页手写页头；
  `TableToolbar`/`FilterField` 统一表格页筛选工具栏(ProTable 风格)；Dashboard `KpiCard` 语义化(tone)；
  深色侧边栏(Menu 选中态=主色)为 ProLayout 经典风格。
- 8 页原型 + 审计日志页 + 登录 + 布局全部迁移至 antd 组件(Table/Form/Modal/Drawer/Card/Descriptions/Progress/Alert 等)。
- `src/theme.ts` 回归 antd 默认，仅保留深色 Sider/Menu 最小配置。
- `src/providers/AntdProvider.tsx` 提供全局 ConfigProvider + App(useApp)。
- 图表使用 `@ant-design/charts`(浏览器) + SVG 降级(测试环境)。
- `src/styles/radius-admin.css` 仅保留 antd 无对应组件的三类场景：图表 SVG 降级、端口接入网格、表格排版微调(约 40 行)；
  `src/styles/index.css`(Tailwind v4) 已删除。
- 旧自定义组件(`Modal.tsx`/`Drawer.tsx`/`states.tsx`/`components/ui/*`)已删除；
  `Toast.tsx` 内部已切换至 `App.useApp().message`。
- mock 模式 20 交互测试全绿；`bun run verify` 全绿；Playwright E2E 全绿(`bun run e2e` / `bun run e2e:http`)。

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

- `src/api/auth.ts` / `src/api/http.ts` / `src/api/resources/*` 提供 mock ↔ http 双轨(`src/api/config.ts`
  的 `MODE` 切换;`VITE_API_MODE=http` 时走真实后端)。
- mock 数据源与页面类型**单一来源**为 `src/data/*`(resources 层在 http 模式下把后端 DTO 映射为同一形状)。
- `src/api/schema.d.ts` 由 `bun run api:gen` 从后端 OpenAPI 生成,契约测试用。
- `AuthGuard` 负责登录态与角色守卫。

## 测试策略

- 20 交互测试 + 14 路由冒烟 + 保真审计：`bun run verify` 全绿。
- `tests/api-contract.test.ts`：schema.d.ts 与前端类型的形状断言。
- 深链语义(`#result=失败&nas=…` 等)保留并有测试覆盖。
- E2E:`bun run e2e`(mock 模式)与 `bun run e2e:http`(真实后端,见 09)。

## 约束清单

1. 不得改动既有页面数据形状(`src/data/*` 的字段是保真度测试与 mock/http 双轨的共同契约)。
2. 类型单一来源 `src/data/*`;新增字段用可选属性,不得另建平行类型文件。
3. 依赖新增需写入本文档并说明理由。
4. 不确定的 antd API 用法先去 https://ant.design/components/overview-cn 查文档。
