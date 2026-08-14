#!/usr/bin/env bash
# 打包"离线部署包"(docs/07-deployment.md「离线部署」/ docs/14-ci-cd.md)。
#
# 前置条件:backend/frontend/freeradius 三个 `ghcr.io/<owner>/openredius-<name>:<version>`
# 镜像、以及 `postgres:17-alpine`,已经在本机 docker 里(build 或 pull 均可)——本脚本只负责
# 打包,不负责构建/拉取镜像。release.yml 在调用前先 `docker pull` 好;本地手工验证时自己
# 先 build/pull 好同名 tag 即可。
#
# 用法:deploy/scripts/package-offline.sh <version> [owner] [outdir]
#   version  必填,如 v0.2.0(不校验格式,由调用方保证是打了 tag 的版本号)
#   owner    镜像所有者,默认取 $GITHUB_REPOSITORY_OWNER,否则 "zopiya"
#   outdir   产物目录,默认 dist-offline(相对当前工作目录)
#
# 产物:<outdir>/openredius-offline-<version>.tar.gz(+ 同名 .sha256)
set -euo pipefail

version="${1:?用法: package-offline.sh <version> [owner] [outdir]}"
owner="${2:-${GITHUB_REPOSITORY_OWNER:-zopiya}}"
outdir="${3:-dist-offline}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
staging_name="openredius-offline-${version}"
staging="${outdir}/${staging_name}"

if command -v sha256sum >/dev/null 2>&1; then
  checksum_cmd=(sha256sum)
else
  checksum_cmd=(shasum -a 256)
fi

echo "==> Staging in ${staging}"
rm -rf "${staging}"
mkdir -p "${staging}"/{images,postgres,nginx,freeradius/certs,scripts}

echo "==> Saving images (owner=${owner}, tag=${version})"
for name in backend frontend freeradius; do
  image="ghcr.io/${owner}/openredius-${name}:${version}"
  echo "    ${image} -> images/openredius-${name}.tar.gz"
  docker save "${image}" | gzip >"${staging}/images/openredius-${name}.tar.gz"
done
echo "    postgres:17-alpine -> images/postgres.tar.gz"
docker save postgres:17-alpine | gzip >"${staging}/images/postgres.tar.gz"

echo "==> Copying compose + runtime assets"
cp "${repo_root}/deploy/docker-compose.offline.yml" "${staging}/docker-compose.offline.yml"
cp -R "${repo_root}/deploy/postgres/init" "${staging}/postgres/init"
cp "${repo_root}/deploy/nginx/nginx.conf" "${staging}/nginx/nginx.conf"
cp "${repo_root}/deploy/nginx/generate-certs.sh" "${staging}/nginx/generate-certs.sh"
cp "${repo_root}/deploy/freeradius/certs/gen.sh" "${staging}/freeradius/certs/gen.sh"
cp "${repo_root}/deploy/scripts/backup.sh" "${staging}/scripts/backup.sh"
cp "${repo_root}/deploy/scripts/restore.sh" "${staging}/scripts/restore.sh"
cp "${repo_root}/deploy/scripts/smoke_freeradius.sh" "${staging}/scripts/smoke_freeradius.sh"

# .env.example:在原模板基础上把 TAG/IMAGE_OWNER 钉死到这个版本,用户不用自己猜。
# 原模板已有一行 `TAG=latest`(见 deploy/.env.example)——先过滤掉,避免同一个 key 在
# 文件里出现两次(compose 的 .env 解析虽然是后者覆盖前者,但留两行容易误导编辑的人)。
{
  grep -Ev '^(TAG|IMAGE_OWNER)=' "${repo_root}/deploy/.env.example"
  echo ""
  echo "# ========== 离线包打包时写入(勿改,对应本包内置的镜像 tar) =========="
  echo "TAG=${version}"
  echo "IMAGE_OWNER=${owner}"
} >"${staging}/.env.example"

git_sha="$(cd "${repo_root}" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf '%s (%s)\n' "${version}" "${git_sha}" >"${staging}/VERSION"

cat >"${staging}/install.sh" <<'EOS'
#!/usr/bin/env bash
# 离线包安装:把 images/*.tar.gz 逐个 docker load 回本地。
# docker save/load 会保留原始 repo:tag,load 完之后 docker-compose.offline.yml
# 引用的镜像名就已经在本地缓存里了,`up -d` 不会再尝试联网拉取。
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v docker >/dev/null 2>&1; then
  echo "错误:未找到 docker,请先安装 Docker Engine(含 compose v2 插件)。" >&2
  exit 1
fi

