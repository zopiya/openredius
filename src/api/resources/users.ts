/**
 * 用户管理 API。
 *   GET  /api/users         → fetchUsers
 *   POST /api/users/sync-ad → syncAdNow
 *   POST /api/users/status  → updateUserStatus(启用/停用)
 *   POST /api/users/policy  → assignUserPolicy
 */
import { delay, LATENCY } from '../mock/latency';
import { POLICY_RULES, USER_FILTER_OPTIONS, USER_ROWS, type UserRow } from '../mock/users';

export { POLICY_RULES, USER_FILTER_OPTIONS };

export async function fetchUsers(): Promise<UserRow[]> {
  await delay(LATENCY.users);
  return [...USER_ROWS];
}

export interface AdSyncResult {
  finishedAt: string;
  summary: string;
  message: string;
}

/** AD 增量同步:mock 固定 1800ms 后成功 */
export function syncAdNow(): Promise<AdSyncResult> {
  return new Promise((resolve) => {
    window.setTimeout(
      () =>
        resolve({
          finishedAt: '10:26',
          summary: '(新增 2 / 更新 5 / 停用 0)',
          message: 'AD 增量同步完成:新增 2 / 更新 5,耗时 38 秒',
        }),
      LATENCY.adSync,
    );
  });
}

export function updateUserStatus(accounts: string[], _verb: '启用' | '停用'): Promise<{ updated: number }> {
  return Promise.resolve({ updated: accounts.length });
}

export function assignUserPolicy(accounts: string[], _policy: string): Promise<{ updated: number }> {
  return Promise.resolve({ updated: accounts.length });
}
