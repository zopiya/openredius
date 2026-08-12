"""Seed the dev database with the prototype dataset (docs/02 映射, docs/04).

10 users / 5 policies / 8 NAS / 8 endpoints + VLAN/ACL dictionaries,
alert rules and baseline settings. Idempotent: wipes domain data first,
never touches admin_user / audit_log.

Usage: cd backend && uv run python scripts/seed_demo.py
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import delete, select

from openredius.core.config import get_settings
from openredius.core.db import close_db, get_session_factory, init_db
from openredius.models import (
    AccessUser,
    AclProfile,
    AdminUser,
    AlertRule,
    Compliance,
    EapMethod,
    Endpoint,
    EndpointType,
    NasDevice,
    NasType,
    PolicyGroup,
    SystemSetting,
    UserStatus,
    Vlan,
)

VLANS = [
    (10, "办公"),
    (20, "研发"),
    (30, "访客"),
    (40, "财务隔离"),
    (50, "供应链"),
    (99, "运维"),
]

ACLS = [
    ("acl_staff", "员工默认 ACL"),
    ("acl_rd_std", "研发标准 ACL"),
    ("acl_fin_iso", "财务隔离 ACL"),
    ("acl_ops_admin", "运维管理 ACL"),
    ("acl_guest_only", "访客仅互联网 ACL"),
]

POLICIES = [
    # (slug, name, description, scope_dept, eap, vlan_vid, acl, timeout_s,
    #  reauth_s, cert, mac, edr, time, rate, priority, enabled)
    (
        "fin",
        "财务隔离策略",
        "高安全域,强合规",
        "财务部",
        EapMethod.EAP_TLS,
        40,
        "acl_fin_iso",
        14400,
        14400,
        True,
        True,
        True,
        False,
        None,
        5,
        True,
    ),
    (
        "rd",
        "研发准入策略",
        "代码库访问域",
        "研发中心",
        EapMethod.EAP_TLS,
        20,
        "acl_rd_std",
        28800,
        28800,
        True,
        True,
        False,
        False,
        None,
        4,
        True,
    ),
    (
        "ops",
        "运维特权策略",
        "网络设备管理域",
        "运维部",
        EapMethod.EAP_TLS,
        99,
        "acl_ops_admin",
        43200,
        43200,
        True,
        False,
        True,
        False,
        None,
        3,
        True,
    ),
    (
        "staff",
        "办公默认策略",
        "全员兜底准入",
        "全体员工",
        EapMethod.PEAP_MSCHAPV2,
        10,
        "acl_staff",
        28800,
        28800,
        False,
        False,
        False,
        False,
        None,
        2,
        True,
    ),
    (
        "guest",
        "访客受限策略",
        "仅互联网,限时准入",
        "访客用户组",
        EapMethod.PEAP_MSCHAPV2,
        30,
        "acl_guest_only",
        14400,
        None,
        False,
        True,
        False,
        True,
        20,
        1,
        False,
    ),
]

# (account, name, dept, title, status, policy_slug)
USERS = [
    ("wang.lei", "王磊", "研发中心", "高级后端工程师", UserStatus.ACTIVE, "rd"),
    ("li.na", "李娜", "市场部", "市场经理", UserStatus.ACTIVE, "staff"),
    ("zhang.wei", "张伟", "财务部", "财务主管", UserStatus.LOCKED, "fin"),
    ("chen.chen", "陈晨", "研发中心", "前端工程师", UserStatus.ACTIVE, "rd"),
    ("liu.yang", "刘洋", "供应链", "仓储专员", UserStatus.ACTIVE, "staff"),
    ("zhao.min", "赵敏", "人事行政", "HRBP", UserStatus.ACTIVE, "staff"),
    ("sun.peng", "孙鹏", "研发中心", "测试工程师", UserStatus.ACTIVE, "rd"),
    ("zhou.ting", "周婷", "市场部", "品牌专员(离职)", UserStatus.DISABLED, "staff"),
    ("wu.hao", "吴昊", "运维部", "网络工程师", UserStatus.ACTIVE, "ops"),
    ("zheng.nan", "郑楠", "财务部", "会计", UserStatus.ACTIVE, "fin"),
]

# (name, type, nasname, area, capacity)
NAS_DEVICES = [
    ("SW-3F-01", NasType.SWITCH, "10.99.0.11", "3F 办公区", 48),
    ("SW-3F-02", NasType.SWITCH, "10.99.0.12", "3F 办公区", 48),
    ("SW-5F-01", NasType.SWITCH, "10.99.0.14", "5F 办公区", 48),
    ("SW-5F-02", NasType.SWITCH, "10.99.0.13", "5F 办公区", 48),
    ("SW-B1-IDC-01", NasType.SWITCH, "10.99.0.21", "B1 机房", 48),
    ("AC-HQ-01", NasType.AC, "10.99.0.30", "B1 机房", 500),
    ("AP-3F-012", NasType.AP, "10.99.1.12", "3F 办公区", 50),
    ("AP-4F-007", NasType.AP, "10.99.1.47", "4F 办公区", 50),
]
NAS_SECRET = "R@dius-S3cr3t"

# (mac, etype, compliance, comp_detail, owner_account, whitelisted, fingerprint)
ENDPOINTS = [
    (
        "3C:52:82:1A:4B:01",
        EndpointType.LAPTOP,
        Compliance.OK,
        "合规",
        "wang.lei",
        False,
        "9F:2A:…:71:C0",
    ),
    (
        "A4:83:E7:22:9C:7E",
        EndpointType.PHONE,
        Compliance.WARN,
        "证书 12 天后到期",
        "li.na",
        False,
        "B1:08:…:3E:9A",
    ),
    (
        "7C:2E:DD:41:0A:93",
        EndpointType.LAPTOP,
        Compliance.OK,
        "合规",
        "zhang.wei",
        False,
        "C4:77:…:0B:52",
    ),
    (
        "3C:52:82:1A:8D:40",
        EndpointType.LAPTOP,
        Compliance.BAD,
        "证书已过期",
        "sun.peng",
        False,
        "4F:2A:…:88:1D",
    ),
    (
        "F4:8C:50:77:BE:09",
        EndpointType.PHONE,
        Compliance.OK,
        "合规",
        "zhao.min",
        False,
        "D2:91:…:6F:04",
    ),
    (
        "00:25:96:FF:FE:12",
        EndpointType.PRINTER,
        Compliance.WHITE,
        "白名单准入",
        None,
        True,
        "—(MAC 白名单)",
    ),
    (
        "8C:85:90:5B:11:2F",
        EndpointType.LAPTOP,
        Compliance.OK,
        "合规",
        "liu.yang",
        False,
        "E7:5C:…:29:F8",
    ),
    (
        "B0:6E:BF:12:78:E3",
        EndpointType.PHONE,
        Compliance.BAD,
        "不合规 · EDR 离线",
        "zheng.nan",
        False,
        "A0:33:…:D5:61",
    ),
]

ALERT_RULES = [
    ("nas_offline", {"offline_minutes": 5}),
    ("ap_high_load", {"load_pct": 90}),
    ("cert_expiring", {"days": 14}),
    ("account_locked", {"window_minutes": 10, "max_fails": 5}),
]

SETTINGS = {
    "radius.ports": {"auth": 1812, "acct": 1813, "coa": 3799},
    "alerts.master": {"enabled": True},
    "audit.enabled": True,
}


async def seed() -> None:
    session_factory = get_session_factory()
    now = datetime.now(UTC)
    async with session_factory() as session:
        for model in (
            Endpoint,
            AccessUser,
            PolicyGroup,
            NasDevice,
            AlertRule,
            SystemSetting,
            AclProfile,
            Vlan,
        ):
            await session.execute(delete(model))

        vlans: dict[int, Vlan] = {}
        for vid, name in VLANS:
            vlan = Vlan(vid=vid, name=name)
            session.add(vlan)
            vlans[vid] = vlan
        for name, description in ACLS:
            session.add(AclProfile(name=name, description=description))
        await session.flush()

        policies: dict[str, PolicyGroup] = {}
        for (
            slug,
            name,
            desc,
            scope,
            eap,
            vid,
            acl,
            timeout,
            reauth,
            cert,
            mac,
            edr,
            tw,
            rate,
            prio,
            on,
        ) in POLICIES:
            policy = PolicyGroup(
                slug=slug,
                name=name,
                description=desc,
                scope_dept=scope,
                eap_method=eap,
                vlan_id=vlans[vid].id,
                acl_name=acl,
                session_timeout_s=timeout,
                reauth_interval_s=reauth,
                require_cert=cert,
                require_mac_bind=mac,
                require_edr=edr,
                time_window_enabled=tw,
                time_from=time(8, 0),
                time_to=time(20, 0),
                rate_limit_mbps=rate,
                priority=prio,
                enabled=on,
            )
            session.add(policy)
            policies[slug] = policy
        await session.flush()

        for account, name, dept, title, status, slug in USERS:
            user = AccessUser(
                account=account,
                name=name,
                dept=dept,
                title=title,
                status=status,
                policy_group_id=policies[slug].id,
                locked_until=now + timedelta(minutes=30) if status is UserStatus.LOCKED else None,
            )
            session.add(user)
        await session.flush()

        for name, nas_type, nasname, area, capacity in NAS_DEVICES:
            session.add(
                NasDevice(
                    name=name,
                    type=nas_type,
                    nasname=nasname,
                    area=area,
                    secret_enc=NAS_SECRET,
                    capacity=capacity,
                )
            )

        accounts = {
            row[0]: row[1]
            for row in (await session.execute(select(AccessUser.account, AccessUser.id))).all()
        }
        for mac, etype, comp, detail, owner, whitelisted, fingerprint in ENDPOINTS:
            session.add(
                Endpoint(
                    mac=mac,
                    etype=etype,
                    compliance=comp,
                    comp_detail=detail,
                    owner_user_id=accounts.get(owner) if owner else None,
                    whitelisted=whitelisted,
                    fingerprint=fingerprint,
                    first_seen_at=now - timedelta(days=200),
                )
            )

        for key, threshold in ALERT_RULES:
            session.add(AlertRule(key=key, enabled=True, threshold_json=threshold))
        for key, value in SETTINGS.items():
            session.add(SystemSetting(key=key, value_json=value, updated_by="seed"))

        await session.commit()
        admin_names = (await session.execute(select(AdminUser.username))).scalars().all()

    print(
        f"seeded: {len(USERS)} users, {len(POLICIES)} policies, "
        f"{len(NAS_DEVICES)} NAS, {len(ENDPOINTS)} endpoints, "
        f"{len(VLANS)} vlans, {len(ACLS)} acls; admins kept: {admin_names}"
    )


async def main() -> None:
    settings = get_settings()
    init_db(settings.database_url)
    try:
        await seed()
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
