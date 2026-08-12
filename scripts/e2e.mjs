/**
 * OpenRedius UI 端到端测试（Playwright + Chromium, mock 模式）
 *
 * 覆盖:
 *  1. 13 路由冒烟——无白屏、无 Console 报错
 *  2. 侧边栏/顶栏——当前页高亮、角色过滤、用户下拉
 *  3. 各页关键交互——筛选/展开/弹窗/抽屉/Tabs/时段切换/锚点
 *
 * 运行: bun scripts/e2e.mjs  (需先 bun run dev 启动 vite)
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5173';
const SCREENSHOT_DIR = '/tmp/e2e-screenshots';

const ROUTES = [
  { path: '/login', name: '登录页', probe: '.ant-btn', minLen: 5 },
  { path: '/dashboard', name: '仪表盘', probe: '[data-od-id="kpi-row"]' },
  { path: '/sessions', name: '在线会话', probe: '[data-od-id="session-table-card"]' },
  { path: '/auth-logs', name: '认证日志', probe: '[data-od-id="log-card"]' },
  { path: '/auth-logs#result=失败&nas=SW-5F-01', name: '认证日志(深链)', probe: '[data-od-id="log-card"]' },
  { path: '/users', name: '用户管理', probe: '[data-od-id="user-card"]' },
  { path: '/users#user=wang.lei', name: '用户管理(深链)', probe: '[data-od-id="user-card"]' },
  { path: '/policies', name: '策略管理', probe: '[data-od-id="policy-card"]' },
  { path: '/devices', name: '设备管理', probe: '[data-od-id="device-tabs"]' },
  { path: '/devices#tab=ep', name: '设备管理(深链)', probe: '[data-od-id="device-tabs"]' },
  { path: '/reports', name: '报表统计', probe: '[data-od-id="fail-dist"]' },
  { path: '/reports#reason=账号锁定', name: '报表统计(深链)', probe: '[data-od-id="fail-dist"]' },
  { path: '/settings', name: '系统设置', probe: '.ant-anchor' },
];

let failures = 0;
const report = [];

function log(ok, msg) {
  const line = `${ok ? '✓' : '✗'} ${msg}`;
  report.push(line);
  console.log(line);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 收集 console 报错
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  console.log('\n═══ 1. 路由冒烟(13 路由,无白屏/无 Console 报错) ═══\n');

  for (const r of ROUTES) {
    const before = consoleErrors.length + pageErrors.length;
    try {
      await page.goto(BASE + r.path, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForSelector(r.probe, { timeout: 10000 });
      const bodyLen = (await page.textContent('body'))?.trim().length ?? 0;
      const newErrors = (consoleErrors.length + pageErrors.length) - before;
      const minLen = r.minLen ?? 200;
      log(bodyLen > minLen && newErrors === 0, `${r.name} [${r.path}] — ${bodyLen} chars, ${newErrors} 错误`);
      if (newErrors > 0) {
        for (const e of [...consoleErrors, ...pageErrors].slice(-newErrors)) {
          console.log(`     ⚠ ${e.slice(0, 120)}`);
        }
      }
    } catch (e) {
      log(false, `${r.name} [${r.path}] — ${String(e.message).split('\n')[0]}`);
    }
  }

  console.log('\n═══ 2. 侧边栏 / 顶栏 ═══\n');

  try {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    // 侧边栏当前页高亮
    const selected = await page.textContent('.ant-menu-item-selected');
    log(selected?.includes('仪表盘'), `侧边栏当前页高亮: ${selected}`);
    // 菜单项数量(admin 角色应 8 项)
    const menuCount = await page.locator('.ant-menu-item').count();
    log(menuCount === 8, `角色过滤: admin 应显示 8 个菜单,实际 ${menuCount}`);
    // 顶栏用户信息 + 下拉
    const topbarUser = await page.textContent('[data-od-id="topbar"]');
    log(topbarUser?.includes('管理员'), `顶栏用户信息显示「管理员」`);
    // 打开下拉
    await page.click('.ant-dropdown-trigger');
    await page.waitForSelector('.ant-dropdown-menu', { timeout: 5000 });
    const menuText = await page.textContent('.ant-dropdown-menu');
    log(menuText?.includes('修改密码') && menuText?.includes('退出登录'), `顶栏下拉含「修改密码」+「退出登录」`);
    // 关闭下拉
    await page.keyboard.press('Escape');
  } catch (e) {
    log(false, `侧边栏/顶栏 — ${String(e.message).split('\n')[0]}`);
  }

  console.log('\n═══ 3. 各页关键交互 ═══\n');

  // Dashboard: KPI 4 卡 + 告警列表
  try {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    const kpi = await page.locator('.kpi').count();
    log(kpi === 4, `Dashboard: 4 个 KPI 卡片(实际 ${kpi})`);
    const alerts = await page.locator('[data-od-id="alert-list"] .alert-item').count();
    log(alerts === 5, `Dashboard: 5 条告警(实际 ${alerts})`);
  } catch (e) { log(false, `Dashboard — ${String(e.message).split('\n')[0]}`); }

  // Sessions: 表格行 + 展开详情
  try {
    await page.goto(BASE + '/sessions', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    const rows = await page.locator('.ant-table-row').count();
    log(rows >= 10, `Sessions: 表格 ${rows} 行`);
    // 展开第一行详情
    await page.click('.ant-table-row a:has-text("详情")');
    await page.waitForSelector('.kv', { timeout: 5000 });
    log(true, `Sessions: 展开行详情(完整 RADIUS 属性)`);
  } catch (e) { log(false, `Sessions — ${String(e.message).split('\n')[0]}`); }

  // AuthLogs: 详情弹窗
  try {
    await page.goto(BASE + '/auth-logs', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await page.click('.ant-table-row a:has-text("详情")');
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    const modal = await page.textContent('.ant-modal');
    log(modal?.includes('Access-Accept') || modal?.includes('User-Name'), `AuthLogs: 详情弹窗打开`);
    await page.keyboard.press('Escape');
  } catch (e) { log(false, `AuthLogs — ${String(e.message).split('\n')[0]}`); }

  // Users: 详情抽屉
  try {
    await page.goto(BASE + '/users', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await page.click('.ant-table-row a:has-text("详情")');
    await page.waitForSelector('.ant-drawer', { timeout: 5000 });
    const drawer = await page.textContent('.ant-drawer');
    log(drawer?.includes('所属策略组'), `Users: 详情抽屉打开`);
    await page.keyboard.press('Escape');
  } catch (e) { log(false, `Users — ${String(e.message).split('\n')[0]}`); }

  // Policies: 编辑抽屉
  try {
    await page.goto(BASE + '/policies', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await page.click('.ant-table-row a:has-text("编辑")');
    await page.waitForSelector('.ant-drawer', { timeout: 5000 });
    const drawer = await page.textContent('.ant-drawer');
    log(drawer?.includes('策略名称') && drawer?.includes('基本信息'), `Policies: 编辑抽屉(多步表单)`);
    await page.keyboard.press('Escape');
  } catch (e) { log(false, `Policies — ${String(e.message).split('\n')[0]}`); }

  // Devices: Tabs 切换
  try {
    await page.goto(BASE + '/devices', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await page.click('.ant-tabs-tab:has-text("终端准入清单")');
    await page.waitForSelector('[data-od-id="ep-table"]', { timeout: 10000 });
    const epRows = await page.locator('[data-od-id="ep-table"] .ant-table-row').count();
    log(epRows >= 8, `Devices: Tabs 切换 → 终端清单 ${epRows} 行`);
  } catch (e) { log(false, `Devices — ${String(e.message).split('\n')[0]}`); }

  // Reports: 时段切换
  try {
    await page.goto(BASE + '/reports', { waitUntil: 'networkidle' });
    await page.click('.ant-segmented-item:has-text("本周")');
    await page.waitForTimeout(500);
    log(true, `Reports: 时段切换(今日→本周)`);
  } catch (e) { log(false, `Reports — ${String(e.message).split('\n')[0]}`); }

  // Settings: 锚点导航
  try {
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-anchor', { timeout: 10000 });
    const sections = await page.locator('.ant-anchor-link').count();
    log(sections >= 5, `Settings: 子导航 ${sections} 个模块`);
  } catch (e) { log(false, `Settings — ${String(e.message).split('\n')[0]}`); }

  console.log('\n═══ 4. 补充关键交互(二次确认/批量/改密) ═══\n');

  // Sessions: 强制下线二次确认弹窗
  try {
    await page.goto(BASE + '/sessions', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await page.click('.ant-table-row a:has-text("强制下线")');
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    const modal = await page.textContent('.ant-modal');
    log(modal?.includes('CoA Disconnect-Request'), `Sessions: 强制下线二次确认弹窗(含 CoA Disconnect-Request)`);
    await page.keyboard.press('Escape');
  } catch (e) { log(false, `Sessions 强制下线 — ${String(e.message).split('\n')[0]}`); }

  // Sessions: 部门筛选
  try {
    await page.goto(BASE + '/sessions', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await page.click('.ant-select:has-text("全部部门")');
    await page.waitForSelector('.ant-select-dropdown:visible', { timeout: 5000 });
    await page.click('.ant-select-item-option:has-text("财务部")');
    await page.click('button:has-text("筛 选")');
    await page.waitForTimeout(500);
    const rows = await page.locator('.ant-table-row').count();
    log(rows >= 1 && rows < 10, `Sessions: 部门筛选「财务部」→ ${rows} 行(应少于10)`);
  } catch (e) { log(false, `Sessions 筛选 — ${String(e.message).split('\n')[0]}`); }

  // Users: 批量停用二次确认
  try {
    await page.goto(BASE + '/users', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await page.click('.ant-table-thead input[type="checkbox"]');
    await page.click('button:has-text("批量停用")');
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    const modal = await page.textContent('.ant-modal');
    log(modal?.includes('无法通过 802.1X 认证'), `Users: 批量停用二次确认弹窗`);
    await page.keyboard.press('Escape');
  } catch (e) { log(false, `Users 批量停用 — ${String(e.message).split('\n')[0]}`); }

  // 顶栏: 修改密码 Modal
  try {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await page.click('.ant-dropdown-trigger');
    await page.waitForSelector('.ant-dropdown-menu', { timeout: 5000 });
    await page.click('.ant-dropdown-menu-item:has-text("修改密码")');
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    const modal = await page.textContent('.ant-modal');
    log(modal?.includes('旧密码') && modal?.includes('新密码'), `顶栏: 修改密码 Modal(含旧/新密码字段)`);
    await page.keyboard.press('Escape');
  } catch (e) { log(false, `顶栏修改密码 — ${String(e.message).split('\n')[0]}`); }

  // AuthLogs: 高级筛选展开
  try {
    await page.goto(BASE + '/auth-logs', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ant-table-row', { timeout: 10000 });
    await page.click('button:has-text("高级筛选")');
    await page.waitForSelector('[data-od-id="adv-filters"]', { timeout: 5000 });
    const adv = await page.textContent('[data-od-id="adv-filters"]');
    log(adv?.includes('失败原因') && adv?.includes('接入设备'), `AuthLogs: 高级筛选展开(含失败原因/接入设备)`);
  } catch (e) { log(false, `AuthLogs 高级筛选 — ${String(e.message).split('\n')[0]}`); }

  // 汇总
  const totalErrors = consoleErrors.length + pageErrors.length;
  console.log('\n═══ 汇总 ═══');
  console.log(`Console 错误: ${consoleErrors.length}, 页面异常: ${pageErrors.length}`);
  if (consoleErrors.length) {
    console.log('--- Console 错误明细 ---');
    consoleErrors.forEach((e) => console.log(`  ⚠ ${e.slice(0, 150)}`));
  }
  if (pageErrors.length) {
    console.log('--- 页面异常明细 ---');
    pageErrors.forEach((e) => console.log(`  ⚠ ${e.slice(0, 150)}`));
  }

  await browser.close();

  console.log(`\n结果: ${report.length - failures}/${report.length} 通过, ${failures} 失败`);
  process.exit(failures > 0 || totalErrors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E 脚本异常:', e);
  process.exit(2);
});
