# NAS/AP 接入热更新修复 — plan

## 技术上下文(基于实际代码,已核实)

- `POST /api/ops/reload-radius`(`backend/src/openredius/api/ops.py`)用
  `shlex.split(settings.radius_reload_command)` + `create_subprocess_exec` 在
  backend 进程内执行命令;`Settings.radius_reload_command`(`core/config.py`)
  默认空字符串 = manual 模式。
- backend 镜像 `python:3.13-slim`(Dockerfile 基底),无 docker CLI;三个 prod
  compose 变体(`docker-compose.yml/.ghcr.yml/.offline.yml`)backend 服务均无
  `/var/run/docker.sock` 挂载。默认命令 `docker kill -s HUP openredius-freeradius-1`
  在容器内执行 = command not found。
- FreeRADIUS 3.2.10:`rlm_sql read_clients=yes` 仅启动时读取 `radius.nas`。
- dev 场景:backend 跑在 host(非容器),dev compose 只有 postgres + freeradius。
- freeradius 入口:`deploy/freeradius/entrypoint.sh`,当前 `exec "$@"`(radiusd
  是 PID 1);官方镜像 PID1 即 radiusd,supervisor 模式需改造。
- 前端 `Devices.tsx` 只消费 `reload_required` 标志做 toast 提示,不直接调用
  `reload-radius`;`health.radius_config` 由设置页消费(manual 提示文案)。

## 现状缺口实测(2026-08-14,dev 栈)

| # | 假设 | 实测结论 |
|---|---|---|
| 1 | backend 容器内 reload 命令执行不了 | **属实**。`python:3.13-slim` 内无 `docker`;3 个 prod compose backend 无 docker.sock 挂载。 |
| 2 | SIGHUP 不重载 SQL NAS 客户端 | **属实**。插入新 nas 行(172.18.0.1)→ 请求被静默丢弃(日志 `unknown client`);`docker kill -s HUP` 后仍丢弃;`docker compose restart freeradius` 后立即收到 Access-Reject(客户端已加载)。 |

## 方案

采用设计文档 §3 推荐方向:**共享卷哨兵文件 + 容器内 watcher 重启 radiusd 进程**。
实现细节的选择与理由:

1. **watcher 用 2s 轮询,不用 inotifywait**(文档允许二者):
   - 零新增 apt 依赖,镜像攻击面不扩大;
   - POSIX sh 实现,与现 entrypoint 风格一致;
   - 哨兵文件用 tmp+`mv` 原子替换写入——inotifywait 对"文件被替换"需监听
     moved_to 等组合事件,轮询直接比较内容更简单可靠;
   - 2s 检测 + radiusd 重启(约 1-3s)远低于验收的 30s 上限。
2. **entrypoint 由 `exec` 改为 supervisor 主循环**:
   - 原因:radiusd 是 PID 1 时无法"杀进程重启"(杀 PID1 = 容器退出),必须让
     radiusd 作子进程、watcher 作主循环才能实现进程级重启。
   - 结构:启动 radiusd 子进程 → 循环内:哨兵变化 → `kill -TERM` 子进程 →
     `wait` → 重新拉起 → 写 applied 标记;子进程意外退出 → 自动拉起(顺带获得
     crash-restart 能力);SIGTERM/SIGINT trap → 转发子进程 → 退出(保持
     docker stop 优雅)。
3. **哨兵协议**(目录 `OPENRADIUS_RADIUS_RELOAD_DIR`,默认 `/var/run/openredius`):
   - backend 写 `reload-requested`:内容 = epoch 秒(字符串),先写
     `<dir>/.reload-requested.tmp` 再 `os.replace`(同卷原子替换,避免 watcher
     读到半截文件);
   - watcher 完成 radiusd 重启后写 `reload-applied`(同值);
   - backend 写完后轮询 `reload-applied` ≥ 请求值,上限 35s:成功返回
     `{mode:"file", applied:true, applied_at}`;超时返回
     `{mode:"file", applied:false, message:"已排队"}`(200——重载仍会发生)。
   - 目录权限:backend 容器(默认 root)与 freeradius 容器(entrypoint root)
     双方可读写;entrypoint 启动时 `mkdir -p` 兜底。
