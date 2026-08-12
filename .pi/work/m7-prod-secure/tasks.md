# M7 生产部署与安全加固 — 完成

- [x] backend/Dockerfile:多阶段 uv build→python:3.13-slim(非root用户 openredius)
- [x] deploy/nginx/Dockerfile:多阶段 bun build→nginx:alpine(TLS 自签 + openssl)
- [x] deploy/nginx/nginx.conf:TLSv1.2/1.3 + HSTS + CSP + X-Frame/DENY + 全部安全头
- [x] deploy/nginx/generate-certs.sh:容器启动自签/挂载真实证书
- [x] deploy/docker-compose.yml:四服务 prod 全栈(postgres/freeradius/backend/frontend)
         健康检查链:postgres→freeradius/backend→frontend;${VAR:?} 必填变量检查
- [x] deploy/.env.example:生产变量模板
- [x] backend CORS prod:默认空=禁用;cors_origins 显式配置时启用受限 CORS
- [x] deploy/scripts/backup.sh:pg_dump -Fc+gzip+14 份轮转(零文件不 crash)
- [x] deploy/scripts/restore.sh:compose/direct 双模式,FORCE 确认,--clean --if-exists
- [x] .dockerignore:排除 .git/docs/.pi/node_modules
- [x] 依赖审计:pip-audit 零漏洞;bun 12 undici(dev-only,prod 静态前端不加载)
- [x] 安全清单:08 验收全部 13 项(见 deploy/README.md)
- [x] 运行手册:deploy/README.md(NAS 接入清单/CoA 配置/备份恢复/故障排查)
- [x] 版本:v0.1.0(pyproject.toml+package.json 已设)
- [x] README.md:项目级文档(技术栈/部署/验证)
- [x] 3 Dockerfile 全部可构建;158 后端+9 集成+21 前端全绿;CI green

## Reviewer 处置

| 级别 | 问题 | 处置 |
|---|---|---|
| BLOCKER | nginx USER openredius 无法 bind 80/443 | →保留 nginx:alpine 默认权限 |
| BLOCKER | openssl CLI 未安装 | →`apk add openssl` |
| HIGH | backup.sh 零备份文件 crash | →`\|\| TOTAL=0` |
| HIGH | docs 引用过时 backend.Dockerfile | →更正为 backend/Dockerfile |
| MEDIUM | 缺少 .dockerignore | →新增(排除 .git/docs/.pi/node_modules) |
| MEDIUM | OPENREDIUS_NO_TLS 不完整 | →移除(自签 TLS 零配置,无此需求) |
