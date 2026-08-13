import { useEffect, useRef, useState } from 'react';
import { Anchor, Card, Input, Select, Switch, Checkbox, Button, Space, Table, Modal, Typography, Tag, Radio, Descriptions, theme, Form, Row, Col, Flex, App } from 'antd';
import type { TableColumnsType } from 'antd';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { getAdmin } from '../api/auth';
import { fetchApi } from '../api/http';
import { MODE } from '../api/config';
import { fetchAlertRules, fetchSettings, saveAlertRules, saveSettings, type AlertRuleRow, type SettingsSnapshot } from '../api/resources/settings';

const { Text } = Typography;

const ROLE_LABELS: Record<string, string> = { admin: '管理员', operator: '运维', auditor: '审计' };
const ROLE_SCOPES: Record<string, string> = { admin: '全部功能 + 系统设置 + Shared Secret 查看', operator: '读全部 + 强制下线 + 用户启停策略分配 + AD 同步', auditor: '仪表盘 / 会话 / 日志 / 报表,仅查看与导出' };
const ALERT_RULE_LABELS: Record<string, string> = {
  nas_offline: '设备离线告警',
  ap_high_load: '设备高负载告警',
  cert_expiring: '证书临期告警',
  account_locked: '账号锁定告警',
};

function ruleThresholdText(t: Record<string, unknown>): string {
  const entries = Object.entries(t ?? {});
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(', ') : '默认阈值';
}

interface AdminRow { id: number; username: string; display_name: string; role: string; status: string; linked_account?: string | null; created_at: string; }

interface AlertRule { key: string; name: string; sub: string; on: boolean; subs: { label: string; checked: boolean; radio?: boolean; value?: string }[]; }

const INITIAL_RULES: AlertRule[] = [
  { key: 'mail', name: '邮件', sub: '发送至 netops@example.com(3 名运维)', on: true, subs: [{ label: '设备离线', checked: true }, { label: '成功率 < 95%(10 分钟窗口)', checked: true }, { label: '账号暴力破解锁定', checked: true }, { label: '证书批量临期(每周一汇总)', checked: false }] },
  { key: 'wecom', name: '企业微信', sub: '群机器人「网络运维告警群」 · Webhook 已验证', on: true, subs: [{ label: '设备离线', checked: true }, { label: '成功率 < 95%', checked: true }, { label: '账号锁定', checked: false }, { label: '未知 MAC 闯入隔离 VLAN', checked: true }] },
  { key: 'webhook', name: '自定义 Webhook', sub: 'POST https://soc.example.com/api/alerts · 未启用', on: false, subs: [{ label: '全部事件', checked: true, radio: true, value: 'all' }, { label: '仅严重', checked: false, radio: true, value: 'critical' }] },
];

function portOk(v: string) { return /^\d{1,5}$/.test(v.trim()) && +v.trim() >= 1 && +v.trim() <= 65535; }

