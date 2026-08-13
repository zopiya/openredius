import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckOutlined, TeamOutlined } from '@ant-design/icons';
import { Table, Select, Button, Space, Modal, Input, Tag, Empty, Skeleton, Result, Drawer, Card, Descriptions, Typography, theme, Divider } from 'antd';
import type { TableColumnsType, TableProps } from 'antd';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import TableToolbar, { FilterField } from '../components/TableToolbar';
import { useToast } from '../components/Toast';
import { assignUserPolicy, fetchSyncRecords, fetchUserDetail, fetchUsers, POLICY_RULES, syncAdNow, updateUserStatus, USER_FILTER_OPTIONS, USER_ROWS, type SyncRecordRow, type UserDetailData, type UserRow } from '../api/resources/users';
import { fetchPolicies } from '../api/resources/policies';
import { MODE } from '../api/config';

interface Filters {
  dept: string;
  status: string;
  policy: string;
  kw: string;
}

const DEFAULT_FILTERS: Filters = { dept: '全部部门', status: '全部状态', policy: '全部策略组', kw: '' };

function matches(row: UserRow, f: Filters) {
  if (f.dept !== '全部部门' && row.dept !== f.dept) return false;
  if (f.status !== '全部状态' && row.status !== f.status) return false;
  if (f.policy !== '全部策略组' && String(row.policyId ?? '') !== String(f.policy)) return false;
  const kw = f.kw.trim().toLowerCase();
  if (kw && (row.name + ' ' + row.account).toLowerCase().indexOf(kw) < 0) return false;
  return true;
}

const STATUS_COLOR: Record<UserRow['status'], string> = {
  正常: 'green',
  停用: 'default',
  锁定: 'red',
};

type ModalKind =
  | { kind: 'batch'; verb: string; danger: boolean; rows: UserRow[] }
  | { kind: 'policy'; rows: UserRow[] }
  | { kind: 'disable'; row: UserRow }
  | { kind: 'sync-log' }
  | { kind: 'sync-error' }
  | null;

