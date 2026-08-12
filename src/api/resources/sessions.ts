/**
 * 会话 API(mock ↔ http 双轨)。
 *
 * http 模式:GET /api/sessions?dept&method&nas&vlan&auth&q
 *   → SessionRowOut[] → SessionRow[](类型不变)
 *
 * disconnect:POST /api/sessions/disconnect
 */
import type { SessionRow } from '../types';
import {
  SESSION_FILTER_OPTIONS,
  SESSION_ROWS,
} from '../../data/sessions';
import { MODE } from '../config';
import { fetchApi, fetchItems } from '../http';

export { SESSION_FILTER_OPTIONS, SESSION_ROWS };
export type { SessionRow };

// ── mock impl ────────────────────────────────────
async function mockFetch(): Promise<SessionRow[]> {
  return [...SESSION_ROWS];
}

function mockDisconnect(ids: string[]): Promise<{ disconnected: number; failed: { id: string; reason: string }[] }> {
  return Promise.resolve({ disconnected: ids.length, failed: [] });
}

// ── http impl ────────────────────────────────────
function _method(nasporttype: string): '有线' | 'WiFi' {
  const t = (nasporttype ?? '').toLowerCase();
  return t.includes('wireless') || t.includes('wi') ? 'WiFi' : '有线';
}

function _duration(duration_s: number): string {
  if (!duration_s || duration_s <= 0) return '0m';
  const h = Math.floor(duration_s / 3600);
  const m = Math.floor((duration_s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function mapSession(raw: any): SessionRow {
  return {
    session: raw.acct_unique_id ?? '',
    user: raw.username ?? '',
    name: raw.name ?? '',
    dept: raw.dept ?? '',
    mac: raw.mac ?? '',
    method: _method(raw.method),
    nas: raw.nas_name ?? '',
    nasSub: raw.nas_area ?? '',
    nasIp: raw.nas_ip ?? '',
    nasPort: raw.nas_port ?? '',
    called: raw.called ?? '',
    ip: raw.ip ?? '',
    vlan: raw.vlan ?? '',
    vlanLabel: raw.vlan_label ?? '',
    auth: raw.auth_method ?? '',
    duration: _duration(raw.duration_s),
    status: raw.status === 'online' ? '在线' : '待重认证',
    filterId: raw.filter_id ?? '',
    timeout: raw.session_timeout ?? '',
    start: raw.start ?? '',
  };
}

async function httpFetch(filters?: Record<string, string>): Promise<SessionRow[]> {
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== '全部' && v !== '全部部门' && v !== '全部设备') params.set(k, v);
    }
  }
  const qs = params.toString();
  const { items } = await fetchItems(`/api/sessions${qs ? '?' + qs : ''}`);
  return items.map(mapSession);
}

async function httpDisconnect(ids: string[]): Promise<{ disconnected: number; failed: { id: string; reason: string }[] }> {
  const body: any = await fetchApi('/api/sessions/disconnect', {
    method: 'POST',
    body: JSON.stringify({ session_ids: ids, confirm: true }),
  });
  return { disconnected: body.disconnected, failed: body.failed ?? [] };
}

// ── public API ───────────────────────────────────
export async function fetchSessions(filters?: Record<string, string>): Promise<SessionRow[]> {
  return MODE === 'http' ? httpFetch(filters) : mockFetch();
}

export function disconnectSessions(ids: string[]): Promise<{ disconnected: number; failed: { id: string; reason: string }[] }> {
  return MODE === 'http' ? httpDisconnect(ids) : mockDisconnect(ids);
}
