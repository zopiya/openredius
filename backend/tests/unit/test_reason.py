"""Failure-reason classifier unit tests (docs/02 归类表)."""

from __future__ import annotations

from openredius.services.reason import classify_reason, reason_key_from_param


def test_class_based_classification():
    assert classify_reason("reason=account-locked").label == "账号锁定"
    assert classify_reason("reason=cert-expired").label == "证书过期"
    assert classify_reason("reason=mac-unbound").label == "MAC 未绑定"
    assert classify_reason("reason=bad-password").label == "密码错误"
    assert classify_reason("reason=time-policy").label == "时间策略拒绝"
    assert classify_reason("reason=non-compliant").label == "终端不合规"
    assert classify_reason("reason=account-locked").key == "account-locked"
    assert classify_reason("reason=account-locked").tone == "warn"


def test_message_fallback():
    assert classify_reason(None, "Wrong password").key == "bad-password"
    assert classify_reason(None, "Certificate expired").key == "cert-expired"
    assert classify_reason("", "MAC not bound to this account").key == "mac-unbound"
    assert classify_reason(None, "Outside allowed time window").key == "time-policy"
    assert classify_reason(None, "账号已被锁定").key == "account-locked"


def test_class_wins_over_message():
    r = classify_reason("reason=time-policy", "Wrong password")
    assert r.key == "time-policy"


def test_other_bucket():
    assert classify_reason(None, None).key == "other"
    assert classify_reason("", "some unknown failure").key == "other"
    assert classify_reason("reason=bogus-key").key == "other"
    assert classify_reason(None).label == "其他"


def test_reason_param_normalization():
    assert reason_key_from_param("账号锁定") == "account-locked"
    assert reason_key_from_param("account-locked") == "account-locked"
    assert reason_key_from_param("其他") == "other"
    assert reason_key_from_param("unknown-thing") is None
    assert reason_key_from_param(None) is None
    assert reason_key_from_param("") is None
