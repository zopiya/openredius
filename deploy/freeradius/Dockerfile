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
    && ln -s /usr/sbin/freeradius /usr/sbin/radiusd

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
