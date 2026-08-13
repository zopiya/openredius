/** API 契约与形状断言(docs/09「前端契约」)。
 *
 * - schema.d.ts 为后端 OpenAPI 快照:断言关键 DTO 组件与端点路径存在,
 *   防止后端契约演进后前端快照漂移(漂移时用 `bun run api:gen` 重新生成)。
 * - src/data/* 是 mock 数据与页面类型的单一来源:对实例做运行时形状断言,
 *   字段增删会在此处红掉。
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function schemaSource(): string {
  return readFileSync(fileURLToPath(new URL('../src/api/schema.d.ts', import.meta.url)), 'utf8');
}

describe('OpenAPI 快照(schema.d.ts)', () => {
  it('关键 DTO 组件名存在', () => {
    const src = schemaSource();
    // 注:列表类端点返回未具名信封(03「通用约定」),OpenAPI 中无
    // SessionRowOut/UserOut/AlertEvent 组件名;此处断言可具名契约。
    for (const name of [
      'PolicyOut',
      'NasOut',
      'NasCreate',
      'EndpointOut',
      'EndpointBrief',
      'SettingsOut',
      'AlertRuleOut',
      'AdSyncJobOut',
      'AdSyncResult',
      'DisconnectResult',
      'ReauthorizeRequest',
      'ChangePasswordRequest',
    ]) {
      expect(src, `schema.d.ts 缺少组件 ${name}`).toContain(name);
    }
  });

  it('关键端点路径存在', () => {
    const src = schemaSource();
    for (const path of [
      '"/api/auth/login"',
      '"/api/auth/me"',
      '"/api/auth/me/password"',
      '"/api/sessions"',
      '"/api/sessions/reauthorize"',
      '"/api/users"',
      '"/api/users/sync-records"',
      '"/api/policies"',
      '"/api/devices/nas"',
      '"/api/devices/nas/{device_id}/ports"',
      '"/api/devices/nas/{device_id}/ssids"',
      '"/api/settings"',
      '"/api/settings/alert-rules"',
      '"/api/audit"',
      '"/api/audit/export.csv"',
    ]) {
      expect(src, `schema.d.ts 缺少端点 ${path}`).toContain(path);
    }
  });
});

describe('mock 数据形状(页面字段契约)', () => {
  it('SessionRow 满足 Sessions.tsx 全部消费字段', async () => {
    const { SESSION_ROWS } = await import('../src/data/sessions');
    const row = SESSION_ROWS[0];
    for (const k of [
      'session', 'user', 'name', 'dept', 'mac', 'method', 'nas', 'nasSub',
      'nasIp', 'nasPort', 'called', 'ip', 'vlan', 'vlanLabel', 'auth',
      'duration', 'status', 'filterId', 'timeout', 'start',
    ]) {
      expect(k in row, `SessionRow 缺少 ${k}`).toBe(true);
    }
  });

  it('UserRow 满足 Users.tsx 全部消费字段', async () => {
    const { USER_ROWS } = await import('../src/data/users');
    const row = USER_ROWS[0];
    for (const k of ['name', 'account', 'dept', 'status', 'policy', 'title', 'devices', 'lastAuth']) {
      expect(k in row, `UserRow 缺少 ${k}`).toBe(true);
    }
  });

  it('NasRow/EndpointRow 满足 Devices.tsx 全部消费字段', async () => {
    const { NAS_ROWS, ENDPOINT_ROWS } = await import('../src/data/devices');
    const nas = NAS_ROWS[0];
    for (const k of ['name', 'type', 'typeLabel', 'ip', 'area', 'status', 'statusLabel', 'statusBadge', 'loadPct', 'loadLabel', 'opLabel']) {
      expect(k in nas, `NasRow 缺少 ${k}`).toBe(true);
    }
    const ep = ENDPOINT_ROWS[0];
    for (const k of ['mac', 'fingerprint', 'userName', 'userSub', 'etype', 'comp', 'compLabel', 'compBadge', 'firstSeen']) {
      expect(k in ep, `EndpointRow 缺少 ${k}`).toBe(true);
    }
  });
});

describe('资源层模块与入口', () => {
  it('全部资源模块可加载(含 audit)', async () => {
    for (const name of ['sessions', 'logs', 'users', 'policies', 'devices', 'dashboard', 'reports', 'settings', 'audit']) {
      const mod = await import(`../src/api/resources/${name}.ts`);
      expect(mod, `resources/${name} 无法加载`).toBeDefined();
    }
  });

  it('config/http/auth 导出入口存在', async () => {
    const { API_BASE, MODE } = await import('../src/api/config');
    expect(typeof API_BASE).toBe('string');
    expect(typeof MODE).toBe('string');
    const { fetchApi } = await import('../src/api/http');
    expect(typeof fetchApi).toBe('function');
    const auth = await import('../src/api/auth');
    for (const fn of ['login', 'logout', 'refresh', 'fetchMe'] as const) {
      expect(typeof auth[fn], `auth.${fn} 缺失`).toBe('function');
    }
  });
});
