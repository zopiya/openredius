# 17 · AD 直通认证 + NAS/AP 接入 —— 生产落地审计记录(10.36.8.10,2026-08-14)

## 0 · 定位与状态

**状态:审计/复盘记录,非设计文档。** docs/15(AD 直通认证)、docs/16(NAS/AP 接入)
两份设计文档由 pi 实现、合并进 `dev`→`main`(v0.3.0)后,在 `10.36.8.10` 首次真实
上线(真实 AD 域 `HENAN.JZTEY.COM`、真实 Aruba AP)过程中,连续暴露了 5 处此前
未被发现的缺陷,从 v0.3.0 一路修到 v0.3.4。本文档把整个过程、每处缺陷的根因、
证据和修复方式系统整理出来,交给 pi:

1. 核对第 2 节里每处缺陷的修复是否已经在对应 PR 里正确落地(五处里前四处已经
   合并到 `main`,第五处见下方 PR 链接,状态以 `gh pr view` 为准)。
2. 处理第 4 节"发现但本轮未修"的遗留问题。
3. 把第 5 节"验证方法论教训"当成以后写验证/测试用例时的检查清单,不要重复
   同样的坑。

## 1 · 背景与时间线

- **2026-08-14 上午**:v0.2.2 在 `10.36.8.10` 部署验证通过后,复核 AD 同步与
  NAS/AP 接入这两条链路,发现均未产品化,写成设计文档 docs/15、docs/16,交给
  pi 实现。
- **同日下午**:pi 在 `dev` 分支完成两份设计的实现(PR #13 AD 直通、
  NAS/AP 热更新哨兵文件机制),本地验证(pytest + dev 栈冒烟)全部通过,
  `.pi/work/ad-ldap-auth-b0bb/validation.md`、
  `.pi/work/nas-ap-reload-ccb1/validation.md` 有完整记录。
- **部署前复核**(Claude Code,合并 `dev`→`main` 之前):只读审查即发现 mschap
  配置文件语法缺陷(第 2.1 节),修复后随 v0.3.0 一起发布。
- **v0.3.0 首次部署到 `10.36.8.10`**:发现 NAS reload 共享卷权限问题
  (第 2.2 节)→ v0.3.1。
- **真实浏览器验证控制台"新增 NAS"**:发现前端生产构建从 v0.2.0 起就没真正
  接后端(第 2.3 节)→ v0.3.2,这是本轮影响面最大的一处。
