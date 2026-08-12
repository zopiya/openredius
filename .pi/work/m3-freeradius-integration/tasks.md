# M3 tasks — 全部完成(2026-08-12)

- [x] radius/tables.py:schema 参数化的 radius 表映射(SQLite 单测可跑)
- [x] radius/compiler.py:幂等全量编译(diff by 键)+ 停用/锁定 Reject 产物
      + policy.compile 审计(trigger/计数);单元测试覆盖 09 场景 1
- [x] radius/nas_sync.py:NAS upsert/delete → radius.nas(存在性探测守卫)
- [x] 迁移 3:v_user_policy_flags 增 cert 标记
- [x] 触发点:policies CRUD/reorder/toggle、users 批量状态/分配、ops/compile
- [x] ops API:reload-radius(命令可配 manual 兜底)、compile(admin)
- [x] config:radius_reload_command;.env.example 增补
- [x] deploy/freeradius:Dockerfile(gettext-base、radiusd 链接、字典 include、
      queries.conf class 补丁、权限收紧)、entrypoint(envsubst + awk 站点补丁
      + 自签证书兜底)、mods-available/sql、clients.conf 覆盖、
      policy.d/openredius、dictionary.openredius、certs/gen.sh
- [x] compose dev:freeradius 服务 + healthcheck(radiusd -CX)
- [x] postgres init:radius 角色 public 默认权限(default privileges)+
      radtest dev 客户端;schema.sql radpostauth +class 列
- [x] seed_demo:radcheck Cleartext-Password(Demo-Radius-2026)+ compile_all
- [x] smoke_freeradius.sh(radiusd -CX)
- [x] 集成测试 7 用例(09 场景 9–11);pyproject addopts 默认排除 integration
- [x] 文档回写:06 实测修正记录、03 ops 契约、deploy/README 运行手册、roadmap
