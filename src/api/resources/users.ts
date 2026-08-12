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
    title: raw.title ?? '',
    devices: raw.device_count ?? 0,
    lastAuth: raw.last_auth ?? '',
  };
}

async function httpFetch(filters?: Record<string, string>): Promise<UserRow[]> {
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== '全部部门' && v !== '全部状态' && v !== '全部策略组') params.set(k, v);
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

async function httpAssignPolicy(accounts: string[], policyId: string): Promise<{ updated: number }> {
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

export function updateUserStatus(accounts: string[], verb: '启用' | '停用'): Promise<{ updated: number }> {
  if (MODE !== 'http') return mockHttpStatus(accounts, verb);
  return httpUpdateStatus(accounts, verb === '启用' ? 'enable' : 'disable');
}

async function mockHttpStatus(accounts: string[], _verb: string): Promise<{ updated: number }> {
  return { updated: accounts.length };
}

export function assignUserPolicy(accounts: string[], policy: string): Promise<{ updated: number }> {
  if (MODE !== 'http') return mockHttpAssign(accounts, policy);
  return httpAssignPolicy(accounts, policy);
}

async function mockHttpAssign(accounts: string[], _policy: string): Promise<{ updated: number }> {
  return { updated: accounts.length };
}

export function syncAdNow(): Promise<AdSyncResult> {
  return MODE === 'http' ? httpSyncAd() : mockSync();
}
