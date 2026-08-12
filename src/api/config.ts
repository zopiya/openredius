/**
 * API 模式开关:VITE_API_MODE=http 或 VITE_API_BASE 非空 → http;否则 mock。
 *
 * Vite dev proxy 模式:set VITE_API_MODE=http(proxy 已配,base 留空)。
 * 直连后端:set VITE_API_BASE=http://localhost:8000。
 */
export const MODE: 'mock' | 'http' = (
  import.meta.env.VITE_API_MODE === 'http' || import.meta.env.VITE_API_BASE
) ? 'http' : 'mock';
export const API_BASE = (import.meta.env.VITE_API_BASE as string) ?? '';

/** 调用方统一入口——在 http 模式下将路径拼到 base 上 */
export function apiUrl(path: string): string {
  return API_BASE + (path.startsWith('/') ? path : `/${path}`);
}