export default function Settings() {
  const toast = useToast();
  const { token } = theme.useToken();
  const [authPort, setAuthPort] = useState('1812');
  const [acctPort, setAcctPort] = useState('1813');
  const origPorts = useRef({ auth: '1812', acct: '1813' });
  const [authErr, setAuthErr] = useState('');
  const [acctErr, setAcctErr] = useState('');
  const [rules, setRules] = useState<AlertRule[]>(INITIAL_RULES);
  const [backendRules, setBackendRules] = useState<AlertRuleRow[]>([]);
  const [alertsMaster, setAlertsMaster] = useState(true);
  const [auditMaster, setAuditMaster] = useState(true);
  const [coreModal, setCoreModal] = useState(false);
  const [cfg, setCfg] = useState<SettingsSnapshot | null>(null);

  useEffect(() => {
    fetchSettings().then((c) => {
      setAuthPort(String(c.radius_auth_port));
      setAcctPort(String(c.radius_acct_port));
      setCfg(c);
      setAlertsMaster(c.alerts_enabled);
      setAuditMaster(c.audit_enabled);
    }).catch(() => {});
    if (MODE === 'http') fetchAlertRules().then((r) => setBackendRules(r)).catch(() => {});
  }, []);

  async function doSave(confirm: boolean) {
    if (!cfg) return;
    try {
      await saveSettings({
        radius_auth_port: Number(authPort),
        radius_acct_port: Number(acctPort),
        coa_port: cfg.coa_port,
        alerts_enabled: cfg.alerts_enabled,
        audit_enabled: cfg.audit_enabled,
        confirm,
      });
      toast('「RADIUS 服务参数」已保存并记录审计日志');
    } catch (e) {
      toast(`保存失败:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function saveRadius() {
    let okA = portOk(authPort), okB = portOk(acctPort);
    setAuthErr(okA ? '' : '请输入 1–65535 的整数端口');
    setAcctErr(okB ? '' : '请输入 1–65535 的整数端口');
    if (okA && okB && authPort.trim() === acctPort.trim()) { okB = false; setAcctErr('计费端口不能与认证端口相同'); }
    if (!okA || !okB) return;
    if (authPort !== origPorts.current.auth || acctPort !== origPorts.current.acct) { setCoreModal(true); return; }
    doSave(false);
  }
  function confirmCore() { origPorts.current = { auth: authPort, acct: acctPort }; setCoreModal(false); doSave(true); }
  function toggleRule(key: string, on: boolean) { setRules((prev) => prev.map((r) => (r.key === key ? { ...r, on } : r))); }
  function toggleSub(key: string, idx: number, checked: boolean) { setRules((prev) => prev.map((r) => { if (r.key !== key) return r; const subs = r.subs.map((s, i) => { if (s.radio) return { ...s, checked: i === idx }; return i === idx ? { ...s, checked } : s; }); return { ...r, subs }; })); }

  function persistMaster(key: 'alerts_enabled' | 'audit_enabled', on: boolean) {
    if (cfg && MODE === 'http') {
      const next = { ...cfg, [key]: on };
      saveSettings({
        radius_auth_port: next.radius_auth_port,
        radius_acct_port: next.radius_acct_port,
        coa_port: next.coa_port,
        alerts_enabled: next.alerts_enabled,
        audit_enabled: next.audit_enabled,
        confirm: false,
      }).then(() => setCfg(next)).catch((e) => toast(`保存失败:${e instanceof Error ? e.message : String(e)}`));
    }
  }

  function toggleAlertsMaster(on: boolean) {
    setAlertsMaster(on);
    persistMaster('alerts_enabled', on);
    toast(on ? '告警已启用' : '告警总开关已关闭,所有告警规则静默');
  }

  function toggleAuditMaster(on: boolean) {
    setAuditMaster(on);
    persistMaster('audit_enabled', on);
    toast(on ? '审计日志已启用' : '审计总开关已关闭,后续写操作不再落审计');
  }

  function toggleBackendRule(key: string, on: boolean) {
    setBackendRules((prev) => prev.map((r) => (r.key === key ? { ...r, enabled: on } : r)));
  }

  function saveAlertCard() {
    if (MODE === 'http') {
      saveAlertRules(backendRules)
        .then(() => toast('「告警规则」已保存并记录审计日志'))
        .catch((e) => toast(`保存失败:${e instanceof Error ? e.message : String(e)}`));
    } else {
      toast('「告警通知配置」已保存');
    }
  }

  const anchorItems = [
    { key: 'set-radius', href: '#set-radius', title: 'RADIUS 参数' },
    { key: 'set-cert', href: '#set-cert', title: '证书管理' },
    { key: 'set-ldap', href: '#set-ldap', title: 'AD / LDAP' },
    { key: 'set-rbac', href: '#set-rbac', title: '管理员与权限' },
    { key: 'set-alert', href: '#set-alert', title: '告警通知' },
  ];

  return (
    <Shell page="系统设置">
      <PageHeader
        title="系统设置"
        subtitle={<>所有配置变更即时生效并记录审计日志 · 当前操作人:{getAdmin()?.display_name || getAdmin()?.username || '管理员'}</>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '168px 1fr', gap: 24, alignItems: 'start' }}>
        <Anchor data-od-id="settings-subnav" items={anchorItems} style={{ position: 'sticky', top: 80 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* RADIUS */}
          <Card id="set-radius" data-od-id="set-radius" title="RADIUS 服务参数" extra={<Tag color="orange">含核心端口 · 改动需二次确认</Tag>}>
            <Form layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="认证端口(UDP)*" validateStatus={authErr ? 'error' : undefined} help={authErr || '修改后需重启 NAS 连接,会短暂中断认证'}>
                    <Input id="r-auth-port" value={authPort} onChange={(e) => { setAuthPort(e.target.value); setAuthErr(''); }} status={authErr ? 'error' : undefined} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="计费端口(UDP,会话审计)*" validateStatus={acctErr ? 'error' : undefined} help={acctErr}>
                    <Input id="r-acct-port" value={acctPort} onChange={(e) => { setAcctPort(e.target.value); setAcctErr(''); }} status={acctErr ? 'error' : undefined} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="NAS 请求超时">
                    <Select id="r-timeout" defaultValue="3 秒" options={['2 秒','3 秒','5 秒'].map((o) => ({ label: o, value: o }))} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="超时重试次数">
                    <Select id="r-retry" defaultValue="2 次" options={['1 次','2 次','3 次'].map((o) => ({ label: o, value: o }))} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="CoA / Disconnect 监听端口" extra="强制下线与策略重授权均通过 CoA 下发">
                    <Input defaultValue="3799" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Flex justify="flex-end"><Button type="primary" onClick={saveRadius}>保存</Button></Flex>
                </Col>
              </Row>
            </Form>
          </Card>

          {/* 证书 */}
          <Card id="set-cert" data-od-id="set-cert" title="证书管理" extra={<Tag color="green">CA 有效</Tag>}>
            <Form layout="vertical">
              <Row gutter={16}>
                <Col span={24}>
                  <Text strong>企业 CA 证书</Text>
                  <Descriptions
                    column={1}
                    size="small"
                    items={[
                      { key: 'issuer', label: '颁发者', children: 'CN=Corp Root CA 2024, O=Example Inc.' },
                      { key: 'valid', label: '有效期', children: '2024-01-01 至 2034-01-01(剩余 8.4 年)' },
                    ]}
                    style={{ marginTop: 6 }}
                  />
                  <Space style={{ marginTop: 10 }}><Button onClick={() => toast('「CA 证书更新申请」已提交')}>上传新 CA 证书</Button><Button onClick={() => toast('CRL(吊销列表)已开始下载,共 23 条记录')}>下载 CRL</Button></Space>
                </Col>
                <Col span={12}>
                  <Form.Item label="终端证书有效期">
                    <Select defaultValue="365 天" options={['180 天','365 天','730 天'].map((o) => ({ label: o, value: o }))} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="到期提醒">
                    <Select defaultValue="前 30 天" options={['前 7 天','前 30 天','前 60 天'].map((o) => ({ label: o, value: o }))} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Checkbox defaultChecked>过期证书直接拒绝接入(不进入隔离区)</Checkbox>
                </Col>
                <Col span={24}>
                  <Flex justify="flex-end"><Button type="primary" onClick={() => toast('「证书策略」已保存')}>保存</Button></Flex>
                </Col>
              </Row>
            </Form>
          </Card>

          {/* AD/LDAP */}
          <Card id="set-ldap" data-od-id="set-ldap" title="AD / LDAP 对接" extra={<Tag color="green">已连接</Tag>}>
            <Form layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="服务器地址">
                    <Input defaultValue="ldaps://dc01.corp.example.com:636" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Base DN">
                    <Input defaultValue="OU=Employees,DC=corp,DC=example,DC=com" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="绑定账号">
                    <Input defaultValue="CN=svc-radius,OU=Service,DC=corp,DC=example,DC=com" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="同步周期">
                    <Select defaultValue="60 分钟" options={['15 分钟','60 分钟','6 小时','每日 02:00'].map((o) => ({ label: o, value: o }))} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Text strong>字段映射</Text>
                  <Table
                    rowKey="ad"
                    size="small"
                    pagination={false}
                    style={{ marginTop: 8 }}
                    dataSource={[
                      { ad: 'sAMAccountName', field: '登录账号' },
                      { ad: 'displayName', field: '姓名' },
                      { ad: 'department', field: '所属部门' },
                      { ad: 'mail', field: '通知邮箱' },
                      { ad: 'userAccountControl', field: '停用状态' },
                    ]}
                    columns={[
                      { title: 'AD 属性', dataIndex: 'ad', key: 'ad', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
                      { title: '本系统字段', dataIndex: 'field', key: 'field' },
                    ]}
                  />
                </Col>
                <Col span={24}>
                  <Flex justify="flex-end" gap={10}>
                    <Button onClick={() => toast('连接成功,耗时 84ms,可读取 1,472 个账号')}>测试连接</Button>
                    <Button type="primary" onClick={() => toast('「AD/LDAP 对接配置」已保存')}>保存</Button>
                  </Flex>
                </Col>
              </Row>
            </Form>
          </Card>

          {/* 管理员 */}
          <AdminSection />

          {/* 告警 */}
          <Card id="set-alert" data-od-id="set-alert" title="告警通知配置" extra={<Button type="primary" size="small" onClick={saveAlertCard}>保存</Button>}>
            <div style={{ display: 'flex', gap: 28, paddingBottom: 10, borderBottom: `1px solid ${token.colorBorderSecondary}`, marginBottom: 4 }}>
              <Space><Switch checked={alertsMaster} aria-label="告警总开关" onChange={toggleAlertsMaster} /><b>告警总开关</b></Space>
              <Space><Switch checked={auditMaster} aria-label="审计总开关" onChange={toggleAuditMaster} /><b>审计总开关</b></Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>关闭总开关后,对应能力全局静默(后端读取 system_setting,见 08)</Typography.Text>
            </div>
            {MODE === 'http' ? (
              backendRules.map((rule) => (
                <div key={rule.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: rule.key !== backendRules[0]?.key ? `1px solid ${token.colorBorderSecondary}` : 'none', opacity: alertsMaster && rule.enabled ? 1 : 0.55 }}>
                  <Switch checked={rule.enabled} disabled={!alertsMaster} aria-label={rule.key} onChange={(on) => toggleBackendRule(rule.key, on)} />
                  <div style={{ flex: 1 }}><b>{ALERT_RULE_LABELS[rule.key] ?? rule.key}</b><Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{ruleThresholdText(rule.threshold)}</Typography.Text></div>
                </div>
              ))
            ) : (
              rules.map((rule) => (
                <div key={rule.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: rule.key !== 'mail' ? `1px solid ${token.colorBorderSecondary}` : 'none', opacity: alertsMaster && rule.on ? 1 : 0.55 }}>
                  <Switch checked={rule.on} disabled={!alertsMaster} aria-label={rule.name + '通知'} onChange={(on) => toggleRule(rule.key, on)} />
                  <div style={{ flex: 1 }}><b>{rule.name}</b><Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{rule.sub}</Typography.Text></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, color: token.colorTextSecondary }}>
                    {rule.subs.map((s, i) => s.radio ? (
                      <Radio key={s.label} checked={s.checked} disabled={!rule.on} onChange={() => toggleSub(rule.key, i, true)}>{s.label}</Radio>
                    ) : (
                      <Checkbox key={s.label} checked={s.checked} disabled={!rule.on} onChange={(e) => toggleSub(rule.key, i, e.target.checked)}>{s.label}</Checkbox>
                    ))}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      <Modal open={coreModal} title="确认修改核心端口" cancelText="再检查一下" okText="确认修改并重启监听" okButtonProps={{ danger: true }} onCancel={() => setCoreModal(false)} onOk={confirmCore}>
        <p>核心端口将由 <Typography.Text code>{origPorts.current.auth} / {origPorts.current.acct}</Typography.Text> 修改为 <Typography.Text code>{authPort.trim()} / {acctPort.trim()}</Typography.Text>。变更影响:</p>
        <p>• 全部 NAS 将中断当前监听并重连,期间认证请求超时或失败<br />• 在线会话不会立即断开,但计费报文可能丢失<br />• 操作记录审计,建议在低峰时段执行。</p>
      </Modal>
    </Shell>
  );
}

/* ── 管理员与权限 ─────────────────────────────────── */

function AdminSection() {
  const toast = useToast();
  const { modal } = App.useApp();
  const me = getAdmin();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [showGrant, setShowGrant] = useState(false);

  useEffect(() => {
    if (MODE !== 'http') { setAdmins([{ id: 1, username: 'admin', display_name: '管理员', role: 'admin', status: 'active', created_at: '' }]); return; }
    fetchApi('/api/auth/admins').then((body: any) => setAdmins(body ?? [])).catch(() => {});
  }, []);

  function changeRole(id: number, role: string, currentRole: string) {
    if (role === currentRole) return;
    modal.confirm({
      title: '确认变更角色',
      content: `将角色从「${ROLE_LABELS[currentRole]}」变更为「${ROLE_LABELS[role]}」。变更立即生效并记录审计日志。`,
      okText: '确认变更',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await fetchApi(`/api/auth/admins/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }); setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, role } : a))); toast('角色已更新'); } catch (e: any) { toast(e.message); }
      },
    });
  }

  function revoke(id: number, name: string) {
    modal.confirm({
      title: '确认撤销权限',
      content: `确认撤销 ${name} 的后台访问权限？撤销后该账号将无法再登录控制台。`,
      okText: '确认撤销',
      okButtonProps: { danger: true },
      onOk: async () => {
        try { await fetchApi(`/api/auth/admins/${id}`, { method: 'DELETE' }); setAdmins((prev) => prev.filter((a) => a.id !== id)); toast('已撤销后台权限'); } catch (e: any) { toast(e.message); }
      },
    });
  }

  const adminCols: TableColumnsType<AdminRow> = [
    { title: '账号', key: 'user', render: (_v, a) => <><b>{a.username}</b>{me?.username === a.username ? ' (当前)' : ''}<Typography.Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{a.display_name || '-'}</Typography.Text></> },
    { title: '来源', key: 'source', render: (_v, a) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{a.linked_account ? `关联用户:${a.linked_account}` : '独立账号'}</Typography.Text> },
    { title: '角色', key: 'role', render: (_v, a) => me?.username === a.username ? <Tag color="blue">{ROLE_LABELS[a.role] || a.role}</Tag> : <Select size="small" value={a.role} onChange={(v) => changeRole(a.id, v, a.role)} options={['admin','operator','auditor'].map((r) => ({ label: ROLE_LABELS[r], value: r }))} style={{ width: 100 }} /> },
    { title: '权限范围', key: 'scope', render: (_v, a) => <Typography.Text ellipsis={{ tooltip: ROLE_SCOPES[a.role] || '' }} style={{ maxWidth: 240 }}>{ROLE_SCOPES[a.role] || a.role}</Typography.Text> },
    { title: '操作', key: 'actions', render: (_v, a) => me?.username !== a.username ? <Button danger size="small" onClick={() => revoke(a.id, a.username)}>撤销</Button> : <Typography.Text type="secondary">—</Typography.Text> },
  ];

  return (
    <Card id="set-rbac" data-od-id="set-rbac" title="管理员与权限" extra={<Button size="small" onClick={() => setShowGrant(true)}>授权用户</Button>}>
      <Table rowKey="id" dataSource={admins} columns={adminCols} pagination={false} size="small" />
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>内置超级管理员不可被降级或删除;敏感操作全部记录审计日志。</Typography.Text>
      {showGrant && <GrantAccessModal onClose={() => setShowGrant(false)} onGranted={() => { setShowGrant(false); fetchApi('/api/auth/admins').then((b: any) => setAdmins(b ?? [])).catch(() => {}); }} />}
    </Card>
  );
}

