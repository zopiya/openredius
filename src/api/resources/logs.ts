/**
 * 认证日志 API(mock ↔ http 双轨)。
 *
 * http:GET /api/auth-logs?result&nas&user&reason&eap&from&to&page&size
 *   → LogRowOut[] → LogRow[]
 */
import type { LogRow } from '../../data/logs';
import { LOG_FILTER_OPTIONS, LOG_ROWS } from '../../data/logs';
import { MODE } from '../config';
import { fetchItems } from '../http';

export { LOG_FILTER_OPTIONS };
export type { LogRow };

async function mockFetch(): Promise<LogRow[]> {
  return [...LOG_ROWS];
}

function mapLog(raw: any): LogRow {
  const reply = raw.reply ?? '';
  const tone = raw.rtag_tone;
  return {
    time: raw.time ?? '',
    user: raw.user ?? '',
    name: raw.name ?? '',
    sub: raw.sub ?? '',
    mac: raw.mac ?? '',
    nas: `${raw.nas_name ?? raw.nas ?? ''} · ${raw.nas_sub ?? ''}`,
    nasName: raw.nas_name ?? raw.nas ?? '',
    nasSub: raw.nas_sub ?? '',
    eap: raw.eap ?? '',
    reply: reply === 'Access-Accept' ? 'Access-Accept' : 'Access-Reject',
    reason: raw.reason ?? '',
    rtagClass: tone ? `rt-${tone}` : undefined,
    attr: raw.attr ?? '',
  };
}

async function httpFetch(filters?: Record<string, string>): Promise<LogRow[]> {
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== '全部' && v !== '全部结果' && v !== '全部设备' && v !== '全部用户' && v !== '全部原因' && v !== '全部EAP') {
        params.set(k, v);
      }
    }
  }
  const qs = params.toString();
  const { items } = await fetchItems(`/api/auth-logs${qs ? '?' + qs : ''}`);
  return items.map(mapLog);
}

export async function fetchAuthLogs(filters?: Record<string, string>): Promise<LogRow[]> {
  return MODE === 'http' ? httpFetch(filters) : mockFetch();
}
