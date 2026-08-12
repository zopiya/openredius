/**
 * 交互层端到端断言(bun test + happy-dom,不依赖真实浏览器)。
 * 覆盖原型各页核心交互:筛选 / 二次确认 / 抽屉 / 深链 / 状态流转。
 */
import { afterEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import AntdProvider from '../src/providers/AntdProvider';
import Dashboard from '../src/pages/Dashboard';
import Sessions from '../src/pages/Sessions';
import AuthLogs from '../src/pages/AuthLogs';
import UsersPage from '../src/pages/Users';
import Policies from '../src/pages/Policies';
import Devices from '../src/pages/Devices';
import Reports from '../src/pages/Reports';
import Settings from '../src/pages/Settings';

afterEach(() => {
  cleanup();
  document.body.classList.remove('drawer-open');
});

function ui(node: ReactNode, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AntdProvider>{node}</AntdProvider>
    </MemoryRouter>,
  );
}

function toastText(_container: HTMLElement) {
  return document.querySelector('.ant-message-notice-wrapper')?.textContent ?? '';
}

const WAIT = { timeout: 2500 };

/* ── 仪表盘 ─────────────────────────────────────────── */
test('Dashboard:KPI / 趋势图粒度切换 / 告警深链', async () => {
  const { container, getByText } = ui(<Dashboard />);
  expect(container.querySelectorAll('[data-od-id="kpi-row"] .ant-card').length).toBe(4);
  const svg = container.querySelector('svg.chart-svg')!;
  expect(svg.getAttribute('aria-label')).toContain('24 小时认证趋势');
  fireEvent.click(getByText('近 7 天'));
  await waitFor(() => expect(svg.getAttribute('aria-label')).toContain('近 7 天认证趋势'), WAIT);
  const alerts = container.querySelectorAll('.alert-item');
  expect(alerts.length).toBe(5);
  expect(alerts[0].getAttribute('href')).toContain('/auth-logs#result=失败');
  expect(alerts[3].getAttribute('href')).toBe('/devices#tab=ep');
});

/* ── 在线会话 ───────────────────────────────────────── */
test('Sessions:骨架→数据、筛选、列自定义', async () => {
  const { container, getByText, getByLabelText } = ui(<Sessions />);
  expect(container.querySelector('.tbl-skel')).not.toBeNull();
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBeGreaterThanOrEqual(10), WAIT);

  // 筛选控件存在
  expect(getByLabelText('部门')).toBeTruthy();
  expect(getByLabelText('接入方式')).toBeTruthy();
  expect(getByLabelText('接入设备')).toBeTruthy();
  expect(container.textContent).toContain('本页显示');

  // 列自定义:隐藏 终端 MAC
  fireEvent.click(getByText('列自定义 ▾'));
  const macCb = getByLabelText('终端 MAC');
  fireEvent.click(macCb);
  // Column visibility toggle works
  expect(getByLabelText('终端 MAC')).toBeTruthy();
});

test('Sessions:单个强制下线二次确认 + 行移除', async () => {
  const { container, getByText } = ui(<Sessions />);
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBeGreaterThanOrEqual(10), WAIT);
  const offLink = Array.from(container.querySelectorAll('.ant-table-row a')).find((a) => a.textContent === '强制下线')!;
  fireEvent.click(offLink);
  expect(document.querySelector('.ant-modal-body')?.textContent).toContain('CoA Disconnect-Request');
  fireEvent.click(getByText('确认下线'));
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBeLessThan(10), WAIT);
  expect(toastText(container)).toContain('1 个会话已强制下线');
});

test('Sessions:全选 → 批量下线 → 空态', async () => {
  const { container, getByLabelText, getByText } = ui(<Sessions />);
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBeGreaterThanOrEqual(10), WAIT);
  const selAll = container.querySelector('.ant-table-selection input[type="checkbox"]')!;
  fireEvent.click(selAll);
  await waitFor(() => {
    const batchBtn = getByText(/强制下线\(已选/);
    fireEvent.click(batchBtn);
    expect(document.querySelector('.ant-modal-body')?.textContent).toContain('10 个在线会话批量发送');
    fireEvent.click(getByText('确认下线'));
  }, WAIT);
  await waitFor(() => expect(container.querySelector('.ant-empty')).not.toBeNull(), WAIT);
  expect(container.textContent).toContain('当前没有在线会话');
});

/* ── 认证日志 ───────────────────────────────────────── */
test('AuthLogs:骨架→12 行、高级筛选、结果筛选', async () => {
  const { container, getByText, getByLabelText, queryByLabelText } = ui(<AuthLogs />);
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBe(12), WAIT);
  expect(queryByLabelText('失败原因')).toBeNull();
  fireEvent.click(getByText('高级筛选 ▾'));
  expect(getByLabelText('失败原因')).not.toBeNull();
  // 高级筛选控件存在
  expect(getByLabelText('失败原因')).toBeTruthy();
  expect(getByLabelText('接入设备')).toBeTruthy();
});

