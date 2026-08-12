/**
 * 策略管理 API(mock ↔ http 双轨)。
 *
 * http:GET /api/policies → PolicyOut[] → PolicyRow[]
 *      POST/PUT/PATCH policies; POST /api/policies/reorder
 */
import type { PolicyForm, PolicyRow } from '../../data/policies';
import {
  NEW_POLICY_FORM,
  POLICY_FORMS,
  POLICY_FORM_OPTIONS,
  POLICY_ROWS,
} from '../../data/policies';
import { MODE } from '../config';
import { fetchApi, fetchItems } from '../http';

export { NEW_POLICY_FORM, POLICY_FORMS, POLICY_FORM_OPTIONS, POLICY_ROWS };
export type { PolicyForm, PolicyRow };

async function mockFetch(): Promise<PolicyRow[]> {
  return [...POLICY_ROWS];
}

function mapPolicy(raw: any): PolicyRow {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    sub: raw.description ?? '',
    scope: raw.scope_dept ?? '',
    eap: raw.eap_method ?? 'PEAP-MSCHAPv2',
    vlan: `VLAN ${raw.vlan_id ?? ''} · ${raw.acl_name ?? ''}`,
    compliance: _complianceLabel(raw),
    on: raw.enabled ?? true,
  };
}

function _complianceLabel(raw: any): string {
  const parts: string[] = [];
  if (raw.require_cert) parts.push('证书');
  if (raw.require_mac_bind) parts.push('MAC 绑定');
  if (raw.require_edr) parts.push('安全状态检查');
  return parts.length ? parts.join(' + ') : '无强制要求';
}

function mapForm(raw: any): PolicyForm {
  return {
    name: raw.name ?? '',
    scope: raw.scope_dept ?? '',
    eap: raw.eap_method ?? 'PEAP-MSCHAPv2',
    vlan: `${raw.vlan_id ?? ''} · ${raw.vlan_name ?? ''}`,
    acl: raw.acl_name ?? '无',
    cert: raw.require_cert ?? false,
    mac: raw.require_mac_bind ?? false,
    edr: raw.require_edr ?? false,
    time: raw.time_window_enabled ?? false,
    timeFrom: raw.time_from ?? '08:00',
    timeTo: raw.time_to ?? '20:00',
    rate: raw.rate_limit_mbps ? `${raw.rate_limit_mbps} Mbps` : '不限速',
    on: raw.enabled ?? true,
  };
}

async function httpFetch(): Promise<PolicyRow[]> {
  const { items } = await fetchItems('/api/policies');
  return items.map(mapPolicy);
}

async function httpGetForm(id: string): Promise<PolicyForm> {
  const body: any = await fetchApi(`/api/policies/${id}`);
  return mapForm(body);
}

export async function fetchPolicies(): Promise<PolicyRow[]> {
  return MODE === 'http' ? httpFetch() : mockFetch();
}

export async function getPolicyForm(id: string): Promise<PolicyForm> {
  if (MODE !== 'http') return { ...POLICY_FORMS[id] };
  return httpGetForm(id);
}

export async function savePolicy(policy: PolicyForm & { id?: string }): Promise<{ id: string; reload_required: boolean }> {
  if (MODE !== 'http') return { id: 'new', reload_required: false };
  const pid: any = (policy as any).id;
  const method = pid && pid !== 'new' ? 'PUT' : 'POST';
  const url = method === 'PUT' ? `/api/policies/${pid}` : '/api/policies';
  const body: any = await fetchApi(url, {
    method,
    body: JSON.stringify(_toBackend(policy)),
  });
  return { id: String(body.id), reload_required: body.reload_required ?? false };
}

export async function togglePolicy(id: string, enabled: boolean): Promise<void> {
  if (MODE !== 'http') return;
  await fetchApi(`/api/policies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export async function deletePolicy(id: string): Promise<void> {
  if (MODE !== 'http') return;
  await fetchApi(`/api/policies/${id}`, { method: 'DELETE' });
}

export async function reorderPolicies(ids: string[]): Promise<void> {
  if (MODE !== 'http') return;
  await fetchApi('/api/policies/reorder', {
    method: 'POST',
    body: JSON.stringify({ order: ids.map(Number) }),
  });
}

function _toBackend(f: PolicyForm): Record<string, unknown> {
  return {
    name: f.name,
    slug: f.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    description: '',
    scope_dept: f.scope,
    eap_method: f.eap,
    vlan_id: parseInt(f.vlan.split('·')[0]?.trim() ?? '0', 10) || 0,
    acl_name: f.acl.split('(')[0]?.trim() ?? '无',
    require_cert: f.cert,
    require_mac_bind: f.mac,
    require_edr: f.edr,
    time_window_enabled: f.time,
    time_from: f.timeFrom,
    time_to: f.timeTo,
    rate_limit_mbps: f.rate === '不限速' ? null : parseInt(f.rate, 10) || null,
    enabled: f.on,
    priority: 0,
  };
}
