# AD 直通认证 + 属性同步扩展 — build log(docs/15)

任务:`docs/15-ad-ldap-auth-integration.md` 落地(spec/plan/tasks 见同目录)
分支:`feat/ad-ldap-auth` → PR #13 → dev(--no-ff merge)
拍板决策:clarifications.md(C-001 方案 A;C-002 专用委派 join 账号;C-003 mobile→telephoneNumber 回退)

## 任务执行

| 任务 | 内容 | 状态 |
|---|---|---|
| T-101 | AccessUser 三列 + 迁移 d4b050406f7c(+linked_account 索引漂移修复) | ✅ |
| T-102 | AdUserEntry/ldap3 属性/mobile 回退/sync 直赋值语义 | ✅ |
| T-103 | UserOut 三字段透传 + 测试 | ✅ |
| T-104 | compiler.py 注释修正(Q-102) | ✅ |
| T-105 | mschap overlay + Dockerfile + entrypoint AD 段 | ✅(含 2 轮 CI 迭代) |
| T-106 | entrypoint:kinit/smb/krb5 生成、幂等 join、winbindd 监督 | ✅(并入 T-105 同提交) |
| T-107 | compose ×4 + .env.example + deploy/README | ✅ |
| T-108 | 前端 UserRow/mapUser/抽屉三字段 + schema.d.ts 重生成 | ✅ |
| T-109 | docs/02、06、07、08 同步 | ✅ |
| T-110 | 本地验证 + CI 验证 + 留痕 | ✅ |
| T-111 | merge dev | ✅ |

## 与设计文档的偏离

1. **env 命名**:`OPENRADIUS_AD_*` 未动(只读同步语义照旧),域 join 配置为
   `RADIUS_AD_*`(freeradius 容器专属)——设计文档允许实现时定名。
2. **mschap 模块**:设计文档的 rlm_ldap 直通(方案 B)被 C-001 方案 A 取代;
   overlay 基于上游 3.2.10 的 mschap 基线仅启用 ntlm_auth 行,未引入 ldap 模块。
3. **镜像构建验证转 GitHub**:本机不 build(用户指令),CI PR 触发
   images-pr-check;本地仅做一次性快速构建诊断(debconf 卡点即此发现)。
4. **winbindd 失败语义**:join 失败时不再启动/监督 winbindd(单次 WARNING),
   避免无意义 2s 崩溃循环刷屏——比 plan 的「join 失败仍常驻 winbindd」更收敛。

## 踩坑与修复

| 坑 | 修复 |
|---|---|
| krb5-user debconf 交互提问卡死 Docker build(本地 >900s×2,CI 16min+) | Dockerfile `DEBIAN_FRONTEND=noninteractive`;CI 1m8s |
| edit 工具无法匹配 tab → mschap overlay 替换失败 | Python 脚本按行匹配;替换 anchor 多写 `}` 一次,正解 anchor 为 `--nt-response=...}\"` 行 |
| Python 批量补 mock 字段脚本 `rstrip(" }")` 产生 `},,` 双逗号(6 行损坏) | 手工修正 6 行,verify 恢复绿 |
| 一次性容器 radiusd 崩溃循环 = 缺 RADIUS_SQL_* 环境(测试方式问题) | 用 dev 网络 + 真实 SQL env 复测,0 crash |
| 冒烟请求 MS-CHAP-Challenge 8B/Response 长度错 | 16B challenge + 50B MS-CHAP2-Response(Ident+Flags+Peer+Reserved+NT) |
| 容器内 radclient stdin 需 `docker exec -i` | `-i` 转发 stdin |
| fake wrapper 日志权限(freeradius 用户写宿主目录) | 不改设计;以 wrapper stderr 出现在 radiusd 日志为调用铁证 |

## 提交

- `e7a84ac` feat(backend): AD 同步扩展 email/mobile/description 字段与 API 输出(docs/15)
- `5333bfd` feat(deploy): freeradius AD 直通(winbind/ntlm_auth 域信任,docs/15 方案 A)
- `3dc9659` feat(frontend): 用户详情抽屉展示 AD 邮箱/手机/备注(docs/15)
- `31553a3` docs: 02/06/07/08 同步 AD 直通实现与联系字段(docs/15)

## 交接清单(用户部署验收)

1. dev 栈验证:`deploy/.env` 加 `RADIUS_AD_REALM`/`_JOIN_USER`/`_JOIN_PASSWORD`
   (域名大写、委派账号、密码),其余 `RADIUS_AD_*` 可选;`up -d` 后看日志
   `joining domain` + `testjoin ok`。
2. AC-1~AC-4 真 AD 验收(validation.md)。
3. 域账号在 OpenRedius 仍走「目录同步」流程进入(直通只校验密码,不自动建号)。
