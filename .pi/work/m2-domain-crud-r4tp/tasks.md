# M2 tasks

- [x] models: access_user / policy_group / vlan / acl_profile / nas_device / endpoint /
      ad_sync_job / alert_rule / alert_event / system_setting
- [x] migration 2 (cf9a9b67326d): 上述表 + PG-only v_user_policy_flags / norm_mac(方言条件)
- [x] schemas + 分页/筛选/排序通用层(core/listing)
- [x] api: users(列表/详情/批量启停/批量分配策略)
- [x] api: policies(CRUD/reorder/启停,保存触发编译占位审计)
- [x] api: devices(nas CRUD + secret 明文审计;endpoints CRUD/导入/白名单/吊销)
- [x] api: settings(全量/保存/confirm 核心端口;alert-rules 读写)
- [x] api: audit 查询(auditor+)
- [x] api: admins CRUD(admin-only,保护最后活跃管理员)
- [x] scripts/seed_demo.py:复刻原型数据集
- [x] tests: 每资源 CRUD + 边界 + RBAC 矩阵(89 用例全绿)
- [x] verify 全绿 + OpenAPI 校验 + 文档/roadmap 更新
