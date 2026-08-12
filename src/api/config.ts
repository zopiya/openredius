/**
 * API 模式开关:读取 VITE_API_BASE 决定走 mock 还是 http。
 *
 * 判断逻辑:
 *   - import.meta.env.VITE_API_BASE 非空 → mode=http, base 即前缀(如 http://localhost:8000)
 *   - 否则 mode=mock (CI / 纯前端开发)
 *
 * Vite dev proxy 模式:set VITE_API_BASE=/api (proxy 已配),或直连后端端口。
 */
export const MODE: 'mock' | 'http' = import.meta.env.VITE_API_BASE ? 'http' : 'mock';
export const API_BASE = (import.meta.env.VITE_API_BASE as string) ?? '';

/** 调用方统一入口——在 http 模式下将路径拼到 base 上 */
export function apiUrl(path: string): string {
  return API_BASE + (path.startsWith('/') ? path : `/${path}`);
}