4. **API 契约变化**(向后兼容策略):
   - 响应 `mode` 枚举:`manual`(未配置目录)/ `file`(哨兵机制);原 `auto`
     值不再出现——前端检查点:`Devices.tsx` 不消费 reload API 响应,设置页
     (Settings.tsx)若引用需同步。
   - `Settings.radius_reload_command` **删除**,新增
     `radius_reload_dir: str = ""`。health 端点 `radius_config` 字段语义:
     目录非空 → `"file"`,否则 `"manual"`。
   - 审计保留:`ops.reload_radius` + detail(mode/requested/applied)。
5. **compose 变更**:
   - prod 三变体:backend 与 freeradius 都挂 named volume
     `radius-reload:/var/run/openredius`;backend env 加
     `OPENRADIUS_RADIUS_RELOAD_DIR=/var/run/openredius`;删除
     `OPENRADIUS_RADIUS_RELOAD_COMMAND` 行。
   - dev 变体(无 backend 容器):freeradius 挂 bind mount
     `./runtime/radius-reload:/var/run/openredius`;host 端 backend 配
     `OPENRADIUS_RADIUS_RELOAD_DIR=<repo>/deploy/runtime/radius-reload`。
   - `.env.example`:删除 reload command 段,新增 reload dir 说明。
6. **文档同步**:docs/06「NAS 客户端生命周期」、docs/07(环境变量表/接入说明)、
   docs/13 SOP-02「现状提醒」、deploy/README.md「真实 NAS 接入清单」步骤 4。

## 被否决的替代方案

- **backend 挂 docker.sock**:设计文档明确不推荐(宿主 root 等价权限),否决。
- **HTTP 调用 freeradius 内部服务**:需在 freeradius 容器新增常驻 HTTP 服务,
  比共享卷多一个攻击面,无必要。
- **inotifywait**:见上,可用但引入依赖与事件语义坑,轮询已满足验收。
- **保持"任意命令"模式只修 compose**:攻击面不动摇,违背文档 §3 收紧要求。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| entrypoint supervisor 改造引入进程管理 bug | dev 栈实测:重载、SIGTERM 停机、`radiusd -CX` 健康检查、异常退出自动拉起 |
| 哨兵目录不存在(未挂卷就跑) | entrypoint `mkdir -p`;backend 写失败返回明确错误(manual/不可用) |
| 并发 reload 竞态 | 原子替换 + epoch 值比较,last-write-wins 语义安全 |
| backend 容器与 freeradius 容器 UID 不一致 | 两容器进程均 root 运行(官方 python 镜像默认 root、freeradius entrypoint root),目录 0777 由 freeradius entrypoint 兜底 |
| reload 时半径请求瞬断 | radiusd 重启窗口 1-3s,请求被 NAS 重试吸收;文档注明 |

## 验证策略

1. 单元/API 测试:`backend/tests/api/test_ops.py` 改写——manual 模式、file 模式
   (tmp 目录 + 伪造 applied 标记)、RBAC、审计、`radius_reload_command` 不再
   存在(config 测试)。
2. 栈集成(dev compose + host backend):
   - 插入新 nas 行 → 调 `POST /api/ops/reload-radius`(file 模式)→ 探针请求
     (pyrad)收到响应 → AC-1;
   - 改 secret → 再次 reload → 旧 secret 探针超时、新 secret 收到响应 → AC-2;
   - 验证 reload API 源码/行为不含任意命令执行 → AC-3;
   - `docker kill -s HUP` 对照实验不再需要(新机制不依赖信号)。
3. 文档一致性人工核对 → AC-4。
4. `bun run verify`(前端类型,若有前端改动)+ `uv run pytest -q` + `ruff check`。

## 影响文件

- `backend/src/openredius/core/config.py`
- `backend/src/openredius/api/ops.py`
- `backend/tests/api/test_ops.py`(+ conftest settings 若引用旧字段)
- `deploy/freeradius/entrypoint.sh`
- `deploy/docker-compose.yml` / `.ghcr.yml` / `.offline.yml` / `.dev.yml`
- `deploy/.env.example` · `deploy/README.md`
- `docs/06-freeradius-integration.md` · `docs/07-deployment.md` ·
  `docs/13-operational-sop.md`
