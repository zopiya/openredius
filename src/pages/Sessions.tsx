import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { Table, Select, Button, Space, Modal, Tag, Checkbox, Dropdown, Empty, Skeleton, Result } from 'antd';
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import {
  disconnectSessions,
  fetchSessions,
  SESSION_FILTER_OPTIONS,
  SESSION_ROWS,
  type SessionRow,
} from '../api/resources/sessions';

type ColKey = 'mac' | 'nas' | 'vlan' | 'auth' | 'duration';

interface Filters {
  dept: string;
  method: string;
  nas: string;
  vlan: string;
  auth: string;
}

const DEFAULT_FILTERS: Filters = {
  dept: '全部部门',
  method: '全部',
  nas: '全部设备',
  vlan: '全部',
  auth: '全部',
};

function matches(row: SessionRow, f: Filters) {
  if (f.dept !== '全部部门' && !`${row.user} · ${row.dept}`.includes(f.dept)) return false;
  if (f.method !== '全部') {
    const want = f.method.indexOf('有线') >= 0 ? '有线' : 'WiFi';
    if (row.method !== want) return false;
  }
  if (f.nas !== '全部设备' && row.nas.indexOf(f.nas) !== 0) return false;
  if (f.vlan !== '全部' && row.vlan !== f.vlan.split(' ')[0]) return false;
  if (f.auth !== '全部' && row.auth !== f.auth) return false;
  return true;
}

const COL_VIS_OPTIONS: [ColKey, string][] = [
  ['mac', '终端 MAC'],
  ['nas', '接入设备'],
  ['vlan', 'VLAN'],
  ['auth', '认证方式'],
  ['duration', '接入时长'],
];

