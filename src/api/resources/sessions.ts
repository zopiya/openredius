/**
 * 在线会话 API。
 * 目标后端契约(mock → http 的 1:1 映射):
 *   GET  /api/sessions            → fetchSessions
 *   POST /api/sessions/disconnect → disconnectSessions (CoA Disconnect-Request)
 */
import { delay, LATENCY } from '../mock/latency';
import { SESSION_FILTER_OPTIONS, SESSIONS_DB, type SessionRow } from '../mock/sessions';

export { SESSION_FILTER_OPTIONS };

export async function fetchSessions(): Promise<SessionRow[]> {
  await delay(LATENCY.sessions);
  return [...SESSIONS_DB];
}

/** mock 后端:从内存会话表移除;http 时代为 POST /api/sessions/disconnect */
export function disconnectSessions(ids: string[]): Promise<{ disconnected: number }> {
  const idSet = new Set(ids);
  for (let i = SESSIONS_DB.length - 1; i >= 0; i--) {
    if (idSet.has(SESSIONS_DB[i].session)) SESSIONS_DB.splice(i, 1);
  }
  return Promise.resolve({ disconnected: ids.length });
}
