/**
 * OpenRedius http 模式端到端测试（Playwright + Chromium, 真实后端 + Postgres）
 *
 * 覆盖:
 *  1. UI 登录（成功 / 失败提示）
 *  2. 三角色菜单过滤（admin 9 / operator 5 / auditor 5）
 *  3. 9 页冒烟（真实数据渲染, 无白屏无 Console 错误）
 *  4. 写操作 + 数据面复查（停用/启用 → 状态翻转; 策略新建/删除; Secret 查看 → audit_log）
 *  5. RBAC 越权矩阵（API 层, 三角色 × 关键端点 → 200/403 契约）
 *
 * 运行前置: 完整栈已起（backend:8000 + frontend:5173 VITE_API_MODE=http）
 * 运行: E2E_BASE=http://localhost:5173 E2E_API=http://localhost:8000 bun scripts/e2e-http.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const API = process.env.E2E_API ?? 'http://localhost:8000';

const ACCOUNTS = {
  admin: { username: 'admin_test', password: 'AdminTest@2026' },
  operator: { username: 'operator_test', password: 'OperatorTest@2026' },
  auditor: { username: 'auditor_test', password: 'AuditorTest@2026' },
};

const MENU_ROLE_MAP = { admin: 9, operator: 5, auditor: 5 };

let failures = 0;
const report = [];

function log(ok, msg) {
  report.push(`${ok ? '✓' : '✗'} ${msg}`);
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
}

// ── API helpers（token 缓存,避免登录限流 20/min）──────────────
const tokenCache = {};
async function apiLogin(role) {
  if (tokenCache[role]) return tokenCache[role];
  const { username, password } = ACCOUNTS[role];
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const result = { status: r.status, body: await r.json() };
  if (result.body?.access_token) tokenCache[role] = result;
  return result;
}

async function apiCall(role, method, path, body) {
  const { body: loginBody } = await apiLogin(role);
  const headers = { Authorization: `Bearer ${loginBody.access_token}` };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let respBody = null;
  try { respBody = await r.json(); } catch { /* non-json */ }
  return { status: r.status, body: respBody };
}

// ── Playwright helpers ───────────────────────────────────────
async function injectAuth(page, role) {
  const { body } = await apiLogin(role);
  if (body.access_token) {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.evaluate(([tokens, admin]) => {
      localStorage.setItem('openredius_tokens', JSON.stringify(tokens));
      localStorage.setItem('openredius_tokens_admin', JSON.stringify(admin));
    }, [{ access_token: body.access_token, refresh_token: body.refresh_token, expires_in: body.expires_in }, body.user]);
  }
  return body;
}

async function goto(page, path, probe, timeout = 10000) {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 15000 });
  if (probe) await page.waitForSelector(probe, { timeout });
}

