# UI 统一重构 — 任务清单

> 每阶段结束跑 `bun run verify`；标 ★ 的步骤后额外跑 `bun run e2e`。
> 任务依赖顺序执行，不并行（同一批文件）。

## 阶段 0：基线确认

- [x] 0.1 记录当前基线：`bun run verify` 35/35、`bun run e2e` 32/32、`grep -c "style={{" src/pages/*.tsx` 总数、`radius-admin.css` 91 行
  - done 条件：基线数字写入 build-log.md

## 阶段 1：全局基调（theme + Provider）★

- [x] 1.1 重写 `src/theme.ts`：删除苹果风 token，仅保留深色 Sider/Menu 配置（Menu 选中态 #1677ff）
  - done 条件：文件只剩 Layout/Menu 两个 components token；`antd doctor` theme-config 通过
- [x] 1.2 `src/providers/AntdProvider.tsx` 移除 `button={{ autoInsertSpace: false }}`
  - done 条件：Provider 只剩 ConfigProvider(theme, locale) + App
- [x] 1.3 全局同步按钮选择器：`grep -rn 'has-text("登录"\|has-text("筛选"\|has-text("重置"\|has-text("保存"\|has-text("取消"\|has-text("编辑"\|has-text("删除"\|has-text("导出"'` → E2E `scripts/e2e.mjs` + 单测 `tests/interactions.test.tsx` 改为带空格文本或 data-od-id
  - done 条件：`bun run verify` + `bun run e2e` 全绿
- [x] 1.4 图表颜色常量统一：#0071e3 → #1677ff（`charts/TrendChart.tsx`、`charts/Donut.tsx`、`charts/DeptBarChart.tsx` 的 color/COLORS 常量）
  - done 条件：`grep -rn "#0071e3" src/` 返回空

## 阶段 2：Shell（ProLayout 风格）★

- [x] 2.1 品牌区 token 化：logo 方块 + `Typography`（标题/副标题），去掉 SF Pro 字体 inline style
- [x] 2.2 底部状态区：改用语义化结构，去掉硬编码 #16a34a（用 `Badge status="success"` + `Typography.Text type="secondary"`）
- [x] 2.3 header 用户下拉：角色徽标用 `Tag`，去掉颜色 inline style；搜索框 token 化
- [x] 2.4 Menu：确认选中态随 theme 生效（深色 + 主色高亮），移除多余 inline style
  - done 条件：Shell.tsx `grep -c "style={{"` 从 22 降到 ≤5；`bun run e2e` 侧边栏/顶栏检查全绿

## 阶段 3：组件抽取

- [x] 3.1 新建 `src/components/TableToolbar.tsx`（参考 ProTable toolbar：`Form layout="inline"` + `Form.Item` 筛选 + 右侧操作区 `Space`）
  - done 条件：组件 props 清晰，可复用于 4 个表格页
- [x] 3.2 增强 `src/components/PageHeader.tsx`：去 inline style，用 `theme.useToken()` + `Flex` + `Typography.Title level={4}`；支持可选 `tabs`
  - done 条件：PageHeader.tsx `grep -c "style={{"` 降到 ≤2

## 阶段 4：逐页替换（每页后 verify；标 ★ 页后 E2E）

- [x] 4.1 Settings ★（49 处 inline）：`.kv`→`Descriptions`、`.mv`→`Button type="text"`、表单分组 Card、锚点保持
- [x] 4.2 AuthLogs ★（42 处）：筛选栏→`TableToolbar`、`.rtag`→`Tag color=`、`.kv`→`Descriptions`、`.filters.adv`→展开区
- [x] 4.3 Users ★（38 处）：筛选栏→`TableToolbar`、`.kv`→`Descriptions`、Drawer 内子表轻量化
- [x] 4.4 Sessions ★（34 处）：筛选栏→`TableToolbar`、`.kv`→`Descriptions`、`.mv`→`Button`、卡片圆角→默认
- [x] 4.5 Dashboard ★（34 处）：KPI 卡片 token 化、`.kpi`/`.grid-kpi`→Card+Statistic、`.alert-item` 状态→Tag/Badge
- [x] 4.6 Devices（31 处）：筛选栏→`TableToolbar`、`.port-grid` 保留+token 化、`.kv`→`Descriptions`
- [x] 4.7 Policies（27 处）：抽屉 `.kv`→`Descriptions`、`.d-sec`→`Divider`
- [x] 4.8 Reports（19 处）：`.rank-row`/`.bar-*`→`Progress`+`Flex`、环图/柱图色板→antd
- [x] 4.9 Login（8 处）：背景 `colorBgLayout`、剩余 inline 去 token 化
  - 每页 done 条件：`grep -c "style={{" 该页 ≤ 5；`bun run verify` 全绿；★ 页 E2E 全绿

## 阶段 5：CSS 清理 + 测试适配

- [x] 5.1 先改单测：`tests/interactions.test.tsx` 中 `.tbl`/`.tbl-skel` 选择器 → antd 选择器
  - done 条件：`grep -rn "\.tbl\|tbl-skel\|\.rtag\|\.kv\b\|\.mv\b" tests/` 返回空
- [x] 5.2 重写 `src/styles/radius-admin.css`：仅保留 `.chart-svg` 系列 + `.port-grid`/`.port` + 图表 tooltip
  - done 条件：文件行数 ≤ 40；`grep -rn "\.kv\|\.rtag\|\.mv\|\.rank\|\.bar\|\.tbl\b\|\.d-sec\|\.filters\|\.truncate\|\.mono\|\.sub\b" src/pages src/components` 返回空
- [x] 5.3 全站 inline style 核对：`grep -c "style={{" src/pages/*.tsx src/components/*.tsx` 总量 ≤ 40
  - done 条件：核对结果写入 build-log.md

## 阶段 6：文案统一 + 文档 + 收尾 ★

- [x] 6.1 文案统一走查：菜单名 ↔ 页面名 ↔ PageHeader title 一致；按钮/提示语气统一
  - done 条件：走查清单（页面名对照表）写入 build-log.md，无术语不一致
- [x] 6.2 更新 `docs/05-frontend-design.md`：antd 默认设计语言 + Pro 布局说明、token 策略、保留 CSS 清单
- [x] 6.3 更新 `src/theme.ts` 头注释（antd 默认 + 深色 Sider 说明）
- [x] 6.4 最终验证：`bun run verify` + `bun run e2e` + `antd lint --version 6` + `antd doctor` + `bun run build` 全绿
  - done 条件：5 条命令输出记录入 validation.md
- [x] 6.5 提交 + 推送（分阶段 commit，格式 `refactor(ui): 阶段N——描述`）

## 完成标准

- [x] 全站无 #0071e3/#1d1d1f/#6e6e73/#e8e8ed/#f5f5f7/#dc2626/#eab308/#16a34a 硬编码（允许保留处除外）
- [x] `radius-admin.css` ≤ 40 行
- [x] inline style 总量 ≤ 40
- [x] 全部验证命令绿
