import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Users } from 'lucide-react';
import { Table, Select, Button, Space, Modal, Input, Tag, Empty, Skeleton, Result, Drawer } from 'antd';
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { fetchUsers, POLICY_RULES, USER_FILTER_OPTIONS, USER_ROWS, type UserRow } from '../api/resources/users';

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
  if (f.policy !== '全部策略组' && row.policy !== f.policy) return false;
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
  const location = useLocation();
  const [view, setView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rows, setRows] = useState<UserRow[]>(USER_ROWS);
  const [form, setForm] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerUser, setDrawerUser] = useState<UserRow | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [policyPick, setPolicyPick] = useState('办公默认组');
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

  const visible = useMemo(() => rows.filter((r) => matches(r, applied)), [rows, applied]);
  const selectedVisible = visible.filter((r) => selected.has(r.account));

  function resetFilters(silent = false) {
    setForm(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    if (!silent) toast('已清空筛选条件');
  }

  function startSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncState('syncing');
    setSyncSummary('(正在拉取 AD 增量变更…)');
    window.setTimeout(() => {
      setSyncing(false);
      setSyncState('success');
      setSyncLast('10:26');
      setSyncSummary('(新增 2 / 更新 5 / 停用 0)');
      toast('AD 增量同步完成:新增 2 / 更新 5,耗时 38 秒');
    }, 1800);
  }

  function confirmModal() {
    if (!modal) return;
    if (modal.kind === 'batch') toast('已对 ' + modal.rows.length + ' 个账号执行「' + modal.verb + '」');
    if (modal.kind === 'policy') toast('已为 ' + modal.rows.length + ' 个账号更新策略组');
    if (modal.kind === 'disable') {
      toast('账号 ' + modal.row.account + ' 已停用');
      setDrawerUser(null);
    }
    if (modal.kind === 'sync-log') toast('已重新触发昨天 22:00 的失败任务,请留意通知');
    if (modal.kind === 'sync-error') toast('已重新触发同步,请留意通知');
    setModal(null);
  }

  function retry() {
    setView('loading');
    fetchUsers()
      .then((data) => { setRows(data); setView('ready'); toast('已重新连接,用户目录已刷新'); })
      .catch(() => setView('error'));
  }

  const drawerRule = drawerUser ? (POLICY_RULES[drawerUser.policy] ?? '—') : '—';

  const rowSelection: TableRowSelection<UserRow> = {
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

  const columns: ColumnsType<UserRow> = [
    {
      title: '姓名 / 账号',
      key: 'name',
      render: (_v, r) => (
        <>
          <b>{r.name}</b>
          <div style={{ fontSize: '12.5px', color: '#6e6e73', fontFamily: '"SF Mono", monospace' }}>{r.account}</div>
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
          {r.statusSub && <div style={{ fontSize: '11.5px', color: '#6e6e73' }}>{r.statusSub}</div>}
        </>
      ),
    },
    { title: '绑定终端数', dataIndex: 'devices', key: 'devices', render: (v) => <span style={{ fontFamily: '"SF Mono", monospace', fontSize: '12.5px' }}>{v}</span> },
    { title: '所属策略组', dataIndex: 'policy', key: 'policy' },
    { title: '最近认证时间', dataIndex: 'lastAuth', key: 'lastAuth', render: (v) => <span style={{ fontFamily: '"SF Mono", monospace', fontSize: '12.5px' }}>{v}</span> },
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
          <>
            <Button onClick={() => toast('已导出 users-20260727.csv(1,472 条)')}>导出清单</Button>
            <Button type="primary" data-od-id="sync-now" disabled={syncing} onClick={startSync}>
              {syncing ? '同步中…' : '立即同步 AD'}
            </Button>
          </>
        }
      />

      {/* AD 同步状态 */}
      <div
        data-od-id="ad-sync-status"
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', marginBottom: 16, border: '1px solid #e8e8ed', borderRadius: 12, background: '#f5f5f7', fontSize: 13, color: '#424245' }}
      >
        <Check style={{ width: 16, height: 16, color: '#16a34a', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          AD 域 <b>corp.example.com</b> · 上次同步 <b>{syncLast}</b>{' '}
          <Tag color={syncState === 'success' ? 'green' : 'blue'}>{syncState === 'success' ? '成功' : '同步中'}</Tag>
          {syncSummary},下次同步 <b>11:00</b> · 周期 60 分钟 · <Link to="/settings">对接配置</Link>
        </div>
        <a href="#" onClick={(e) => { e.preventDefault(); setModal({ kind: 'sync-log' }); }}>同步记录</a>
      </div>

      {/* 主卡片 */}
      <div data-od-id="user-card" style={{ background: '#fff', border: '1px solid #e8e8ed', borderRadius: 18 }}>
        {/* 筛选栏 */}
        <div data-od-id="user-filters" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '14px 20px', borderBottom: '1px solid #e8e8ed' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="fu-dept" style={{ fontSize: '11.5px', color: '#6e6e73' }}>部门</label>
            <Select id="fu-dept" value={form.dept} onChange={(v) => setForm((f) => ({ ...f, dept: v }))} options={USER_FILTER_OPTIONS.dept.map((o) => ({ label: o, value: o }))} style={{ width: 140 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="fu-status" style={{ fontSize: '11.5px', color: '#6e6e73' }}>状态</label>
            <Select id="fu-status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))} options={USER_FILTER_OPTIONS.status.map((o) => ({ label: o, value: o }))} style={{ width: 110 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="fu-policy" style={{ fontSize: '11.5px', color: '#6e6e73' }}>策略组</label>
            <Select id="fu-policy" value={form.policy} onChange={(v) => setForm((f) => ({ ...f, policy: v }))} options={USER_FILTER_OPTIONS.policy.map((o) => ({ label: o, value: o }))} style={{ width: 140 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="fu-kw" style={{ fontSize: '11.5px', color: '#6e6e73' }}>关键词</label>
            <Input id="fu-kw" placeholder="姓名 / 账号" value={form.kw} onChange={(e) => setForm((f) => ({ ...f, kw: e.target.value }))} style={{ width: 140 }} />
          </div>
          <Button type="primary" size="small" onClick={() => setApplied(form)}>筛选</Button>
          <Button size="small" onClick={() => resetFilters()}>重置</Button>
          <div style={{ flex: 1 }} />
          <Button disabled={selectedVisible.length === 0} onClick={() => setModal({ kind: 'batch', verb: '启用', danger: false, rows: selectedVisible })}>批量启用</Button>
          <Button danger disabled={selectedVisible.length === 0} onClick={() => setModal({ kind: 'batch', verb: '停用', danger: true, rows: selectedVisible })}>批量停用</Button>
          <Button disabled={selectedVisible.length === 0} onClick={() => { setPolicyPick('办公默认组'); setModal({ kind: 'policy', rows: selectedVisible }); }}>分配策略组</Button>
        </div>

        {/* 选中提示 */}
        {selectedVisible.length > 0 && (
          <div style={{ display: 'flex', gap: 14, padding: '12px 20px', borderBottom: '1px solid #e8e8ed', fontSize: '12.5px', color: '#424245' }}>
            <span>已选 <b style={{ color: '#0071e3' }}>{selectedVisible.length}</b> 项,可执行右上方批量操作</span>
            <a href="#" style={{ marginLeft: 'auto', color: '#6e6e73' }} onClick={(e) => { e.preventDefault(); setSelected(new Set()); }}>清除选择</a>
          </div>
        )}

        {/* 表格 */}
        {view === 'loading' && <div className="tbl-skel" style={{ padding: 40 }}><Skeleton active paragraph={{ rows: 8 }} /></div>}
        {view === 'ready' && visible.length > 0 && (
          <Table
            className="tbl"
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
          <Empty image={<Users style={{ width: 64, height: 64, color: '#86868b' }} />} description="没有符合条件的用户" style={{ padding: '56px 24px' }}>
            <span style={{ fontSize: 13, color: '#6e6e73' }}>当前筛选条件下无账号。可放宽部门 / 状态 / 策略组条件,或修改关键词。</span>
            <br /><Button style={{ marginTop: 12 }} onClick={() => resetFilters()}>清空筛选条件</Button>
          </Empty>
        )}
        {view === 'error' && <Result status="error" title="用户数据加载失败" subTitle="无法读取用户目录(DIR-SYNC 503)。" extra={<Button onClick={retry}>重试</Button>} />}
      </div>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '12.5px', color: '#6e6e73', marginBottom: 16 }}>
              <Link to="/users">用户管理</Link><span>/</span><span style={{ color: '#1d1d1f', fontWeight: 500 }}>用户详情</span>
            </div>
            <dl className="kv plain">
              <dt>姓名 / 账号</dt><dd>{drawerUser.name} · {drawerUser.account}</dd>
              <dt>所属部门 / 职位</dt><dd>{drawerUser.dept} · {drawerUser.title}</dd>
              <dt>账号状态</dt><dd>{drawerUser.status}</dd>
              <dt>账号来源</dt><dd>AD 同步(corp.example.com)</dd>
              <dt>最近认证</dt><dd>2026-07-27,SW-3F-01 · EAP-TLS</dd>
            </dl>
            <div className="d-sec">
              <div className="d-sec-t">所属策略组</div>
              <dl className="kv plain"><dt>当前策略组</dt><dd>{drawerUser.policy}</dd><dt>下发规则</dt><dd>{drawerRule}</dd></dl>
            </div>
            <div className="d-sec">
              <div className="d-sec-t">绑定终端(2)</div>
              <table className="tbl">
                <thead><tr><th>MAC</th><th>证书指纹(SHA-256)</th><th>合规</th></tr></thead>
                <tbody>
                  <tr><td className="mono">3C:52:82:1A:4B:01</td><td className="mono">9F:2A:…:71:C0</td><td><Tag color="green">合规</Tag></td></tr>
                  <tr><td className="mono">A4:83:E7:22:9C:7E</td><td className="mono">B1:08:…:3E:9A</td><td><Tag color="orange">证书 30 天内到期</Tag></td></tr>
                </tbody>
              </table>
            </div>
            <div className="d-sec">
              <div className="d-sec-t">历史认证记录(最近 5 条)</div>
              <table className="tbl">
                <thead><tr><th>时间</th><th>接入设备</th><th>结果</th></tr></thead>
                <tbody>
                  <tr><td className="mono">07-27 10:24</td><td>SW-3F-01 · Gi1/0/12</td><td><Tag color="green">成功</Tag></td></tr>
                  <tr><td className="mono">07-27 06:12</td><td>SW-3F-01 · Gi1/0/12</td><td><Tag color="green">成功</Tag></td></tr>
                  <tr><td className="mono">07-26 18:02</td><td>AC-HQ-01 · AP-3F-012</td><td><Tag color="green">成功</Tag></td></tr>
                  <tr><td className="mono">07-26 09:31</td><td>SW-3F-01 · Gi1/0/12</td><td><Tag color="green">成功</Tag></td></tr>
                  <tr><td className="mono">07-25 21:14</td><td>AC-HQ-01 · AP-3F-012</td><td><Tag color="red">失败</Tag></td></tr>
                </tbody>
              </table>
              <div style={{ marginTop: 10, fontSize: '12.5px' }}>
                <Link to={`/auth-logs#user=${encodeURIComponent(drawerUser.account)}`}>查看该用户全部认证日志 →</Link>
              </div>
            </div>
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
            <div style={{ background: '#f5f5f7', borderRadius: 8, padding: '10px 12px', marginTop: 10, fontFamily: '"SF Mono", monospace', fontSize: 12, maxHeight: 140, overflow: 'auto' }}>
              {modal.rows.map((r) => <span key={r.account}>{r.name}({r.account})<br /></span>)}
            </div>
            {modal.danger && <p style={{ marginTop: 8 }}>停用后这些账号将立即无法通过 802.1X 认证,在线会话会被断开。</p>}
          </>
        )}
        {modal?.kind === 'policy' && (
          <>
            <p>将 <b>{modal.rows.length}</b> 个选中账号分配到:</p>
            <Select style={{ width: '100%', marginTop: 12 }} value={policyPick} onChange={setPolicyPick} options={USER_FILTER_OPTIONS.policy.slice(1).map((o) => ({ label: o, value: o }))} />
            <div style={{ marginTop: 10, fontSize: 12, color: '#6e6e73' }}>变更在下次认证时生效;在线终端将收到 CoA 重新授权。</div>
          </>
        )}
        {modal?.kind === 'disable' && <p>停用 <b>{modal.row.name}({modal.row.account})</b> 后,该账号所有认证请求将被拒绝,在线会话立即断开。此操作可随时通过「启用」恢复。</p>}
        {modal?.kind === 'sync-log' && (
          <>
            <p>共 168 次同步:<b>167 次成功 / 1 次失败</b>。</p>
            <div style={{ background: '#f5f5f7', borderRadius: 8, padding: '10px 12px', marginTop: 10, fontFamily: '"SF Mono", monospace', fontSize: 12 }}>
              今日 10:00 · 成功 · 新增 12 / 更新 3 / 停用 1<br />
              今日 09:00 · 成功 · 无变更<br />
              今日 08:00 · 成功 · 新增 1 / 更新 2<br />
              昨天 22:00 · <b style={{ color: '#dc2626' }}>失败</b> · dc01 连接超时(已回退){' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setModal({ kind: 'sync-error' }); }}>查看原因</a><br />
              昨天 21:00 · 成功 · 无变更
            </div>
          </>
        )}
        {modal?.kind === 'sync-error' && (
          <>上次连接 <b>dc01.corp.example.com:636</b> 超时(等待 8s),已重试 2 次均失败。建议检查网络与凭据。</>
        )}
      </Modal>
    </Shell>
  );
}
