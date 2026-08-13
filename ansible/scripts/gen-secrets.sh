#!/bin/bash
# 生成随机密钥并填充 vault.yml(随后需 ansible-vault encrypt)
# 用法:bash ansible/scripts/gen-secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

VAULT="inventory/group_vars/all/vault.yml"
if [ -f "$VAULT" ]; then
    echo "已存在 ${VAULT},拒绝覆盖(手动编辑或删除后重跑)" >&2
    exit 1
fi

rand() { openssl rand -base64 "$1" | tr -d '/+=' | head -c "$2"; }

cat > "$VAULT" <<EOF
vault_postgres_password: "$(rand 32 24)"
vault_openredius_db_password: "$(rand 32 24)"
vault_radius_sql_password: "$(rand 32 24)"
vault_jwt_secret: "$(rand 64 48)"
vault_bootstrap_admin_user: "admin"
vault_bootstrap_admin_password: "$(rand 32 24)"
vault_radius_coa_secret: "$(rand 24 16)"
vault_ad_url: ""
vault_ad_bind_dn: ""
vault_ad_bind_pw: ""
vault_ad_base_dn: ""
EOF

echo "已生成 ${VAULT}(明文,未加密)"
echo "下一步:"
echo "  ansible-vault encrypt ${VAULT}"
echo "  (或设 ANSIBLE_VAULT_PASSWORD_FILE 指向口令文件后加密)"
