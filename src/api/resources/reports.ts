/**
 * 报表 API(mock ↔ http 双轨)。
 *
 * http:
 *   GET /api/reports/summary?period=today|week|month
 *   GET /api/reports/endpoint-types
 *   GET /api/reports/departments?period=
 */
import { MODE } from '../config';
import { downloadApi, fetchApi } from '../http';
import {
  DEPT_ROWS,
  ETYPE_ROWS,
  LOAD_TOP,
  REPORT_PERIODS,
} from '../../data/reports';
import type { PeriodData } from '../types';

export { DEPT_ROWS, ETYPE_ROWS, LOAD_TOP, REPORT_PERIODS };
export type { PeriodData };

function apiPeriod(p: string): string {
  if (p === '本周') return 'week';
  if (p === '本月') return 'month';
  return 'today';
}

// ── mock ─────────────────────────────────────────
async function mockSummary(period: string): Promise<PeriodData> {
  return (REPORT_PERIODS as Record<string, PeriodData>)[period] ?? REPORT_PERIODS['今日'];
}

// ── http ─────────────────────────────────────────
async function httpSummary(period: string): Promise<PeriodData> {
  const body: any = await fetchApi(`/api/reports/summary?period=${apiPeriod(period)}`);
  return {
    sub: body.sub ?? '',
    total: body.total ?? 0,
    fail: (body.fail ?? []).map((d: any) => ({ label: d.label, value: d.value })),
  };
}

async function httpEndpointTypes() {
  const body: any = await fetchApi('/api/reports/endpoint-types');
  return body.items ?? [];
}

async function httpDepartments(period: string) {
  const body: any = await fetchApi(`/api/reports/departments?period=${apiPeriod(period)}`);
  return body.items ?? [];
}

export async function fetchSummary(period: string): Promise<PeriodData> {
  return MODE === 'http' ? httpSummary(period) : mockSummary(period);
}

export async function fetchEndpointTypes(): Promise<any[]> {
  if (MODE !== 'http') return ETYPE_ROWS;
  return httpEndpointTypes();
}

export async function fetchDepartments(period: string): Promise<any[]> {
  if (MODE !== 'http') return DEPT_ROWS;
  return httpDepartments(period);
}

export type ReportExportFormat = 'pdf' | 'xlsx';

function fallbackFilename(format: ReportExportFormat, period: string): string {
  return `report-${apiPeriod(period)}.${format}`;
}

export async function exportReport(format: ReportExportFormat, period: string): Promise<string> {
  const filename = fallbackFilename(format, period);
  if (MODE !== 'http') return filename;

  const file = await downloadApi(`/api/reports/export?format=${format}&period=${apiPeriod(period)}`);
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename ?? filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return link.download;
}
