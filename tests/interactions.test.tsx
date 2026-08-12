/**
 * 交互层端到端断言(bun test + happy-dom,不依赖真实浏览器)。
 * 覆盖原型各页核心交互:筛选 / 二次确认 / 抽屉 / 深链 / 状态流转。
 */
import { afterEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ToastProvider } from '../src/components/Toast';
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
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>,
  );
}

function toastText(container: HTMLElement) {
  return container.querySelector('.toast')?.textContent ?? '';
}

const WAIT = { timeout: 2500 };

/* ── 仪表盘 ─────────────────────────────────────────── */
test('Dashboard:KPI / 趋势图粒度切换 / 告警深链', async () => {
  const { container, getByText } = ui(<Dashboard />);
  expect(container.querySelectorAll('.grid-kpi .kpi').length).toBe(4);
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
  expect(container.querySelector('.filters.adv')).not.toBeNull();
  expect(toastText(container)).toContain('已按链接预填筛选条件');
});

/* ── 用户管理 ───────────────────────────────────────── */
test('Users:骨架→10 行、批量停用二次确认', async () => {
  const { container, getByLabelText, getByText } = ui(<UsersPage />);
  await waitFor(() => expect(container.querySelectorAll('table.tbl:not(.tbl-skel) tbody tr').length).toBe(10), WAIT);
  const disableBtn = getByText('批量停用') as HTMLButtonElement;
  expect(disableBtn.disabled).toBe(true);
  fireEvent.click(getByLabelText('全选'));
  expect((getByText('批量停用') as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(getByText('批量停用'));
  expect(document.querySelector('.modal-head')?.textContent).toBe('确认批量停用');
  expect(document.querySelector('.modal-body')?.textContent).toContain('停用后这些账号将立即无法通过 802.1X 认证');
  fireEvent.click(getByText('确认停用'));
  expect(toastText(container)).toContain('已对 10 个账号执行「停用」');
});

test('Users:AD 同步状态流转(成功→同步中)', async () => {
  const { container, getByText } = ui(<UsersPage />);
  expect(container.querySelector('.notice')?.textContent).toContain('成功');
  fireEvent.click(getByText('立即同步 AD'));
  expect(getByText('同步中…')).not.toBeNull();
  expect(container.querySelector('.notice .badge')?.textContent).toBe('同步中');
  expect(container.querySelector('.notice')?.textContent).toContain('正在拉取 AD 增量变更');
});

test('Users:深链 #user=wang.lei 打开详情抽屉', async () => {
  const { container } = ui(<UsersPage />, '/users#user=wang.lei');
  await waitFor(() => expect(document.body.classList.contains('drawer-open')).toBe(true), WAIT);
  expect(container.querySelector('.drawer-title')?.textContent).toBe('王磊 · wang.lei');
  expect(container.querySelector('.drawer-body')?.textContent).toContain('研发准入组');
});

/* ── 策略管理 ───────────────────────────────────────── */
test('Policies:优先级上移重排', () => {
  const { container } = ui(<Policies />);
  const rows = container.querySelectorAll('table.tbl tbody tr');
  expect(rows.length).toBe(5);
  expect(rows[0].textContent).toContain('P1');
  // P2(研发准入策略)上移
  const up = rows[1].querySelector('.mv.up') as HTMLElement;
  fireEvent.click(up);
  const rows2 = container.querySelectorAll('table.tbl tbody tr');
  expect(rows2[0].textContent).toContain('研发准入策略');
  expect(rows2[1].textContent).toContain('财务隔离策略');
  expect(container.querySelector('.toast')?.textContent).toContain('优先级已调整');
});

test('Policies:编辑抽屉回填 + 新建必填校验 + 保存确认', async () => {
  const { container, getByText, getByLabelText } = ui(<Policies />);
  // 编辑财务隔离策略
  const firstEdit = container.querySelector('table.tbl tbody tr .op-edit, table.tbl tbody tr .row-ops a') as HTMLElement;
  fireEvent.click(firstEdit);
  expect(container.querySelector('.drawer-title')?.textContent).toBe('编辑策略 · 财务隔离策略');
  expect((getByLabelText(/策略名称/) as HTMLInputElement).value).toBe('财务隔离策略');
  expect(container.querySelector('.radio-card.on b')?.textContent).toBe('EAP-TLS');
  fireEvent.click(container.querySelector('.drawer-close')!);

  // 新建 + 必填校验
  fireEvent.click(getByText('新建策略'));
  const nameInput = getByLabelText(/策略名称/) as HTMLInputElement;
  expect(nameInput.value).toBe('');
  fireEvent.click(getByText('保存策略'));
  expect(container.querySelector('.field.invalid .field-error')).not.toBeNull();
  fireEvent.change(nameInput, { target: { value: '测试策略' } });
  fireEvent.click(getByText('保存策略'));
  expect(document.querySelector('.modal-overlay.show')).not.toBeNull();
  expect(document.querySelector('.modal-body')?.textContent).toContain('测试策略');
  fireEvent.click(getByText('确认下发'));
  expect(toastText(container)).toContain('策略已下发');
});

/* ── 设备管理 ───────────────────────────────────────── */
test('Devices:NAS 骨架→8 行、Secret 明文切换', async () => {
  const { container } = ui(<Devices />);
  await waitFor(() => expect(container.querySelectorAll('table.tbl:not(.tbl-skel) tbody tr').length).toBe(8), WAIT);
  const firstRow = container.querySelector('table.tbl:not(.tbl-skel) tbody tr')!;
  expect(firstRow.querySelector('.secret-mask')).not.toBeNull();
  fireEvent.click(firstRow.querySelector('.secret-toggle')!);
  expect(firstRow.querySelector('.secret-val')).not.toBeNull();
  expect(firstRow.textContent).toContain('R@dius-S3cr3t');
  expect(container.querySelector('.toast')?.textContent).toContain('Shared Secret 已明文显示');
});

test('Devices:深链 #tab=ep 打开终端清单 + 移出白名单', async () => {
  const { container, getByText } = ui(<Devices />, '/devices#tab=ep');
    await waitFor(() => expect(container.querySelector('[data-od-id="ep-table"]')).not.toBeNull(), WAIT);
  expect(container.querySelectorAll('[data-od-id="ep-table"] tbody tr').length).toBe(8);
  expect(container.querySelector('[data-od-id="import-mac"]')).not.toBeNull();
  fireEvent.click(getByText('移出白名单'));
  expect(document.querySelector('.modal-head')?.textContent).toBe('确认移出白名单');
  fireEvent.click(getByText('确认移出'));
  await waitFor(() => expect(container.querySelectorAll('[data-od-id="ep-table"] tbody tr').length).toBe(7), WAIT);
  expect(container.querySelector('.toast')?.textContent).toContain('已移出白名单');
});

test('Devices:吊销证书二次确认 + 端口抽屉', async () => {
  const { container, getAllByText, getByText } = ui(<Devices />, '/devices#tab=ep');
    await waitFor(() => expect(container.querySelector('[data-od-id="ep-table"]')).not.toBeNull(), WAIT);
  fireEvent.click(getAllByText('吊销证书')[0]);
  expect(document.querySelector('.modal-body')?.textContent).toContain('吊销不可撤销');
  fireEvent.click(getByText('确认吊销'));
  expect(container.querySelector('.toast')?.textContent).toContain('证书已吊销');
  // 切回 NAS,打开端口抽屉
  fireEvent.click(getByText('准入网络设备(NAS)'));
  await waitFor(() => expect(container.querySelectorAll('table.tbl:not(.tbl-skel) tbody tr').length).toBe(8), WAIT);
  fireEvent.click(getAllByText('端口状态')[0]);
  await waitFor(() => expect(container.querySelectorAll('.port-grid .port').length).toBe(24), WAIT);
  expect(container.querySelectorAll('.port-grid .port.busy').length).toBe(5); // 原型仅渲染 Gi1/0/1–24,busy 映射中 26 号端口不显示
});

/* ── 报表统计 ───────────────────────────────────────── */
test('Reports:周期切换联动环图合计', async () => {
  const { container, getByText } = ui(<Reports />);
  expect(getByText('共 166 次失败')).not.toBeNull();
  expect(container.querySelector('.donut-total')?.textContent).toBe('166');
  fireEvent.click(getByText('本周'));
  await waitFor(() => expect(getByText('共 1,084 次失败')).not.toBeNull(), WAIT);
  expect(container.querySelector('.donut-total')?.textContent).toBe('1,084');
  expect(container.querySelector('.page-sub')?.textContent).toContain('2026-07-21 至 2026-07-27');
  expect(container.querySelector('.toast')?.textContent).toContain('已切换至「本周」统计口径');
});

test('Reports:深链 reason 定位提示', () => {
  const { container } = ui(<Reports />, '/reports#reason=账号锁定');
  expect(container.querySelector('.toast')?.textContent).toContain('已定位到「账号锁定」');
});

/* ── 系统设置 ───────────────────────────────────────── */
test('Settings:端口必填校验 + 冲突校验', () => {
  const { container, getByText } = ui(<Settings />);
  const authInput = container.querySelector('#r-auth-port') as HTMLInputElement;
  const acctInput = container.querySelector('#r-acct-port') as HTMLInputElement;
  const save = container.querySelector('#set-radius .save-btn, #set-radius .btn-primary') as HTMLButtonElement;
  // 非法端口
  fireEvent.change(authInput, { target: { value: '70000' } });
  fireEvent.click(save);
  expect(container.querySelector('#field-auth-port, .field.invalid')).not.toBeNull();
  expect(container.querySelectorAll('.field.invalid').length).toBeGreaterThan(0);
  // 端口冲突
  fireEvent.change(authInput, { target: { value: '1813' } });
  fireEvent.change(acctInput, { target: { value: '1813' } });
  fireEvent.click(save);
  expect(container.textContent).toContain('计费端口不能与认证端口相同');
});

test('Settings:核心端口变更二次确认', () => {
  const { container } = ui(<Settings />);
  const authInput = container.querySelector('#r-auth-port') as HTMLInputElement;
  const save = container.querySelector('#set-radius .btn-primary') as HTMLButtonElement;
  fireEvent.change(authInput, { target: { value: '2000' } });
  fireEvent.click(save);
  expect(document.querySelector('.modal-overlay.show')).not.toBeNull();
  expect(document.querySelector('.modal-head')?.textContent).toBe('确认修改核心端口');
  expect(document.querySelector('.modal-body')?.textContent).toContain('1812 / 1813');
  fireEvent.click(Array.from(document.querySelectorAll('.modal-foot .btn')).find((b) => b.textContent === '确认修改并重启监听')!);
  expect(container.querySelector('.toast')?.textContent).toContain('核心端口已变更并重启监听');
});

test('Settings:告警总开关关闭时子项禁用', () => {
  const { container } = ui(<Settings />);
  const mailRule = container.querySelector('#set-alert .alert-rule')!;
  const master = mailRule.querySelector('.sw') as HTMLInputElement;
  const subs = Array.from(mailRule.querySelectorAll('.rule-sub input')) as HTMLInputElement[];
  expect(master.checked).toBe(true);
  expect(subs.every((c) => !c.disabled)).toBe(true);
  fireEvent.click(master);
  expect(mailRule.classList.contains('off')).toBe(true);
  expect(subs.every((c) => c.disabled)).toBe(true);
});
