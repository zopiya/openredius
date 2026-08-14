# NAS/AP 接入热更新机制修复 — spec

来源设计文档:`docs/16-nas-ap-onboarding.md`(状态:设计文档,本次实现)。

## 问题与目标

控制台新增/变更 NAS 后,文档化流程是 `POST /api/ops/reload-radius` → 执行
`OPENRADIUS_RADIUS_RELOAD_COMMAND` → FreeRADIUS 重新读取 `radius.nas`。设计文档
§2 指出这条链路有两个缺口(当时为只读代码审查结论,未经实测):

- **缺口 1**:默认 reload 命令 `docker kill -s HUP openredius-freeradius-1` 在
  backend 容器内部执行,但 backend 镜像(`python:3.13-slim`)没有 docker CLI,
  compose 也没有给 backend 挂 `/var/run/docker.sock` → 大概率 `command not found`。
- **缺口 2**:FreeRADIUS 3.x `read_clients = yes` 仅启动时读取 `nas` 表,SIGHUP
  不保证重读 SQL 客户端列表 → 即使命令能跑,新 NAS 也不保证生效。

目标:NAS 新增/修改/删除后,无需人工 SSH、无需重启容器、无需给 backend 挂
docker.sock,在数秒～数十秒内自动生效;同时收窄"Web API 触发任意 shell 命令"
的攻击面。

## 范围

### In scope

- 验证两个缺口在测试环境是否属实(实施前,先复现)。
- `POST /api/ops/reload-radius` 改为受控的"共享卷哨兵文件"机制,彻底移除
  "执行从配置读出的任意 shell 命令"模式。
- freeradius 容器内 watcher:侦测哨兵文件变化后重启 `radiusd` 进程(不是重启
  容器),使其重走启动时读取 `nas` 表的过程。
- 后端配置项 `radius_reload_command` → 新语义(共享目录路径),compose ×4、
  `.env.example` 同步。
- 文档同步:`docs/06`(NAS 客户端生命周期)、`docs/07`(环境变量/真实 NAS 接入
  相关)、`docs/13`(SOP-02 现状提醒)、`deploy/README.md`(真实 NAS 接入清单)。

### Out of scope(设计文档 §4,可另行排期)

- NAS 连通性自检(§4.1)、批量导入 AP(§4.2)、随机密钥生成按钮(§4.3)。
- 给 backend 挂 docker.sock / 装 docker CLI(设计文档明确不推荐,已否决)。

## 功能需求

- **FR-001** `POST /api/ops/reload-radius` 不再执行任意 shell 命令;配置项
  `OPENRADIUS_RADIUS_RELOAD_COMMAND` 废弃,替换为 `OPENRADIUS_RADIUS_RELOAD_DIR`
  (哨兵文件目录路径;空 = manual 模式)。
- **FR-002** backend 与 freeradius 通过共享卷交换哨兵文件;backend 写请求文件
  (时间戳/序号,原子替换),freeradius watcher 完成重启后写回 applied 标记。
- **FR-003** watcher 检测间隔内(目标 ≤5s,总生效时间 ≤30s)重启 `radiusd` 进程;
  新 NAS 的 `nasname`/`secret` 即可通过认证;修改/删除密钥后旧密钥同样失效。
- **FR-004** API 响应区分 `manual`(未配置)/ `file`(哨兵机制)两种模式;file
  模式下轮询 applied 标记,返回是否已生效;审计记录保留(`ops.reload_radius`)。
- **FR-005** freeradius 容器内进程管理改造不得破坏:优雅停机(SIGTERM)、健康检查
  (`radiusd -CX`)、崩溃自动拉起。
- **FR-006** 文档与实现一致(见范围节清单)。

## 验收标准(映射设计文档 §5)

| 编号 | 标准 | 对应文档条目 |
|---|---|---|
| AC-1 | 控制台新增 NAS,不 SSH、不重启容器,watcher 间隔内 `radtest` 用新 secret 认证成功 | §5.1 |
| AC-2 | 修改/删除 NAS 密钥后,旧密钥在同样间隔内失效 | §5.2 |
| AC-3 | reload 实现不再执行配置里的任意 shell 命令 | §5.3 |
| AC-4 | docs/06、docs/07、deploy/README.md 描述与实际一致 | §5.4 |

本地验证手段:dev compose 起 postgres + freeradius,host 跑 backend,直接写
`radius.nas`(经设备 API),容器内 `radtest` 验证;缺口复现证据与修复后验证记录
均落 `validation.md`。

## 假设

- 验收以本地/测试环境跑通为准,不部署任何生产/目标环境(10.36.8.10 由用户另行
  接手)。
- watcher 方案允许在文档 §3 推荐方向内选择实现细节(轮询 vs inotifywait);
  若偏离推荐方向需在 plan.md 说明理由。
- `radius.nas` 为 FreeRADIUS 客户端表,Alembic 只读不写结构(见 docs/02 红线);
  本任务不涉及应用表 schema 变更。
