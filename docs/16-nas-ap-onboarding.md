# 16 · NAS/AP 接入与热更新改进设计

## 0 · 定位与状态

**状态:设计文档,未实现。** 同 [15-ad-ldap-auth-integration.md](./15-ad-ldap-auth-integration.md),
只排查现状、写方案,交给 `pi` 实现,我(Claude Code)之后负责部署验证与反馈。

## 1 · 现状流程(设计初衷,见 06/07/deploy/README)

控制台「设备管理」新增 NAS(`POST /api/devices/nas`,
`backend/src/openredius/api/devices.py:152`)→ 写入 `radius.nas` → 响应带
`reload_required: true` → 前端 toast 引导调用
`POST /api/ops/reload-radius`(`backend/src/openredius/api/ops.py:56`)→
执行 `OPENRADIUS_RADIUS_RELOAD_COMMAND` 配置的 shell 命令 → FreeRADIUS
重新读取 `nas` 表,新设备生效。

`deploy/README.md`「真实 NAS 接入清单」和 `docs/07-deployment.md` 都是照这条
链路写的操作步骤。

## 2 · 发现的两个缺口(2026-08-14 设计复核发现,尚未在真实环境实测到这一步)

> 以下是**只读代码审查**发现的问题,不是"已经在生产环境复现过的故障"——标注
> 清楚避免误导。实现改进方案前,pi 应该先在测试环境实际验证一遍现状,确认这两条
> 缺口是否属实、影响面多大,再动手改。

### 2.1 `reload-radius` 默认配置大概率执行不了

`deploy/docker-compose.yml`/`docker-compose.ghcr.yml`/`docker-compose.offline.yml`
里 `OPENRADIUS_RADIUS_RELOAD_COMMAND` 的默认值是:

```
docker kill -s HUP openredius-freeradius-1
```

但这条命令是 `POST /api/ops/reload-radius` 在 **backend 容器内部**执行的
(`ops.py` 直接 `subprocess`/`asyncio.create_subprocess_exec` 跑这个字符串)。
backend 镜像基于 `python:3.13-slim`,**没有安装 `docker` 客户端,compose 文件
里也没有给 backend 挂载 `/var/run/docker.sock`**——这条命令在 backend 容器里
执行,大概率是 `command not found`(`ops.py` 已经把这类失败包成
`reload_unavailable`/`reload_failed` 错误返回,不会让人以为成功了,但功能本身
不通)。

### 2.2 就算命令能跑通,SIGHUP 也不保证重新加载 NAS 客户端列表

`docs/06-freeradius-integration.md`「NAS 客户端生命周期」已经记录了这个结论:
FreeRADIUS 3.x 的 `read_clients = yes` 语义是**仅启动时读取一次**,这是
FreeRADIUS 上游的已知行为,不是本项目配置能改的。`SIGHUP` 通常触发的是"配置
重新加载"里的一部分行为,但不保证覆盖到从 SQL `nas` 表读取客户端列表这一步——
要保证新 NAS 生效,可靠的做法是**重启 `radiusd` 进程**(或整个容器),而不是
发信号。

**两条叠加的结论**:目前"新增 NAS → 点重载 → 立刻生效"这条文档化流程,大概率
从第一步(命令执行)就不通;就算修好第一步,第二步(HUP 是否真的重新读客户端表)
也存疑。这是这份文档要解决的核心问题。

## 3 · 改进方向(推荐):容器内 watcher,不给 backend 挂 docker.sock

**不建议**的方案:给 backend 挂 `docker.sock` + 装 `docker` 客户端,让它能直接
操作宿主机 Docker——这等于给 backend 容器事实上的宿主机 root 等价权限
(能起停任意容器、挂载任意路径),安全 posture 明显变差,一个 web 后端不应该有
这种权限,不推荐,即使能最快解决问题。

**推荐方案**:backend 与 freeradius 之间新增一个共享 volume(比如
`radius-reload:/var/run/openredius`,两边都挂载,不需要暴露给宿主机)。

1. `POST /api/ops/reload-radius` 的实现从"执行任意 shell 命令"改成"往共享卷
   写一个哨兵文件/时间戳"(比如 `touch /var/run/openredius/reload-requested`
   或写入当前时间戳)。
