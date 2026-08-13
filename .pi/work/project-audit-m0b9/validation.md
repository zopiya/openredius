# 验证记录(validation)

> 全部命令在 `feat/project-audit-m0b9` @ 最新提交执行。时间:2026-08-13。

## 基线(Phase 0,dev @ 4bda8d6)

- `bun run verify`:35 pass + 3 skip(interactions 20 + 契约 + http skip);fidelity 无原型跳过。
- `uv run ruff check .`:绿;`uv run pytest -q`:173 passed, 9 deselected。

## 最终全量(AC-2)

| 命令 | 结果 |
|---|---|
| `bun run verify` | 全绿(26 pass + 3 skip + http 3 pass;14 路由冒烟含 /audit) |
| `bun run e2e`(mock,Playwright) | **33/33 通过** |
| `bun run e2e:http`(真实后端+Postgres,Playwright) | **42/42 通过**,exit 0(401 守卫探测已白名单) |
| `uv run ruff check .` + `ruff format --check .` | 绿 |
| `uv run pytest -q`(SQLite) | **184 passed**, 9 deselected |
| `uv run pytest -m integration -q`(Postgres+FreeRADIUS) | **9 passed** |
| `uv run alembic heads`(SQLite + Postgres) | 单 head `a1b2c3d4e5f6` |

## 审计过程中发现并修复的额外缺陷(超出初始漂移清单)

1. **radius 角色视图/表授权缺失(安全级)**:新库上 `public.v_user_policy_flags` 视图与
   `endpoint`/`access_user` 表对 radius 角色无 SELECT → unlang 的 mac/edr/time/cert
   检查**静默失效**(应拒绝的请求被接受)。迁移 `a1b2c3d4e5f6` 显式补齐授权;集成测试
   9/9 验证 mac-unbound/time-policy 拒绝路径真实生效。docs/06 补记。
2. **GET /api/policies 裸数组 vs 信封契约**:统一为信封(docs/03 通用约定),前端
   fetchItems 双态兼容;reorder 返回同步;3 处测试断言更新。
3. **e2e-http 脚本缺陷**:硬编码 vlan_id=1(新库自增 id 不固定)→ 改为取既有策略的
   vlan_id;`/api/users?account=` 参数不存在 → 改 `?q=`;401 守卫探测计入 console
   错误 → 白名单;mock 模式 /audit 无演示数据 → 补 MOCK_AUDIT。
4. **AuthLogs 表格 rowKey 重复**(真实数据同秒多行)→ 改后端行 id;antd 6 rowKey
   index 参数弃用告警随之消除。
5. **`_RULE_DESC` 位置占位符 + kwargs 不兼容**(user_compiled_rules 潜伏 bug)→
   模板改具名占位符,策略详情预览复用同一格式化路径。
6. **CI 只监听 main**:push 分支补 dev。
7. **deploy/scripts/backup.sh 无 compose 执行方式**:补 `BACKUP_METHOD=compose`,
   ansible 模板改为薄封装调用正典。

## 文档一致性抽查(AC-5)

- docs/09 数字:20 交互、14 冒烟、两套 E2E 与实测一致。
- README 目录树包含 ansible/;测试数字 173→184 已同步(pytest 计数随新增用例更新)。
- schema.d.ts 由运行中后端重新生成,含全部新增端点。
