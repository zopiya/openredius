# NAS/AP 接入热更新修复 — build log

依据 docs/16-nas-ap-onboarding.md §3 推荐方案落地,把旧「任意 shell 命令」重载机制
替换为共享卷哨兵文件 + 容器内 watcher。分支 `fix/nas-ap-reload`。

## 已落地内容

### 后端(`backend/src/openredius/`)

- **`core/config.py`**:`radius_reload_command: str` → `radius_reload_dir: str = ""`。
  空值 = manual 模式;配置后 POST reload-radius 走哨兵文件协议。**后端不再保存/执行任何
  shell 命令**,CLI 注入攻击面(docs/16 §2 Gap 1)整体移除。
- **`api/ops.py`**:
  - `reload_radius` 重写:manual 模式(未配置目录)仅记审计、返回 `{mode:"manual", applied:false}`
    + 手工重启指引;file 模式写入 `reload-requested`(epoch 秒,先写 `.tmp` 再
    `os.replace` 原子替换),轮询 `reload-applied` ≥ requested 直至
    `_RELOAD_APPLIED_TIMEOUT_S = 35.0`(间隔 0.5s)。超时仍返回 200 `applied:false`
    +「已排队」语义——重启完成即自动生效,不必把 HTTP 请求挂到超时失败。
  - 目录不存在/不可写 → 503 `reload_unavailable`;审计 detail 记录 mode/requested/applied。
  - health `radius_config`:`"configured"` → `"file"`(manual 时保持 `"manual"`)。

### 容器侧(`deploy/freeradius/entrypoint.sh`)

- entrypoint 由 `exec radiusd` 改为 supervisor 主循环(radiusd 不再是 PID 1,文档
  docs/16 §3.2 的「PID 1 无法 kill」约束解除):
  - 启动 `start_radiusd`(后台子进程)、`trap` SIGTERM/SIGINT 优雅停机;
  - 每 2s:`reload_if_requested`(对比 `reload-requested` 与本地 APPLIED,变化则
    kill+wait+重启 radiusd,再写 `reload-applied`;启动时先读已有 applied 避免重复重启);
  - `restart_if_crashed`:radiusd 意外退出自动拉起(顺带获得崩溃自愈)。
  - POSIX sh 实现,零新增 apt 依赖(不引 inotifywait)。
- 实测修复过一个 dash 陷阱:POSIX sh 函数内 `"$@"` 是**函数参数**而非脚本参数,
  裸调 `start_radiusd` 会启动空命令导致 radiusd 永不真正重启(2s 循环「exited
  unexpectedly」);改为所有调用点显式传递 `"$@"`。

### 编排(`deploy/docker-compose{,.dev,.ghcr,.offline}.yml` + `.env.example`)

- prod 三变体:backend + freeradius 共享 named volume
  `radius-reload:/var/run/openredius`,两服务均注入 `OPENRADIUS_RADIUS_RELOAD_DIR`。
- dev 变体:bind mount `./runtime/radius-reload:/var/run/openredius`(host 直跑 backend
  时走同一目录);`.gitignore` 已加 `deploy/runtime/`。
- `.env.example`:删 `OPENRADIUS_RADIUS_RELOAD_COMMAND`,新增
  `OPENRADIUS_RADIUS_RELOAD_DIR=/var/run/openredius`(protected-path 拦 write,经
  Python 脚本改)。

### 文档同步(AC-4)

- `docs/03-api-design.md`:reload-radius 行改为哨兵机制描述。
- `docs/04-backend-design.md`:配置表 `OPENRADIUS_RADIUS_RELOAD_DIR`。
- `docs/06-freeradius-integration.md`:NAS 客户端生命周期流程改写。
- `docs/13-operational-sop.md`:SOP-02 删「现状提醒」段(旧机制已修),改为直接描述
  reload API 生效路径。
- `deploy/README.md`:两处(第 4 步重载说明、NAS 接入清单步骤 4)。
- `docs/07` 无需改:无机制描述,仅引用「生产运行」一节。
- `docs/16`(设计文档)、`docs/10`(历史 roadmap)按约定不改。

### 其他

- `src/api/schema.d.ts`:OpenAPI 重新生成。除 reload 文档串更新外,还带入此前遗漏的
  portal catch-all 全方法路由、policy 描述等真实漂移(此前快照落后于 backend)。
- `backend/uv.lock`:`openredius 0.1.0` → `0.2.2` 与 pyproject 对齐(每次 uv 运行都会
  自动漂移),单独 chore 提交。

## 验证记录

见同目录 `validation.md`。核心:后端 188 单测 + 9 栈集成测试全绿;dev 栈端到端
实测 AC-1(新 NAS 行经 reload API 生效,pyrad 探针收到 Access-Reject 而非静默丢弃)、
AC-2(改 secret 后旧 secret 静默丢弃、新 secret 收到响应);SIGTERM 优雅停机、
SIGKILL 自动拉起、`bun run e2e:http` 42/42。