/* ── 授权用户弹窗 ─────────────────────────────────── */

function GrantAccessModal({ onClose, onGranted }: { onClose: () => void; onGranted: () => void }) {
  const toast = useToast();
  const [users, setUsers] = useState<{ account: string; name: string; dept: string }[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] = useState('operator');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (MODE !== 'http') { setUsers([{ account: 'li.na', name: '李娜', dept: '技术部' }, { account: 'wang.lei', name: '王磊', dept: '网络运维部' }, { account: 'zhang.wei', name: '张伟', dept: '研发部' }]); return; }
    fetchApi('/api/users?size=200').then((body: any) => { const items = body?.items ?? []; setUsers(items.map((u: any) => ({ account: u.account, name: u.name, dept: u.dept }))); }).catch(() => {});
  }, []);

  const filtered = users.filter((u) => { const q = search.toLowerCase(); return u.account.includes(q) || u.name.includes(q) || u.dept.includes(q); });
  const picked = users.find((u) => u.account === selected);

  async function grant() { if (!selected) return toast('请选择一个用户'); setBusy(true); try { await fetchApi('/api/auth/admins', { method: 'POST', body: JSON.stringify({ username: selected, display_name: picked?.name || selected, linked_account: selected, role }) }); toast('已授权'); onGranted(); } catch (e: any) { toast(e.message); } finally { setBusy(false); } }

  return (
    <Modal open title="授权用户访问后台" onCancel={onClose} okText="授权" confirmLoading={busy} onOk={grant} okButtonProps={{ disabled: !selected }}>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>选择一个已有用户,授予后台访问权限。该用户可使用其 RADIUS 密码(本地用户)或 AD 密码登录。</Typography.Text>
      <Input value={search} onChange={(e) => { setSearch(e.target.value); setSelected(null); }} placeholder="输入账号或姓名…" autoFocus />
      <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
        <Table
          rowKey="account"
          size="small"
          pagination={false}
          dataSource={filtered.slice(0, 50)}
          columns={[
            { title: '账号', dataIndex: 'account', key: 'account', render: (v: string) => <b>{v}</b> },
            { title: '姓名', dataIndex: 'name', key: 'name' },
            { title: '部门', dataIndex: 'dept', key: 'dept' },
          ]}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selected ? [selected] : [],
            onChange: (keys) => setSelected((keys[0] as string) ?? null),
          }}
          onRow={(record) => ({ onClick: () => setSelected(record.account) })}
        />
      </div>
      {selected && <><div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}><Text strong>已选择:</Text><Input value={`${selected} · ${picked?.name || ''}`} readOnly /></div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}><Text strong>角色:</Text>
          <Select value={role} onChange={setRole} options={[{ label: '管理员 — 全部功能', value: 'admin' }, { label: '运维 — 读+强制下线+用户管理+AD同步', value: 'operator' }, { label: '审计 — 只读', value: 'auditor' }]} />
        </div>
      </>}
    </Modal>
  );
}