export default function Sessions() {
  const toast = useToast();
  const [view, setView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rows, setRows] = useState<SessionRow[]>(SESSION_ROWS);
  const [form, setForm] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [colVis, setColVis] = useState<Record<ColKey, boolean>>({
    mac: true, nas: true, vlan: true, auth: true, duration: true,
  });
  const [kickTarget, setKickTarget] = useState<SessionRow[] | null>(null);

  useEffect(() => {
    if (view !== 'loading') return;
    let cancelled = false;
    fetchSessions()
      .then((data) => { if (!cancelled) { setRows(data); setView('ready'); } })
      .catch(() => { if (!cancelled) setView('error'); });
    return () => { cancelled = true; };
  }, [view]);

  const visible = useMemo(() => rows.filter((r) => matches(r, applied)), [rows, applied]);
  const selectedVisible = visible.filter((r) => selected.has(r.session));

  function resetFilters(silent = false) {
    setForm(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    if (!silent) toast('已清空筛选条件');
  }

  async function confirmKick() {
    if (!kickTarget) return;
    const n = kickTarget.length;
    const ids = new Set(kickTarget.map((r) => r.session));
    try {
      const result = await disconnectSessions(kickTarget.map((r) => r.session));
      if (result.failed.length) {
        toast(`${n} 个会话已处理,${result.failed.length} 个失败`);
      } else {
        toast(`已向 NAS 发送 Disconnect-Request,${n} 个会话已强制下线`);
      }
    } catch {
      toast('强制下线请求失败');
    }
    setRows((prev) => prev.filter((r) => !ids.has(r.session)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setDetailId((d) => (d && ids.has(d) ? null : d));
    setKickTarget(null);
  }

  function retry() {
    setView('loading');
    window.setTimeout(() => {
      setView('ready');
      toast('已重新连接,会话数据已刷新');
    }, 450);
  }

  const kickIsBatch = (kickTarget?.length ?? 0) > 1;

  // Row selection config
  const rowSelection: TableRowSelection<SessionRow> = {
    selectedRowKeys: Array.from(selected).filter((id) => visible.some((r) => r.session === id)),
    onSelect: (r, on) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(r.session); else next.delete(r.session);
        return next;
      });
    },
    onSelectAll: (on, _, changeRows) => {
      setSelected((prev) => {
        const next = new Set(prev);
        changeRows.forEach((r) => (on ? next.add(r.session) : next.delete(r.session)));
        return next;
      });
    },
  };

  // Columns definition
  const columns: ColumnsType<SessionRow> = useMemo(() => {
    const cols: ColumnsType<SessionRow> = [
      {
        title: '用户名',
        dataIndex: 'name',
        key: 'name',
        sorter: (a, b) => a.name.localeCompare(b.name, 'zh'),
        render: (_v, r) => (
          <>
            <b>{r.name}</b>
            <div style={{ fontSize: '12.5px', color: '#6e6e73', fontFamily: '"SF Mono", monospace' }}>
              {r.user} · {r.dept}
            </div>
          </>
        ),
      },
      {
        title: '终端 MAC',
        dataIndex: 'mac',
        key: 'mac',
        hidden: !colVis.mac,
        width: 150,
        render: (v) => <span style={{ fontFamily: '"SF Mono", monospace', fontSize: '12.5px' }}>{v}</span>,
      },
      {
        title: '接入方式',
        dataIndex: 'method',
        key: 'method',
        filters: [
          { text: '有线', value: '有线' },
          { text: 'WiFi', value: 'WiFi' },
        ],
        onFilter: (value, record) => record.method === value,
        render: (v) => <Tag>{v}</Tag>,
      },
      {
        title: '接入设备',
        dataIndex: 'nas',
        key: 'nas',
        hidden: !colVis.nas,
        render: (_v, r) => (
          <>
            {r.nas}
            <div style={{ fontSize: '12.5px', color: '#6e6e73', fontFamily: '"SF Mono", monospace' }}>{r.nasSub}</div>
          </>
        ),
      },
      {
        title: 'VLAN',
        dataIndex: 'vlanLabel',
        key: 'vlan',
        hidden: !colVis.vlan,
        render: (v) => <span style={{ fontFamily: '"SF Mono", monospace', fontSize: '12.5px' }}>{v}</span>,
      },
      {
        title: '认证方式',
        dataIndex: 'auth',
        key: 'auth',
        hidden: !colVis.auth,
        filters: [
          { text: 'EAP-TLS', value: 'EAP-TLS' },
          { text: 'EAP-PEAP', value: 'EAP-PEAP' },
          { text: 'MAC Auth', value: 'MAC Auth' },
        ],
        onFilter: (value, record) => record.auth === value,
      },
      {
        title: '接入时长',
        dataIndex: 'duration',
        key: 'duration',
        hidden: !colVis.duration,
        sorter: (a, b) => {
          const pa = parseInt(a.duration) || 0;
          const pb = parseInt(b.duration) || 0;
          return pa - pb;
        },
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        filters: [
          { text: '在线', value: '在线' },
          { text: '待重认证', value: '待重认证' },
        ],
        onFilter: (value, record) => record.status === value,
        render: (v) => <Tag color={v === '在线' ? 'green' : 'orange'}>{v}</Tag>,
      },
      {
        title: '操作',
        key: 'actions',
        width: 160,
        render: (_v, r) => (
          <Space size={12}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setDetailId((d) => (d === r.session ? null : r.session));
              }}
            >
              详情
            </a>
            <a
              href="#"
              style={{ color: '#dc2626' }}
              onClick={(e) => {
                e.preventDefault();
                setKickTarget([r]);
              }}
            >
              强制下线
            </a>
          </Space>
        ),
      },
    ];
    return cols;
  }, [colVis]);

  // Expanded row render
  const expandedRowRender = useCallback(
    (r: SessionRow) => (
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#6e6e73',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 10,
          }}
        >
          会话 {r.session} · 完整 RADIUS 属性
        </div>
        <dl className="kv">
          <dt>User-Name</dt><dd>{r.user}</dd>
          <dt>Calling-Station-Id</dt><dd>{r.mac}</dd>
          <dt>Called-Station-Id</dt><dd>{r.called}</dd>
          <dt>NAS-IP-Address / NAS-Port</dt><dd>{r.nasIp} · {r.nasPort}</dd>
          <dt>Framed-IP-Address</dt><dd>{r.ip}</dd>
          <dt>Tunnel-Private-Group-Id</dt><dd>VLAN {r.vlan}</dd>
          <dt>Filter-ID</dt><dd>{r.filterId}</dd>
          <dt>Session-Timeout</dt><dd>{r.timeout} 秒(剩余自动重认证)</dd>
          <dt>Acct-Start-Time</dt><dd>{r.start}</dd>
        </dl>
        <div style={{ marginTop: 12, fontSize: '12.5px' }}>
          <Link to={`/users#user=${encodeURIComponent(r.user)}`}>查看 {r.name} 的用户详情 →</Link>
        </div>
      </div>
    ),
    [],
  );

  return (
    <Shell page="在线会话">
      <PageHeader
        title="在线会话"
        subtitle={<>当前 <b>1,286</b> 个终端在线 · 每 15 秒自动刷新 · 最近刷新 10:24:31</>}
        extra={
          <>
            <Dropdown
              menu={{
                items: COL_VIS_OPTIONS.map(([k, label]) => ({
                  key: k,
                  label: (
                    <Checkbox
                      checked={colVis[k]}
                      onChange={(e) => setColVis((v) => ({ ...v, [k]: e.target.checked }))}
                    >
                      {label}
                    </Checkbox>
                  ),
                })),
              }}
              trigger={['click']}
            >
              <Button data-od-id="col-customize">列自定义 ▾</Button>
            </Dropdown>
            <Button
              data-od-id="export-btn"
              onClick={() => toast('已按当前筛选导出 sessions-20260727.csv(1,286 条)')}
            >
              导出 CSV
            </Button>
          </>
        }
      />

      {/* 主卡片 */}
      <div
        data-od-id="session-table-card"
        style={{
          background: '#fff',
          border: '1px solid #e8e8ed',
          borderRadius: 18,
        }}
      >
        {/* 筛选栏 */}
        <div data-od-id="session-filters" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '14px 20px', borderBottom: '1px solid #e8e8ed' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="f-dept" style={{ fontSize: '11.5px', color: '#6e6e73' }}>部门</label>
            <Select
              id="f-dept"
              value={form.dept}
              onChange={(v) => setForm((f) => ({ ...f, dept: v }))}
              options={SESSION_FILTER_OPTIONS.dept.map((o) => ({ label: o, value: o }))}
              style={{ width: 140 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="f-method" style={{ fontSize: '11.5px', color: '#6e6e73' }}>接入方式</label>
            <Select
              id="f-method"
              value={form.method}
              onChange={(v) => setForm((f) => ({ ...f, method: v }))}
              options={SESSION_FILTER_OPTIONS.method.map((o) => ({ label: o, value: o }))}
              style={{ width: 120 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="f-nas" style={{ fontSize: '11.5px', color: '#6e6e73' }}>接入设备</label>
            <Select
              id="f-nas"
              value={form.nas}
              onChange={(v) => setForm((f) => ({ ...f, nas: v }))}
              options={SESSION_FILTER_OPTIONS.nas.map((o) => ({ label: o, value: o }))}
              style={{ width: 150 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="f-vlan" style={{ fontSize: '11.5px', color: '#6e6e73' }}>VLAN</label>
            <Select
              id="f-vlan"
              value={form.vlan}
              onChange={(v) => setForm((f) => ({ ...f, vlan: v }))}
              options={SESSION_FILTER_OPTIONS.vlan.map((o) => ({ label: o, value: o }))}
              style={{ width: 120 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="f-auth" style={{ fontSize: '11.5px', color: '#6e6e73' }}>认证方式</label>
            <Select
              id="f-auth"
              value={form.auth}
              onChange={(v) => setForm((f) => ({ ...f, auth: v }))}
              options={SESSION_FILTER_OPTIONS.auth.map((o) => ({ label: o, value: o }))}
              style={{ width: 130 }}
            />
          </div>
          <Button type="primary" size="small" onClick={() => setApplied(form)}>筛选</Button>
          <Button size="small" onClick={() => resetFilters()}>重置</Button>
          <div style={{ flex: 1 }} />
          <Button
            danger
            data-od-id="batch-kick"
            disabled={selectedVisible.length === 0}
            onClick={() => setKickTarget(selectedVisible)}
          >
            {selectedVisible.length ? `强制下线(已选 ${selectedVisible.length})` : '强制下线'}
          </Button>
        </div>

        {/* 选中提示 */}
        {selectedVisible.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: '1px solid #e8e8ed', fontSize: '12.5px', color: '#424245' }}>
            <span>已选 <b style={{ color: '#0071e3' }}>{selectedVisible.length}</b> 项</span>
            <a href="#" style={{ marginLeft: 'auto' }} onClick={(e) => { e.preventDefault(); setSelected(new Set()); }}>清除选择</a>
          </div>
        )}

        {/* 表格区域 */}
        {view === 'loading' && (
          <div className="tbl-skel" style={{ padding: 40 }}>
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        )}
        {view === 'error' && (
          <Result
            status="error"
            title="会话数据加载失败"
            subTitle="与 RADIUS 服务的连接超时(NAS-API 504)。请检查服务状态后重试。"
            extra={<Button onClick={retry}>重试</Button>}
          />
        )}
        {view === 'ready' && visible.length === 0 && (
          <Empty
            image={<Inbox style={{ width: 64, height: 64, color: '#86868b' }} />}
            description="当前没有在线会话"
          >
            <span style={{ fontSize: 13, color: '#6e6e73' }}>
              没有符合条件的在线终端。可放宽筛选条件,或等待下一次刷新(每 15 秒自动拉取)。
            </span>
            <br />
            <Button style={{ marginTop: 12 }} onClick={() => resetFilters()}>
              清空筛选条件
            </Button>
          </Empty>
        )}
        {view === 'ready' && visible.length > 0 && (
          <Table
            className="tbl"
            rowKey="session"
            dataSource={visible}
            columns={columns}
            rowSelection={rowSelection}
            expandable={{
              expandedRowRender,
              expandedRowKeys: detailId ? [detailId] : [],
              onExpandedRowsChange: (keys) => setDetailId((keys as string[])[0] ?? null),
            }}
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              showTotal: (_total, range) => `共 1,286 条在线会话,本页显示 ${range[0]}-${range[1]} 条`,
            }}
            size="middle"
            data-od-id="session-table"
            locale={{ emptyText: null }}
          />
        )}
      </div>

      {/* 强制下线确认模态 */}
      <Modal
        open={!!kickTarget}
        title="确认强制下线"
        okText="确认下线"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onCancel={() => setKickTarget(null)}
        onOk={confirmKick}
      >
        {kickTarget && !kickIsBatch && (
          <>
            <p>
              将向接入设备 <b>{kickTarget[0].nasIp}</b> 发送 CoA Disconnect-Request,立即断开以下会话的网络连接。
              <b>终端将瞬间断网</b>,但可随时重新发起 802.1X 认证 —— 该操作用于异常处置,不是封禁,不影响账号与终端准入状态。
            </p>
            <div
              style={{
                background: '#f5f5f7',
                borderRadius: 8,
                padding: '10px 12px',
                marginTop: 10,
                fontFamily: '"SF Mono", monospace',
                fontSize: 12,
                maxHeight: 140,
                overflow: 'auto',
              }}
            >
              {kickTarget[0].name}({kickTarget[0].user})<br />
              {kickTarget[0].mac} · 会话 {kickTarget[0].session}
            </div>
          </>
        )}
        {kickTarget && kickIsBatch && (
          <>
            <p>
              将对 <b>{kickTarget.length}</b> 个在线会话批量发送 Disconnect-Request,
              <b>这些终端将瞬间断网</b>。终端可重新认证接入,操作不封禁账号。请确认这些会话确需处置:
            </p>
            <div
              style={{
                background: '#f5f5f7',
                borderRadius: 8,
                padding: '10px 12px',
                marginTop: 10,
                fontFamily: '"SF Mono", monospace',
                fontSize: 12,
                maxHeight: 140,
                overflow: 'auto',
              }}
            >
              {kickTarget.map((r) => (
                <span key={r.session}>{r.name}({r.user}) · {r.mac}<br /></span>
              ))}
            </div>
          </>
        )}
      </Modal>
    </Shell>
  );
}
