# OpenRedius Ansible 部署系统 — 总体设计

> 状态:设计稿(待评审)
> 作者分支:`feat/ansible-deploy`(独立 worktree,不触碰前端/后端在途开发)
> 关联文档:docs/07-deployment.md(部署现状)、docs/08-security.md(安全)、docs/01-architecture.md(拓扑)

## 1. 目标与非目标

### 1.1 目标

把「docs/07-deployment.md」描述的手工生产部署(`cp .env` → 手写密钥 → 手装
Docker → `docker compose up` → 手配防火墙 → 手配备份 cron)收敛为**一条命令、
可复现、零信任、可验证**的自动化部署:

- 一条命令完成全栈部署(四服务:postgres / freeradius / backend / frontend)
- **零信任**:目标机默认不可信,部署前对每项前置条件做显式断言,任一不满足即
  fail-fast 并给出可执行的修复提示,绝不"带病部署"
- **可复现**:幂等,`--check` 干跑,重复执行结果一致
- **可验证**:部署后自动跑健康检查(compose `healthy`、`/api/health`、TLS 握手)
- **可升级/回滚/备份/卸载**:镜像 tag 语义化,DB 迁移可回退,备份 cron 自动落盘

### 1.2 非目标(明确不做)

- 不托管 FreeRADIUS/NAS 业务配置(那些经控制台 API 写入 `radius.nas` 等)
- 不做多机/集群调度(单节点部署;多 FreeRADIUS 实例是应用层留白,见 docs/01)
- 不引入 K8s / Nomad 等编排器(沿用 compose 作为运行时,见 ADR 尚未记录但 docs/07 已定)
- 不做云平台差异适配(首版锁定 Debian/Ubuntu 家族,见 §5.1)
- 不做 GUI / CI 编排集成(后续可作为 `ansible-playbook` 的调用方接入 CI)

## 2. 现状盘点(Ansible 要接管的资产)

| 资产 | 路径 | Ansible 如何处理 |
|---|---|---|
| prod compose(四服务) | `deploy/docker-compose.yml` | **模板化**(镜像 tag、端口、build/pull 开关),原文件不改动 |
| dev compose | `deploy/docker-compose.dev.yml` | 不接管(dev 用) |
| env 模板 | `deploy/.env.example` / `.env.example` | 由 vault 密钥 + group_vars 渲染成目标机 `.env`,**永不落库明文** |
| backend Dockerfile | `backend/Dockerfile`(context=仓库根) | build 策略时随源码同步到目标机 |
| frontend Dockerfile | `deploy/nginx/Dockerfile`(context=仓库根) | 同上 |
| freeradius 镜像 | `deploy/freeradius/`(Dockerfile+raddb+entrypoint) | pull 策略时仅同步运行时资产(raddb/entrypoint/certs) |
| postgres 初始化 | `deploy/postgres/init/`(schema.sql + 01-init.sh) | 同步到目标机挂载 |
| nginx 配置 | `deploy/nginx/nginx.conf` + `generate-certs.sh` | 同步到目标机挂载 |
| 备份/恢复 | `deploy/scripts/backup.sh` / `restore.sh` | 由 Ansible 封装成 playbook + cron(不直接复用 shell) |

关键约束:**Ansible 只读引用 `deploy/`、`backend/` 下的现有文件,不修改它们**。
需要变化的部分(镜像 tag、端口、build/pull 开关)全部通过 `ansible/templates/`
下的模板副本 + 变量注入实现,避免与前端/后端在途分支产生任何文件冲突。

## 3. 设计原则(零信任如何落地)

零信任部署 = 假设目标机与网络均不可信,不依赖任何"应该已经装好/配好"的隐式前提。
五条硬原则:

1. **先证后做(Verify-before-Act)**:每个 playbook 首段必跑 preflight,任何断言失败
   立即中止,输出失败项 + 修复建议;`--check` 模式可只跑 preflight 不改动任何东西。
