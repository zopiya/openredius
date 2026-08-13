# 决策点与澄清(clarifications)

## Q1 · 远程分支清理(破坏性,需确认)

6 个远程分支已全部合并进 origin/dev(0 提交未合入;post-mvp 分支 1 提交未合入但内容已以不同 hash 在 dev):
`fix/auth-session-audit`、`fix/http-401-refresh-retry`、`feat/ui-v6`、`feat/ui-migration`、`feat/ansible-deploy`、`feat/post-mvp-operating-model`

本地 6 个已合并分支:`docs/v0.1.0-changelog`、`feat/ansible-deploy`、`feat/backend-audit`、`feat/ui-migration`、`feat/ui-v6`、`main`(main 见 Q2)。

**Resolution**: 全部删除(本地已合并分支 + 6 个远程 stale 分支)。2026-08-13 用户确认。

## Q2 · main 分支定位(项目惯例,需确认)

main 落后 dev 45 提交,无 tag。选项:
a) main 快进到 dev,以后 dev 开发 / main 发布(v0.1.0 打 tag);
b) main 不动,AGENTS.md 改为声明 dev 是唯一主线;
c) 删除 main。

**Resolution**: main 快进到 dev 并打 v0.1.0 tag。2026-08-13 用户确认。

## Q3 · 文档承诺但前端未实现的功能(范围决策,需确认)

D04 用户抽屉详情、D05 AD 同步记录、D06 NAS 端口/SSID、D07 NAS CRUD、D08 告警规则、D10 服务端筛选、D19 导出带筛选。后端端点全部已存在,只差前端接线(NAS CRUD 需新建表单)。
选项:a) 全部实现(推荐,1:1 且提升成熟度);b) 实现轻量项,D07 降级文档;c) 全部降级文档维持现状。

**Resolution**: 全部实现(含 NAS CRUD 新表单)。2026-08-13 用户确认。

## Q4 · 一次性审计产物(低风险,需确认)

`scripts/visual-audit*.mjs` + `audit-screenshots/`(15 PNG)+ `UI-效果报告.html`(2.4MB)。
选项:a) 全部删除(推荐);b) 保留截图与报告、删脚本;c) 全部保留并 gitignore。

**Resolution**: 全部删除(脚本 + 截图 + UI 报告)。2026-08-13 用户确认。

## Q5 · docs/12/13 与 M8 评审(产品决策,需确认)

`post-mvp-operating-model-p3a7` 剩 1 项未勾:"评审并确认 M8 的范围、SLO 目标和责任人";docs/12、13 状态"待评审"。
选项:a) 本审计定稿(评审通过,状态改"已评审",勾完任务);b) 挂起,状态改"待产品负责人评审",任务勾除并在文档标注;c) 视为已定稿不再评审。

**Resolution**: 本次审计定稿(我评审后状态改『已评审』,post-mvp 任务勾完)。2026-08-13 用户确认。

## 已自行决定(无需确认)

- e2e-http.mjs 收编进 package.json(`e2e:http`)+ docs/09 登记(S3)。
- ansible/ 登记进 docs/07 + 根 README 目录树(S8);backup 双实现:j2 模板改为调用 deploy/scripts 原版脚本(消除双维护)。
- 删除 Launcher.tsx、api/mock 6 文件、types.ts、useApi.ts、lib/utils.ts(S1/S2/D29)。
- B17 endpoints/import 改逐条审计(对齐 02 文档承诺,改动小)。
- docs/09 CI 段:按事实改文档(backend job 已启用;audit job 未落地 → 从承诺改为"后续项"或落地,以事实为准)。
- 设置开关(B1)默认值保持现状("开"),仅补读取路径。