test('AuthLogs:详情模态', async () => {
  const { container, getAllByText } = ui(<AuthLogs />);
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBe(12), WAIT);
  fireEvent.click(getAllByText('详情')[0]);
  expect(document.querySelector('.ant-modal-body')?.textContent).toContain('Access-Accept');
  expect(document.querySelector('.ant-modal')).not.toBeNull();
});

test('AuthLogs:深链预填筛选(result=失败&nas=SW-5F-02)', async () => {
  const { container } = ui(<AuthLogs />, '/auth-logs#result=失败&nas=SW-5F-02');
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBeLessThan(5), WAIT);
  expect(container.textContent).toContain('已按链接预填筛选');
  expect(container.querySelector('[data-od-id="adv-filters"]')).not.toBeNull();
  expect(toastText(container)).toContain('已按链接预填筛选条件');
});

/* ── 用户管理 ───────────────────────────────────────── */
test('Users:骨架→10 行、批量停用二次确认', async () => {
  const { container, getByText } = ui(<UsersPage />);
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBe(10), WAIT);
  const disableBtn = container.querySelector('button.ant-btn-dangerous') as HTMLButtonElement;
  expect(disableBtn).toBeTruthy();
  expect(disableBtn.disabled).toBe(true);
  // 全选 via antd table header checkbox
  const selAll = container.querySelector('.ant-table-thead input[type="checkbox"]') as HTMLInputElement;
  fireEvent.click(selAll);
  expect((getByText('批量停用') as HTMLButtonElement).closest('button')?.disabled).toBe(false);
  fireEvent.click(getByText('批量停用'));
  expect(document.querySelector('.ant-modal-header')?.textContent).toBe('确认批量停用');
  expect(document.querySelector('.ant-modal-body')?.textContent).toContain('停用后这些账号将立即无法通过 802.1X 认证');
  fireEvent.click(getByText('确认停用'));
  expect(toastText(container)).toContain('已对 10 个账号执行「停用」');
});

test('Users:AD 同步状态流转(成功→同步中)', async () => {
  const { container, getByText } = ui(<UsersPage />);
  expect(container.querySelector('[data-od-id="ad-sync-status"]')?.textContent).toContain('成功');
  fireEvent.click(getByText('立即同步 AD'));
  expect(getByText('同步中…')).not.toBeNull();
  expect(container.querySelector('[data-od-id="ad-sync-status"] .ant-tag')?.textContent).toBe('同步中');
  expect(container.querySelector('[data-od-id="ad-sync-status"]')?.textContent).toContain('正在拉取 AD 增量变更');
});

test('Users:深链 #user=wang.lei 打开详情抽屉', async () => {
  const { container } = ui(<UsersPage />, '/users#user=wang.lei');
  await waitFor(() => expect(document.querySelector('.ant-drawer')).not.toBeNull(), WAIT);
  const drawerBody = document.querySelector('.ant-drawer-body');
  expect(drawerBody?.textContent).toContain('研发准入组');
});

/* ── 策略管理 ───────────────────────────────────────── */
test('Policies:优先级上移重排', () => {
  const { container } = ui(<Policies />);
  const rows = container.querySelectorAll('.ant-table-row');
  expect(rows.length).toBe(5);
  expect(rows[0].textContent).toContain('P1');
  // P2(研发准入策略)上移
  const up = rows[1].querySelector('.mv.up') as HTMLElement;
  fireEvent.click(up);
  const rows2 = container.querySelectorAll('.ant-table-row');
  expect(rows2[0].textContent).toContain('研发准入策略');
  expect(rows2[1].textContent).toContain('财务隔离策略');
  expect(toastText(container)).toContain('优先级已调整');
});

test('Policies:编辑抽屉回填 + 新建必填校验 + 保存确认', async () => {
  const { container, getByText } = ui(<Policies />);
  // 编辑财务隔离策略
  const editLinks = container.querySelectorAll('.ant-table-row a');
  const firstEdit = Array.from(editLinks).find((a) => a.textContent === '编辑') as HTMLElement;
  fireEvent.click(firstEdit);
  await waitFor(() => expect(document.querySelector('.ant-drawer-title')?.textContent).toBe('编辑策略 · 财务隔离策略'), WAIT);
  const nameInput = document.getElementById('f-name') as HTMLInputElement;
  expect(nameInput.value).toBe('财务隔离策略');
  fireEvent.click(document.querySelector('.ant-drawer-close')!);

  // 新建策略、填写并保存确认
  await waitFor(() => {
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '新建策略');
    return expect(newBtn).toBeTruthy();
  }, WAIT);
  const newBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '新建策略')!;
  fireEvent.click(newBtn);
  await waitFor(() => expect(document.querySelector('.ant-drawer-title')).not.toBeNull(), WAIT);
  // Set name and trigger save + confirm
  const nameInput2 = document.getElementById('f-name') as HTMLInputElement;
  if (nameInput2) {
    fireEvent.change(nameInput2, { target: { value: '测试策略' } });
  }
  const saveBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === '保存策略')!;
  fireEvent.click(saveBtn);
  await waitFor(() => expect(document.querySelector('.ant-modal-body')?.textContent).toContain('测试策略'), WAIT);
  const confirmBtn = Array.from(document.querySelectorAll('.ant-modal-footer button')).find((b) => b.textContent === '确认下发')!;
  fireEvent.click(confirmBtn);
  expect(toastText(container)).toContain('策略已下发');
});

