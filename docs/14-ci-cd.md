# 14 · CI/CD 与离线部署包

本文档是 `.github/workflows/` 全部流水线的唯一权威索引:谁在什么条件下跑、产出什么、
产物怎么被消费。部署本身(compose/服务清单/环境变量/运维手册)仍以
[07-deployment.md](./07-deployment.md) 为准;本文档只讲"怎么把代码变成能跑的产物"。

## 全景表

| Workflow | 触发 | 产出 | 谁来用 |
|---|---|---|---|
| `ci-frontend.yml` | push(main/dev)/PR,`src/**` 等前端路径变化 | tsc + 路由冒烟 + 交互测试 + 保真审计 | PR 质量门 |
| `ci-backend.yml` | push(main/dev)/PR,`backend/**` 变化 | ruff + pytest | PR 质量门 |
| `codeql.yml` | push(main/dev)/PR + 每周一次 | JS/TS + Python 静态分析,结果进 Security 标签页 | 安全门(非阻断合并,人工看告警) |
| `dependency-review.yml` | PR | 只审这个 PR 新引入/升级的依赖,高危直接挡 PR | 安全门(阻断) |
| `_build-images.yml` | 仅 `workflow_call`,不单独触发 | 三镜像 matrix 构建 + Trivy 扫描,`push` 输入控制是否推 GHCR | 被下面三个复用,避免构建逻辑漂移 |
| `images-build.yml` | push(main),镜像相关路径 | backend/frontend/freeradius 推 GHCR,tag `latest` + `<sha>` | 日常持续集成镜像(供 `docker-compose.ghcr.yml` 拉取) |
| `images-pr-check.yml` | PR,镜像相关路径 | 只 build(不 push)+ 扫描 | 提前发现 Dockerfile/依赖改坏构建,不用等合并 |
| `release.yml` | push tag `v*.*.*` | 三镜像多打一个版本号 tag 推 GHCR;打包 `openredius-offline-<version>.tar.gz` 发到 GitHub Release | **离线部署**(见下) |
| `images-export-fallback.yml` | 手动 `workflow_dispatch` | 把 GHCR 上任意 tag 的镜像重新导出成 Actions artifact(3 天过期,需登录下载) | ghcr.io 网络不稳时的应急导出,**不是**面向用户的离线包 |

## 版本/发布策略

- 唯一的版本号事实来源是 **git tag**(`vX.Y.Z`,遵循现有 `v0.1.0` 的约定)。打 tag 前建议先在
  一次提交里把 `package.json`/`backend/pyproject.toml` 的 `version` 字段同步改掉——**这一步是
  人工的**,CI 不会自动回写版本号。
- `latest`/`<sha>` 两个 tag(`images-build.yml`)是"main 分支当前状态",随每次 push 滚动;
  `vX.Y.Z` tag(`release.yml`)是"某个确定版本",不会被覆盖,是离线包与
  `docker-compose.ghcr.yml`(生产在线部署,固定 `TAG=vX.Y.Z`)都应该锚定的对象。

## 离线部署包

`release.yml` 打包的 `openredius-offline-<version>.tar.gz` 内含 backend/frontend/freeradius
三个应用镜像 + `postgres:17-alpine`(全部 `docker save` 出来的 tar,目标机零联网)、
`docker-compose.offline.yml`、`.env.example`(已预填 `TAG`/`IMAGE_OWNER`)、
`postgres/init`、`nginx/{nginx.conf,generate-certs.sh}`、`freeradius/certs/gen.sh`、
`scripts/{backup.sh,restore.sh,smoke_freeradius.sh}`、`install.sh`、`CHECKSUMS.sha256`。
打包逻辑在 [deploy/scripts/package-offline.sh](../deploy/scripts/package-offline.sh),
CI 只是调用它,本地也能跑(前提是本机已有对应 tag 的镜像)。

安装步骤见 [07-deployment.md「离线部署」](./07-deployment.md#离线部署github-release)。

## 安全扫描的现状与边界

- Trivy(镜像 CVE)与 CodeQL(源码静态分析)**默认都不阻断**——结果上报到仓库 Security 标签页,
  先建立可见性。是否收紧成阻断(比如 CRITICAL 直接 fail)留到看过几轮真实扫描结果、评估
  误报率之后再定,不在这次改动范围内。
- `dependency-review.yml` 是唯一会真正拦 PR 的一环,且只审查这个 PR 新引入的依赖
  (`fail-on-severity: high`),不针对仓库里已经存在的依赖。

## 明确排除的范围(避免以后重复讨论)

以下都是讨论过、明确决定**不做**的,记在这里而不是丢掉结论:

- **不推镜像到 Docker Hub**——只保留 GHCR,离线部署场景本来就不依赖任何 registry 可达性。
- **不做 arm64/多架构构建**——当前 amd64-only;真有 arm64 生产机需求时再加,
  `_build-images.yml` 的 matrix 结构预留了扩展空间(加 `platforms:` 输入即可)。
- **离线包不含 Ansible**——Ansible 本身依赖联网装 collections,不适合完全断网场景;
  compose 离线包已覆盖"下载 → load → up -d"的核心诉求。Ansible 部署系统设计见
  [ansible/DESIGN.md](../ansible/DESIGN.md),两者是并行的两条部署路径,不互相替代。