2. **密钥零明文**:所有口令由 vault 加密保存于仓库(或外部 vault 提供);部署时渲染到
   目标机 `.env`(权限 600);仓库内任何明文口令被禁止(preflight 自查)。
3. **最小权限**:容器全部非 root 运行(backend 已 `USER openredius`);docker 不暴露
   TCP socket;目标机不开放 5432/8000;1812/1813 仅对 NAS 网段(防火墙层控制)。
4. **默认拒绝**:网络暴露面白名单化 —— 只开 80/443(管理)与 1812/1813 udp(限 NAS);
   其余一律 drop;`5432/8000/3799` 永不对外。
5. **可验证可回滚**:部署后自动健康断言;镜像 tag 语义化;升级=换 tag+迁移;回滚=切回
   旧 tag;DB 迁移要求向后兼容一个版本(沿用 docs/07 约定)。

## 4. 目录结构

```
ansible/
├── DESIGN.md                  # 本文档
├── README.md                  # 使用手册(快速开始/命令/FAQ)
├── ansible.cfg                # 控制器配置(inventory/roles 路径、host_key_checking 等)
├── requirements.yml           # collections 依赖(community.docker / general / posix)
├── inventory/
│   ├── hosts.yml              # 目标机清单(生产/测试分组)
│   ├── group_vars/
│   │   ├── all/
│   │   │   ├── main.yml       # 通用:部署路径、镜像占位、端口、资源基线
│   │   │   └── vault.yml      # 加密:全部口令(JWT/DB×3/admin/CoA) — ansible-vault
│   │   └── prod/              # 生产分组覆盖(域名、NAS 网段、真实证书开关)
│   └── host_vars/             # 单机覆盖
├── playbooks/
│   ├── site.yml               # 主入口:preflight → install → deploy → verify(带 tag)
│   ├── preflight.yml          # 纯检查,零改动(零信任门禁)
│   ├── deploy.yml             # 部署/更新(幂等)
│   ├── backup.yml             # 即时备份 + 安装每日 cron
│   ├── restore.yml            # 从备份恢复(带 --extra-vars dump=...)
│   ├── upgrade.yml            # 换镜像 tag + DB 迁移 + 滚动重启
│   ├── verify.yml             # 部署后健康检查
│   └── teardown.yml           # 卸载(停栈,可选保留数据卷)
├── roles/
│   ├── preflight/             # ★ 零信任核心:全量前置断言(见 §6)
│   ├── common/                # 目标机基线:用户/时区/时间同步/内核参数
│   ├── docker/                # 安装 + 配置 Docker Engine + compose 插件
│   ├── firewall/              # 白名单防火墙(ufw/nftables,按 OS 分支)
│   ├── deploy/                # 同步资产、渲染 .env、渲染 compose、起栈
│   ├── certs/                 # TLS:真实证书分发 or 自签生成(prod 默认拒绝自签)
│   ├── backup/                # 备份目录/保留策略/每日 cron
│   └── post_deploy/           # 健康检查、迁移、初始管理员引导
├── templates/                 # 渲染模板(compose、.env、cron、firewall 规则)
└── files/                     # 需原样同步的静态资产引用(deploy/ 下的东西)
```

> 说明:`deploy/` 现有文件不复制进 `ansible/`,而是在 playbook 里以**源路径**引用
> (相对仓库根 `../deploy/...`),保证单一事实来源;模板化产物才放 `ansible/templates/`。

## 5. 目标环境基线

### 5.1 支持矩阵(首版锁定)

| 维度 | 支持 | 说明 |
|---|---|---|
| OS | Debian 12 (bookworm)、Ubuntu 22.04/24.04 LTS | preflight 显式断言 `ansible_os_family` |
| 架构 | x86_64 / arm64 | 镜像需对应多架构 tag |
| Docker | Engine ≥ 24 + compose v2 插件 | preflight 断言版本 |
| Ansible | core ≥ 2.16 + Python ≥ 3.10 | 控制器侧要求 |
| 目标机资源 | ≥ 2C / ≥ 2GB / ≥ 10GB 空闲磁盘 | 低于基线即 fail(见 §6) |