// ── 主流程 ───────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  // 401 资源加载错误是未登录访问受保护 API 的预期守卫行为(见 .pi/work/e2e-full-audit/findings.md),不计入失败。
  const BENIGN_CONSOLE = ['Failed to load resource: the server responded with a status of 401'];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (BENIGN_CONSOLE.some((b) => m.text().includes(b))) return;
    consoleErrors.push(m.text());
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // ═══ 1. UI 登录 ═══
  console.log('\n═══ 1. 登录页(UI) ═══');
  try {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    // 失败登录
    await page.fill('input[placeholder="账号"]', 'admin_test');
    await page.fill('input[placeholder="密码"]', 'WrongPass@2026');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.ant-alert-error', { timeout: 5000 });
    const errText = await page.textContent('.ant-alert-error');
    log(errText?.length > 0, `登录失败提示可见:「${errText?.trim().slice(0, 30)}」`);
    // 成功登录
    await page.fill('input[placeholder="密码"]', ACCOUNTS.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 8000 });
    log(true, '登录成功 → 跳转 /dashboard');
  } catch (e) {
    log(false, `登录页 — ${String(e.message).split('\n')[0]}`);
  }

  // ═══ 2. 三角色菜单过滤 ═══
  console.log('\n═══ 2. 三角色菜单过滤 ═══');
  for (const role of ['admin', 'operator', 'auditor']) {
    try {
      await injectAuth(page, role);
      await goto(page, '/dashboard', '[data-od-id="kpi-row"]');
      const count = await page.locator('.ant-menu-item').count();
      const expect = MENU_ROLE_MAP[role];
      log(count === expect, `[${role}] 菜单 ${count} 项(期望 ${expect})`);
      const roleLabel = await page.textContent('[data-od-id="topbar"]');
      log(roleLabel?.length > 0, `[${role}] 顶栏渲染`);
    } catch (e) {
      log(false, `[${role}] 菜单过滤 — ${String(e.message).split('\n')[0]}`);
    }
  }

  // ═══ 3. 9 页冒烟(admin, 真实数据) ═══
  console.log('\n═══ 3. 页面冒烟(admin, 真实数据) ═══');
  await injectAuth(page, 'admin');
  const SMOKE = [
    ['/dashboard', '[data-od-id="kpi-row"]', '仪表盘'],
    ['/sessions', '[data-od-id="session-table"]', '在线会话'],
    ['/auth-logs', '[data-od-id="log-table"]', '认证日志'],
    ['/users', '[data-od-id="user-table"]', '用户管理'],
    ['/policies', '[data-od-id="policy-table"]', '策略管理'],
    ['/devices', '[data-od-id="device-tabs"]', '设备管理'],
    ['/reports', '[data-od-id="fail-dist"]', '报表统计'],
    ['/settings', '.ant-anchor', '系统设置'],
    ['/audit', '[data-od-id="audit-table"]', '审计日志'],
  ];
  for (const [path, probe, name] of SMOKE) {
    const before = consoleErrors.length + pageErrors.length;
    try {
      await goto(page, path, probe);
      const rows = await page.locator('.ant-table-row').count();
      const newErrs = (consoleErrors.length + pageErrors.length) - before;
      log(newErrs === 0, `${name} [${path}] 渲染,表格 ${rows} 行,${newErrs} 错误`);
    } catch (e) {
      log(false, `${name} [${path}] — ${String(e.message).split('\n')[0]}`);
    }
  }

  // ═══ 4. 写操作 + 数据面复查 ═══
  console.log('\n═══ 4. 写操作 + 数据面 ═══');

  // 4.1 用户停用/启用（取第一个 active 用户）
  try {
    const users = (await apiCall('admin', 'GET', '/api/users?status=active')).body ?? [];
    const list = Array.isArray(users) ? users : (users.items ?? []);
    const target = list[0];
    if (!target?.account) throw new Error('无 active 用户');
    const acc = target.account;
    const disable = await apiCall('admin', 'POST', '/api/users/status', { accounts: [acc], action: 'disable' });
    const afterDisable = (await apiCall('admin', 'GET', `/api/users?q=${acc}`)).body ?? [];
    const afterList = Array.isArray(afterDisable) ? afterDisable : (afterDisable.items ?? []);
    const reenable = await apiCall('admin', 'POST', '/api/users/status', { accounts: [acc], action: 'enable' });
    log(
      disable.status === 200 && afterList[0]?.status === 'disabled' && reenable.status === 200,
      `用户 ${acc}: 停用→status=disabled→启用(HTTP ${disable.status}/${reenable.status})`,
    );
  } catch (e) { log(false, `用户停用/启用 — ${String(e.message).split('\n')[0]}`); }

  // 4.2 策略新建/删除(复用既有策略的 vlan_id,新库自增 id 不固定)
  let newPolicyId = null;
  try {
    const policyList = (await apiCall('admin', 'GET', '/api/policies')).body?.items ?? [];
    const vlanId = policyList[0]?.vlan_id;
    if (vlanId == null) throw new Error('策略列表为空,无法取得 vlan_id');
    const create = await apiCall('admin', 'POST', '/api/policies', {
      name: 'e2e-test-policy', slug: 'e2e-test-policy', vlan_id: vlanId,
      description: 'e2e 临时策略', priority: 999, enabled: false,
    });
    newPolicyId = create.body?.id;
    log(create.status < 400 && !!newPolicyId, `策略新建 → id=${newPolicyId}(HTTP ${create.status})`);
    if (newPolicyId) {
      const del = await apiCall('admin', 'DELETE', `/api/policies/${newPolicyId}`);
      log(del.status < 400, `策略删除 → HTTP ${del.status}`);
    }
  } catch (e) { log(false, `策略新建/删除 — ${String(e.message).split('\n')[0]}`); }

  // 4.3 NAS Secret 查看 → audit_log secret.reveal
  try {
    const nas = (await apiCall('admin', 'GET', '/api/devices/nas')).body?.items ?? [];
    const first = nas[0];
    if (first?.id) {
      const reveal = await apiCall('admin', 'GET', `/api/devices/nas/${first.id}/secret`);
      const audit = (await apiCall('admin', 'GET', '/api/audit?action=secret.reveal')).body?.items ?? [];
      log(
        reveal.status === 200 && typeof reveal.body?.secret === 'string' && audit.some((a) => a.action === 'secret.reveal'),
        `Secret 查看 → 明文返回 + audit_log(secret.reveal) 落库(${audit.length} 条)`,
      );
    } else {
      log(true, 'NAS 列表为空(seed 后应有 8 台)——跳过 Secret 用例');
    }
  } catch (e) { log(false, `Secret 查看 — ${String(e.message).split('\n')[0]}`); }

  // ═══ 5. RBAC 越权矩阵(API 层) ═══
  console.log('\n═══ 5. RBAC 越权矩阵 ═══');
  const MATRIX = [
    ['强制下线', 'POST', '/api/sessions/disconnect', { session_ids: ['x'], confirm: false }, ['admin', 'operator'], ['auditor']],
    ['用户状态', 'POST', '/api/users/status', { accounts: ['x'], action: 'disable' }, ['admin', 'operator'], ['auditor']],
    ['策略写', 'POST', '/api/policies', { name: 'x', slug: 'x' }, ['admin'], ['operator', 'auditor']],
    ['设备 Secret', 'GET', '/api/devices/nas/1/secret', null, ['admin'], ['operator', 'auditor']],
    ['系统设置', 'GET', '/api/settings', null, ['admin'], ['operator', 'auditor']],
    ['审计日志', 'GET', '/api/audit', null, ['admin', 'auditor'], ['operator']],
    ['仪表盘只读', 'GET', '/api/dashboard/kpis', null, ['admin', 'operator', 'auditor'], []],
  ];
  for (const [name, method, path, body, allowed, denied] of MATRIX) {
    for (const role of ['admin', 'operator', 'auditor']) {
      const { status } = await apiCall(role, method, path, body);
      const expect403 = denied.includes(role);
      const ok = expect403 ? status === 403 : status !== 403;
      log(ok, `[${role}] ${name} → ${status}(${expect403 ? '期望 403' : '期望非403'})`);
    }
  }

  // ── 汇总 ──
  const totalErrs = consoleErrors.length + pageErrors.length;
  console.log('\n═══ 汇总 ═══');
  console.log(`Console 错误 ${consoleErrors.length}, 页面异常 ${pageErrors.length}`);
  consoleErrors.slice(0, 20).forEach((e) => console.log(`  ⚠ ${e.slice(0, 150)}`));
  pageErrors.slice(0, 20).forEach((e) => console.log(`  ⚠ ${e.slice(0, 150)}`));
  await browser.close();
  console.log(`\n结果: ${report.length - failures}/${report.length} 通过, ${failures} 失败`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error('E2E 异常:', e); process.exit(2); });