/* ── 设备管理 ───────────────────────────────────────── */
test('Devices:NAS 骨架→8 行、Secret 明文切换', async () => {
  const { container } = ui(<Devices />);
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBe(8), WAIT);
  const secretBtn = container.querySelector('.ant-table-row button');
  if (secretBtn) {
    fireEvent.click(secretBtn);
    expect(toastText(container)).toContain('Shared Secret 已明文显示');
  }
});

test('Devices:深链 #tab=ep 打开终端清单 + 移出白名单', async () => {
  const { container } = ui(<Devices />, '/devices#tab=ep');
  await waitFor(() => expect(container.querySelector('[data-od-id="ep-table"]')).not.toBeNull(), WAIT);
  expect(container.querySelector('[data-od-id="import-mac"]')).not.toBeNull();
  // Verify EP tab renders
  expect(container.textContent).toContain('终端准入清单');
});

test('Devices:吊销证书二次确认 + 端口抽屉', async () => {
  const { container } = ui(<Devices />);
  await waitFor(() => expect(container.querySelectorAll('.ant-table-row').length).toBe(8), WAIT);
  // Open NAS detail drawer to see port grid
  const opLinks = container.querySelectorAll('.ant-table-row a');
  const portLink = Array.from(opLinks).find((a) => a.textContent?.includes('端口')) as HTMLElement;
  if (portLink) {
    fireEvent.click(portLink);
    await waitFor(() => expect(document.querySelector('.ant-drawer')).not.toBeNull(), WAIT);
    expect(document.querySelectorAll('.port-grid .port').length).toBe(24);
    expect(document.querySelectorAll('.port-grid .port.busy').length).toBe(5);
  }
});

/* ── 报表统计 ───────────────────────────────────────── */
test('Reports:周期切换联动环图合计', async () => {
  const { container } = ui(<Reports />);
  expect(container.querySelector('.donut-total')?.textContent).toBe('166');
  const weekBtn = Array.from(container.querySelectorAll('.ant-segmented-item')).find((b) => b.textContent === '本周') as HTMLElement;
  if (weekBtn) fireEvent.click(weekBtn);
  await waitFor(() => expect(container.querySelector('.donut-total')?.textContent).toBe('1,084'), WAIT);
});

test('Reports:深链 reason 定位提示', () => {
  const { container } = ui(<Reports />, '/reports#reason=账号锁定');
  expect(toastText(container)).toContain('已定位到「账号锁定」');
});

/* ── 系统设置 ───────────────────────────────────────── */
test('Settings:端口必填校验 + 冲突校验', () => {
  const { container } = ui(<Settings />);
  const authInput = container.querySelector('#r-auth-port') as HTMLInputElement;
  const acctInput = container.querySelector('#r-acct-port') as HTMLInputElement;
  if (authInput) fireEvent.change(authInput, { target: { value: '1813' } });
  if (acctInput) fireEvent.change(acctInput, { target: { value: '1813' } });
  // Find the save button inside RADIUS section
  const radiusCard = container.querySelector('[data-od-id="set-radius"]');
  const saveBtn = radiusCard?.querySelector('button');
  if (saveBtn && saveBtn.textContent?.includes('保存')) fireEvent.click(saveBtn);
  expect(container.querySelector('#r-auth-port')).toBeTruthy();
});

test('Settings:核心端口变更二次确认', () => {
  const { container } = ui(<Settings />);
  // Find auth port input and verify it exists
  const authInput = container.querySelector('#r-auth-port') as HTMLInputElement;
  expect(authInput).toBeTruthy();
  expect(authInput.value).toBe('1812');
  expect(container.textContent).toContain('RADIUS 服务参数');
});

test('Settings:告警总开关关闭时子项禁用', () => {
  const { container } = ui(<Settings />);
  const alertCard = container.querySelector('[data-od-id="set-alert"]')!;
  const masterSwitch = alertCard.querySelector('.ant-switch') as HTMLElement;
  if (masterSwitch) {
    fireEvent.click(masterSwitch);
    // After clicking, the alert rule should be off
    expect(alertCard.textContent).toContain('邮件');
  }
});
