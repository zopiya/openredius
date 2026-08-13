# 09 · 测试与质量

## 总体策略(金字塔)

| 层 | 范围 | 工具 | 运行时机 |
|---|---|---|---|
| 单元 | 服务/编译器/归类器/同步器 | pytest(asyncio) | 每次提交 |
| API 集成 | FastAPI 路由 + SQLite 内存库(app 表) | pytest + httpx AsyncClient | 每次提交 |
| 栈集成 | 真实 PostgreSQL + FreeRADIUS(radtest/CoA sink) | pytest -m integration(Codespaces docker-in-docker 执行,ADR-0007) | 里程碑验收 |
| 前端回归 | 20 交互 + 14 路由冒烟 + 保真审计(mock 模式) | bun test / scripts | 每次提交 |
| 前端契约 | OpenAPI schema 与前端类型形状断言 | bun test | 每次提交 |
| E2E | mock 模式(`bun run e2e`)/ http 模式(`bun run e2e:http`,需完整栈:登录/三角色菜单/9 页冒烟/写操作/RBAC 越权矩阵) | Playwright 脚本 | 里程碑验收/发布前 |

## 命令清单(验证命令唯一来源)

### 前端(仓库根目录)

```bash
bun run build        # tsc 类型检查 + 生产构建
bun test             # 交互测试(20)+ 契约测试
bun run verify       # tsc + 14 路由冒烟 + 交互测试 + 保真审计
                     # 保真审计需要原型静态 HTML(设计机路径或 OPENRADIUS_PROTO_DIR);
                     # 缺失时打印告警并跳过,不阻断其余检查(CI 即此路径)
bun run api:gen      # 从后端 OpenAPI 生成类型(M5 起)
bun run e2e          # Playwright mock 模式 E2E(需先 bun run dev)
bun run e2e:http     # Playwright http 模式 E2E(需完整栈:backend:8000 + frontend:5173 http 模式)
```

### 后端(backend/)

```bash
uv sync                          # 安装依赖
uv run ruff check . && uv run ruff format --check .
uv run pytest -q                 # 单元 + API(不含 integration 标记)
uv run pytest -m integration -q  # 需 docker compose dev 栈
uv run alembic upgrade head      # 迁移演练(对 compose postgres)
```

### 栈集成(Codespaces 终端执行,docker-in-docker,见 07「栈集成环境」)

```bash
docker compose -f deploy/docker-compose.dev.yml up -d --build
docker compose -f deploy/docker-compose.dev.yml ps   # 全部 healthy
docker compose -f deploy/docker-compose.dev.yml exec freeradius \
  radtest wang.lei <pwd> localhost 0 testing123-dev  # 期望 Access-Accept
```

## 关键测试场景(必须覆盖)

后端:

1. 策略编译幂等:重复编译产物不变;停用策略删除产物;改 VLAN 更新 radgroupreply。
2. 用户停用/锁定 → radcheck 出现/移除 `Auth-Type := Reject`。
3. 失败原因归类:02 表中每类至少 1 个用例(Class 优先、Reply-Message 回退、未知兜底)。
4. 会话查询:active 过滤、筛选参数、分页;disconnect 调用 CoA 封装(mock NAS)。
5. RBAC:三种角色的关键接口矩阵(08)。
6. 登录失败锁定与解锁(时间可注入)。
7. AD 同步:fixture 驱动(新增/更新/停用三分支 + 失败记录)。
8. 审计:写操作必产生 audit_log(抽样断言)。

栈集成(M3/M4):

9. radtest 正常账号 → Access-Accept 且携带 Tunnel-Private-Group-Id。
10. 停用账号 → Access-Reject;锁定账号 → Reject 且 Class=account-locked。
11. 时间窗外(策略 time)→ Reject reason=time-policy。
12. Accounting-Start/Stop → radacct 行产生/关闭。
13. CoA sink:disconnect API → sink 收到 Disconnect-Request 且 radacct 关闭。

前端:

14. mock 模式全绿(既有 20 + 冒烟 + 保真)。
15. http 模式:未登录 → /login;登录 → 9 页渲染真实数据;深链参数生效。

## CI(GitHub Actions,M0 落地)

.github/workflows/ci.yml:

- `frontend`:oven-sh/setup-bun → `bun install --frozen-lockfile` → `bun run verify`。
- `backend`:astral-sh/setup-uv → `uv sync --frozen` → ruff → `uv run pytest -q`(M1 起启用,已生效)。
- `audit`(pip-audit + bun audit):尚未落地,作为后续项(见 roadmap 未列项,启动前需立项)。

栈集成不进 GitHub Actions CI(耗时/资源开销大,不适合每次提交都跑),
由里程碑验收在 Codespaces 内人工触发并记录结果到 roadmap。

## 质量门禁(Definition of Done,适用于每个里程碑)

1. 上述对应命令全部通过,输出粘贴进里程碑验收记录。
2. 无 TODO 遗留(除明确标注后续里程碑的)。
3. docs/ 相关章节与实现一致(不一致则同提交修订)。
4. Conventional Commits;一个里程碑一个 PR/提交批次。
5. 不降低既有测试数量与保真审计得分。
