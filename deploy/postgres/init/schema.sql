-- FreeRADIUS 官方 PostgreSQL schema(vendored)
-- 来源:FreeRADIUS 3.2.x `raddb/mods-config/sql/main/postgresql/schema.sql`
-- (https://github.com/FreeRADIUS/freeradius-server)。结构冻结,升级需跟随
-- FreeRADIUS 版本(ADR-0004)。由 01-init.sh 载入 radius schema(先 SET search_path)。

--
-- 表结构(raddb/mods-config/sql/main/postgresql/setup.sql 对应)
--

CREATE TABLE radcheck (
    id          serial PRIMARY KEY,
    username    varchar(64) NOT NULL DEFAULT '',
    attribute   varchar(64) NOT NULL DEFAULT '',
    op          varchar(2) NOT NULL DEFAULT '==',
    value       varchar(253) NOT NULL DEFAULT ''
);
CREATE INDEX radcheck_UserName ON radcheck (username, attribute);

CREATE TABLE radreply (
    id          serial PRIMARY KEY,
    username    varchar(64) NOT NULL DEFAULT '',
    attribute   varchar(64) NOT NULL DEFAULT '',
    op          varchar(2) NOT NULL DEFAULT '=',
    value       varchar(253) NOT NULL DEFAULT ''
);
CREATE INDEX radreply_UserName ON radreply (username, attribute);

CREATE TABLE radgroupcheck (
    id          serial PRIMARY KEY,
    groupname   varchar(64) NOT NULL DEFAULT '',
    attribute   varchar(64) NOT NULL DEFAULT '',
    op          varchar(2) NOT NULL DEFAULT '==',
    value       varchar(253) NOT NULL DEFAULT ''
);
CREATE INDEX radgroupcheck_GroupName ON radgroupcheck (groupname, attribute);

CREATE TABLE radgroupreply (
    id          serial PRIMARY KEY,
    groupname   varchar(64) NOT NULL DEFAULT '',
    attribute   varchar(64) NOT NULL DEFAULT '',
    op          varchar(2) NOT NULL DEFAULT '=',
    value       varchar(253) NOT NULL DEFAULT ''
);
CREATE INDEX radgroupreply_GroupName ON radgroupreply (groupname, attribute);

CREATE TABLE radusergroup (
    id          serial PRIMARY KEY,
    username    varchar(64) NOT NULL DEFAULT '',
    groupname   varchar(64) NOT NULL DEFAULT '',
    priority    integer NOT NULL DEFAULT 0
);
CREATE INDEX radusergroup_UserName ON radusergroup (username);

CREATE TABLE radpostauth (
    id                  bigserial PRIMARY KEY,
    username            varchar(64) NOT NULL DEFAULT '',
    pass                varchar(1024),
    reply               varchar(32),
    calledstationid     varchar(50),
    callingstationid    varchar(50),
    authdate            timestamp(0) without time zone NOT NULL DEFAULT now(),
    -- reply:Class captured by the M3 postauth_query (docs/06 failure-reason classifier).
    class               varchar(64) NOT NULL DEFAULT ''
);
CREATE INDEX radpostauth_username ON radpostauth (username);
CREATE INDEX radpostauth_authdate ON radpostauth (authdate);

CREATE TABLE radacct (
    radacctid           bigserial PRIMARY KEY,
    acctsessionid       varchar(64) NOT NULL DEFAULT '',
    acctuniqueid        varchar(32) NOT NULL DEFAULT '',
    username            varchar(64) NOT NULL DEFAULT '',
    groupname           varchar(64) NOT NULL DEFAULT '',
    realm               varchar(64) DEFAULT '',
    nasipaddress        inet NOT NULL,
    nasportid           varchar(32) DEFAULT NULL,
    nasporttype         varchar(32) DEFAULT NULL,
    acctstarttime       timestamp(0) without time zone NOT NULL DEFAULT now(),
    acctupdatetime      timestamp(0) without time zone NOT NULL DEFAULT now(),
    acctstoptime        timestamp(0) without time zone NOT NULL DEFAULT now(),
    acctinterval        bigint NOT NULL DEFAULT 0,
    acctsessiontime     bigint NOT NULL DEFAULT 0,
    acctauthentic       varchar(32) DEFAULT NULL,
    connectinfo_start   varchar(50) DEFAULT NULL,
    connectinfo_stop    varchar(50) DEFAULT NULL,
    acctinputoctets     bigint NOT NULL DEFAULT 0,
    acctoutputoctets    bigint NOT NULL DEFAULT 0,
    calledstationid     varchar(50) NOT NULL DEFAULT '',
    callingstationid    varchar(50) NOT NULL DEFAULT '',
    acctterminatecause  varchar(32) NOT NULL DEFAULT '',
    servicetype         varchar(32) DEFAULT NULL,
    framedprotocol      varchar(32) DEFAULT NULL,
    framedipaddress     inet NOT NULL,
    framedipv6address   inet NOT NULL,
    framedipv6prefix    varchar(44) NOT NULL DEFAULT '',
    framedinterfaceid   varchar(44) DEFAULT NULL,
    delegatedipv6prefix varchar(44) NOT NULL DEFAULT '',
    acctstartdelay      integer NOT NULL DEFAULT 0,
    acctstopdelay       integer NOT NULL DEFAULT 0,
    acctinputgigawords  bigint NOT NULL DEFAULT 0,
    acctoutputgigawords bigint NOT NULL DEFAULT 0
);
-- 官方索引(在线会话/关闭会话/批量查询路径)
CREATE INDEX radacct_WhosOnline ON radacct (username, nasipaddress, acctstarttime, acctstoptime);
CREATE INDEX radacct_SessionId ON radacct (acctsessionid);
CREATE INDEX radacct_AcctUniqueId ON radacct (acctuniqueid);
CREATE INDEX radacct_start_user_bps ON radacct
    (acctstarttime, username, acctsessiontime, acctinputoctets, acctoutputoctets);
CREATE INDEX radacct_stop_user_bps ON radacct
    (acctstoptime, username, acctsessiontime, acctinputoctets, acctoutputoctets);
CREATE INDEX radacct_Bulk_Close ON radacct (nasipaddress, acctstarttime);

CREATE TABLE nas (
    id          serial PRIMARY KEY,
    nasname     varchar(128) NOT NULL,
    shortname   varchar(32),
    type        varchar(30) NOT NULL DEFAULT 'other',
    ports       integer,
    secret      varchar(60) NOT NULL,
    server      varchar(64),
    community   varchar(50),
    description varchar(200)
);
CREATE INDEX nas_nasname ON nas (nasname);

-- NAS 热重载标记表(FreeRADIUS 3.2 reload 机制,M3 使用)
CREATE TABLE nasreload (
    nasipaddress inet PRIMARY KEY,
    reloadtime   timestamp(0) without time zone NOT NULL
);
