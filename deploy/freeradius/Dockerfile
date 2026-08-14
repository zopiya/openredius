# OpenRedius dev FreeRADIUS image (docs/06).
# Base: official FreeRADIUS server image; raddb/ is an overlay — only files we
# ship replace upstream defaults, everything else stays stock.
# Tested baseline: FreeRADIUS 3.2.10 (docs/06). On upgrade run
# deploy/scripts/smoke_freeradius.sh + `uv run pytest -m integration` — the
# entrypoint's awk anchors and the queries.conf class patch are version-sensitive.
FROM freeradius/freeradius-server:3.2.10

# winbind + samba-common-bin (ntlm_auth) + krb5-user (kinit/net) for AD direct
# auth via winbind/ntlm_auth (docs/15 方案 A). join state lives on the mounted
# /var/lib/samba volume, never baked into the image.
# DEBIAN_FRONTEND=noninteractive: krb5-user/samba debconf would otherwise block
# the build asking for a default Kerberos realm (entrypoint generates the real
# krb5.conf at runtime from RADIUS_AD_*).
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gettext-base \
    winbind samba-common-bin krb5-user \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/sbin/freeradius /usr/sbin/radiusd \
    && usermod -aG winbindd_priv freerad

# radiusd runs as the unprivileged `freerad` user (radiusd.conf, upstream
# default). `ntlm_auth --request-nt-key` needs winbindd's *privileged* pipe
# (/var/lib/samba/winbindd_privileged/pipe, mode 0750 root:winbindd_priv) —
# without membership every mschap→ntlm_auth call from radiusd itself fails
# with "Reading winbind reply failed! (0xc0000001)", even though the exact
# same command run as root (e.g. `docker exec` default user) succeeds fine.
# Confirmed on real AD (2026-08-14, 10.36.8.10): manual root-shell ntlm_auth
# calls always worked; radiusd's own calls always failed until this group was
# added, which is why the mschap wiring smoke test (`ntlm_auth --username=...
# --password=...` run directly from entrypoint.sh, also as root) passed while
# real MS-CHAPv2 requests through radiusd kept failing.

COPY raddb/ /etc/raddb/
COPY entrypoint.sh /entrypoint.sh
# FreeRADIUS refuses to start on group/world-writable config dirs.
RUN chmod +x /entrypoint.sh && ln -sf ../mods-available/sql /etc/raddb/mods-enabled/sql \
    && echo '$INCLUDE dictionary.openredius' >> /etc/raddb/dictionary \
    && sed -i -E \
        's/^([[:space:]]*)column_name[[:space:]]*=.*/\1column_name = ", class"/; \
         s/^([[:space:]]*)reply_xlat[[:space:]]*=.*/\1reply_xlat = ", '"'"'%{reply:OpenRedius-Deny-Reason}'"'"'"/; \
         s/^([[:space:]]*)packet_xlat[[:space:]]*=.*/\1packet_xlat = ", '"'"'%{Class}'"'"'"/; \
         s/username, pass, reply, authdate/username, pass, reply, callingstationid, nasipaddress, authdate/; \
         s/^([[:space:]]*)'"'"'%S\.%M'"'"' \\$/\1'"'"'%{Calling-Station-Id}'"'"', '"'"'%{NAS-IP-Address}'"'"', '"'"'%S.%M'"'"' \\/' \
        /etc/raddb/mods-config/sql/main/postgresql/queries.conf \
    && find -H /etc/raddb -type d -exec chmod 755 {} + \
    && find -H /etc/raddb -type f -exec chmod 644 {} +

EXPOSE 1812/udp 1813/udp

ENTRYPOINT ["/entrypoint.sh"]
CMD ["radiusd", "-X"]
