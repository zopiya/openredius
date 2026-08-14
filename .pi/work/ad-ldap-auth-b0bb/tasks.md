# AD 直通认证 + 属性同步扩展 — tasks

依赖顺序执行;每项有可观察的完成条件。标注 `[DONE]` 时更新本条。
前置:nas-ap-reload 任务已完成并合入(共享 entrypoint.sh/compose 文件)。

 - [x] T-101 后端 schema:`models/user.py` 三列 + Alembic 迁移(FR-005)
  - 条件:SQLite/PG 双环境 `upgrade head` 成功;`downgrade -1` 可回退;`ruff check` 通过
 - [x] T-102 同步链:`connector.py` AdUserEntry + `ldap3_.py` attributes/mobile 回退 + `sync.py` upsert(FR-005)
  - 条件:`uv run pytest tests/unit/test_ad_sync.py -q` 全绿(含新字段断言)
 - [x] T-103 API:`schemas/users.py` UserOut + `api/users.py` _user_out(FR-005)
  - 条件:users API 测试断言三字段存在且同步后落库
 - [x] T-104 `radius/compiler.py` 顶部注释修正(Q-102)
 - [x] T-105 FreeRADIUS 镜像:提取上游 mschap 基线 → overlay `mods-available/mschap` 开 ntlm_auth;Dockerfile 装 winbind/samba-common-bin/krb5-user + 启用 mschap(FR-001)
  - 条件:镜像构建成功;`radiusd -XC` 通过;包名/二进制路径经容器内实测确认
 - [x] T-106 entrypoint.sh:krb5.conf/smb.conf 生成、幂等 net ads join、winbindd 启动、冒烟自检;未配 AD 变量时完全跳过(FR-001/FR-006)
  - 条件:dev 栈(未配 AD)行为与旧版一致;配假 AD 变量时脚本路径可达(join 失败仅告警不阻塞)
 - [x] T-107 compose ×3 + `.env.example` + `deploy/README.md`:RADIUS_AD_* env、dns、samba/keytab 卷(FR-006)
 - [x] T-108 前端:`schema.d.ts` 重新生成 + `resources/users.ts` 类型 + `Users.tsx` 详情抽屉三字段(FR-005)
  - 条件:`bun run verify` 通过;抽屉显示邮箱/手机号/备注
 - [x] T-109 文档:docs/02、docs/06、docs/07、docs/08(FR-007/AC-6)
 - [x] T-110 本地验收:全量 pytest/ruff、`radiusd -XC`、假 ntlm_auth 接线冒烟、`bun run verify`
  - 条件:validation.md 记录命令与输出;真实 AD 项(AC-1~4)输出部署验收清单
 - [x] T-111 留痕 + Conventional Commits 提交(build-log.md/validation.md)