export default function UsersPage() {
  const toast = useToast();
  const { token } = theme.useToken();
  const location = useLocation();
  const [view, setView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rows, setRows] = useState<UserRow[]>(USER_ROWS);
  const [form, setForm] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerUser, setDrawerUser] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<UserDetailData | null>(null);
  const [syncRecords, setSyncRecords] = useState<{ total: number; items: SyncRecordRow[] } | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [policyPick, setPolicyPick] = useState<number | undefined>(undefined);
  const [policies, setPolicies] = useState<{ id: number; name: string }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<'success' | 'syncing'>('success');
  const [syncLast, setSyncLast] = useState('10:00');
  const [syncSummary, setSyncSummary] = useState('(新增 12 / 更新 3 / 停用 1)');
  const deepLinked = useRef(false);

  useEffect(() => {
    if (view !== 'loading') return;
    let cancelled = false;
    fetchUsers()
      .then((data) => { if (!cancelled) { setRows(data); setView('ready'); } })
      .catch(() => { if (!cancelled) setView('error'); });
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    fetchPolicies()
      .then((ps) => setPolicies(ps.map((p) => ({ id: Number(p.id), name: p.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (rows.length === 0) return;
    if (deepLinked.current) return;
    deepLinked.current = true;
    const h = decodeURIComponent(location.hash.replace('#', ''));
    const m = h.match(/user=(.+)/);
    if (!m) return;
    const row = rows.find((r) => r.account === m[1]);
    if (row) setDrawerUser(row);
    else toast('用户 ' + m[1] + ' 不在当前页,请通过关键词搜索定位');
  }, [rows]);

  // docs/03:用户抽屉在 http 模式拉真实详情(recent_auth/终端/下发规则)。
  useEffect(() => {
    if (!drawerUser) return;
    setDetail(null);
    if (MODE !== 'http') return;
    let cancelled = false;
    fetchUserDetail(drawerUser.account)
      .then((d) => { if (!cancelled && d) setDetail(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [drawerUser]);

  const visible = useMemo(
    () => (MODE === 'http' ? rows : rows.filter((r) => matches(r, applied))),
    [rows, applied],
  );
  const selectedVisible = visible.filter((r) => selected.has(r.account));

  function applyFilters() {
    setApplied(form);
    if (MODE !== 'http') return;
    setView('loading');
    fetchUsers({ dept: form.dept, status: form.status, policy: form.policy, q: form.kw })
      .then((data) => { setRows(data); setView('ready'); })
      .catch(() => setView('error'));
  }

  function resetFilters(silent = false) {
    setForm(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    if (MODE === 'http') {
      setView('loading');
      fetchUsers().then((data) => { setRows(data); setView('ready'); }).catch(() => setView('error'));
    }
    if (!silent) toast('已清空筛选条件');
  }

  function openSyncLog() {
    setModal({ kind: 'sync-log' });
    if (MODE !== 'http') return;
    fetchSyncRecords()
      .then((d) => setSyncRecords(d))
      .catch(() => {});
  }

  async function startSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncState('syncing');
    setSyncSummary('(正在拉取 AD 增量变更…)');
    try {
      const r = await syncAdNow();
      setSyncing(false);
      setSyncState('success');
      setSyncLast(r.finishedAt || syncLast);
      setSyncSummary(r.summary || '');
      toast(r.message || 'AD 同步完成');
    } catch (e) {
      setSyncing(false);
      setSyncState('success');
      toast(`AD 同步失败:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function reload() {
    fetchUsers()
      .then((data) => { setRows(data); setView('ready'); })
      .catch(() => setView('error'));
  }

  async function confirmModal() {
    const m = modal;
    if (!m) return;
    setModal(null);
    if (MODE !== 'http') {
      if (m.kind === 'batch') toast(`已对 ${m.rows.length} 个账号执行「${m.verb}」`);
      else if (m.kind === 'policy') toast(`已为 ${m.rows.length} 个账号更新策略组`);
      else if (m.kind === 'disable') { toast(`账号 ${m.row.account} 已停用`); setDrawerUser(null); }
      else toast('已重新触发同步,请留意通知');
      return;
    }
    try {
      if (m.kind === 'batch') {
        const accounts = m.rows.map((r) => r.account);
        await updateUserStatus(accounts, m.verb as '启用' | '停用');
        toast(`已对 ${accounts.length} 个账号执行「${m.verb}」`);
      } else if (m.kind === 'policy') {
        if (policyPick == null) { toast('请选择策略组'); return; }
        const accounts = m.rows.map((r) => r.account);
        await assignUserPolicy(accounts, policyPick);
        toast(`已为 ${accounts.length} 个账号更新策略组`);
      } else if (m.kind === 'disable') {
        await updateUserStatus([m.row.account], '停用');
        toast(`账号 ${m.row.account} 已停用`);
        setDrawerUser(null);
      } else {
        toast('已重新触发同步,请留意通知');
      }
      reload();
    } catch (e) {
      toast(`操作失败:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function retry() {
    setView('loading');
    fetchUsers()
      .then((data) => { setRows(data); setView('ready'); toast('已重新连接,用户目录已刷新'); })
      .catch(() => setView('error'));
  }

  const drawerRule = drawerUser ? (POLICY_RULES[drawerUser.policy] ?? '—') : '—';

  const rowSelection: TableProps<UserRow>['rowSelection'] = {
    selectedRowKeys: Array.from(selected).filter((id) => visible.some((r) => r.account === id)),
    onSelect: (r, on) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(r.account); else next.delete(r.account);
        return next;
      });
    },
    onSelectAll: (on, _, changeRows) => {
      setSelected((prev) => {
        const next = new Set(prev);
        changeRows.forEach((r) => (on ? next.add(r.account) : next.delete(r.account)));
        return next;
      });
    },
  };

  const columns: TableColumnsType<UserRow> = [
    {
      title: '姓名 / 账号',
      key: 'name',
      render: (_v, r) => (
        <>
          <b>{r.name}</b>
          <Typography.Text type="secondary" style={{ display: 'block', fontFamily: 'monospace' }}>{r.account}</Typography.Text>
        </>
      ),
    },
    { title: '所属部门', dataIndex: 'dept', key: 'dept' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: '正常', value: '正常' },
        { text: '停用', value: '停用' },
        { text: '锁定', value: '锁定' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (v: UserRow['status'], r) => (
        <>
          <Tag color={STATUS_COLOR[v]}>{v}</Tag>
          {r.statusSub && <Typography.Text type="secondary" style={{ display: 'block' }}>{r.statusSub}</Typography.Text>}
        </>
      ),
    },
    { title: '绑定终端数', dataIndex: 'devices', key: 'devices', render: (v) => <Typography.Text code>{v}</Typography.Text> },
    { title: '所属策略组', dataIndex: 'policy', key: 'policy' },
    { title: '最近认证时间', dataIndex: 'lastAuth', key: 'lastAuth', render: (v) => <Typography.Text code>{v}</Typography.Text> },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_v, r) => (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setDrawerUser(r);
          }}
        >
          详情
        </a>
      ),
    },
  ];

  const modalTitle = modal?.kind === 'batch' ? '确认批量' + modal.verb
    : modal?.kind === 'policy' ? '批量分配策略组'
    : modal?.kind === 'disable' ? '确认停用账号'
    : modal?.kind === 'sync-log' ? 'AD 同步记录 · 近 7 天'
    : 'AD 同步未完成';

  const modalOkText = modal?.kind === 'batch' ? (modal.danger ? '确认停用' : '确认' + modal.verb)
    : modal?.kind === 'policy' ? '确认分配'
    : modal?.kind === 'disable' ? '确认停用'
    : modal?.kind === 'sync-log' ? '重试失败任务'
    : '立即重试';

  return (
    <Shell page="用户管理">
      <PageHeader
        title="用户管理"
        subtitle={<>共 <b>1,472</b> 个账号,源自 AD 域同步 · 正常 1,408 / 停用 52 / 锁定 12</>}
        extra={
          <Button type="primary" data-od-id="sync-now" disabled={syncing} onClick={startSync}>
            {syncing ? '同步中…' : '立即同步 AD'}
          </Button>
        }
      />

      {/* AD 同步状态 */}
      <div
        data-od-id="ad-sync-status"
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', marginBottom: 16, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 12, background: token.colorBgLayout, color: token.colorTextSecondary }}
      >
        <CheckOutlined style={{ width: 16, height: 16, color: token.colorSuccess, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          AD 域 <b>corp.example.com</b> · 上次同步 <b>{syncLast}</b>{' '}
          <Tag color={syncState === 'success' ? 'green' : 'blue'}>{syncState === 'success' ? '成功' : '同步中'}</Tag>
          {syncSummary},下次同步 <b>11:00</b> · 周期 60 分钟 · <Link to="/settings">对接配置</Link>
        </div>
        <a href="#" onClick={(e) => { e.preventDefault(); openSyncLog(); }}>同步记录</a>
      </div>

      {/* 主卡片 */}
      <Card data-od-id="user-card" styles={{ body: { padding: 0 } }}>
        {/* 筛选栏 */}
        <TableToolbar
          data-od-id="user-filters"
          actions={
            <Space>
              <Button disabled={selectedVisible.length === 0} onClick={() => setModal({ kind: 'batch', verb: '启用', danger: false, rows: selectedVisible })}>批量启用</Button>
              <Button danger disabled={selectedVisible.length === 0} onClick={() => setModal({ kind: 'batch', verb: '停用', danger: true, rows: selectedVisible })}>批量停用</Button>
              <Button disabled={selectedVisible.length === 0} onClick={() => { setPolicyPick(policies[0]?.id); setModal({ kind: 'policy', rows: selectedVisible }); }}>分配策略组</Button>
            </Space>
          }
        >
          <FilterField label="部门" htmlFor="fu-dept">
            <Select id="fu-dept" value={form.dept} onChange={(v) => setForm((f) => ({ ...f, dept: v }))} options={USER_FILTER_OPTIONS.dept.map((o) => ({ label: o, value: o }))} style={{ width: 140 }} />
          </FilterField>
          <FilterField label="状态" htmlFor="fu-status">
            <Select id="fu-status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))} options={USER_FILTER_OPTIONS.status.map((o) => ({ label: o, value: o }))} style={{ width: 110 }} />
          </FilterField>
          <FilterField label="策略组" htmlFor="fu-policy">
            <Select id="fu-policy" value={form.policy} onChange={(v) => setForm((f) => ({ ...f, policy: v }))} options={[{ label: '全部策略组', value: '全部策略组' }, ...policies.map((p) => ({ label: p.name, value: p.id }))]} style={{ width: 140 }} />
          </FilterField>
          <FilterField label="关键词" htmlFor="fu-kw">
            <Input id="fu-kw" placeholder="姓名 / 账号" value={form.kw} onChange={(e) => setForm((f) => ({ ...f, kw: e.target.value }))} style={{ width: 140 }} />
          </FilterField>
          <Space>
            <Button type="primary" size="small" onClick={applyFilters}>筛选</Button>
            <Button size="small" onClick={() => resetFilters()}>重置</Button>
          </Space>
        </TableToolbar>

        {/* 选中提示 */}
        {selectedVisible.length > 0 && (
          <div style={{ display: 'flex', gap: 14, padding: '12px 20px', borderBottom: `1px solid ${token.colorBorderSecondary}`, color: token.colorTextSecondary }}>
            <span>已选 <b style={{ color: token.colorPrimary }}>{selectedVisible.length}</b> 项,可执行右上方批量操作</span>
            <a href="#" style={{ marginLeft: 'auto', color: token.colorTextTertiary }} onClick={(e) => { e.preventDefault(); setSelected(new Set()); }}>清除选择</a>
          </div>
        )}

        {/* 表格 */}
        {view === 'loading' && <div style={{ padding: 40 }}><Skeleton active paragraph={{ rows: 8 }} /></div>}
        {view === 'ready' && visible.length > 0 && (
          <Table
           
            rowKey="account"
            dataSource={visible}
            columns={columns}
            rowSelection={rowSelection}
            data-od-id="user-table"
            pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (_total, range) => `共 1,472 个账号,本页显示 ${range[0]}-${range[1]} 条` }}
            size="middle"
          />
        )}
        {view === 'ready' && visible.length === 0 && (
          <Empty image={<TeamOutlined style={{ width: 64, height: 64, color: token.colorTextQuaternary }} />} description="没有符合条件的用户" style={{ padding: '56px 24px' }}>
            <Typography.Text type="secondary">当前筛选条件下无账号。可放宽部门 / 状态 / 策略组条件,或修改关键词。</Typography.Text>
            <br /><Button style={{ marginTop: 12 }} onClick={() => resetFilters()}>清空筛选条件</Button>
          </Empty>
        )}
        {view === 'error' && <Result status="error" title="用户数据加载失败" subTitle="无法读取用户目录(DIR-SYNC 503)。" extra={<Button onClick={retry}>重试</Button>} />}
      </Card>

      {/* 用户详情抽屉 */}
      <Drawer
        open={!!drawerUser}
        title={drawerUser ? drawerUser.name + ' · ' + drawerUser.account : '用户详情'}
        onClose={() => setDrawerUser(null)}
        size={560}
        footer={
          drawerUser ? (
            <Space>
              <Button danger onClick={() => drawerUser && setModal({ kind: 'disable', row: drawerUser })}>停用账号</Button>
              <Button type="primary" onClick={() => toast('终端绑定编辑:请在设备管理 → 终端准入清单中操作')}>编辑绑定终端</Button>
            </Space>
          ) : undefined
        }
      >
        {drawerUser && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: token.colorTextTertiary, marginBottom: 16 }}>
              <Link to="/users">用户管理</Link><span>/</span><span style={{ color: token.colorText, fontWeight: 500 }}>用户详情</span>
            </div>
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'name', label: '姓名 / 账号', children: `${drawerUser.name} · ${drawerUser.account}` },
                { key: 'dept', label: '所属部门 / 职位', children: `${drawerUser.dept} · ${drawerUser.title}` },
                { key: 'status', label: '账号状态', children: drawerUser.status },
                { key: 'src', label: '账号来源', children: 'AD 同步(corp.example.com)' },
                { key: 'last', label: '最近认证', children: detail ? (detail.recentAuth[0] ? `${detail.recentAuth[0].time},${detail.recentAuth[0].nas} · ${detail.recentAuth[0].result === '失败' ? '拒绝' : '接受'}` : '—') : '2026-07-27,SW-3F-01 · EAP-TLS' },
              ]}
            />
            <Divider titlePlacement="start" plain>所属策略组</Divider>
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'policy', label: '当前策略组', children: drawerUser.policy },
                { key: 'rule', label: '下发规则', children: detail ? detail.policyRules.join('; ') || '—' : drawerRule },
              ]}
            />
            <Divider titlePlacement="start" plain>绑定终端({detail ? detail.endpoints.length : 2})</Divider>
            <Table
              rowKey="mac"
              size="small"
              pagination={false}
              dataSource={detail ? detail.endpoints : [
                { mac: '3C:52:82:1A:4B:01', fp: '9F:2A:…:71:C0', comp: '合规' },
                { mac: 'A4:83:E7:22:9C:7E', fp: 'B1:08:…:3E:9A', comp: '证书 30 天内到期' },
              ]}
              columns={[
                { title: 'MAC', dataIndex: 'mac', key: 'mac', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
                { title: '证书指纹(SHA-256)', dataIndex: 'fp', key: 'fp', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
                { title: '合规', dataIndex: 'comp', key: 'comp', render: (v: string) => <Tag color={v === '合规' ? 'green' : 'orange'}>{v}</Tag> },
              ]}
            />
            <Divider titlePlacement="start" plain>历史认证记录({detail ? `最近 ${detail.recentAuth.length} 条` : '最近 5 条'})</Divider>
            <Table
              rowKey="time"
              size="small"
              pagination={false}
              dataSource={detail ? detail.recentAuth : [
                { time: '07-27 10:24', nas: 'SW-3F-01 · Gi1/0/12', result: '成功' },
                { time: '07-27 06:12', nas: 'SW-3F-01 · Gi1/0/12', result: '成功' },
                { time: '07-26 18:02', nas: 'AC-HQ-01 · AP-3F-012', result: '成功' },
                { time: '07-26 09:31', nas: 'SW-3F-01 · Gi1/0/12', result: '成功' },
                { time: '07-25 21:14', nas: 'AC-HQ-01 · AP-3F-012', result: '失败' },
              ]}
              columns={[
                { title: '时间', dataIndex: 'time', key: 'time', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
                { title: '接入设备', dataIndex: 'nas', key: 'nas' },
                { title: '结果', dataIndex: 'result', key: 'result', render: (v: string) => <Tag color={v === '成功' ? 'green' : 'red'}>{v}</Tag> },
              ]}
            />
            <Typography.Text style={{ display: 'block', marginTop: 10 }}>
              <Link to={`/auth-logs#user=${encodeURIComponent(drawerUser.account)}`}>查看该用户全部认证日志 →</Link>
            </Typography.Text>
          </>
        )}
      </Drawer>

      {/* 模态 */}
      <Modal
        open={!!modal}
        title={modalTitle}
        cancelText={modal?.kind === 'sync-log' ? undefined : '取消'}
        okText={modalOkText}
        okButtonProps={{ danger: !(modal?.kind === 'policy' || modal?.kind === 'sync-log' || modal?.kind === 'sync-error') }}
        onCancel={() => setModal(null)}
        onOk={confirmModal}
      >
        {modal?.kind === 'batch' && (
          <>
            <p>将对以下 <b>{modal.rows.length}</b> 个账号执行「{modal.verb}」:</p>
            <div style={{ background: token.colorBgLayout, borderRadius: 8, padding: '10px 12px', marginTop: 10, fontFamily: 'monospace', fontSize: 12, maxHeight: 140, overflow: 'auto' }}>
              {modal.rows.map((r) => <span key={r.account}>{r.name}({r.account})<br /></span>)}
            </div>
            {modal.danger && <p style={{ marginTop: 8 }}>停用后这些账号将立即无法通过 802.1X 认证,在线会话会被断开。</p>}
          </>
        )}
        {modal?.kind === 'policy' && (
          <>
            <p>将 <b>{modal.rows.length}</b> 个选中账号分配到:</p>
            <Select style={{ width: '100%', marginTop: 12 }} value={policyPick} onChange={setPolicyPick} options={policies.map((p) => ({ label: p.name, value: p.id }))} />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 10 }}>变更在下次认证时生效;在线终端将收到 CoA 重新授权。</Typography.Text>
          </>
        )}
        {modal?.kind === 'disable' && <p>停用 <b>{modal.row.name}({modal.row.account})</b> 后,该账号所有认证请求将被拒绝,在线会话立即断开。此操作可随时通过「启用」恢复。</p>}
        {modal?.kind === 'sync-log' && (
          <>
            {MODE === 'http' ? (
              <>
                <p>共 {syncRecords?.total ?? '…'} 次同步。</p>
                <div style={{ background: token.colorBgLayout, borderRadius: 8, padding: '10px 12px', marginTop: 10, fontFamily: 'monospace', fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                  {syncRecords?.items.map((r, i) => (
                    <span key={i}>{r.time} · {r.status === '失败' ? <b style={{ color: token.colorError }}>失败</b> : r.status} · {r.detail}{r.error ? ` · ${r.error}` : ''}<br /></span>
                  )) ?? <span>加载中…</span>}
                </div>
              </>
            ) : (
              <>
                <p>共 168 次同步:<b>167 次成功 / 1 次失败</b>。</p>
                <div style={{ background: token.colorBgLayout, borderRadius: 8, padding: '10px 12px', marginTop: 10, fontFamily: 'monospace', fontSize: 12 }}>
                  今日 10:00 · 成功 · 新增 12 / 更新 3 / 停用 1<br />
                  今日 09:00 · 成功 · 无变更<br />
                  今日 08:00 · 成功 · 新增 1 / 更新 2<br />
                  昨天 22:00 · <b style={{ color: token.colorError }}>失败</b> · dc01 连接超时(已回退){' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setModal({ kind: 'sync-error' }); }}>查看原因</a><br />
                  昨天 21:00 · 成功 · 无变更
                </div>
              </>
            )}
          </>
        )}
        {modal?.kind === 'sync-error' && (
          <>上次连接 <b>dc01.corp.example.com:636</b> 超时(等待 8s),已重试 2 次均失败。建议检查网络与凭据。</>
        )}
      </Modal>
    </Shell>
  );
}
