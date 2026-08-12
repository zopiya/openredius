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
