/**
 * HTTP 客户端 —— 自动附带 Bearer token、统一错误格式处理。
 *
 * 后端错误体:{ "error": { "code": "string", "message": "human", "details": {} } }
 * → 将 message 投掷为 ApiHttpError。
 */
import { MODE, apiUrl } from './config';

export class ApiHttpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

let _token: string | null = null;

export function setToken(token: string | null): void {
  _token = token;
}

export function getToken(): string | null {
  return _token;
}

/** 后台模式切回 mock 时使用(CI 没有 VITE_API_BASE) */
export function assertHttp(): void {
  if (MODE !== 'http') throw new Error('API called in mock mode');
}

async function handleResponse(resp: Response): Promise<unknown> {
  // 401 → attempt token refresh once, then retry
  if (resp.status === 401 && resp.url !== apiUrl('/api/auth/login') && resp.url !== apiUrl('/api/auth/refresh')) {
    try {
      const { refresh: doRefresh } = await import('./auth');
      await doRefresh();
      // Retry original request with fresh token
      const headers: Record<string, string> = {};
      if (_token) headers['Authorization'] = `Bearer ${_token}`;
      const retryResp = await fetch(resp.url, { ...(resp as any)._init, headers });
      return handleResponse(retryResp);
    } catch {
      // Refresh failed → re-throw original 401
    }
  }
  const text = await resp.text();
  let body: any = {};
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON responses (e.g. CSV export)
    if (resp.ok) return text;
    throw new ApiHttpError('http_error', text || `HTTP ${resp.status}`, resp.status);
  }
  if (!resp.ok) {
    const err = body?.error ?? {};
    throw new ApiHttpError(
      err.code ?? 'http_error',
      err.message ?? `HTTP ${resp.status}`,
      resp.status,
      err.details,
    );
  }
  return body;
}

export async function fetchApi(path: string, init?: RequestInit): Promise<unknown> {
  assertHttp();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const resp = await fetch(apiUrl(path), { ...init, headers });
  (resp as any)._init = init;  // stash for retry
  return handleResponse(resp);
}

/** 列表中后端统一包裹 { "items": [...], "total": n } 或直接返回数组;
 *  资源层调用此函数解包到 items[],total 由 list.returnItems 控制。 */
export async function fetchItems(path: string, init?: RequestInit): Promise<{ items: any[]; total?: number }> {
  const body: any = await fetchApi(path, init);
  if (body && body.items !== undefined) return { items: body.items, total: body.total };
  if (Array.isArray(body)) return { items: body };
  // 某些端点(如 kpis)直接返回对象,留给资源层自行解。
  return { items: [body] };
}

/** 文件下载(带 Bearer token),从 Content-Disposition 取文件名。 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  assertHttp();
  const headers: Record<string, string> = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const resp = await fetch(apiUrl(path), { headers });
  if (!resp.ok) {
    const text = await resp.text();
    let msg = text;
    try { msg = JSON.parse(text)?.error?.message ?? text; } catch { /* non-json */ }
    throw new ApiHttpError('download_error', msg || `HTTP ${resp.status}`, resp.status);
  }
  const blob = await resp.blob();
  const cd = resp.headers.get('Content-Disposition') ?? '';
  const m = cd.match(/filename="?([^";]+)"?/);
  const name = m?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
