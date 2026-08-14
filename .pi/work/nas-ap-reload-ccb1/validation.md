# NAS/AP 接入热更新修复 — validation

## 缺口复现证据(实施前,Q-001)

- Gap 1:`docker run --rm python:3.13-slim sh -c 'command -v docker'` → 空输出
  (backend 容器无 docker CLI);prod 三个 compose 的 backend 服务均无 docker.sock 挂载
  (grep 计数 = 0)。旧 `RELOAD_COMMAND` 默认为 docker 命令 → 必然失败。**属实。**
- Gap 2:dev 栈 gateway=172.18.0.1,插入 nas 行(`172.18.0.1`/`gap-verify-secret`)后
  host 端 pyrad 探针 4s 超时且 freeradius 日志静默丢弃(`unknown client`);
  `docker kill -s HUP` 后仍丢弃;`docker compose restart freeradius` 后立即收到
  Access-Reject。**`radiusd -HUP` 对 rlm_sql(read_clients)无效,必须整进程重启。属实。**
- 验证行已清理(`DELETE FROM radius.nas WHERE shortname='gap-verify'`)。

## 后端

```
uv run pytest -q            → 188 passed
uv run pytest -m integration -q → 9 passed(dev 栈 + PG)
uv run ruff check .         → clean
```

test_ops.py 覆盖:manual/file 两模式、file applied(预写 `9999999999` 立即生效)、
file pending(monkeypatch `_RELOAD_APPLIED_TIMEOUT_S=0.2`)、不可写目录 → 500
`reload_unavailable`、**AC-3 目录含 `$(touch ...)` 元字符断言无 shell 执行**、审计、
RBAC、health `radius_config` 值。

集成测试期间两处环境问题(非代码缺陷):早期失败登录触发 admin 锁定 + 我重置过
admin 密码,均已恢复(`fail_count=0`、密码回 `Admin-Dev-2026`)。

## 容器侧 + 端到端(dev 栈实测)

```
docker compose -f deploy/docker-compose.dev.yml up -d --build   → freeradius healthy
```

- 启动:radiusd 为 supervisor 子进程(PID ≠ 1),`Ready to process requests`。
- **AC-1 新增 NAS 生效**:插 `gap-e2e` 行(secret=e2e-secret-v1)→ host backend
  (`OPENRADIUS_RADIUS_RELOAD_DIR=deploy/runtime/radius-reload`)
  `POST /api/ops/reload-radius` → `{"mode":"file","applied":true,...}`(1.5s 返回)→
  pyrad 探针(旧 secret)收到 Access-Reject(code=3)——之前同场景是 4s 静默丢弃。
- **AC-2 改 secret 生效**:`UPDATE radius.nas SET secret='e2e-secret-v2'` → reload API
  `applied:true` → 旧 secret 探针 `NO REPLY within 4.0s (unknown client -> dropped)`,
  新 secret 探针 `REPLY received: code=3`。
- **SIGTERM 优雅停机**:`docker compose stop freeradius` → trap 生效,rlm_sql 连接池
  干净关闭;`start` 后自动恢复。
- **崩溃自愈**:`kill -9 $(ps -o pid= -C radiusd)` → 6s 后新 radiusd 进程在跑
  (watcher 自动拉起)。
- 哨兵文件:requested/applied 均为 epoch 秒,重启后 epoch 比较防止重复重启。
- 测试数据已清理(`DELETE ... WHERE shortname='gap-e2e'`)。

## 前端 / 全栈

```
bun run api:gen(OpenAPI 重新生成,schema.d.ts 含真实漂移修正)
bun run verify             → 0 fail
bun run e2e:http           → 42/42(需 VITE_API_MODE=http + backend:8000 + dev server:5173)
```

## 回归矩阵

| 层 | 命令 | 结果 |
|---|---|---|
| 后端单测 | `uv run pytest -q` | 188 passed |
| 栈集成 | `uv run pytest -m integration -q` | 9 passed |
| lint | `uv run ruff check .` | clean |
| 前端 | `bun run verify` | 0 fail |
| 全栈 | `bun run e2e:http` | 42/42 |

生产部署(10.36.8.10)由用户接手;prod compose 改动已落地但未部署。
