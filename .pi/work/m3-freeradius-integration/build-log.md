# M3 build log

## 验收记录(2026-08-12,docker-in-docker)

- compose up --build:postgres healthy + freeradius healthy(radiusd -CX)。
- 基线实测:FreeRADIUS 3.2.10(git #9071ea041)。
- radtest li.na → Access-Accept + Tunnel-Private-Group-Id "10"(staff)。
- radtest wang.lei → Accept + VLAN "20";radclient 绑定 MAC → Accept;
  未绑定 MAC → Reject + Reply-Message(中文)+ radpostauth.class=reason=mac-unbound。
- API 停用 wang.lei → Reject(class reason=account-disabled);锁定 →
  reason=account-locked;恢复后 Accept。
- 时间窗 00:00-00:01 → Reject reason=time-policy;恢复 Accept。
- NAS CRUD → radius.nas 同步;reload-radius auto 模式实测重启容器。
- `uv run pytest -q`:101 单元/API 全绿(含 5 个编译器幂等用例);
  `uv run pytest -m integration -q`:7 全绿;ruff 干净。

## 关键决策与偏差(均已回写 docs/06「M3 实测修正记录」)

1. `%{SQL-User-Name}` 在 mod_authorize 后被 rlm_sql 清除 → 内联 SQL 用
   `LOWER('%{User-Name}')`(escape 兜注入)。
2. mac 检查需要 Calling-Station-Id;radtest 不带 → 缺省跳过(真实 NAS 必带)。
3. unlang 内正则禁 `{2}`(破坏 xlat 花括号配对)→ `[0-9][0-9]`。
4. Class 是 octets → 0x-hex 入库;新增 string 镜像属性 OpenRedius-Deny-Reason
   (dictionary 本地号 3001;OpenRedius-Flags 为 3000),postauth class 记镜像值;
   safe_characters 追加 `=`。
5. sql 模块必须 $INCLUDE queries.conf;后置配置段无法覆盖 include 内段 →
   class 列启用用 Dockerfile sed 改 queries.conf。
6. 拒绝段名为 Post-Auth-Type REJECT(v3.2.10);站点补丁用分区感知 awk,
   锚点缺失 fail-fast。
7. clients.conf 覆盖为空(NAS 表单一客户端来源)。
8. 挂载 certs 遮蔽上游 → entrypoint 自签兜底(口令 whatever 对齐上游 eap)。
9. PG init 用 ALTER DEFAULT PRIVILEGES(public 表由 Alembic 后建)。
10. schema 结构变更(radpostauth.class)需 down -v 重建卷 —— deploy/README 已注明。
