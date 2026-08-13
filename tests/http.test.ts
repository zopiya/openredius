import { afterEach, describe, expect, it } from 'bun:test';
import { clearAuth, login } from '../src/api/auth';
import { ApiHttpError, downloadApi, fetchApi } from '../src/api/http';

const originalFetch = globalThis.fetch;
const describeHttp = process.env.VITE_API_MODE === 'http' ? describe : describe.skip;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearAuth();
});

describeHttp('fetchApi token refresh', () => {
  it('retries a protected request once with refreshed credentials and preserved headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/api/auth/login')) {
        return json({ access_token: 'old-token', refresh_token: 'refresh-token', expires_in: 900 });
      }
      if (String(url).endsWith('/api/auth/refresh')) {
        return json({ access_token: 'new-token', refresh_token: 'new-refresh-token', expires_in: 900 });
      }
      return calls.filter((call) => call.url.endsWith('/api/users')).length === 1
        ? json({ error: { code: 'expired', message: 'expired' } }, 401)
        : json({ items: [] });
    }) as typeof fetch;

    await login('admin', 'password');
    await expect(fetchApi('/api/users', { headers: { 'X-Request-ID': 'audit-1' } })).resolves.toEqual({ items: [] });

    expect(calls.map((call) => call.url)).toEqual(['/api/auth/login', '/api/users', '/api/auth/refresh', '/api/users']);
    const retryHeaders = new Headers(calls[3]?.init?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');
    expect(retryHeaders.get('X-Request-ID')).toBe('audit-1');
  });

  it('returns the second 401 instead of repeatedly refreshing', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url) => {
      calls.push(String(url));
      if (String(url).endsWith('/api/auth/login')) {
        return json({ access_token: 'old-token', refresh_token: 'refresh-token', expires_in: 900 });
      }
      if (String(url).endsWith('/api/auth/refresh')) {
        return json({ access_token: 'new-token', refresh_token: 'new-refresh-token', expires_in: 900 });
      }
      return json({ error: { code: 'forbidden', message: 'forbidden' } }, 401);
    }) as typeof fetch;

    await login('admin', 'password');
    await expect(fetchApi('/api/users')).rejects.toMatchObject<ApiHttpError>({ status: 401, code: 'forbidden' });
    expect(calls).toEqual(['/api/auth/login', '/api/users', '/api/auth/refresh', '/api/users']);
  });

  it('downloads authenticated binary responses with the server filename', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/api/auth/login')) {
        return json({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 900 });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'Content-Disposition': 'attachment; filename=report-week.xlsx',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }) as typeof fetch;

    await login('admin', 'password');
    const file = await downloadApi('/api/reports/export?format=xlsx&period=week');

    expect(file.filename).toBe('report-week.xlsx');
    expect(file.blob.size).toBe(3);
    expect(new Headers(calls[1]?.init?.headers).get('Authorization')).toBe('Bearer access-token');
  });
});
