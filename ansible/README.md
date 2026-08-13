# ansible/ · OpenRedius 自动化部署

基于 Ansible + docker compose 的**零信任**生产部署。总体设计见
[DESIGN.md](./DESIGN.md)(先读它)。

## 快速开始

```bash
cd ansible

# 1. 装 collections
ansible-galaxy install -r requirements.yml

# 2. 准备密钥(加密)
#    自动生成随机口令(推荐):
bash scripts/gen-secrets.sh
ansible-vault encrypt inventory/group_vars/all/vault.yml
#    或手工:
#    cp inventory/group_vars/all/vault.yml.example inventory/group_vars/all/vault.yml
#    $EDITOR inventory/group_vars/all/vault.yml
#    ansible-vault encrypt inventory/group_vars/all/vault.yml

# 3. 填目标机
$EDITOR inventory/hosts.yml                          # prod01 的 IP/用户
$EDITOR inventory/group_vars/all/main.yml            # 管理网段/NAS 网段(必填)

# 4. 零信任干跑(不改动目标机,全量断言)
ansible-playbook playbooks/preflight.yml --check -i inventory/hosts.yml

# 5. 一键部署
ansible-playbook playbooks/site.yml --ask-vault-pass
```

## 常用命令

| 命令 | 用途 |
|---|---|
| `playbooks/preflight.yml --check` | 零信任前置检查(零改动) |
| `playbooks/site.yml` | 一键全流程(preflight→install→deploy→backup→verify) |
| `playbooks/deploy.yml --tags deploy` | 仅部署/更新(幂等) |
| `playbooks/backup.yml` | 即时备份 + 每日 cron |
| `playbooks/restore.yml --extra-vars "openredius_restore_dump=…"` | 从备份恢复 |
| `playbooks/upgrade.yml --extra-vars "openredius_images.backend=…"` | 换 tag 升级 |
| `playbooks/verify.yml` | 部署后健康检查 |
| `playbooks/teardown.yml` | 卸载(默认保留数据卷) |

## 状态

- [x] P0 骨架
- [x] P1 preflight(七组零信任断言)
- [x] P2 common / docker / firewall
- [x] P3 deploy / certs(模板化 compose/.env、build/pull 双策略、TLS 门禁)
- [x] P4 backup / restore(每日 cron + 保留策略)
- [x] P5 post_deploy / verify(健康检查 + 安全头断言)

## 前置条件

- **控制器**:ansible-core ≥ 2.16 + 对应 collections;`git`(build 策略用于 `git archive` 导出源码)。
- **目标机**:Debian 12 / Ubuntu LTS、x86_64/arm64、≥2C/2G/10G 磁盘、SSH 公钥 + sudo 免密;其余(Docker/ufw/chrony)由 playbook 自动装。

## 约定

- 只读引用 `deploy/`、`backend/` 现有文件,不修改它们;变化经 `ansible/templates/` 渲染。
- 密钥只在 `vault.yml`(加密),仓库内禁止明文口令。
- 目标机基线:Debian 12 / Ubuntu 22.04/24.04 LTS,x86_64/arm64,≥2C/2G/10G。
