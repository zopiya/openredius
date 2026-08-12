# M2 build log

## 决策与偏差

1. **枚举持久化 value 而非 name**:SQLAlchemy `Enum(PyEnum)` 默认存成员名
   (`ACTIVE`),与 02/06 的字面值(`active`、`compliance='bad'`)不一致,会让
   FreeRADIUS 服务端 SQL 看到未文档化的值。新增 `models/base.enum_column`
   (values_callable)统一存 value;两份迁移的 CHECK 约束同步修正。M1 迁移被修改
   属例外(通常迁移不可变):项目未上线、仅一次性 dev 库应用过,重建即可,避免
   留下"约束修复迁移"的长期负担。已在 roadmap M1/M2 记录。
2. **编译占位**:`services/compiler.compile_policies_placeholder` 在策略
   create/update/toggle/reorder/delete 时写 `policy.compile` 审计行
   (detail.status=placeholder)。真编译 M3。
3. **延后项**(spec.md 已列):sync-ad/sync-records(M5)、nas ports/ssids(M6)、
   radius.nas 写入(M3;nas_device 响应按契约带 reload_required)。
4. **移出白名单语义**:whitelisted=False 且 compliance 从 white → ok(02 中
   `white` = 白名单免检,移出后应回到常规合规轨道)。
5. **批量导入 MAC**:任一条目非法 → 整批 422,不做部分导入(口径简单可预期)。
6. **reorder 语义**:order 必须恰好覆盖全部策略各一次(否则 422)。
7. **MissingGreenlet 修复**:UPDATE 后 `onupdate` 列被 expire,序列化触发隐式懒
   加载;变更端点统一 `await db.refresh(obj)` 后再构造响应。

## 验收记录(2026-08-12)

- alembic upgrade/downgrade/upgrade 通过(SQLite);PG-only 对象在 SQLite 跳过。
- seed_demo.py:10 用户/5 策略/8 NAS/8 终端/6 VLAN/5 ACL + 告警规则 + 设置。
- uvicorn 冒烟:users 列表/筛选、policy CRUD(409 重名、409 删除约束)、reorder、
  nas CRUD + secret 明文(掩码/审计)、endpoints 规范化(3c-52-82-aa-bb-cc →
  3C:52:82:AA:BB:CC)、settings confirm 流程、admins RBAC(403/409 矩阵)、
  audit 过滤。
- pytest 89 用例全绿;ruff check/format 干净;bun run verify 前端不回归;
  /api/openapi.json 校验通过。
