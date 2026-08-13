/**
 * 设备管理 API(mock ↔ http 双轨)。
 *
 * http:
 *   GET /api/devices/nas?type&area&status → NasRow[]
 *   GET /api/devices/endpoints?type&comp&q → EndpointRow[]
 *   POST /api/devices/endpoints/import
 *   DELETE /api/devices/endpoints/{mac}/whitelist
 *   POST /api/devices/endpoints/{mac}/revoke-cert
 */
import type { EndpointRow, NasRow } from '../../data/devices';
import {
  DEVICE_FILTER_OPTIONS,
  NAS_ROWS,
  ENDPOINT_ROWS,
  SWITCH_PORT_DETAIL,
  SWITCH_BUSY_PORTS,
  SSID_ROWS,
} from '../../data/devices';
import { MODE } from '../config';
import { fetchApi, fetchItems } from '../http';

export {
  DEVICE_FILTER_OPTIONS,
  SWITCH_PORT_DETAIL,
  SWITCH_BUSY_PORTS,
  SSID_ROWS,
};
export type { EndpointRow, NasRow };

// ── mock ─────────────────────────────────────────
async function mockFetchNas(): Promise<NasRow[]> {
  return [...NAS_ROWS];
}
async function mockFetchEndpoints(): Promise<EndpointRow[]> {
  return [...ENDPOINT_ROWS];
}

// ── http ─────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  online: 'success',
  offline: 'danger',
  'high-load': 'warn',
};

function mapNas(raw: any): NasRow {
  const status = raw.status ?? 'offline';
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    type: raw.type ?? 'switch',
    typeLabel: raw.type === 'ac' ? '无线 AC' : raw.type === 'ap' ? 'AP' : '交换机',
    ip: raw.nasname ?? '',
    area: raw.area ?? '',
    status: status === 'online' ? 'online' : 'offline',
    statusLabel: status === 'online' ? '在线' : status === 'high-load' ? '高负载' : `离线`,
    statusBadge: (STATUS_BADGE[status] ?? 'danger') as any,
    secret: raw.secret_masked,
    loadPct: raw.load_pct ?? 0,
    loadDanger: (raw.load_pct ?? 0) >= 90,
    loadLabel: raw.capacity ? `${raw.active_sessions ?? 0}/${raw.capacity} 端口` : '',
    opLabel: raw.type === 'ac' ? 'SSID 状态' : '端口状态',
  };
}

const COMP_BADGE: Record<string, string> = {
  ok: 'success',
  white: 'muted',
  warn: 'warn',
  bad: 'danger',
};
const COMP_LABEL: Record<string, string> = {
  ok: '合规',
  white: '白名单准入',
  warn: '证书临期',
  bad: '不合规',
};

function mapEndpoint(raw: any): EndpointRow {
  const comp = raw.compliance ?? 'ok';
  return {
    mac: raw.mac ?? '',
    fingerprint: raw.fingerprint ?? '',
    userName: raw.owner_name ?? '',
    userSub: raw.owner_account ?? '',
    etype: raw.etype ?? '其他',
    comp: comp,
    compLabel: raw.comp_detail ?? (COMP_LABEL[comp] ?? '合规'),
    compBadge: (COMP_BADGE[comp] ?? 'success') as any,
    firstSeen: raw.first_seen_at ?? '',
    whitelist: raw.whitelisted,
  };
}

async function httpFetchNas(filters?: Record<string, string>): Promise<NasRow[]> {
  const params = new URLSearchParams();
  if (filters?.type && filters.type !== '全部类型') params.set('type', _nasTypeParam(filters.type));
  if (filters?.area && filters.area !== '全部区域') params.set('area', filters.area);
  if (filters?.status && filters.status !== '全部') params.set('status', filters.status);
  const qs = params.toString();
  const { items } = await fetchItems(`/api/devices/nas${qs ? '?' + qs : ''}`);
  return items.map(mapNas);
}

function _nasTypeParam(label: string): string {
  if (label.includes('AC')) return 'ac';
  if (label.includes('AP')) return 'ap';
  return 'switch';
}

async function httpFetchEndpoints(filters?: Record<string, string>): Promise<EndpointRow[]> {
  const params = new URLSearchParams();
  if (filters?.type && filters.type !== '全部类型') params.set('type', filters.type);
  if (filters?.comp && filters.comp !== '全部') params.set('comp', filters.comp);
  if (filters?.q) params.set('q', filters.q);
  const qs = params.toString();
  const { items } = await fetchItems(`/api/devices/endpoints${qs ? '?' + qs : ''}`);
  return items.map(mapEndpoint);
}

export async function fetchNas(filters?: Record<string, string>): Promise<NasRow[]> {
  return MODE === 'http' ? httpFetchNas(filters) : mockFetchNas();
}

/** 查看 NAS Shared Secret 明文(admin only,后端写 secret.reveal 审计)。 */
export async function getNasSecret(id: string): Promise<string> {
  if (MODE !== 'http') return '';
  const body: any = await fetchApi(`/api/devices/nas/${id}/secret`);
  return body.secret ?? '';
}

export async function fetchEndpoints(filters?: Record<string, string>): Promise<EndpointRow[]> {
  return MODE === 'http' ? httpFetchEndpoints(filters) : mockFetchEndpoints();
}

// Write operations (mock = no-op success)
export async function importEndpoints(macs: string[]): Promise<{ imported: number }> {
  if (MODE !== 'http') return { imported: macs.length };
  const body: any = await fetchApi('/api/devices/endpoints/import', {
    method: 'POST',
    body: JSON.stringify({ macs }),
  });
  return { imported: body.affected ?? macs.length };
}

export async function removeWhitelist(mac: string): Promise<void> {
  if (MODE !== 'http') return;
  await fetchApi(`/api/devices/endpoints/${encodeURIComponent(mac)}/whitelist`, { method: 'DELETE' });
}

export async function revokeCert(mac: string): Promise<void> {
  if (MODE !== 'http') return;
  await fetchApi(`/api/devices/endpoints/${encodeURIComponent(mac)}/revoke-cert`, { method: 'POST' });
}
