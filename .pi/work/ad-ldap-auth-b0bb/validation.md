# AD 直通认证 + 属性同步扩展 — 验证记录(docs/15)

任务分支:`feat/ad-ldap-auth` → PR #13 → dev(--no-ff merge commit)
验证时间:2026-08-14(本地 + GitHub CI)

## 本地验证(已执行)

| 项 | 结果 |
|---|---|
| Alembic 迁移 `d4b050406f7c` PG 上 upgrade→downgrade→upgrade | ✅ 三列 + 修复 ix_admin_user_linked_account 漂移 |
| backend 全量 pytest | ✅ 194 passed, 9 deselected |
| backend ruff check | ✅ clean |
| `sh -n entrypoint.sh` | ✅ 语法通过 |
| 前端 `bun run verify` | ✅ tsc + 测试 + build 通过 |
| schema.d.ts 重生成 | ✅ UserOut 三字段;portal 命名漂移为真实后端变更 |
| 本地 docker build freeradius | ✅ ~4min(debconf 修复后) |
| 容器内 `radiusd -XC` | ✅ 无 error |
| 二进制在位(ntlm_auth/winbindd/net/kinit) | ✅ |
| dev 栈重启(AD 变量全空) | ✅ healthy,Ready to process requests(与 pre-AD 行为一致) |
| 假 AD 变量(join 必败) | ✅ 单次 WARNING 不刷屏;radiusd 正常;SIGTERM 干净退出;0 crash-restart |
| **mschap→ntlm_auth 接线冒烟** | ✅ 见下 |

### mschap→ntlm_auth 接线冒烟(本地假 ntlm_auth)

- 方法:一次性容器挂载 fake `/usr/bin/ntlm_auth`(输出固定 NT_KEY),host 通过
  容器内 radclient 发 MS-CHAPv2 Access-Request(16B Challenge + 50B
  MS-CHAP2-Response),临时插 nas 行(172.18.0.1/wire-test-secret)做 client 认证。
- 日志证据:
  - `mschap: Found MS-CHAP attributes. Setting 'Auth-Type = mschap'`
  - `mschap: Executing: /usr/bin/ntlm_auth --request-nt-key --allow-mschapv2 --username=... --challenge=... --nt-response=...`
  - fake wrapper 输出 NT_KEY → **Access-Accept**(共 4 次)
  - wrapper 的 stderr 出现在日志(`cannot create /tmp/ntlm-calls.log`)= 确被 exec
- 结论:eap 内层 MS-CHAPv2 → rlm_mschap → ntlm_auth 路径连通;真实 AD 校验
  只需 winbindd 能 join + ntlm_auth 能验证,留部署验收清单。
- 清理:临时 nas 行已删,一次性容器/临时文件已清。

## GitHub CI(PR #13,全部 SUCCESS)

| 检查 | 结果 |
|---|---|
| Build (freeradius) | ✅ 1m8s(debconf 卡构建已修:`DEBIAN_FRONTEND=noninteractive`) |
| Build (backend) / Build (frontend) | ✅ |
| Backend (uv + ruff + pytest) | ✅ |
| Frontend verify / typecheck | ✅ |
| Trivy(镜像漏洞扫描) | ✅ |
| CodeQL / Analyze ×2 / shell / json / frontmatter / Dependency review | ✅ |

### CI 迭代记录

1. 首推:Build (freeradius) 卡死 16min+ → 本地复现:krb5-user debconf
   交互提问(Dialog→Readline)阻塞 apt → Dockerfile 加
   `DEBIAN_FRONTEND=noninteractive` → 1m8s 通过。
2. 本地假 AD 场景发现 winbindd join 失败后 2s 崩溃重启刷屏 → entrypoint
   加 `WINBIND_ENABLED` 门控(join 失败不再启动/监督 winbindd,单次告警)。

## 未验证(需真实 AD 部署验收,交付用户)

| 验收项 | 条件 |
|---|---|
| AC-1 域内 PEAP-MSCHAPv2 手机/笔记本认证成功 | 真 AD + NAS 接入 |
| AC-2 join 幂等:容器重建不重复 join | 真 AD,看 DC 侧计算机账户 |
| AC-3 keytab 重建 | 删 samba-state/krb5.keytab 后重启 |
| AC-4 属性同步(含中文) | 真 AD 用户带 mail/mobile/telephoneNumber/description |
| winbind 组映射/DC 多站点 SRV | 生产 DNS 配置后观察 |
