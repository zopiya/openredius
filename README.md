# OpenRedius · 准入认证控制台

企业内网 RADIUS 802.1X 准入管理后台 —— 由 Open Design 高保真 HTML 原型逐页移植而来的 **React 19 + TypeScript + Vite** 应用,使用 **bun** 作为包管理器与运行器。

原型来源:`~/Library/Application Support/Open Design/namespaces/release-stable/data/projects/9a01259b-d4ce-4246-99c0-9fa84278542e`(8 页 HTML + radius-admin.css)。移植保持原有视觉、布局、交互与数据不变:设计样式表 `radius-admin.css` 原样复用,图标改用 `lucide-react`(与原型 lucide 图标一一对应),图表(趋势折线 / 环形占比)为同参数移植的内联 SVG。

## 开发环境与 AI 协作

- 开发环境:GitHub Codespaces,经 `gh`/SSH 直连使用;`.devcontainer/` 声明式配置
  暂时回退(实测有问题,ADR-0007「更新」),手工在 Codespace 内装 bun / uv,
  详见 [`docs/07-deployment.md`](./docs/07-deployment.md)。
- Coding agent:[pi](https://pi.dev),配置见根目录 [`AGENTS.md`](./AGENTS.md)(自动加载,
  路由/协作规则)与 [`.pi/`](./.pi/)(skills/agents/prompts)。这一层只回答"agent 怎么干活",
  "要做什么"仍然只看 [`docs/`](./docs/README.md)(`docs/10-roadmap.md` 是里程碑权威来源)。

## 运行

```bash
cd /Users/zopiya/workspace/openredius
bun install        # 首次安装依赖(已装好可跳过)
bun run dev        # 开发服务器,默认 http://localhost:5173
```

## 预览

- 启动页(8 页导航):http://localhost:5173/
- 各页路由:`/dashboard` · `/sessions` · `/auth-logs` · `/users` · `/policies` · `/devices` · `/reports` · `/settings`
- 深链与原型一致,例如:
  - `/auth-logs#result=失败&nas=SW-5F-01`(仪表盘告警跳转,自动预填筛选)
  - `/users#user=wang.lei`(会话详情跳转,自动打开用户抽屉)
  - `/devices#tab=ep`(直达终端准入清单)
  - `/reports#reason=账号锁定`(失败原因聚合定位提示)

## 验证

```bash
bun run build      # tsc 类型检查 + vite 生产构建(当前通过)
bun test           # 21 个页面交互端到端断言(筛选/二次确认/抽屉/深链/状态流转)
bun run verify     # tsc + 13 路由冒烟 + 21 个交互断言 + 原型保真度审计(全程不依赖浏览器)
bun run preview    # 预览生产构建产物(dist/)
```

手工走查建议(与原型交互一一对应):

1. 仪表盘:切换「今日 / 近 7 天」趋势图粒度;告警条目点击跳转认证日志/设备管理。
2. 在线会话:骨架屏 550ms 后出数据;部门/接入方式/设备/VLAN/认证方式筛选;行内「详情」展开 RADIUS 属性;勾选后「强制下线」二次确认;「列自定义」隐藏列;导出 CSV toast。
3. 认证日志:高级筛选展开/收起;失败原因标签跳转报表;「详情」模态;自定义时间范围。
4. 用户管理:批量启用/停用/分配策略组;「立即同步 AD」同步中→成功状态流转;「同步记录」失败任务查看原因;用户详情抽屉。
5. 策略管理:优先级 ↑↓ 重排;启用开关;编辑/新建抽屉四步导航;策略名称必填校验;保存二次确认。
6. 设备管理:NAS/终端清单 Tab 切换;Shared Secret 明文切换(审计 toast);端口/SSID 抽屉(离线设备显示快照提示);吊销证书/移出白名单/批量导入 MAC。
7. 报表统计:今日/本周/本月口径切换,环图与合计联动;导出 PDF/Excel toast。
8. 系统设置:子导航滚动高亮;端口必填/范围/冲突校验;核心端口变更二次确认;告警总开关关闭时子项禁用变暗。

## 目录结构

```
src/
├── main.tsx / App.tsx        # 入口与路由
├── styles/radius-admin.css   # 原型设计系统样式(原样复用)
├── components/
│   ├── Shell.tsx             # 侧边栏 + 顶栏布局
│   ├── Toast.tsx / Modal.tsx / Drawer.tsx
│   ├── states.tsx            # 骨架屏 / 空态 / 错误态
│   └── charts/               # TrendChart(趋势)/ Donut(环图)
├── data/                     # 原型表格/图表数据(逐行转录)
└── pages/                    # Launcher + 8 个功能页
```

## 与原型的一处工程差异

原型页面内联 `assets/tailwind.js` 运行时但未使用任何 Tailwind 工具类(已全量扫描确认),故移植版不引入 Tailwind,视觉完全由 `radius-admin.css` 承载;多页链接改为 react-router 客户端路由,hash 深链语义保持不变。