非受支持 OS(RHEL/CentOS/其它)在 preflight 阶段**明确拒绝**并提示,不尝试"尽力而为"。

### 5.2 目标机目录布局

```
/opt/openredius/               # 部署根(变量 openredius_deploy_root)
├── .env                       # 渲染出的运行时密钥(600,root)
├── docker-compose.yml         # 渲染出的生产 compose
├── certs/                     # nginx 证书(cert.pem/key.pem,600)
├── freeradius/                # raddb + entrypoint + certs(同步自 deploy/freeradius)
├── postgres/init/             # schema.sql + 01-init.sh(同步自 deploy/postgres/init)
├── nginx/                     # nginx.conf + generate-certs.sh(同步自 deploy/nginx)
├── backups/                   # pg_dump 产物(700,保留 14 份)
└── .source/                   # 仅 build 策略:仓库源码(build 上下文)
```

## 6. 零信任 preflight 检查矩阵(核心)

preflight role 是零信任的落地载体。分七组断言,顺序执行,失败即停。每一项都带
`assert` + `fail_msg`(说明现状/期望/修复命令)。全部断言在 `--check` 下也可跑。

### A. 控制器侧(本地,delegate_to: localhost)

| # | 检查 | 失败提示(示例) |
|---|---|---|
| A1 | ansible-core ≥ 2.16、Python ≥ 3.10 | "升级: pip install -U ansible-core" |
| A2 | collections 已装(community.docker/general/posix) | "执行: ansible-galaxy install -r requirements.yml" |
| A3 | vault 文件可解密(口令正确) | "用正确 vault password 重试" |

### B. 连通与访问

| # | 检查 | 说明 |
|---|---|---|
| B1 | SSH 可达 + 公钥认证(非交互密码) | 探测 `ssh -o BatchMode` |
| B2 | sudo 免密(`sudo -n true`) | 后续特权操作前提 |
| B3 | 目标机可被 ping / TCP 22 通 | 基础连通 |

### C. 主机基线

| # | 检查 | 说明 |
|---|---|---|
| C1 | OS family/版本在支持矩阵内 | 不支持即 fail |
| C2 | 架构 x86_64/arm64 | 与镜像多架构 tag 匹配 |
| C3 | hostname 非 `localhost`、可解析 | 影响审计/JWT |
| C4 | 时间同步 active(chrony/timesyncd)且时钟偏差 < 阈值 | RADIUS/审计/JWT 依赖 |
| C5 | 时区可配置(默认 UTC,可在 vars 覆盖) | 日志一致性 |

### D. 资源与磁盘

| # | 检查 | 说明 |
|---|---|---|
| D1 | CPU ≥ 2 | docs/07 资源基线合计约 2C |
| D2 | 内存 ≥ 2GB(建议 4GB) | 低于 2G fail,2~4G warn |
| D3 | `/opt` 空闲 ≥ 5GB、`/var/lib/docker` 空闲 ≥ 5GB | 镜像+数据卷+备份 |
| D4 | `/opt/openredius` 不在 tmpfs、非只读 | 数据持久性 |
| D5 | swap(可选,warn) | 内存不足时兜底 |

### E. 运行时依赖与端口冲突

| # | 检查 | 说明 |
|---|---|---|
| E1 | Docker 已装/可装、daemon running、版本 ≥ 24 | 未装则进入 install 阶段 |
| E2 | `docker compose version` 可用(插件) | 非 legacy docker-compose |
| E3 | 部署用户具备 docker 权限 | 或 sudo 下执行 |
| E4 | 端口无冲突:80/443/5432/1812/1813/3799 未被占用 | `ss -lntup` 断言 |
| E5 | 出网可达镜像仓库(Docker Hub / 私有 registry) | pull 策略必需 |

