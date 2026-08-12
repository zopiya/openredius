/**
 * 认证服务 —— login / logout / refresh / me。
 *
 * Token 存储在内存(_token) + localStorage("openredius_tokens"),
 * 启动时自动恢复。
 */
import { fetchApi, setToken } from './http';
import { MODE } from './config';

const STORAGE_KEY = 'openredius_tokens';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface AdminInfo {
  username: string;
  display_name: string;
  role: string;
}

let _tokens: AuthTokens | null = null;
let _admin: AdminInfo | null = null;

/** 从 localStorage 恢复 token(若存在);http 模块的 _token 同步设置 */
export function restoreFromStorage(): boolean {
  if (MODE !== 'http') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const tokens: AuthTokens = JSON.parse(raw);
    _tokens = tokens;
    _admin = JSON.parse(localStorage.getItem(STORAGE_KEY + '_admin') ?? 'null');
    setToken(tokens.access_token);
    return true;
  } catch {
    return false;
  }
}

function persist(tokens: AuthTokens, admin?: AdminInfo): void {
  _tokens = tokens;
  setToken(tokens.access_token);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  if (admin) {
    _admin = admin;
    localStorage.setItem(STORAGE_KEY + '_admin', JSON.stringify(admin));
  }
}

export function clearAuth(): void {
  _tokens = null;
  _admin = null;
  setToken(null);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY + '_admin');
}

export function getAdmin(): AdminInfo | null {
  return _admin;
}

export function isAuthenticated(): boolean {
  return _tokens !== null && _tokens.access_token.length > 0;
}

export async function login(username: string, password: string): Promise<AdminInfo> {
  const body: any = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const tokens: AuthTokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: body.expires_in,
  };
  const admin: AdminInfo = body.user ?? {};
  persist(tokens, admin);
  return admin;
}

export async function refresh(): Promise<void> {
  if (!_tokens?.refresh_token) throw new Error('no refresh token');
  const body: any = await fetchApi('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: _tokens.refresh_token }),
  });
  const tokens: AuthTokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: body.expires_in,
  };
  persist(tokens);
}

export async function logout(): Promise<void> {
  try {
    await fetchApi('/api/auth/logout', { method: 'POST' });
  } finally {
    clearAuth();
  }
}

export async function fetchMe(): Promise<AdminInfo> {
  const body: any = await fetchApi('/api/auth/me');
  const admin: AdminInfo = body;
  // Sync local copy but don't persist (already persisted from login)
  _admin = admin;
  return admin;
}
