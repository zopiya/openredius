# 实施记录(build-log)

分支:`feat/project-audit-m0b9`(从 dev @ 4bda8d6 切出)。全部批次均跑对应验证后提交。

| 提交 | 批次 | 内容 | 验证 |
|---|---|---|---|
| 9bb461f | Phase 2 git 卫生 | 删本地/远程分支、worktree、游离产物;main 快进 + v0.1.0 tag;AGENTS.md 分支段 | — |
| 65d256c | Phase 3 死代码 | Launcher/mock 六文件/types.ts/useApi/utils 删除;类型收敛 data/;e2e:http 收编;菜单断言 8→9;/audit 覆盖 | `bun run verify` 全绿(14 路由冒烟) |
| 79d3a1d | Phase 4 文档批次 | 02/03/04/05/06/08/09/11/00/README/ci.yml 回写(端点/形状/数字/结构/CI) | — |
| f3ecad8 | Phase 5 后端代码 | 审计/告警总开关接入读取路径、策略规则预览、last_auth、高负载阈值配置化、cert_serial、import 逐条审计、锁定文案、_RULE_DESC 潜伏 bug | ruff 绿 + pytest 184 passed(+11) |
| 4d0c8e2 | Phase 6 前端接线 | 用户抽屉/同步记录/NAS 端口抽屉/NAS CRUD/告警规则/服务端筛选/导出带筛选/告警标读/自动刷新/契约测试重写/schema 重新生成 | `bun run verify` 全绿 |
| (本提交) | Phase 7 结构收尾 | ansible backup/restore 改为薄封装调用 deploy/scripts 正典;backup.sh 增 BACKUP_METHOD=compose;DESIGN.md 修正;findings 处置汇总 | `bash -n` 语法通过 |

## 关键决定记录

- B7(CoA 兜底 class 标记):改文档而非代码——覆盖 class 会破坏认证时的 reason 标记,保留 connectinfo_stop。
- B5(last_login_at):从 02 字段表删除(无实现,无消费方)。
- D20(会话/日志详情端点):03 标注"前端列表行内数据已够用,详情保留给深度排查"。
- D26(Users/Devices 导出清单):移除按钮——03 无对应端点,不新增未契约功能。
- D25(设置页证书/AD-LDAP):00-overview 注明原型占位,后续立项(见 12)。
- B16(NAS 变更 reload):06 修正为"后端不自动重启,由操作方调用 reload-radius"。
- S9(CI audit job):09 按事实描述——audit job 未落地,标注后续项。
- schema.d.ts:从运行中的后端重新生成(openapi-typescript 6.7.6),新增端点全部入快照。
- 契约测试断言调整:列表端点返回未具名信封,OpenAPI 无 SessionRowOut/UserOut/AlertEvent 组件名——测试断言可具名契约组件,注释说明原因。
