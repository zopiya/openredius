# M2 · 领域模型与 CRUD API

来源:docs/10-roadmap.md M2 小节(逐字)。目标:02 的应用实体全部落地,API 按 03 提供,
seed 复刻原型数据集。必读:02、03、04、08(RBAC)。

## 任务(roadmap 原文)

- [ ] 模型+迁移:access_user、policy_group、vlan、acl_profile、nas_device、endpoint、
      ad_sync_job、alert_rule、alert_event、audit_log、system_setting
- [ ] 视图 `v_user_policy_flags` + 函数 `norm_mac`(06)
- [ ] 各资源 CRUD/批量 API(03):users/policies/devices(nas+endpoints)/settings/audit
- [ ] 策略保存即触发"编译占位"(真实编译在 M3;此处写 audit)
- [ ] `scripts/seed_demo.py`:原型数据集(10 用户/5 策略/8 NAS/8 终端/字典)
- [ ] 服务端筛选/分页/排序(03 约定)
- [ ] RBAC 全覆盖;写操作审计全覆盖
- [ ] pytest:每资源 CRUD + 边界(重名、删除约束、MAC 规范化)

## 验收

```bash
cd backend && uv run alembic upgrade head && uv run python scripts/seed_demo.py
uv run pytest -q   # 新增用例全绿
curl -s localhost:8000/api/openapi.json | python3 -m json.tool > /dev/null
```

## 范围决定(与文档对齐时的取舍,均回写 build-log)

- admins CRUD(03「管理员账户 CRUD(设置页)」)M1 未做,归入本里程碑。
- `/api/users/sync-ad`、`sync-records` 属 M5(AD 集成),M2 只建 ad_sync_job 模型。
- `/api/devices/nas/{id}/ports|ssids` 依赖 radacct 聚合,属 M6 会话域,M2 不实现。
- radius.nas 写入属 M3 栈集成;nas_device CRUD 在 M2 仅管应用表,响应按契约带
  `reload_required`。
- PG 专属对象(视图/函数)仅 postgresql 方言创建(04 明示),SQLite 跳过;
  MAC 规范化在 API 层用 Python 等价实现(norm_mac 语义)。
