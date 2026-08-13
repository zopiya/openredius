import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, Button, Space, Modal, Drawer, Input, Select, Switch, Radio, Checkbox, Typography, Steps, Form, Card, theme, Alert, App } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { deletePolicy, fetchPolicies, NEW_POLICY_FORM, POLICY_FORMS, POLICY_FORM_OPTIONS, POLICY_ROWS, reorderPolicies, savePolicy, togglePolicy, type PolicyForm, type PolicyRow } from '../api/resources/policies';
import { MODE } from '../api/config';

const STEPS = [
  { title: '基本信息' },
  { title: '认证协议' },
  { title: 'VLAN 与合规' },
  { title: '生效条件' },
];

const EAP_OPTIONS = [
  { value: 'EAP-TLS', label: 'EAP-TLS', desc: '双向证书,安全性最高,推荐' },
  { value: 'PEAP-MSCHAPv2', label: 'PEAP-MSCHAPv2', desc: '账号密码,部署成本最低' },
  { value: 'EAP-FAST', label: 'EAP-FAST', desc: 'PAC 隧道,适合漫游频繁场景' },
];

export default function Policies() {
  const toast = useToast();
  const { modal } = App.useApp();
  const { token } = theme.useToken();
  const [rows, setRows] = useState<PolicyRow[]>(POLICY_ROWS);
  const [order, setOrder] = useState<string[]>(POLICY_ROWS.map((r) => r.id));
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(POLICY_ROWS.map((r) => [r.id, r.on]))
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyForm>(NEW_POLICY_FORM);
  const [stepIdx, setStepIdx] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [antForm] = Form.useForm();

  useEffect(() => {
    let cancelled = false;
    fetchPolicies().then((data) => {
      if (!cancelled) {
        setRows(data);
        setOrder(data.map((r) => r.id));
        setEnabled(Object.fromEntries(data.map((r) => [r.id, r.on])));
      }
    });
    return () => { cancelled = true; };
  }, []);

  function reload() {
    fetchPolicies().then((data) => {
      setRows(data);
      setOrder(data.map((r) => r.id));
      setEnabled(Object.fromEntries(data.map((r) => [r.id, r.on])));
    }).catch(() => {});
  }

  const rowById = (id: string) => rows.find((r) => r.id === id)!;

  function move(id: string, dir: -1 | 1) {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    if (MODE !== 'http') { toast('优先级已调整'); return; }
    reorderPolicies(next)
      .then(() => toast('优先级已调整并下发'))
      .catch((e) => { toast(`重排失败:${e instanceof Error ? e.message : String(e)}`); reload(); });
  }

  function openEdit(id: string) {
    setEditingId(id);
    const existingForm = POLICY_FORMS[id];
    setForm({ ...existingForm });
    antForm.setFieldsValue({ ...existingForm });
    setStepIdx(0);
    setDrawerOpen(true);
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...NEW_POLICY_FORM });
    antForm.resetFields();
    setStepIdx(0);
    setDrawerOpen(true);
  }

  function trySave() {
    if (!form.name.trim()) {
      toast('请填写策略名称');
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmPush() {
    setConfirmOpen(false);
    if (MODE !== 'http') { setDrawerOpen(false); toast('策略已下发'); return; }
    try {
      await savePolicy({ ...form, id: editingId ?? undefined });
      setDrawerOpen(false);
      toast('策略已下发');
      reload();
    } catch (e) {
      toast(`保存失败:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const compSummary = [
    ...(form.cert ? ['证书'] : []),
    ...(form.mac ? ['MAC 绑定'] : []),
    ...(form.edr ? ['安全状态'] : []),
  ].join(' + ') || '无强制要求';

  const drawerTitle = editingId ? '编辑策略 · ' + rowById(editingId).name : '新建策略';

  // sort rows by current order
  const sortedRows = order.map((id) => rowById(id));

  const columns: ColumnsType<PolicyRow> = [
    {
      title: '优先级',
      key: 'priority',
      width: 110,
      render: (_v, _r, i) => (
        <span>
          <Typography.Text strong style={{ fontFamily: 'monospace' }}>P{i + 1}</Typography.Text>
          <Button type="text" size="small" title="上移" style={{ padding: '0 4px' }} onClick={(e) => { e.preventDefault(); move(order[i], -1); }}>↑</Button>
          <Button type="text" size="small" title="下移" style={{ padding: '0 4px' }} onClick={(e) => { e.preventDefault(); move(order[i], 1); }}>↓</Button>
        </span>
      ),
    },
    {
      title: '策略名称',
      key: 'name',
      render: (_v, r) => (
        <>
          <b>{r.name}</b>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{r.sub}</Typography.Text>
        </>
      ),
    },
    { title: '适用部门 / 用户组', dataIndex: 'scope', key: 'scope' },
    { title: '认证方式', dataIndex: 'eap', key: 'eap' },
    { title: '下发 VLAN', dataIndex: 'vlan', key: 'vlan', render: (v) => <Typography.Text code>{v}</Typography.Text> },
    { title: '终端合规要求', dataIndex: 'compliance', key: 'compliance' },
    {
      title: '生效状态',
      key: 'status',
      width: 90,
      render: (_v, r) => (
        <Switch
          checked={enabled[r.id]}
          aria-label="启用状态"
          onChange={(on) => {
            setEnabled((prev) => ({ ...prev, [r.id]: on }));
            togglePolicy(r.id, on)
              .then(() => toast(`策略「${r.name}」已${on ? '启用' : '停用'}`))
              .catch((e) => { toast(`操作失败:${e instanceof Error ? e.message : String(e)}`); setEnabled((prev) => ({ ...prev, [r.id]: !on })); });
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_v, r) => (
        <Space>
          <a href="#" onClick={(e) => { e.preventDefault(); openEdit(r.id); }}>编辑</a>
          <a href="#" style={{ color: token.colorError }} onClick={(e) => {
            e.preventDefault();
            modal.confirm({
              title: '确认删除策略',
              content: `删除「${r.name}」后该策略的 radgroupreply 产物将被移除,匹配用户将回退到下一优先级策略。`,
              okText: '确认删除',
              okButtonProps: { danger: true },
              onOk: async () => {
                await deletePolicy(r.id);
                toast('策略已删除');
                reload();
              },
            });
          }}>删除</a>
        </Space>
      ),
    },
  ];

  return (
    <Shell page="策略管理">
      <PageHeader
        title="策略管理"
        subtitle="802.1X 准入策略 · 多策略匹配时按优先级自上而下执行,先匹配先生效 · 变更即时下发至全部 NAS"
        extra={<Button type="primary" data-od-id="new-policy" onClick={openNew}>新建策略</Button>}
      />

      {/* 策略冲突提示 */}
      <Alert
        type="warning"
        showIcon
        data-od-id="policy-conflict"
        title={<>策略匹配提示:「办公默认策略」以<b>全体员工(兜底)</b>为适用范围,与「研发 / 财务 / 运维」策略在用户组上存在重叠。当前按优先级自上而下先匹配先生效,兜底策略排在 P4 不影响高优先级规则;调整顺序前请核查重叠用户组的预期 VLAN 是否一致。</>}
        action={<a href="#" onClick={(e) => { e.preventDefault(); toast('共 412 名研发 + 64 名财务 + 18 名运维用户与「办公默认」策略重叠,已按优先级生效专项策略'); }}>查看影响范围</a>}
        style={{ marginBottom: 16 }}
      />

      {/* 主卡片 */}
      <Card data-od-id="policy-card" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={sortedRows}
          columns={columns}
          data-od-id="policy-table"
          pagination={false}
          size="middle"
        />
        <div style={{ display: 'flex', gap: 26, padding: '12px 20px', borderTop: `1px solid ${token.colorBorderSecondary}`, color: token.colorTextTertiary }}>
          <span>共 <b style={{ color: token.colorText }}>5</b> 条策略 · 停用的策略不参与匹配,仅作为配置存档</span>
        </div>
      </Card>

      {/* 编辑/新建抽屉 */}
      <Drawer
        open={drawerOpen}
        title={drawerTitle}
        size={620}
        onClose={() => setDrawerOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" data-od-id="policy-save" onClick={trySave}>保存策略</Button>
          </Space>
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: token.colorTextTertiary, marginBottom: 16 }}>
          <Link to="/policies">策略管理</Link><span>/</span><span style={{ color: token.colorText, fontWeight: 500 }}>{editingId ? '策略编辑' : '新建策略'}</span>
        </div>

        <Steps
          current={stepIdx}
          onChange={setStepIdx}
          size="small"
          items={STEPS.map((s) => ({ title: s.title }))}
          style={{ marginBottom: 24 }}
        />

        <Form form={antForm} layout="vertical" initialValues={form}>
          <div style={{ display: stepIdx === 0 ? 'block' : 'none' }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>基本信息</Typography.Text>
            <Form.Item label="策略名称" required rules={[{ required: true, message: '请填写策略名称' }]} name="name">
              <Input id="f-name" value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); antForm.setFieldsValue({ name: e.target.value }); }} />
            </Form.Item>
            <Form.Item label="适用部门 / 用户组" name="scope">
              <Select value={form.scope} onChange={(v) => { setForm((f) => ({ ...f, scope: v })); antForm.setFieldsValue({ scope: v }); }} options={POLICY_FORM_OPTIONS.scope.map((o) => ({ label: o, value: o }))} />
            </Form.Item>
          </div>

          <div style={{ display: stepIdx === 1 ? 'block' : 'none' }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>认证协议</Typography.Text>
            <Radio.Group
              data-od-id="eap-select"
              value={form.eap}
              onChange={(e) => { setForm((f) => ({ ...f, eap: e.target.value })); antForm.setFieldsValue({ eap: e.target.value }); }}
            >
              <Space orientation="vertical">
                {EAP_OPTIONS.map((o) => (
                  <Radio key={o.value} value={o.value}>
                    <b>{o.label}</b> <Typography.Text type="secondary">{o.desc}</Typography.Text>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>

          <div style={{ display: stepIdx === 2 ? 'block' : 'none' }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>VLAN 下发规则</Typography.Text>
            <Form.Item label="默认下发 VLAN" name="vlan">
              <Select value={form.vlan} onChange={(v) => { setForm((f) => ({ ...f, vlan: v })); antForm.setFieldsValue({ vlan: v }); }} options={POLICY_FORM_OPTIONS.vlan.map((o) => ({ label: o, value: o }))} />
            </Form.Item>
            <Form.Item label="下发 ACL(Filter-ID)" name="acl">
              <Select value={form.acl} onChange={(v) => { setForm((f) => ({ ...f, acl: v })); antForm.setFieldsValue({ acl: v }); }} options={POLICY_FORM_OPTIONS.acl.map((o) => ({ label: o, value: o }))} />
            </Form.Item>

            <Typography.Text strong style={{ display: 'block', marginTop: 16, marginBottom: 12 }}>终端合规校验</Typography.Text>
            <Checkbox checked={form.cert} onChange={(e) => { setForm((f) => ({ ...f, cert: e.target.checked })); antForm.setFieldsValue({ cert: e.target.checked }); }}>要求安装企业 CA 颁发的终端证书</Checkbox>
            <br />
            <Checkbox checked={form.mac} onChange={(e) => { setForm((f) => ({ ...f, mac: e.target.checked })); antForm.setFieldsValue({ mac: e.target.checked }); }}>要求 MAC 预先绑定</Checkbox>
            <br />
            <Checkbox checked={form.edr} onChange={(e) => { setForm((f) => ({ ...f, edr: e.target.checked })); antForm.setFieldsValue({ edr: e.target.checked }); }}>检查终端安全状态(EDR 在线 / 病毒库 7 日内)</Checkbox>
          </div>

          <div style={{ display: stepIdx === 3 ? 'block' : 'none' }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>生效时间段(可选)</Typography.Text>
            <Space>
              <Checkbox checked={form.time} onChange={(e) => { setForm((f) => ({ ...f, time: e.target.checked })); antForm.setFieldsValue({ time: e.target.checked }); }}>限制准入时间</Checkbox>
              <Input type="time" value={form.timeFrom} style={{ width: 110 }} onChange={(e) => { setForm((f) => ({ ...f, timeFrom: e.target.value })); antForm.setFieldsValue({ timeFrom: e.target.value }); }} />
              <span>至</span>
              <Input type="time" value={form.timeTo} style={{ width: 110 }} onChange={(e) => { setForm((f) => ({ ...f, timeTo: e.target.value })); antForm.setFieldsValue({ timeTo: e.target.value }); }} />
            </Space>

            <Typography.Text strong style={{ display: 'block', marginTop: 16, marginBottom: 12 }}>限速下发(可选)</Typography.Text>
            <Form.Item label="上下行速率上限" name="rate">
              <Select value={form.rate} onChange={(v) => { setForm((f) => ({ ...f, rate: v })); antForm.setFieldsValue({ rate: v }); }} options={POLICY_FORM_OPTIONS.rate.map((o) => ({ label: o, value: o }))} />
            </Form.Item>
            <Checkbox checked={form.on} onChange={(e) => { setForm((f) => ({ ...f, on: e.target.checked })); antForm.setFieldsValue({ on: e.target.checked }); }}>启用该策略</Checkbox>
          </div>
        </Form>
      </Drawer>

      {/* 保存确认 */}
      <Modal
        open={confirmOpen}
        title="确认保存策略变更"
        cancelText="再检查一下"
        okText="确认下发"
        onCancel={() => setConfirmOpen(false)}
        onOk={confirmPush}
      >
        <p>即将{editingId ? '修改' : '新建'}策略并即时下发至全部 NAS,匹配该策略的在线终端将收到 CoA 重新授权:</p>
        <div style={{ background: token.colorBgLayout, borderRadius: 8, padding: '10px 12px', marginTop: 10, fontFamily: 'monospace', fontSize: 12 }}>
          {form.name}<br />
          协议 {form.eap} · {form.vlan}<br />
          合规:{compSummary}<br />
          {form.time ? '准入时间 ' + form.timeFrom + ' – ' + form.timeTo : '全天可准入'} · 限速 {form.rate}
        </div>
      </Modal>
    </Shell>
  );
}
