import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://localhost:5174';
const OUT = '/workspaces/openredius/audit-screenshots/sizes';

const SIZES = [
  { w: 1366, h: 768 },
  { w: 1536, h: 864 },
  { w: 2560, h: 1440 },
];

const PAGES = [
  { name: '01-login', url: '/login', wait: 500 },
  { name: '02-dashboard', url: '/dashboard', wait: 1000 },
  { name: '03-sessions', url: '/sessions', wait: 1000 },
  { name: '05-users', url: '/users', wait: 1000 },
  { name: '06-policies', url: '/policies', wait: 800 },
  { name: '07-devices', url: '/devices', wait: 1000 },
  { name: '09-reports', url: '/reports', wait: 1000 },
  { name: '10-settings', url: '/settings', wait: 800 },
  { name: '11-audit', url: '/audit', wait: 800 },
];

async function captureStates(page, dir) {
  // users detail drawer
  await page.goto(`${BASE}/users`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const detail = page.locator('text=详情').first();
  if (await detail.isVisible()) {
    await detail.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/05-users-drawer.png` });
    await page.keyboard.press('Escape');
  }

  // policies wizard drawer
  await page.goto(`${BASE}/policies`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(800);
  const newBtn = page.locator('[data-od-id="new-policy"]');
  if (await newBtn.isVisible()) {
    await newBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/06-policies-drawer.png` });
    await page.keyboard.press('Escape');
  }

  // devices endpoint tab via click (hash deep-link is broken, see audit)
  await page.goto(`${BASE}/devices`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(800);
  const epTab = page.locator('text=终端准入清单').first();
  if (await epTab.isVisible()) {
    await epTab.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/08-devices-ep.png` });
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const { w, h } of SIZES) {
    const dir = `${OUT}/${w}x${h}`;
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      locale: 'zh-CN',
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    for (const p of PAGES) {
      try {
        await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(p.wait);
        await page.screenshot({ path: `${dir}/${p.name}.png` });
        console.log(`✓ ${w}x${h} ${p.name}`);
        if (p.url === '/login') {
          await page.evaluate(() => {
            localStorage.setItem('od_token', 'mock-jwt-token');
            localStorage.setItem('od_admin', JSON.stringify({
              username: 'admin',
              display_name: '管理员',
              role: 'admin',
            }));
          });
        }
      } catch (err) {
        console.error(`✗ ${w}x${h} ${p.name}: ${err.message}`);
      }
    }

    await captureStates(page, dir);
    console.log(`✓ ${w}x${h} state captures`);
    await ctx.close();
  }
  await browser.close();
  console.log('\nDone. Saved to audit-screenshots/sizes/');
})();