### F. 网络与防火墙(默认拒绝)

| # | 检查 | 说明 |
|---|---|---|
| F1 | 防火墙工具存在(ufw 或 firewalld 或 nftables) | 未装则 install 阶段装 |
| F2 | 80/443 对管理网段开放 | 白名单 |
| F3 | 1812/1813 udp 仅对 NAS 网段开放 | 非全 0.0.0.0 |
| F4 | 5432/8000/3799 未对外暴露 | 内部网络断言 |
| F5 | `net.ipv4.ip_forward=1`(docker 需要) | 内核参数 |

### G. 密钥与安全姿态(零信任核心)

| # | 检查 | 说明 |
|---|---|---|
| G1 | 全部密钥非默认值(无 `change-me`/`dev-only`) | 渲染前断言 |
| G2 | `OPENRADIUS_JWT_SECRET` 长度 ≥ 32 | prod 硬约束(docs/08) |
| G3 | bootstrap admin 口令强度达标(长度 ≥ 10) | argon2 侧约束 |
| G4 | prod 模式下自签证书默认拒绝(需显式 `tls_allow_self_signed: true`) | TLS 门禁 |
| G5 | docker 未暴露 TCP socket(2375/2376) | 攻击面 |
| G6 | 仓库内无明文密钥(vault 外) | 控制器侧自查 |

## 7. 密钥管理(零信任)

- 载体:`ansible-vault` 加密 `inventory/group_vars/all/vault.yml`,密钥文件单独分发
  (`.vault_pass` 不入库;支持 `ANSIBLE_VAULT_PASSWORD_FILE` 环境变量注入)。
- 生成:提供 `ansible/scripts/gen-secrets.sh`(或 playbook `--tags gen-secrets`)用
  `openssl rand -base64` 生成全部口令,写入 vault,绝不手工发明口令。
- 渲染:deploy role 用 `ansible.builtin.template` 将 vault 值写入目标机
  `/opt/openredius/.env`(mode=600, owner=root),用 `no_log: true` 禁止回显。
- 轮换:改 vault 值 → 重跑 `deploy.yml --tags env` → `docker compose up -d` 生效
  (DB 角色口令变更需额外 `ALTER ROLE`,记录为已知限制,首版提示而非自动执行)。

## 8. 镜像占位策略

### 8.1 变量层(单一事实来源)

`inventory/group_vars/all/main.yml` 定义镜像与 tag:

```yaml
openredius_images:
  postgres:       "postgres:17-alpine"
  freeradius_base: "freeradius/freeradius-server:3.2"   # 构建基底(暂占位)
  freeradius:     "openredius/freeradius:0.1.0"          # 占位:正式镜像未发布
  backend:        "ghcr.io/openredius/backend:0.1.0"     # 占位
  frontend:       "ghcr.io/openredius/frontend:0.1.0"    # 占位
openredius_deploy_strategy: build    # build(占位期) | pull(正式镜像发布后)
```

### 8.2 双策略

| 策略 | 何时用 | 目标机需要 | 行为 |
|---|---|---|---|
| `build`(默认) | 正式镜像未发布(当前) | 同步源码(`git archive`/rsync 仓库) | compose 保留 `build:` 段,在目标机构建并打 tag |
| `pull` | 镜像发布到 registry 后 | 仅运行时资产(无源码) | compose 去掉 `build:`,按 `image:` 拉取 |

**切换方式**:只改 `openredius_deploy_strategy` 一个开关 + `openredius_images.*` 的
真实 tag;compose 模板据此渲染。无需改动 `deploy/` 原文件、无需改角色逻辑。
这满足"镜像先占位、正式镜像确定后更新"的要求。

## 9. 变量设计