for f in images/*.tar.gz; do
  echo "==> Loading ${f}"
  gunzip -c "${f}" | docker load
done

echo
echo "全部镜像已加载。接下来:"
echo "  1. cp .env.example .env && \$EDITOR .env   # 改掉全部口令(TAG/IMAGE_OWNER 已预填,不用改)"
echo "  2. docker compose -f docker-compose.offline.yml up -d postgres"
echo "  3. docker compose -f docker-compose.offline.yml run --rm --no-deps backend alembic upgrade head"
echo "     # 迁移必须在这一步跑完 —— backend 启动时会查 admin_user 表,库没迁移会直接崩溃重启,"
echo "     # frontend 又等 backend healthy,顺序反了会一直卡住"
echo "  4. docker compose -f docker-compose.offline.yml up -d"
echo "  5. docker compose -f docker-compose.offline.yml ps   # 全部 healthy 为止"
echo "     # OPENRADIUS_BOOTSTRAP_ADMIN_USER/_PASSWORD(.env 里)非空的话会自动建管理员;"
echo "     # 没配或要重置密码,再手工跑:"
echo "     #   docker compose -f docker-compose.offline.yml exec backend \\"
echo "     #     python scripts/create_admin.py admin --password '<强口令>' --role admin --force"
echo "详细步骤见 README.md / docs/07-deployment.md「离线部署」。"
EOS
chmod +x "${staging}/install.sh"

cat >"${staging}/README.md" <<EOF
# OpenRedius 离线部署包 ${version}

目标机**全程不需要连接 ghcr.io 或任何镜像仓库**。前提:目标机已装好 Docker Engine ≥ 24
+ compose v2 插件(这一步本包不覆盖,需目标机自行准备,或参考 docs/07-deployment.md)。

\`\`\`bash
tar xzf openredius-offline-${version}.tar.gz
cd ${staging_name}
./install.sh                          # docker load 全部镜像(含 postgres:17-alpine)
cp .env.example .env && \$EDITOR .env  # 改掉全部 change-me 口令;TAG/IMAGE_OWNER 已预填
                                       # FRONTEND_HTTP_PORT/_HTTPS_PORT 默认 80/443,
                                       # 目标机被占用时记得改

# 数据库迁移必须在整套栈起来之前跑完 —— backend 启动时会查 admin_user 表(自动建
# 初始管理员),库没迁移会 UndefinedTableError 崩溃重启;frontend 又等 backend
# healthy,顺序反了会一直卡住。
docker compose -f docker-compose.offline.yml up -d postgres
docker compose -f docker-compose.offline.yml run --rm --no-deps backend alembic upgrade head

docker compose -f docker-compose.offline.yml up -d
docker compose -f docker-compose.offline.yml ps        # 全部 healthy 为止

# .env 里配了 OPENRADIUS_BOOTSTRAP_ADMIN_USER/_PASSWORD 的话,backend 首次启动会
# 自动建管理员,不用手工建号。没配,或要重置密码,再手工跑:
docker compose -f docker-compose.offline.yml exec backend \\
  python scripts/create_admin.py admin --password '<强口令>' --role admin --force
\`\`\`

- TLS:不放证书时 nginx 自签(365 天);真实证书放 \`nginx/certs/cert.pem\` + \`key.pem\`。
- 备份/恢复:\`scripts/backup.sh\` / \`scripts/restore.sh\`(用法同在线部署,见
  docs/07-deployment.md「备份与恢复」)。
- 校验完整性:\`sha256sum -c CHECKSUMS.sha256\`(在本目录内执行)。
- 完整运维手册(真实 NAS 接入、CoA、故障排查):docs/07-deployment.md / deploy/README.md。

产物版本:见 \`VERSION\` 文件(版本号 + 源码 short sha)。
EOF

echo "==> Writing checksums"
(
  cd "${staging}"
  find . -type f ! -name CHECKSUMS.sha256 -print0 | LC_ALL=C sort -z | xargs -0 "${checksum_cmd[@]}" >CHECKSUMS.sha256
)

echo "==> Creating tarball"
tar czf "${outdir}/${staging_name}.tar.gz" -C "${outdir}" "${staging_name}"
# cd 进 outdir 再算,记录进 .sha256 的是不带目录前缀的文件名,下载下来放哪个目录都能直接
# `sha256sum -c openredius-offline-<version>.tar.gz.sha256` 校验。
(cd "${outdir}" && "${checksum_cmd[@]}" "${staging_name}.tar.gz" >"${staging_name}.tar.gz.sha256")

echo "==> Done"
echo "    ${outdir}/${staging_name}.tar.gz"
echo "    ${outdir}/${staging_name}.tar.gz.sha256"
