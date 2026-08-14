# NAS/AP 接入热更新修复 — tasks

依赖顺序执行;每项有可观察的完成条件。标记 `[DONE]` 时更新本条。

- [x] T-01 实测复现缺口 1/2(§2,前置验证)→ 证据见 clarifications.md Q-001 + validation.md
- [x] T-02 `core/config.py`:`radius_reload_command` → `radius_reload_dir: str = ""`(FR-001)
  - 条件:`grep -r radius_reload_command backend/ deploy/` 无残留(测试除外);`uv run pytest -q` 通过
- [x] T-03 `api/ops.py`:reload_radius 改哨兵机制 + applied 轮询;health `radius_config` 语义更新(FR-002/FR-004)
  - 条件:file 模式写 `reload-requested`(原子替换)、轮询 `reload-applied`;manual 模式不变;审计保留
- [x] T-04 `tests/api/test_ops.py`(及相关测试)改写:manual/file/RBAC/审计/无任意命令(FR-001/FR-004)
  - 条件:`uv run pytest tests/api/test_ops.py -q` 全绿
- [x] T-05 `deploy/freeradius/entrypoint.sh`:supervisor 主循环 + 2s watcher + applied 标记(FR-003/FR-005)
  - 条件:dev 栈实测重载/停机/健康检查/自动拉起(见 T-08)
- [x] T-06 compose ×4 + `.env.example`(FR-002)
  - 条件:prod 三变体 backend+freeradius 挂 `radius-reload` 卷 + env;dev 变体 bind mount;`.env.example` 更新
- [x] T-07 文档同步:docs/06、docs/07、docs/13 SOP-02、deploy/README.md(FR-006/AC-4)
- [x] T-08 栈集成验收:AC-1/AC-2 实测(新增 NAS → reload → radtest 通过;改 secret → 旧失效)
  - 条件:validation.md 记录命令与输出
- [x] T-09 全量回归:`uv run pytest -q`、`uv run ruff check .`、`bun run verify`、`bun run e2e:http`(栈在跑)
- [x] T-10 留痕 + Conventional Commits 提交(build-log.md/validation.md)
