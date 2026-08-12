#!/bin/sh
# OpenRedius FreeRADIUS entrypoint (docs/06):
#   1. envsubst the sql module credentials (only the RADIUS_SQL_* variables,
#      so other ${...} in config files survive).
#   2. Patch sites-enabled/default to wire in `sql` + `policy-openredius`
#      (section-aware awk; fail fast if upstream anchors move).
#   3. Self-signed dev certs when the certs mount has none.
#   4. exec the server (default: radiusd -X).
set -eu

SQL_MODS=/etc/raddb/mods-available/sql
SITE=/etc/raddb/sites-enabled/default

# --- 1. credentials ----------------------------------------------------------
if [ -f "$SQL_MODS" ]; then
    envsubst '$RADIUS_SQL_HOST $RADIUS_SQL_PORT $RADIUS_SQL_USER $RADIUS_SQL_PASSWORD $RADIUS_SQL_DB' \
        < "$SQL_MODS" > "$SQL_MODS.tmp"
    mv "$SQL_MODS.tmp" "$SQL_MODS"
fi

# --- 2. site wiring ----------------------------------------------------------
# Anchors (upstream v3.2 default site):
#   authorize: "\tfiles"            -> append sql + policy-openredius
#   accounting: "\tdetail"          -> append sql
#   post-auth:  "\t-sql"            -> enable (logs Access-Accept)
#   Post-Auth-Type REJECT: "\t\t-sql" -> enable (logs rejects incl. Class)
if ! grep -q '^	sql$' "$SITE"; then
    awk '
        BEGIN { sec = ""; da = 0; dc = 0; dp = 0; dr = 0; inrej = 0 }
        /^[A-Za-z]/ && /\{[ \t]*$/ { sec = $1 }
        sec == "post-auth" && /^\tPost-Auth-Type REJECT \{$/ { inrej = 1 }
        sec == "post-auth" && $0 == "\t-sql" && !dp { print "\tsql"; dp = 1; next }
        sec == "post-auth" && inrej && $0 == "\t\t-sql" && !dr { print "\t\tsql"; dr = 1; next }
        {
            print
            if (sec == "authorize" && $0 == "\tfiles" && !da) {
                print "\tsql"; print "\tpolicy-openredius"; da = 1
            }
            if (sec == "accounting" && $0 == "\tdetail" && !dc) {
                print "\tsql"; dc = 1
            }
        }
        END {
            if (!da || !dc || !dp || !dr) {
                print "entrypoint: site patch anchors missing" > "/dev/stderr"
                exit 1
            }
        }
    ' "$SITE" > "$SITE.tmp"
    mv "$SITE.tmp" "$SITE"
fi

# --- 3. dev certs fallback ----------------------------------------------------
# The certs volume mount shadows the upstream demo certs; generate a self-signed
# set when missing so eap-tls/peap always boots (docs/06 certs/gen.sh is the
# documented manual path; this keeps first `compose up` frictionless).
CERTDIR=/etc/raddb/certs
# Mounted from the host: normalize permissions (FreeRADIUS security check).
chmod 755 "$CERTDIR" 2>/dev/null || true
if [ ! -f "$CERTDIR/server.pem" ] || [ ! -f "$CERTDIR/server.key" ]; then
    echo "entrypoint: generating self-signed dev certificates"
    cd "$CERTDIR"
    # Upstream eap tls-config expects server.pem = cert + key encrypted with
    # password "whatever" (mods-available/eap, dev baseline).
    openssl req -x509 -newkey rsa:2048 -days 825 -nodes \
        -keyout ca.key -out ca.pem \
        -subj "/C=CN/O=OpenRedius/CN=OpenRedius-Dev-CA" >/dev/null 2>&1
    openssl req -newkey rsa:2048 -nodes \
        -keyout server.key.plain -out server.csr \
        -subj "/C=CN/O=OpenRedius/CN=OpenRedius-Dev" >/dev/null 2>&1
    openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
        -days 825 -out server.crt >/dev/null 2>&1
    openssl rsa -in server.key.plain -aes256 -passout pass:whatever \
        -out server.key >/dev/null 2>&1
    cat server.crt server.key > server.pem
    rm -f server.csr server.crt server.key.plain
    cd - >/dev/null
fi
# Normalize after (re)generation: FreeRADIUS refuses world-writable certs.
chmod 644 "$CERTDIR"/*.pem 2>/dev/null || true
chmod 600 "$CERTDIR"/*.key 2>/dev/null || true

# --- 4. run ------------------------------------------------------------------
exec "$@"