2. `deploy/freeradius/entrypoint.sh` 起一个极简的后台 watcher:用
   `inotifywait -m` 监听这个文件(镜像已经是 Debian 基础,装
   `inotify-tools` 成本很低),或者退化成一个轮询循环(`while true; do
   [ file 比上次新 ] && do_reload; sleep N; done`,不引入额外依赖但有
   延迟)。
3. watcher 侦测到变化后,**重启 `radiusd` 进程本身**(比如
   `kill -TERM $(pidof radiusd) && exec radiusd -X` 之类,具体信号/命令需要
   pi 实现时结合当前 entrypoint 的进程管理方式,PID 1 是谁、怎么优雅重启)——
   不是重启整个容器,但达到"重新走一遍启动时读取"的等价效果,不需要 Docker
   API、不需要跨容器高权限、不需要暴露 socket。

**顺带的收紧**:现有 `OPENRADIUS_RADIUS_RELOAD_COMMAND` 是"允许 admin 在
`.env` 里配一条任意 shell 命令,由 API 触发执行"这种设计,权限模型偏松散
(相当于给了一个通过 Web API 触发的任意命令执行接口,即使当前只有 admin 能
调)。改成受控的"写哨兵文件"机制后,这个攻击面也一并收窄了,建议一起做掉,
不要只修 bug 不改设计。

**受影响文件清单(供 pi 参考)**:

- `backend/src/openredius/api/ops.py`(`reload_radius` 实现改成写哨兵文件)
- `backend/src/openredius/core/config.py`(`radius_reload_command` 这个配置项
  的语义要么废弃要么改名,明确新机制不再是"任意命令"）
- `deploy/freeradius/entrypoint.sh`(加 watcher 逻辑)
- `deploy/freeradius/Dockerfile`(如果选 inotifywait 方案,需要装
  `inotify-tools`)
- `deploy/docker-compose.yml`/`docker-compose.ghcr.yml`/
  `docker-compose.offline.yml`(新增共享 volume,backend + freeradius 都挂)
- `deploy/.env.example`(去掉/更新 `OPENRADIUS_RADIUS_RELOAD_COMMAND` 相关说明)
- `docs/06-freeradius-integration.md`「NAS 客户端生命周期」章节需要同步改写
  成实际实现的机制
- `docs/07-deployment.md`/`deploy/README.md`「真实 NAS 接入清单」步骤 4
  (FreeRADIUS 重载)需要同步更新

## 4 · 次要改进点(优先级低于上面的修复,可以分开排期)

1. **新增 NAS 后没有连通性自检**:操作员保存完 NAS 配置、点了重载,不知道
   到底生没生效,只能靠真机联调才能验证。建议在「设备管理」页给每个 NAS 加一个
   "验证"操作,后端内部逻辑可以是:检查 freeradius 进程最近一次重启时间是否
   晚于该 NAS 的创建/修改时间(证明确实过了一轮 reload),或者更彻底地做一次
   内部 loopback 认证测试(类似 `radtest`,但用一个专门的探测账号,不依赖真实
   用户密码)。
2. **批量导入多个 AP**:当前「设备管理」只支持逐条创建 NAS,接入几十上百台
   AP/交换机的场景效率很低。可以参考已有的端点批量导入模式
   (`backend/src/openredius/api/devices.py:414`,`POST /endpoints/import`),
   给 NAS 也加一个 CSV/Excel 批量导入接口 + 前端入口。
3. **共享密钥没有"随机生成"按钮**:目前新增 NAS 时 secret 需要管理员自己想/
   记,容易图省事用弱密钥或重复使用同一个密钥。建议前端表单加一个"生成随机
   强密钥"按钮(参考现有强口令生成逻辑,如果项目里已经有类似的密码生成工具
   函数,直接复用)。

## 5 · 验收标准

1. 通过控制台新增一个 NAS,**不需要人工 SSH 到服务器、不需要重启整个容器**,
   在 watcher 的检测间隔内(几秒到几十秒,取决于实现方式)该 NAS 的
   `nasname`/`secret` 就能通过 `radtest` 认证成功。
2. 修改或删除某个 NAS 的密钥后,旧密钥立刻(同样的检测间隔内)失效,不能再用
   旧密钥认证成功。
3. `POST /api/ops/reload-radius` 的实现不再执行"从配置读出来的任意 shell
   命令"这种模式。
4. `docs/06-freeradius-integration.md`/`docs/07-deployment.md`/
   `deploy/README.md` 三处关于"NAS 变更如何生效"的描述已同步更新,和实际
   实现一致。
