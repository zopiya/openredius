/**
 * 仪表盘 API(mock ↔ http 双轨)。
 *
 * http:
 *   GET /api/dashboard/kpis → { online_sessions, auth_today, ... }
 *   GET /api/dashboard/trend?range=today|7d → { buckets: [{t, accept, reject}] }
 *   GET /api/dashboard/alerts?limit=20 → AlertItem[]
 *   POST /api/dashboard/alerts/{id}/read
 */
import { MODE } from '../config';
import { fetchApi } from '../http';
import type { TrendSeries } from '../../components/charts/TrendChart';
import { TREND_TODAY, TREND_WEEK } from '../../components/charts/TrendChart';

// ── types ────────────────────────────────────────
export interface KpiSnapshot {
  online_sessions: number;
  auth_today: number;
  auth_success_rate_today: number;
  nas_online: number;
  nas_total: number;
  locked_users: number;
}

export interface AlertItem {
  id: number;
  rule_key: string;
  level: '严重' | '警告' | '提示';
  title: string;
  message: string;
  link: string;
  created_at: string;
  read_at: string | null;
}

// ── mock ─────────────────────────────────────────
const MOCK_KPIS: KpiSnapshot = {
  online_sessions: 1286,
  auth_today: 12713,
  auth_success_rate_today: 98.7,
  nas_online: 6,
  nas_total: 8,
  locked_users: 1,
};

async function mockKpis(): Promise<KpiSnapshot> {
  return { ...MOCK_KPIS };
}

// ── http ─────────────────────────────────────────
function mapAlert(raw: any): AlertItem {
  return {
    id: raw.id,
    rule_key: raw.rule_key,
    level: raw.level === 'critical' ? '严重' : raw.level === 'warning' ? '警告' : '提示',
    title: raw.title ?? '',
    message: raw.message ?? '',
    link: raw.link ?? '',
    created_at: raw.created_at ?? '',
    read_at: raw.read_at ?? null,
  };
}

async function httpKpis(): Promise<KpiSnapshot> {
  const body: any = await fetchApi('/api/dashboard/kpis');
  return {
    online_sessions: body.online_sessions ?? 0,
    auth_today: body.auth_today ?? 0,
    auth_success_rate_today: body.auth_success_rate_today ?? 0,
    nas_online: body.nas_online ?? 0,
    nas_total: body.nas_total ?? 0,
    locked_users: body.locked_users ?? 0,
  };
}

function bucketsToSeries(buckets: any[], range: string): TrendSeries {
  const ok = buckets.map((b: any) => b.accept ?? 0);
  const fail = buckets.map((b: any) => b.reject ?? 0);
  const allVals = [...ok, ...fail];
  const rawMax = Math.max(...allVals, 1);
  const maxY = Math.ceil(rawMax * 1.15 / 50) * 50 || 50;
  const step = maxY / 5;
  const ticks = [0, 1, 2, 3, 4, 5].map((i) => Math.round(i * step));
  const isToday = range !== '7d';
  return {
    ok,
    fail,
    maxY,
    ticks,
    label: (i: number) => {
      const t = (buckets[i] as any)?.t ?? '';
      if (!t) return '';
      if (isToday) return t.slice(0, 5);   // HH:MM
      // 7d: return short date — `t` is ISO date-hour
      return t.slice(5, 10);                // MM-DD
    },
    ariaPrefix: isToday ? '24 小时' : '近 7 天',
  };
}

async function httpTrend(range: string): Promise<TrendSeries> {
  const body: any = await fetchApi(`/api/dashboard/trend?range=${range}`);
  return bucketsToSeries(body.buckets ?? [], range);
}

async function httpAlerts(limit = 20): Promise<AlertItem[]> {
  const body: any = await fetchApi(`/api/dashboard/alerts?limit=${limit}`);
  return (body.items ?? []).map(mapAlert);
}

async function httpReadAlert(id: number): Promise<void> {
  await fetchApi(`/api/dashboard/alerts/${id}/read`, { method: 'POST' });
}

// ── public ───────────────────────────────────────
export async function fetchKpis(): Promise<KpiSnapshot> {
  return MODE === 'http' ? httpKpis() : mockKpis();
}

export async function fetchTrend(range: string): Promise<TrendSeries> {
  if (MODE !== 'http') return range === '7d' ? TREND_WEEK : TREND_TODAY;
  return httpTrend(range);
}

export async function fetchAlerts(limit = 20): Promise<AlertItem[]> {
  if (MODE !== 'http') return [];  // alerts are hardcoded in Dashboard component
  return httpAlerts(limit);
}

export async function readAlert(id: number): Promise<void> {
  if (MODE !== 'http') return;
  return httpReadAlert(id);
}
