/**
 * 用户管理 API(mock ↔ http 双轨)。
 *
 * http:GET /api/users?dept&status&policy&q → UserOut[] → UserRow[]
 *      POST /api/users/status  /api/users/policy  /api/users/sync-ad
 */
import type { UserRow } from '../../data/users';
import {
  POLICY_RULES,
  USER_FILTER_OPTIONS,
  USER_ROWS,
} from '../../data/users';
import { LATENCY } from '../mock/latency';
import { MODE } from '../config';
import { fetchApi, fetchItems } from '../http';

export { POLICY_RULES, USER_FILTER_OPTIONS, USER_ROWS };
export type { UserRow };

async function mockFetch(): Promise<UserRow[]> {
  return [...USER_ROWS];
}

export interface AdSyncResult {
  finishedAt: string;
  summary: string;
  message: string;
}

async function mockSync(): Promise<AdSyncResult> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({
      finishedAt: '10:26',
      summary: '(新增 2 / 更新 5 / 停用 0)',
      message: 'AD 增量同步完成:新增 2 / 更新 5,耗时 38 秒',
    }), LATENCY.adSync);
  });
}

function mapUser(raw: any): UserRow {
  const s = raw.status ?? 'enabled';
  const status = s === 'locked' ? '锁定' : s === 'disabled' ? '停用' : '正常';
  return {
    name: raw.name ?? '',
    account: raw.account ?? '',
    dept: raw.dept ?? '',
    status: status as any,
    statusSub: raw.locked_until ? `${raw.locked_until.split('T')[1]?.slice(0,5) ?? ''} 自动解锁` : undefined,
    policy: raw.policy_name ?? raw.policy ?? '',
    policyId: raw.policy_id ?? undefined,
    title: raw.title ?? '',
    devices: raw.endpoint_count ?? 0,
    lastAuth: raw.last_auth ?? '',
    email: raw.email ?? '',
    mobile: raw.mobile ?? '',
    description: raw.description ?? '',
  };
}

const STATUS_PARAM: Record<string, string> = { 正常: 'active', 停用: 'disabled', 锁定: 'locked' };

async function httpFetch(filters?: Record<string, string>): Promise<UserRow[]> {
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (!v || v === '全部部门' || v === '全部状态' || v === '全部策略组') continue;
      params.set(k, k === 'status' ? (STATUS_PARAM[v] ?? v) : v);
    }
  }
  const qs = params.toString();
  const { items } = await fetchItems(`/api/users${qs ? '?' + qs : ''}`);
  return items.map(mapUser);
}

async function httpUpdateStatus(accounts: string[], action: 'enable' | 'disable'): Promise<{ updated: number }> {
  const body: any = await fetchApi('/api/users/status', {
    method: 'POST',
    body: JSON.stringify({ accounts, action }),
  });
  return { updated: body.affected ?? body.updated ?? accounts.length };
}

async function httpAssignPolicy(accounts: string[], policyId: number): Promise<{ updated: number }> {
  const body: any = await fetchApi('/api/users/policy', {
    method: 'POST',
    body: JSON.stringify({ accounts, policy_id: policyId }),
  });
  return { updated: body.affected ?? body.updated ?? accounts.length };
}

async function httpSyncAd(): Promise<AdSyncResult> {
  const body: any = await fetchApi('/api/users/sync-ad', { method: 'POST' });
  return { finishedAt: body.finished_at ?? '', summary: body.summary ?? '', message: body.message ?? '' };
}

export async function fetchUsers(filters?: Record<string, string>): Promise<UserRow[]> {
  return MODE === 'http' ? httpFetch(filters) : mockFetch();
}

// ── 用户抽屉详情(docs/03 GET /api/users/{account}) ──
export interface UserDetailData {
  recentAuth: { time: string; nas: string; result: string }[];
  endpoints: { mac: string; fp: string; comp: string }[];
  policyRules: string[];
}

export async function fetchUserDetail(account: string): Promise<UserDetailData | null> {
  if (MODE !== 'http') return null;
  const body: any = await fetchApi(`/api/users/${encodeURIComponent(account)}`);
  return {
    recentAuth: (body.recent_auth ?? []).map((a: any) => ({
      time: (a.time ?? '').replace('T', ' ').slice(0, 16),
      nas: a.nas_ip ?? '',
      result: a.reply === 'Access-Reject' ? '失败' : '成功',
    })),
    endpoints: (body.endpoints ?? []).map((e: any) => ({
      mac: e.mac,
      fp: e.fingerprint ?? '—',
      comp: e.compliance === 'ok' ? '合规' : e.compliance === 'white' ? '白名单' : '不合规',
    })),
    policyRules: body.policy_rules ?? [],
  };
}

// ── AD 同步记录(docs/03 GET /api/users/sync-records) ──
export interface SyncRecordRow {
  time: string;
  status: '成功' | '失败' | '运行中';
  detail: string;
  error?: string;
}

export async function fetchSyncRecords(): Promise<{ total: number; items: SyncRecordRow[] }> {
  if (MODE !== 'http') return { total: 0, items: [] };
  const { items, total } = await fetchItems('/api/users/sync-records?size=10');
  return {
    total: total ?? items.length,
    items: items.map((j: any) => ({
      time: (j.started_at ?? '').replace('T', ' ').slice(0, 16),
      status: j.status === 'success' ? '成功' : j.status === 'running' ? '运行中' : '失败',
      detail: `新增 ${j.added ?? 0} / 更新 ${j.updated ?? 0} / 停用 ${j.disabled ?? 0}`,
      error: j.error ?? undefined,
    })),
  };
}

export function updateUserStatus(accounts: string[], verb: '启用' | '停用'): Promise<{ updated: number }> {
  if (MODE !== 'http') return mockHttpStatus(accounts, verb);
  return httpUpdateStatus(accounts, verb === '启用' ? 'enable' : 'disable');
}

async function mockHttpStatus(accounts: string[], _verb: string): Promise<{ updated: number }> {
  return { updated: accounts.length };
}

export function assignUserPolicy(accounts: string[], policyId: number): Promise<{ updated: number }> {
  if (MODE !== 'http') return mockHttpAssign(accounts, policyId);
  return httpAssignPolicy(accounts, policyId);
}

async function mockHttpAssign(accounts: string[], _policyId: number): Promise<{ updated: number }> {
  return { updated: accounts.length };
}

export function syncAdNow(): Promise<AdSyncResult> {
  return MODE === 'http' ? httpSyncAd() : mockSync();
}