| 变量(前缀 `openredius_`) | 默认 | 说明 |
|---|---|---|
| `openredius_deploy_root` | `/opt/openredius` | 目标机部署根 |
| `openredius_deploy_strategy` | `build` | build / pull |
| `openredius_images.*` | 见 §8 | 镜像与 tag |
| `openredius_env` | `prod` | 后端运行模式 |
| `openredius_frontend_http_port` / `_https_port` | 80 / 443 | 前端映射 |
| `openredius_nas_udp_expose` | `1812-1813` | RADIUS 端口映射 |
| `openredius_admin_cidr` | 必填 | 管理网段(防火墙白名单) |
| `openredius_nas_cidr` | 必填 | NAS 网段(1812/1813 白名单) |
| `openredius_tls_allow_self_signed` | `false` | prod 默认拒绝自签 |
| `openredius_tls_cert_src` / `_key_src` | 空 | 真实证书路径(控制器侧) |
| `openredius_backup_retention` | `14` | 备份保留份数 |
| `openredius_backup_cron` | `0 3 * * *` | 每日备份时间 |
| `openredius_db_migrate_on_deploy` | `true` | 部署后自动 alembic upgrade head |

密钥类(全部在 `vault.yml`,不出现在明文 vars):`POSTGRES_PASSWORD`、
`OPENRADIUS_DB_PASSWORD`、`RADIUS_SQL_PASSWORD`、`OPENRADIUS_JWT_SECRET`、
`OPENRADIUS_BOOTSTRAP_ADMIN_USER/_PASSWORD`、`OPENRADIUS_RADIUS_COA_SECRET`、AD 系(可选)。

## 10. playbook 清单与执行流

| playbook | 职责 | 关键 tag |
|---|---|---|
| `site.yml` | 一键:`preflight` → `common` → `docker` → `firewall` → `certs` → `deploy` → `backup`(cron) → `post_deploy` | `preflight,install,deploy,verify,backup` |
| `preflight.yml` | 纯检查,零改动 | — |
| `deploy.yml` | 部署/更新(幂等) | `env,assets,compose,up` |
| `backup.yml` | 立即备份 + 装 cron | `backup,cron` |
| `restore.yml` | 恢复(必传 `--extra-vars dump=/path/...`) | `restore` |
| `upgrade.yml` | 换 tag → 迁移 → 滚动重启 → 健康断言 | `image,migrate,up,verify` |
| `verify.yml` | 部署后健康断言 | — |
| `teardown.yml` | 停栈(默认保留数据卷) | `stop,volumes` |

执行流(site.yml 顺序):

```
preflight(零信任门禁,fail-fast)
  → common(用户/时区/时间同步/内核参数)
  → docker(安装/配置/启动)
  → firewall(白名单规则)
  → certs(证书分发或自签门禁)
  → deploy(同步资产 → 渲染 .env/compose → 起栈 → 迁移)
  → backup(备份目录 + 每日 cron)
  → post_deploy(健康检查 + 初始管理员引导提示)
```

## 11. 幂等性与安全执行

- 全部模块用幂等原语(`ansible.builtin.copy/template/file/get_url/systemd/command`
  配合 `creates`/`changed_when`/`docker_compose_v2` 幂等状态)。
- 起栈用 `community.docker.docker_compose_v2`,自动幂等(仅差异时重建)。
- 敏感任务 `no_log: true`;`--check` + `--diff` 全程支持干跑审计。
- 所有 `command` 用 `changed_when`/`failed_when` 显式声明,避免假阳性/假阴性。
- 目标机改动最小化:只写 `/opt/openredius/`、系统包、防火墙规则、cron 条目。

## 12. 安全加固清单(Ansible 负责的部分)

| 项 | 措施 |
|---|---|
| 暴露面 | 仅 80/443 + 1812/1813(限 NAS);5432/8000/3799 内部 |
| 容器权限 | 非 root(backend 已有);不挂 docker.sock;不 privileged |
| TLS | 真实证书分发;自签仅内网且显式允许;HSTS/CSP 沿用现有 nginx.conf |
| 密钥 | vault 加密;`.env` 600;`backups/` 700;传输不落明文日志 |
| 时间 | 强制时间同步(审计/JWT 依赖) |
| 备份 | 每日 cron + 保留策略;备份文件同密级(700) |
| 审计 | Ansible 运行日志(playbook 输出)可被 CI 留存 |

