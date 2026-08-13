/**
 * 报表 API(mock ↔ http 双轨)。
 *
 * http:
 *   GET /api/reports/summary?period=today|week|month
 *   GET /api/reports/endpoint-types
 *   GET /api/reports/departments?period=
 */
import { MODE } from '../config';
import { downloadFile, fetchApi } from '../http';
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

/** 导出报表(pdf/xlsx/csv)。http 模式触发文件下载;mock 模式抛错由页面提示。 */
export async function exportReport(format: 'pdf' | 'xlsx' | 'csv', period: string): Promise<void> {
  if (MODE !== 'http') throw new Error('mock 模式不支持导出');
  await downloadFile(`/api/reports/export?format=${format}&period=${apiPeriod(period)}`, `report.${format}`);
}
