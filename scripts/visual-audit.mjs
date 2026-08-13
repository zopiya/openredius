import { chromium } from 'playwright';

const BASE = 'http://localhost:5174';
const VIEWPORT = { width: 1920, height: 1080 };

const PAGES = [
  { name: '01-login', url: '/login', wait: 500 },
  { name: '02-dashboard', url: '/dashboard', wait: 1000 },
  { name: '03-sessions', url: '/sessions', wait: 1000 },
  { name: '04-auth-logs', url: '/auth-logs', wait: 1000 },
  { name: '05-users', url: '/users', wait: 1000 },
  { name: '06-policies', url: '/policies', wait: 800 },
  { name: '07-devices', url: '/devices', wait: 1000 },
  { name: '08-devices-ep', url: '/devices#tab=ep', wait: 1000 },
  { name: '09-reports', url: '/reports', wait: 1000 },
  { name: '10-settings', url: '/settings', wait: 800 },
  { name: '11-audit', url: '/audit', wait: 1000 },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'zh-CN',
    deviceScaleFactor: 1,
  });

  const page = await ctx.newPage();

  // Bypass auth: set mock token in localStorage
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => {
    localStorage.setItem('od_token', 'mock-jwt-token');
    localStorage.setItem('od_admin', JSON.stringify({
      username: 'admin',
      display_name: '管理员',
      role: 'admin',
    }));
  });

  for (const p of PAGES) {
    try {
      await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(p.wait ?? 600);
      await page.screenshot({
        path: `/workspaces/openredius/audit-screenshots/${p.name}.png`,
        fullPage: false,
      });
      console.log(`✓ ${p.name} captured`);
    } catch (err) {
      console.error(`✗ ${p.name}: ${err.message}`);
    }
  }

  // Also capture full-page dashboard
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: '/workspaces/openredius/audit-screenshots/02-dashboard-full.png',
    fullPage: true,
  });
  console.log('✓ 02-dashboard-full captured');

  // Capture policy drawer open state
  await page.goto(`${BASE}/policies`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(800);
  const newBtn = page.locator('[data-od-id="new-policy"]');
  if (await newBtn.isVisible()) {
    await newBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: '/workspaces/openredius/audit-screenshots/06-policies-drawer.png',
      fullPage: false,
    });
    console.log('✓ 06-policies-drawer captured');
  }

  // Capture user detail drawer
  await page.goto(`${BASE}/users`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const detailLink = page.locator('text=详情').first();
  if (await detailLink.isVisible()) {
    await detailLink.click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: '/workspaces/openredius/audit-screenshots/05-users-drawer.png',
      fullPage: false,
    });
    console.log('✓ 05-users-drawer captured');
  }

  await browser.close();
  console.log('\nDone. All screenshots saved to audit-screenshots/');
})();