- **配置真实 AD 域 join 账号、真机 802.1X 联调**:连续暴露两处 winbindd 相关
  权限/进程管理缺陷(第 2.4、2.5 节)→ v0.3.3、v0.3.4(2.5 节修复见
  [PR #22](https://github.com/zopiya/openredius/pull/22),提交时 CI 正在跑,
  版本号是否已打 tag 以 `git tag -l` 为准)。
- **最终验证结果**:真实域账号(`svc-radius-join@henan.jztey.com`)通过
  `radtest -t mschap` 连续 5/5 次拿到 `Access-Accept`;真实 Aruba AP
  (`10.36.8.176`)发起的 PEAP-MSCHAPv2 请求能被完整处理(TLS 握手、证书协商、
  内层 MSCHAPv2 全部走通)。AD 直通认证的核心链路在真实环境里已经跑通。

## 2 · 缺陷清单(按发现顺序)

每一条都标注:根因 / 影响 / 修复 / 为什么本地验证没测出来 / 证据。

### 2.1 mschap `ntlm_auth` 行多打一个 `}`(PR #14,v0.3.0 前修复)

- **根因**:`deploy/freeradius/raddb/mods-available/mschap` 里 pi 启用的
  `ntlm_auth` 行末尾比同文件内的官方注释模板多了一个 `}`:
  `...NT-Response}:-00}}"` 而不是 `...NT-Response}:-00}"`。
- **影响**:展开后 `--nt-response=` 参数末尾被追加一个字面 `}` 字符,不再是
  合法十六进制响应,真实 Samba `ntlm_auth` 会拒绝所有 MS-CHAPv2 请求——即所有
  域内客户端的 802.1X 登录都会失败。
- **修复**:去掉多余的 `}`,恢复和文件内注释模板一致的写法。
- **为什么本地没测出来**:`.pi/work/ad-ldap-auth-b0bb/validation.md` 的
  mschap→ntlm_auth 冒烟测试用的是固定输出 NT_KEY 的假 `ntlm_auth` wrapper,
  不解析入参格式,坏参数照样返回"成功"。
- **证据**:`od -c` 逐字节比对同一文件里两处 `ntlm_auth =` 行,确认活跃行比
  注释模板多一个 `}`(见 PR #14 描述)。

### 2.2 NAS reload 共享卷权限(PR #16,v0.3.1)

- **根因**:`radius-reload` 共享卷由 Docker 在两边容器 entrypoint 跑之前创建,
  属主 root:root、权限 0755;freeradius 容器以 root 运行,backend 容器以非
  root 用户 `openredius`(uid 999,`backend/Dockerfile`)运行,后者对该目录
  只有 r-x,写不进哨兵文件。
- **影响**:`POST /api/ops/reload-radius` 一律返回 500
  `reload_unavailable: Permission denied`,NAS/AP 新增或改密钥后无法生效。
- **修复**:freeradius 容器(root)在自己的 entrypoint 里对共享目录补一次
  `chmod 777`。
- **为什么本地没测出来**:pi 本地验证时 backend 是直接跑在 host 上
  (`OPENRADIUS_RADIUS_RELOAD_DIR=deploy/runtime/radius-reload` 本地目录),
  host 进程用的是当前用户身份,不会撞上容器间的 UID 不匹配问题。
- **证据**:`docker exec openredius-backend-1 ls -la /var/run/openredius`
  显示 `drwxr-xr-x root root`,backend 容器内 `id` 显示 `uid=999`。

### 2.3 前端生产构建漏设 `VITE_API_MODE=http`(PR #18,v0.3.2,**影响面最大**)

- **根因**:`deploy/nginx/Dockerfile` 构建前端时只设了
  `ENV VITE_API_BASE=`(留空,同源 `/api`,这本身没错),但没设
  `ENV VITE_API_MODE=http`。`src/api/config.ts` 的判断是
  `VITE_API_MODE === 'http' || VITE_API_BASE`,BASE 留空时这个条件恒假,
  MODE 落到 `mock`——Vite 构建期内联 `import.meta.env.*`,MODE 在编译期就是
  字面量 `'mock'`,每个资源模块访问真实后端的 `fetch("/api/...")` 分支被当成
  死代码整个删掉。
- **影响**:**从 v0.2.0 首次发版起,控制台除登录页外全线只能看内置假数据,
  任何增删改都没有真正落到后端**——设备管理、用户管理、策略、会话、报表、
  审计全部受影响。之前的每一轮验证都是拿 `curl` 直接打后端 API,没有通过
  真实浏览器把控制台走一遍,所以一直没暴露。
- **修复**:补上 `ENV VITE_API_MODE=http`。
- **验证方法**(值得记录,后续可以做成自动化检查):在部署好的容器里拉取
  实际提供服务的 JS bundle,`grep -c '/api/devices/nas'` 等真实接口路径——
  修复前 0,修复后 ≥1。本地也验证过:加/不加这一行,`bun run build` 产物
  里这些路径字符串的有无直接对应。
- **教训**:CI 里的 `bun run e2e:http` 测的是**源码**在 `bun run dev` 之类
  的场景下跑起来的行为,不是**构建产物**(生产 Docker 镜像)本身——这两者
  可能不一致,这次就是活生生的例子。

### 2.4 winbindd 前台运行(PR #20,v0.3.3)

- **根因**:`deploy/freeradius/entrypoint.sh` 里 `winbindd &` 没加 `-F`。
  winbindd 默认会自己 fork 到后台(标准 daemon 行为),`$!` 拿到的是那个
  几毫秒后就退出的启动进程 PID,不是真正长期运行的 winbindd 进程;
  `restart_if_crashed` 风格的监控循环(`kill -0 "$WINBIND_PID"`)每 ~2s 就
  误判"winbindd 挂了",重复调用 `start_winbindd`。
- **影响**:**不是纯日志噪音**——重复的启动尝试(虽然因为 pidfile 锁很快
  失败退出)会偶发干扰正在处理请求的真实 winbindd 进程的 pidfile/socket
  处理,导致 `ntlm_auth` 报 `Reading winbind reply failed! (0xc0000001)`,
  把本来密码正确的 MS-CHAPv2 认证判成失败。**这些误判失败还会连带触发
  OpenRedius 自己的账号锁定策略**(`OPENRADIUS_LOCKOUT_MAX_FAILS=5` /
  `_WINDOW=600` / `_DURATION=1800`),把测试账号(甚至真实员工账号)误锁
  30 分钟——这是一次基础设施 bug 通过"失败次数计数"这个正常安全机制,
  间接产生了一次业务影响的典型案例(细节见第 4.4 节的遗留问题)。
- **修复**:`winbindd -F`(前台运行,不自我 daemonize),让 `$!` 正确跟踪
  真实进程。
- **为什么本地没测出来**:pi 本地验证时用的是伪造的 `ntlm_auth` 假 AD 场景
  (join 必败),没有真正启动过一个长期存活、需要被正确监督的 winbindd
  进程,自然不会触发这种"进程存活但 PID 追踪错了"的问题。
- **证据**:`docker logs` 里 `entrypoint: winbindd exited unexpectedly —
  restarting` 每 ~2s 刷一次;`radiusd -X` 调试日志里
  `mschap: ERROR: Reading winbind reply failed! (0xc0000001)` 与上述刷屏
  时间点吻合。修复后 `grep -c 'winbindd exited unexpectedly'` 归零。

### 2.5 `freerad` 用户未加入 `winbindd_priv` 组(PR #22,→ v0.3.4)

- **根因**:`radiusd` 以非 root 的 `freerad` 用户运行(`radiusd.conf` 上游
  默认),但 `ntlm_auth --request-nt-key` 需要访问 winbindd 的**特权** pipe
  (`/var/lib/samba/winbindd_privileged/pipe`,权限 `0750 root:winbindd_priv`)。
  `freerad` 不在这个组里,radiusd 自己发起的每一次 `ntlm_auth` 调用都会被拒。
- **影响**:即使 2.4 修好、winbindd 稳定运行、域 join 成功,`radtest -t
  mschap` 依然稳定失败,报错和 2.4 完全一样
  (`Reading winbind reply failed! (0xc0000001)`)——这是两个独立的根因,
  产生了相同的错误信息,容易被误认成同一个 bug 没修干净。
- **修复**:构建时 `usermod -aG winbindd_priv freerad`。
- **为什么本地(以及 entrypoint 自带的冒烟测试)都没测出来**:
  `entrypoint.sh` 里"验证 mschap→ntlm_auth 接线"的冒烟测试,是在 entrypoint
  自身(root 身份)里直接跑 `ntlm_auth --username=... --password=...`,不是
  以 `freerad` 身份、也不是走 `--request-nt-key --challenge=... --nt-
  response=...` 这个 radiusd 实际会用的参数形式——两个差异叠加,冒烟测试
  测的其实是一条 radiusd 自己永远不会真正走的路径,天然测不出这个用户组
  权限问题。
- **证据**:完全相同的 `ntlm_auth --request-nt-key --challenge=X --nt-
  response=Y` 命令,`docker exec`(默认 root)手工跑成功、radiusd 自己跑
  失败——这个对照直接定位到"运行身份不同"这个变量。修复后(容器内热改
  `usermod` + 重启 radiusd 进程验证)`radtest -t mschap` 连续 5/5 次
  `Access-Accept`。

## 3 · docs/15、docs/16 核心链路——最终验证结果

### AD 直通认证(docs/15 方案 A)

| 验收项 | 结果 |
|---|---|
| 域 join(`net ads join`) | 成功,`net ads testjoin` 在容器重建后正确走"已 join,跳过"分支 |
| `wbinfo -t`(信任关系) | `succeeded` |
| `wbinfo -a user%pass`(明文 + 挑战应答两种方式) | 均 `succeeded` |
| `radtest -t mschap`(真实域账号,5 次) | 5/5 `Access-Accept` |
| 真实 Aruba AP 发起的 PEAP 请求 | TLS 握手、证书协商、内层 MSCHAPv2 全部正常处理(见容器 debug 日志) |
| AD 目录同步(email/mobile/description) | 成功,3662 个真实用户同步进 `access_user`(见第 4 节数据安全状态变化) |

### NAS/AP 接入热更新(docs/16)

| 验收项 | 结果 |
|---|---|
| 新增/改密钥后 `POST /api/ops/reload-radius` | `{"mode":"file","applied":true,...}`,几秒内 `radiusd` 重启完成 |
| 旧密钥失效、新密钥生效 | 验证通过(改密钥→reload→旧密钥 no-reply,新密钥收到正常响应) |
| 真实 NAS(Aruba AP,`10.36.8.176`)接入 | 控制台新增成功、reload 后 FreeRADIUS 正确识别,已收到该 AP 的真实 RADIUS 流量 |

## 4 · 发现但本轮未修的遗留问题(交给 pi)

### 4.1 `nas_device.radius_nas_id` 没有回写

控制台新增 NAS 后,`radius.nas` 表里正确生成了对应行(能查到、能用于认证),
但 `nas_device.radius_nas_id` 这一列始终是空的——`NasOut` 响应里
`radius_nas_id: null`,和模型注释"1:1 map to radius.nas.id once the stack
is up (M3)"不符。不影响认证功能(FreeRADIUS 直接读 `radius.nas`,不依赖这个
回写字段),但这是一个数据一致性 gap,前端如果以后要用这个字段做关联查询/
展示会有问题,应该修。

### 4.2 前端容器健康检查一直失败(与本轮 AD/NAS 工作无关,老问题)

`docker compose ps` 里 `frontend` 服务长期显示 `unhealthy`
(`FailingStreak` 很高)。健康检查命令是 `wget -qO- http://localhost:80/`,
但容器内直接测试:
```
wget http://localhost:80/     → exit 1(无输出,静默失败)
wget http://127.0.0.1:80/     → SSL 相关报错(诡异,http 请求不该走 SSL 握手)
```
但站点本身访问完全正常(真实用户通过 8443 端口访问 200 成功)。这是一个
容器内 `localhost`/`127.0.0.1` 解析或者 nginx 监听行为的问题,不影响实际
功能,但会导致健康检查状态一直是假的,也会让 `depends_on: condition:
service_healthy` 这类编排逻辑不可用。建议排查。

### 4.3 后端 `/api/health` 的 `version` 字段是死的硬编码值

`backend/src/openredius/__init__.py` 里 `__version__ = "0.1.0"`,从来没有
跟着 `pyproject.toml` 的版本号(现在已经是 0.3.x)更新过,`/api/health`
返回的 `version` 字段一直显示 `0.1.0`。纯展示问题,不影响功能,建议要么
在发版流程里加一步同步这个值,要么改成从 `importlib.metadata` 动态读取
安装包版本,避免以后再手动维护一份。

### 4.4 账号锁定策略和"基础设施错误"耦合在一起,设计上值得斟酌

见第 2.4 节:winbindd 的一个进程管理 bug,通过"MS-CHAP 认证失败"这个信号,
触发了 OpenRedius 自己的账号锁定策略,把测试账号误锁了 30 分钟。这次是
因为我们知道根因、能用管理员权限手工解锁,但如果生产环境批量出现类似的
基础设施抖动(网络瞬断、DC 短暂不可达等),会不会因为"重试几次都因为
基础设施问题失败"而误锁一批真实员工账号?建议 pi 评估一下:能不能在
`mschap`/`ntlm_auth` 报错、EAP 模块自身失败(不是"用户名密码确实不对"
这种明确的凭证错误)这类场景下,不计入或者用不同的计数器来对待账号锁定
策略,避免基础设施抖动误伤真实用户。这是本轮审计发现的一个具体案例支撑的
设计建议,不是臆测。

### 4.5 域账号被 AD 侧禁用时的排障路径

联调过程中还遇到一次域 join 账号(`svc-radius-join`)被 AD 一侧直接标记为
"disabled"(不是我们系统锁的,是 AD 原生状态),导致 `net ads join`/
`testjoin` 双双失败,报错信息是 Samba 原生的
`The referenced account is currently disabled and cannot be logged on to`。
这次是靠人工判断错误信息、找 AD 管理员确认账号状态解决的。建议
`docs/15`/`deploy/README.md` 补一条排障提示:遇到这个具体报错文案,直接
判断是 AD 侧账号状态问题(禁用/过期/策略限制),不要在我们自己的配置里
反复排查。

## 5 · 验证方法论教训(给 pi 写测试/验收用例时参考)

这一轮一共出现 5 处"本地验证/pi 自测通过,真实环境失败"的缺陷,复盘下来
能看出几类反复出现的验证盲区,值得沉淀成规则:

1. **不要在 host 上直接跑 backend/关键服务来验证容器行为**——第 2.2 条的
   坑:host 进程的文件系统权限、用户身份跟容器里的非 root 运行身份完全
   不同,会掩盖真实的权限类问题。验证 NAS reload、AD 直通这类涉及跨容器
   共享资源/进程身份的功能,必须在**实际会部署的容器组合**里测,不能图快
   在 host 上跑一遍就算数。
2. **不要只测源码/dev server,要测实际构建产物**——第 2.3 条的坑(也是
   影响面最大的一条):`bun run e2e:http` 测的是源码的运行时行为,不代表
   Docker 镜像构建出来的静态资源就是同一份逻辑。任何涉及构建时环境变量
   (`ENV`/`ARG`/`--build-arg`)的功能,必须在构建完的镜像里实测,不能只
   在源码层面验证。
3. **冒烟测试要模拟真实调用路径,不能只测"技术上跑得通"**——第 2.5 条的
   坑:entrypoint 里那条"以 root 身份、用 --username/--password 参数形式"
   的冒烟测试,从"ntlm_auth 这个二进制本身能不能用"的角度看是通过的,但
   跟 radiusd 实际会用的"以 freerad 身份、用 --challenge/--nt-response
   参数形式"完全是两条不同的路径,测了个寂寞。写冒烟测试时要问自己:
   "这测的和生产环境实际发生的调用,运行身份/参数形式/触发路径是不是
   同一条?"
4. **假 mock/stub 要校验输入,不能只保证输出格式对**——第 2.1 条的坑:
   固定返回值的假 `ntlm_auth` wrapper 不解析入参,天然测不出参数拼接
   错误这类问题。用 stub 顶掉外部依赖做单测没问题,但至少要对关键入参
   做基本格式校验(比如"是不是合法十六进制"),否则这个测试只能证明
   "调用链路没断",证明不了"传的参数是对的"。
5. **同样的错误信息可能对应完全不同的根因**——2.4 和 2.5 报的是一模一样
   的 `Reading winbind reply failed! (0xc0000001)`,但根因完全独立(前者
   是进程管理导致 winbindd 瞬时不可用,后者是权限问题导致永远不可用)。
   排查这类问题时不要看到"报错消失了"就认为修完了,要拿"预期行为应该是
   什么"(比如"应该稳定 5/5 成功"而不是"看起来不报错了")去反复验证。

## 6 · 数据安全状态变化(重要,SOP-07 相关)

审计过程中,AD 同步成功跑通后,**`10.36.8.10` 已经从"空环境"变成了"有真实
生产数据的环境"**:

- `access_user`:3662 个真实 AD 用户(含真实姓名、邮箱、手机、部门)
- `nas_device` / `radius.nas`:至少 1 台真实 Aruba AP

按 [07-deployment.md「数据安全红线」](./07-deployment.md#数据安全红线首次部署-vs-已有数据环境)
和 [13-operational-sop.md](./13-operational-sop.md) SOP-07,**这个环境从
这一刻起适用"已有数据环境"那一档规则,禁止任何清空/截断/批量删除操作,
没有例外**。以后任何人(包括 pi)在这个环境上操作前,先跑一遍 07 文档里
那段 count 检查 SQL,确认影响面,不能再假设这是"测试环境"。

## 7 · 相关 PR / 版本

| 版本 | PR | 缺陷 |
|---|---|---|
| v0.3.0 前 | [#14](https://github.com/zopiya/openredius/pull/14) | 2.1 mschap 多余 `}` |
| v0.3.1 | [#16](https://github.com/zopiya/openredius/pull/16) | 2.2 NAS reload 卷权限 |
| v0.3.2 | [#18](https://github.com/zopiya/openredius/pull/18) | 2.3 前端 mock 模式 |
| v0.3.3 | [#20](https://github.com/zopiya/openredius/pull/20) | 2.4 winbindd 前台运行 |
| v0.3.4 | [#22](https://github.com/zopiya/openredius/pull/22) | 2.5 winbindd_priv 组 |