## 13. 验证与验收

部署完成后自动断言(verify.yml / site.yml 末段):

1. `docker compose ps` 四服务 `running` 且 `healthy`
2. `curl -sk https://<host>/api/health` → `{"status":"ok"}`
3. TLS 握手成功、安全头存在(Strict-Transport-Security / X-Frame-Options / CSP)
4. `docker compose logs backend --tail 50` 无 ERROR
5. 端口暴露面符合白名单(`ss -lntup` 复核)
6. 备份 cron 已安装、备份目录可写
7. (可选)radtest 冒烟:从 freeradius 容器对本地认证(需先经控制台注册 NAS + 用户)

**验收标准(整体交付)**:
- `ansible-playbook -i inventory/hosts.yml playbooks/site.yml --check` 全绿(干跑)
- 在干净 Debian 12 VM 上 `site.yml` 一条命令起全栈并全 healthy
- 改坏一个密钥 → preflight G 组 fail 且提示修复
- `--extra-vars openredius_deploy_strategy=pull` 切换后 compose 无 `build:` 段
- vault 加密后 `grep` 仓库无明文密钥

## 14. 分阶段实施计划

| 阶段 | 交付物 | 验收 |
|---|---|---|
| P0 骨架 | 目录/ansible.cfg/requirements.yml/inventory/group_vars/空 playbook | 结构可被 `ansible-playbook --syntax-check` 通过 |
| P1 preflight | 七组断言全部落地(§6) | 干净机 + 故意制造缺陷机两种输入,断言行为正确 |
| P2 基础角色 | common + docker + firewall | 干净机一条命令装齐 Docker + 防火墙规则 |
| P3 部署核心 | deploy + certs(模板化 compose/.env,资产同步) | build 策略起全栈 healthy |
| P4 数据面 | backup + restore + upgrade | 备份/恢复演练、tag 升级、回滚 |
| P5 验证收尾 | post_deploy/verify + README + 文档 | §13 验收标准全过 |

## 15. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 占位镜像未发布,build 策略需目标机源码 | 首次部署重(需 git/rsync 整个仓库) | 默认 `git archive <tag>` 只取必要上下文;镜像发布后切 pull |
| FreeRADIUS 基底镜像 tag 漂移(`latest`) | 构建不可复现 | 占位期 pin `freeradius-server:3.2`;正式发布后替换 |
| DB 角色口令轮换需 `ALTER ROLE` | 轮换不彻底 | 首版提示手动步骤,后续封装成 `rotate.yml` |
| 防火墙工具差异(ufw vs firewalld) | 兼容成本 | 锁定 Debian/Ubuntu → 统一 ufw;nftables 作为兜底分支 |
| RADIUS 端口仅 NAS 网段,但 compose 绑 0.0.0.0 | 暴露面依赖防火墙 | preflight F3 断言 + 防火墙规则双保险;文档警示 |
| 时间不同步导致 JWT/审计漂移 | 认证失败难排查 | preflight C4 强制 chrony,不满足即 fail |

## 16. 待评审问题(open questions)

1. 目标机 OS 是否可锁定 Debian 12 / Ubuntu LTS 家族?(首版明确拒绝 RHEL 系)
2. 生产 TLS 证书分发方式:控制器本地文件分发 / 外部 CA 签发 / Let's Encrypt(acme)?
   首版按"本地文件分发 + 可选自签",是否够?
3. 镜像 registry 目标:GHCR(ghcr.io/openredius/…)还是私有 Harbor?决定 `openredius_images` 占位前缀。
4. 备份是否需要 offsite(rsync/rclone 到对象存储)?首版仅本地 + cron,offsite 留作扩展。
