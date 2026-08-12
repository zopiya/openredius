# ADR-0007 · 开发环境:GitHub Codespaces(docker-in-docker)取代远程 SSH 服务器

- 状态:已接受(2026-08-12)

## 背景

07/09/10 与 deploy/README 此前均假设"本机(开发者 macOS)无 Docker/PostgreSQL",
因此把栈集成(Postgres + FreeRADIUS,M3 起)与生产部署验证都放到一台需要连接
信息、需要 SSH 的远程 Linux 服务器上执行。该服务器连接信息在 M3 前一直未补录,
是路线图里的一个悬而未决的外部依赖。

开发计划改为基于 **GitHub Codespaces** 进行,Codespaces 本身即容器化云端环境,
可通过 `docker-in-docker` feature 直接起 docker compose 栈,不再需要一台额外的
远程服务器来解决"本机无 Docker"的问题。

## 备选

1. **维持远程 SSH 服务器**:需长期占用一台服务器、维护连接信息与访问权限,
   且与"自动化开发"目标摩擦大(SSH 会话、端口转发、手工同步代码)。
2. **GitHub Codespaces + `.devcontainer/`(docker-in-docker)**:环境随仓库定义
   (`.devcontainer/devcontainer.json`),一键创建;容器内可直接跑
   `docker compose -f deploy/docker-compose.dev.yml up -d`,无需 SSH 与额外服务器;
   端口经 Codespaces 自动转发。

## 决定

方案 2。`.devcontainer/` 作为开发环境的唯一事实来源:

- Codespace 内含 Python 3.13 + uv(backend feature)、docker-in-docker(栈集成);
  bun/uv 由 `post-create.sh` 安装。
- M0–M2(SQLite + mock)在 Codespace 内直接跑,不依赖 docker。
- M3 起的栈集成(Postgres + FreeRADIUS + `pytest -m integration`)在 Codespace 终端
  直接执行 `deploy/docker-compose.dev.yml`,替代原「远程联调环境(SSH)」流程。
- 本机(无 Docker 的 macOS 等)仍可用于纯前端 mock 开发,但不再是集成测试的路径。

生产部署(M7)不受影响:仍面向独立的生产服务器,`deploy/docker-compose.yml` +
`deploy/.env` 的流程不变,只是不再复用"栈集成用的那台远程服务器"这一悬空依赖。

## 后果

- 正面:去掉了"服务器连接信息待补录"这个外部依赖;栈集成环境随仓库声明式定义、
  可复现;`pytest -m integration` 从"需要人工 SSH"变为"Codespace 终端一条命令"。
- 代价:Codespaces 使用需要 GitHub 账号额度/计费(相比已有服务器可能增加成本);
  docker-in-docker 在部分网络受限环境下镜像拉取可能变慢,需要预热或缓存镜像层。
- 受影响文档(同批次修订):07-deployment.md、09-testing-quality.md、10-roadmap.md、
  docs/README.md、deploy/README.md、backend/README.md、04-backend-design.md。

## 更新(2026-08-12)

`.devcontainer/`(devcontainer.json + post-create.sh)实测有问题——具体表现为
影响了日常经 `gh`/SSH 直连 Codespace 的使用方式,已移除,配置暂时回退到
Codespaces 默认镜像,手工在 Codespace 内 SSH 会话中按需装 bun/uv/pi。

本节不推翻上面的决定:**Codespaces 取代远程 SSH 服务器**这个核心判断不变,
只是"用 `.devcontainer/` 声明式定义环境"这一具体实现方式回退,待重新设计后
再引入(需排查是哪个 feature 或安装步骤导致的问题,而不是简单重试同一份配置)。
在此之前,文档中"容器内已含 XXX"一类表述均改写为"需手工在 Codespace 内配置"。
