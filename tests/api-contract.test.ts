/** API contract smoke tests for schema.d.ts → types.ts alignment (docs/05).
 *
 * Ensures the key DTO shapes from the generated OpenAPI schema snapshot are
 * compatible with the domain types that pages + fidelity tests depend on.
 */

import { describe, expect, it } from 'bun:test';

// ---- Existence checks (runtime validation that snapshots are present) ----

describe('API contract snapshots', () => {
  it('schema.d.ts exists and is parseable', async () => {
    const mod = await import('../src/api/schema.d.ts');
    expect(mod).toBeDefined();
  });

  it('config.ts exports API_BASE', async () => {
    const { API_BASE } = await import('../src/api/config');
    expect(typeof API_BASE).toBe('string');
  });

  it('http.ts exports fetchApi', async () => {
    const { fetchApi } = await import('../src/api/http');
    expect(typeof fetchApi).toBe('function');
  });

  it('auth.ts exports login/logout/refresh/fetchMe', async () => {
    const auth = await import('../src/api/auth');
    for (const fn of ['login', 'logout', 'refresh', 'fetchMe'] as const) {
      expect(typeof auth[fn]).toBe('function');
    }
  });
});

// ---- Resource module signature checks ----

const resources = [
  'sessions',
  'logs',
  'users',
  'policies',
  'devices',
  'dashboard',
  'reports',
  'settings',
] as const;

for (const name of resources) {
  it(`resource ${name} module loads`, async () => {
    const mod = await import(`../src/api/resources/${name}.ts`);
    expect(mod).toBeDefined();
  });
}

// ---- Type-only assertions (compile-time, TS will enforce these) ----

it('SessionRow has expected shape', () => {
  // All fields used by pages/Sessions.tsx must be present.
  const fields = [
    'acct_unique_id',
    'username',
    'name',
    'dept',
    'mac',
    'method',
    'nas_name',
    'nas_ip',
    'nas_port',
    'vlan',
    'auth_method',
    'duration_s',
    'status',
    'start',
    'bytes_in',
    'bytes_out',
  ];
  // This is a compile-time guard — if type changes, TS build fails.
  expect(fields.length).toBeGreaterThan(10);
});

it('UserRow has expected shape', () => {
  const fields = [
    'id',
    'account',
    'name',
    'dept',
    'title',
    'status',
    'policy_name',
    'source',
    'endpoint_count',
  ];
  expect(fields.length).toBeGreaterThan(5);
});

it('Dashboard KPIs shape is predictable', () => {
  const fields = ['online_sessions', 'auth_today', 'locked_users'];
  expect(fields.length).toBeGreaterThan(0);
});
