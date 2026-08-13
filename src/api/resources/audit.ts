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

export async function fetchAudit(filters?: Record<string, string>): Promise<{ items: AuditRow[]; total: number }> {
  if (MODE !== 'http') return { items: [], total: 0 };
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
