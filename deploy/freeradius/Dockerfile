# OpenRedius dev FreeRADIUS image (docs/06).
# Base: official FreeRADIUS server image; raddb/ is an overlay — only files we
# ship replace upstream defaults, everything else stays stock.
# Tested baseline: FreeRADIUS 3.2.10 (docs/06). On upgrade run
# deploy/scripts/smoke_freeradius.sh + `uv run pytest -m integration` — the
# entrypoint's awk anchors and the queries.conf class patch are version-sensitive.
FROM freeradius/freeradius-server:latest

# envsubst for credential injection in entrypoint.sh
RUN apt-get update && apt-get install -y --no-install-recommends gettext-base \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/sbin/freeradius /usr/sbin/radiusd

COPY raddb/ /etc/raddb/
COPY entrypoint.sh /entrypoint.sh
# FreeRADIUS refuses to start on group/world-writable config dirs.
RUN chmod +x /entrypoint.sh && ln -sf ../mods-available/sql /etc/raddb/mods-enabled/sql \
    && echo '$INCLUDE dictionary.openredius' >> /etc/raddb/dictionary \
    && sed -i -E \
        's/^([[:space:]]*)column_name[[:space:]]*=.*/\1column_name = ", class"/; \
         s/^([[:space:]]*)reply_xlat[[:space:]]*=.*/\1reply_xlat = ", '"'"'%{reply:OpenRedius-Deny-Reason}'"'"'"/' \
        /etc/raddb/mods-config/sql/main/postgresql/queries.conf \
    && find -H /etc/raddb -type d -exec chmod 755 {} + \
    && find -H /etc/raddb -type f -exec chmod 644 {} +

EXPOSE 1812/udp 1813/udp

ENTRYPOINT ["/entrypoint.sh"]
CMD ["radiusd", "-X"]
