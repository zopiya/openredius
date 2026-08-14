# NAS/AP 接入热更新 — clarifications

## 已解决

| # | 问题 | 结论 | 依据 |
|---|---|---|---|
| Q-001 | §2 两个缺口是否属实 | **属实**。缺口 1:backend 容器(镜像 `python:3.13-slim`)内 `docker` CLI 不存在(实测 `docker: not found`),compose 三个 prod 变体均无 `/var/run/docker.sock` 挂载。缺口 2:SIGHUP 后 `radtest` 用新插入的 nas 行 secret 仍报 unknown client,重启容器后立即可用。复现证据见 `validation.md`。 | 测试环境实测(dev compose) |
| Q-002 | watcher 用 inotifywait 还是轮询 | **轮询**(2s interval)。理由:①零新增 apt 依赖(inotify-tools),镜像攻击面不扩大;②POSIX sh 即可实现,与现 entrypoint 一致;③2s 检测 + radiusd 重启远低于验收的 30s;④inotifywait 对"文件被替换"(tmp+mv)的事件语义有坑,轮询比较内容更稳。文档 §3 明确允许两者,此为方案内选择,未偏离推荐方向。 | plan.md |
| Q-003 | `radius_reload_command` 语义 | 废弃,替换为 `radius_reload_dir`(哨兵目录路径)。旧变量名不再读取。 | FR-001 |
| Q-004 | §4 次要改进点 | 不在本轮范围,记入 spec.md Out of scope,后续单独排期。 | docs/16 §4「可以分开排期」 |
| Q-005 | 哨兵文件协议 | `reload-requested`(backend 写,内容 = epoch 秒,先写 tmp 再 `os.replace` 原子替换)+ `reload-applied`(watcher 重启完成后写回同值)。backend 轮询 applied ≥ requested,超时 35s 则返回 "已排队"。 | plan.md |
| Q-006 | radiusd 进程管理改造 | entrypoint 由 `exec "$@"` 改为 supervise 主循环:radiusd 作子进程、watcher 轮询为主循环,收到哨兵变化 → `kill -TERM` + 重启;子进程意外退出自动拉起;SIGTERM/SIGINT trap 转发子进程后退出。 | plan.md |
| Q-007 | dev 环境共享路径 | dev compose 无 backend 容器,backend 跑在 host → freeradius 用 bind mount `./runtime/radius-reload:/var/run/openredius`,host 端 backend 配 `OPENRADIUS_RADIUS_RELOAD_DIR=deploy/runtime/radius-reload`。 | plan.md |

## 未决问题

无。
