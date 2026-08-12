/**
 * 系统设置 API(mock ↔ http 双轨)。
 *
 * http:
 *   GET  /api/settings → SettingsOut
 *   PUT  /api/settings → SettingsWriteResult
 *   GET  /api/settings/alert-rules → AlertRuleOut[]
 *   PUT  /api/settings/alert-rules
 *   GET  /api/auth/admins → admin list
 *   POST /api/auth/admins → create
 */
import { MODE } from '../config';
import { fetchApi } from '../http';

// ── types ────────────────────────────────────────
export interface SettingsSnapshot {
  radius_auth_port: number;
  radius_acct_port: number;
  coa_port: number;
  alerts_enabled: boolean;
  audit_enabled: boolean;
}

// ── mock ─────────────────────────────────────────
const MOCK_SETTINGS: SettingsSnapshot = {
  radius_auth_port: 1812,
  radius_acct_port: 1813,
  coa_port: 3799,
  alerts_enabled: true,
  audit_enabled: true,
};

async function mockGet(): Promise<SettingsSnapshot> {
  return { ...MOCK_SETTINGS };
}

// ── public ───────────────────────────────────────
export async function fetchSettings(): Promise<SettingsSnapshot> {
  if (MODE !== 'http') return mockGet();
  return (await fetchApi('/api/settings')) as SettingsSnapshot;
}

export async function saveSettings(
  settings: SettingsSnapshot & { confirm: boolean },
): Promise<{ radius_reload_required: boolean }> {
  if (MODE !== 'http') return { radius_reload_required: false };
  return (await fetchApi('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })) as any;
}
