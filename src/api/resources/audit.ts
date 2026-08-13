/**
 * 审计日志 API(http 双轨)。
 *
 * http: GET /api/audit?action&actor&from&to&page&size&sort
 *       GET /api/audit/export.csv
 * RBAC: admin + auditor(后端 require_role)。
 */
import { MODE } from '../config';
import { downloadFile, fetchItems } from '../http';

export interface AuditRow {
  id: number;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown> | null;
  ip: string;
  createdAt: string;
}

function mapAudit(raw: any): AuditRow {
  return {
    id: raw.id,
    actor: raw.actor ?? '',
    action: raw.action ?? '',
    targetType: raw.target_type ?? '',
    targetId: raw.target_id != null ? String(raw.target_id) : '',
    detail: raw.detail ?? null,
    ip: raw.ip ?? '',
    createdAt: raw.created_at ?? '',
  };
}

const MOCK_AUDIT: AuditRow[] = [
  { id: 1, actor: 'admin', action: 'auth.login', targetType: 'admin_user', targetId: '1', detail: null, ip: '10.99.0.5', createdAt: '2026-08-13T10:24:31Z' },
  { id: 2, actor: 'admin', action: 'policy.update', targetType: 'policy_group', targetId: '2', detail: { name: '研发准入策略' }, ip: '10.99.0.5', createdAt: '2026-08-13T09:48:12Z' },
  { id: 3, actor: 'operator_test', action: 'session.disconnect', targetType: 'session', targetId: 'acct-8f3a', detail: { count: 3 }, ip: '10.99.0.7', createdAt: '2026-08-13T09:15:44Z' },
  { id: 4, actor: 'admin', action: 'secret.reveal', targetType: 'nas_device', targetId: '1', detail: null, ip: '10.99.0.5', createdAt: '2026-08-13T08:57:03Z' },
  { id: 5, actor: 'admin', action: 'ad_sync.triggered', targetType: 'ad_sync_job', targetId: '12', detail: { source: 'manual' }, ip: '10.99.0.5', createdAt: '2026-08-13T08:30:00Z' },
  { id: 6, actor: 'auditor_test', action: 'auth.login', targetType: 'admin_user', targetId: '3', detail: null, ip: '10.99.0.9', createdAt: '2026-08-13T08:12:27Z' },
];

export async function fetchAudit(filters?: Record<string, string>): Promise<{ items: AuditRow[]; total: number }> {
  if (MODE !== 'http') {
    const action = filters?.action;
    const items = action ? MOCK_AUDIT.filter((r) => r.action === action) : MOCK_AUDIT;
    return { items, total: items.length };
  }
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  }
  const qs = params.toString();
  const { items, total } = await fetchItems(`/api/audit${qs ? '?' + qs : ''}`);
  return { items: items.map(mapAudit), total: total ?? items.length };
}

export async function exportAuditCsv(): Promise<void> {
  if (MODE !== 'http') throw new Error('mock 模式不支持导出');
  await downloadFile('/api/audit/export.csv', 'audit.csv');
}
