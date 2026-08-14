#!/bin/sh
# OpenRedius FreeRADIUS entrypoint (docs/06):
#   1. envsubst the sql module credentials (only the RADIUS_SQL_* variables,
#      so other ${...} in config files survive).
#   2. Patch sites-enabled/default to wire in `sql` + `policy-openredius`
#      (section-aware awk; fail fast if upstream anchors move).
#   3. Self-signed dev certs when the certs mount has none.
#   4. AD join + winbindd when RADIUS_AD_* is set (docs/15 方案 A; skipped
#      entirely otherwise).
#   5. supervise radiusd (+ winbindd) with the sentinel-file reload watcher
#      (docs/16), then loop forever.
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
    printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\n" \
        > /tmp/openredius-san.cnf
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
        -days 825 -out server.crt -extfile /tmp/openredius-san.cnf >/dev/null 2>&1
    openssl rsa -in server.key.plain -aes256 -passout pass:whatever \
        -out server.key >/dev/null 2>&1
    cat server.crt server.key > server.pem
    rm -f server.csr server.crt server.key.plain
    cd - >/dev/null
fi
# Normalize after (re)generation: FreeRADIUS refuses world-writable certs.
chmod 644 "$CERTDIR"/*.pem 2>/dev/null || true
chmod 600 "$CERTDIR"/*.key 2>/dev/null || true

# --- 4. AD join + winbind (docs/15 方案 A) ----------------------------------
# Gated entirely on RADIUS_AD_* env: with no AD variables set (plain dev)
# nothing here runs and startup is byte-identical to the pre-AD entrypoint.
AD_ENABLED=false
if [ -n "${RADIUS_AD_REALM:-}" ] && [ -n "${RADIUS_AD_JOIN_USER:-}" ] && [ -n "${RADIUS_AD_JOIN_PASSWORD:-}" ]; then
    AD_ENABLED=true
fi
WINBIND_PID=""
# winbindd only starts when the join actually succeeded; a failed join would
# otherwise crash-loop the supervisor (2s restart spam, no benefit).
WINBIND_ENABLED=false

if $AD_ENABLED; then
    AD_REALM="${RADIUS_AD_REALM}"
    AD_WORKGROUP="${RADIUS_AD_WORKGROUP:-$(printf '%s' "$AD_REALM" | cut -d. -f1)}"
    AD_LCREALM="$(printf '%s' "$AD_REALM" | tr '[:upper:]' '[:lower:]')"
    AD_KDC="${RADIUS_AD_KDC:-}"

    # /etc/krb5.conf — realm + optional explicit KDC; otherwise rely on DNS
    # SRV records (AD DNS is set on the compose service, T-107).
    {
        echo "[libdefaults]"
        echo "    default_realm = $AD_REALM"
        echo "    default_keytab_name = /var/lib/samba/krb5.keytab"
        echo "    dns_lookup_realm = false"
        if [ -n "$AD_KDC" ]; then
            echo "    dns_lookup_kdc = false"
        else
            echo "    dns_lookup_kdc = true"
        fi
        echo ""
        echo "[realms]"
        echo "    $AD_REALM = {"
        if [ -n "$AD_KDC" ]; then
            echo "        kdc = $AD_KDC"
        fi
        echo "    }"
        echo ""
        echo "[domain_realm]"
        echo "    .$AD_LCREALM = $AD_REALM"
    } > /etc/krb5.conf

    # /etc/samba/smb.conf — minimal winbind member config.
    {
        echo "[global]"
        echo "    workgroup = $AD_WORKGROUP"
        echo "    realm = $AD_REALM"
        echo "    security = ADS"
        echo "    winbind use default domain = yes"
        echo "    winbind refresh tickets = yes"
        echo "    winbind offline logon = yes"
        echo "    idmap config * : backend = tdb"
        echo "    idmap config * : range = 100000-200000"
        echo "    kerberos method = secrets and keytab"
        echo "    dedicated keytab file = /var/lib/samba/krb5.keytab"
        echo "    log file = /var/log/samba/log.winbind"
    } > /etc/samba/smb.conf

    mkdir -p /var/lib/samba /var/log/samba /run/samba

    # Idempotent join: secrets.tdb lives on the mounted /var/lib/samba volume,
    # so a recreated container passes testjoin and skips the join call.
    if net ads testjoin >/dev/null 2>&1; then
        echo "entrypoint: already joined to $AD_REALM (testjoin ok)"
        WINBIND_ENABLED=true
    else
        echo "entrypoint: joining domain $AD_REALM as $RADIUS_AD_JOIN_USER"
        if net ads join -U "$RADIUS_AD_JOIN_USER%$RADIUS_AD_JOIN_PASSWORD" >/dev/null 2>&1; then
            WINBIND_ENABLED=true
        else
            echo "entrypoint: WARNING — domain join FAILED; MS-CHAP auth via winbind will not work" >&2
        fi
    fi
    # (Re)create the machine keytab into the state volume when missing — the
    # keytab is derived state, secrets.tdb holds the actual join secret.
    if $WINBIND_ENABLED && [ ! -f /var/lib/samba/krb5.keytab ]; then
        net ads keytab create -P >/dev/null 2>&1 \
            || echo "entrypoint: WARNING — keytab create failed" >&2
    fi
    # Smoke check ntlm_auth wiring once winbindd is up (best-effort: the join
    # account may lack interactive logon rights, so failure is a warning only).
fi

# --- 5. supervise radiusd + sentinel-file reload watcher (docs/16) -----------
# radiusd runs as a child process so it can be restarted in place (a PID-1
# radiusd could never reload the SQL nas client list). A 2s poll loop watches
# the shared reload directory for ``reload-requested`` (epoch seconds, written
# atomically by the backend) and restarts radiusd, then echoes the epoch into
# ``reload-applied``. Crashes are also restarted. No inotify dependency.
RELOAD_DIR="${OPENRADIUS_RADIUS_RELOAD_DIR:-}"
RADIUS_PID=""

# NOTE: inside a POSIX-sh function "$@" is the *function's* arguments, so the
# radiusd command is always passed along explicitly ("$@" at call sites below
# refers to the entrypoint's own arguments).
start_radiusd() {
    "$@" &
    RADIUS_PID=$!
}

stop_radiusd() {
    [ -n "$RADIUS_PID" ] || return 0
    kill "$RADIUS_PID" 2>/dev/null || true
    wait "$RADIUS_PID" 2>/dev/null || true
    RADIUS_PID=""
}

reload_if_requested() {
    [ -n "$RELOAD_DIR" ] || return 0
    REQUESTED="$(cat "$RELOAD_DIR/reload-requested" 2>/dev/null || true)"
    [ -n "$REQUESTED" ] || return 0
    [ "$REQUESTED" != "$APPLIED" ] || return 0
    echo "entrypoint: reload requested (epoch=$REQUESTED) — restarting radiusd"
    stop_radiusd
    start_radiusd "$@"
    APPLIED="$REQUESTED"
    printf '%s' "$APPLIED" > "$RELOAD_DIR/reload-applied"
}

restart_if_crashed() {
    kill -0 "$RADIUS_PID" 2>/dev/null && return 0
    wait "$RADIUS_PID" 2>/dev/null || true
    echo "entrypoint: radiusd exited unexpectedly — restarting"
    start_radiusd "$@"
}

start_winbindd() {
    $WINBIND_ENABLED || return 0
    # -F: stay in the foreground. Without it winbindd double-forks and
    # detaches (normal daemon behavior) — `$!` then captures the pid of the
    # launcher process, which exits within milliseconds once the real daemon
    # is off in the background, tricking restart_if_crashed's `kill -0` into
    # firing every ~2s even though winbindd is fine. Confirmed on real AD
    # (2026-08-14, 10.36.8.10): each bogus restart attempt collides with the
    # live daemon's pidfile/socket handling often enough to intermittently
    # break in-flight ntlm_auth calls (`Reading winbind reply failed!
    # (0xc0000001)`) — this wasn't just log spam, it was dropping real
    # MS-CHAPv2 authentications.
    winbindd -F &
    WINBIND_PID=$!
}

stop_winbindd() {
    [ -n "$WINBIND_PID" ] || return 0
    kill "$WINBIND_PID" 2>/dev/null || true
    wait "$WINBIND_PID" 2>/dev/null || true
    WINBIND_PID=""
}

exec 2>&1
if [ -n "$RELOAD_DIR" ]; then
    mkdir -p "$RELOAD_DIR" 2>/dev/null || true
    # The named volume is created by Docker (root:root, 0755) before either
    # container's entrypoint runs. This container is root (official
    # freeradius image), backend is not (non-root USER openredius, uid 999,
    # backend/Dockerfile) — without this, backend's `os.replace` into the
    # sentinel path fails with EACCES and every reload request 500s
    # (found 2026-08-14 during v0.3.0 real-server rollout: the sentinel
    # mechanism was only ever validated with backend run on the host, which
    # doesn't hit this UID mismatch at all). Only two small marker files
    # ever live here, shared solely between these two trusted containers —
    # world-writable is an acceptable trade for not having to align UID/GID
    # across two unrelated base images.
    chmod 777 "$RELOAD_DIR" 2>/dev/null || true
fi
APPLIED="$(cat "$RELOAD_DIR/reload-applied" 2>/dev/null || true)"
start_winbindd
if $WINBIND_ENABLED; then
    # Best-effort wiring smoke test (docs/15 §5): validates the
    # eap→mschap→ntlm_auth chain from inside the container. Failure is a
    # warning — real auth still requires a reachable DC and valid users.
    SMOKE_OK=false
    i=0
    while [ "$i" -lt 3 ]; do
        if ntlm_auth --username="$RADIUS_AD_JOIN_USER" --password="$RADIUS_AD_JOIN_PASSWORD" --domain="$AD_WORKGROUP" >/dev/null 2>&1; then
            SMOKE_OK=true
            break
        fi
        i=$((i + 1))
        sleep 1
    done
    if $SMOKE_OK; then
        echo "entrypoint: ntlm_auth smoke test OK"
    else
        echo "entrypoint: WARNING — ntlm_auth smoke test failed (check join/DC reachability)" >&2
    fi
fi
start_radiusd "$@"
trap 'echo "entrypoint: SIGTERM — stopping radiusd/winbindd"; stop_radiusd; stop_winbindd; exit 0' TERM INT
while :; do
    sleep 2
    reload_if_requested "$@"
    restart_if_crashed "$@"
    # winbindd supervisor (crash-restart only; reload only restarts radiusd).
    if $WINBIND_ENABLED && ! kill -0 "$WINBIND_PID" 2>/dev/null; then
        wait "$WINBIND_PID" 2>/dev/null || true
        echo "entrypoint: winbindd exited unexpectedly — restarting"
        start_winbindd
    fi
done
