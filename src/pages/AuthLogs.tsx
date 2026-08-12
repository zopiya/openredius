import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileSearch } from 'lucide-react';
import { Table, Select, Button, Space, Modal, Input, Tag, Empty, Skeleton, Result } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { fetchAuthLogs, LOG_FILTER_OPTIONS, type LogRow } from '../api/resources/logs';

interface Filters {
  user: string;
  result: string;
  reason: string;
  nas: string;
  eap: string;
}

const DEFAULT_FILTERS: Filters = {
  user: '',
  result: '全部',
  reason: '全部原因',
  nas: '全部设备',
  eap: '全部',
};

function matches(row: LogRow, f: Filters) {
  const kw = f.user.trim().toLowerCase();
  if (kw && `${row.user} ${row.name} ${row.mac}`.toLowerCase().indexOf(kw) < 0) return false;
  if (f.result !== '全部' && (f.result === '成功') !== (row.reply === 'Access-Accept')) return false;
  if (f.reason !== '全部原因' && row.reason !== f.reason) return false;
  if (f.nas !== '全部设备' && row.nas.indexOf(f.nas) !== 0) return false;
  if (f.eap !== '全部' && row.eap !== f.eap) return false;
  return true;
}

export default function AuthLogs() {
  const toast = useToast();
  const location = useLocation();
  const [view, setView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [timeRange, setTimeRange] = useState('今日(00:00 至今)');
  const [form, setForm] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [advOpen, setAdvOpen] = useState(false);
  const [detail, setDetail] = useState<LogRow | null>(null);
  const [prefillNote, setPrefillNote] = useState('');
  const deepLinked = useRef(false);

  useEffect(() => {
    if (view !== 'loading') return;
    let cancelled = false;
    fetchAuthLogs()
      .then((data) => { if (!cancelled) { setRows(data); setView('ready'); } })
      .catch(() => { if (!cancelled) setView('error'); });
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const h = decodeURIComponent(location.hash.replace('#', ''));
    if (!h) return;
    const kv: Record<string, string> = {};
    h.split('&').forEach((p) => {
      const i = p.indexOf('=');
      kv[p.slice(0, i)] = p.slice(i + 1);
    });
    const notes: string[] = [];
    const next = { ...DEFAULT_FILTERS };
    let needAdv = false;
    if (kv.result === '失败') { next.result = '失败'; notes.push('结果「失败」'); }
    if (kv.reason) {
      if (LOG_FILTER_OPTIONS.reason.includes(kv.reason as never)) next.reason = kv.reason;
      needAdv = true; notes.push(`原因「${kv.reason}」`);
    }
    if (kv.nas) {
      if (LOG_FILTER_OPTIONS.nas.includes(kv.nas as never)) next.nas = kv.nas;
      needAdv = true; notes.push(`设备「${kv.nas}」`);
    }
    if (kv.user) { next.user = kv.user; notes.push(`用户「${kv.user}」`); }
    if (!notes.length) return;
    setForm(next);
    setApplied(next);
    if (needAdv) setAdvOpen(true);
    setPrefillNote('  · 已按链接预填筛选:' + notes.join(' / '));
    toast('已按链接预填筛选条件');
  }, []);

  const visible = useMemo(() => rows.filter((r) => matches(r, applied)), [rows, applied]);

  function resetFilters(silent = false) {
    setTimeRange('今日(00:00 至今)');
    setForm(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    if (!silent) toast('已清空筛选条件');
  }

  function retry() {
    setView('loading');
    window.setTimeout(() => {
      setView('ready');
      toast('已重新连接,日志数据已刷新');
    }, 450);
  }

  const columns: ColumnsType<LogRow> = [
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 80,
      render: (v) => <span style={{ fontFamily: '"SF Mono", monospace', fontSize: '12.5px' }}>{v}</span>,
    },
    {
      title: '用户名',
      key: 'user',
      render: (_v, r) => (
        <>
          <b>{r.name}</b>
          <div style={{ fontSize: '12.5px', color: '#6e6e73', fontFamily: '"SF Mono", monospace' }}>{r.sub}</div>
        </>
      ),
    },
    {
      title: '终端 MAC',
      dataIndex: 'mac',
      key: 'mac',
      width: 150,
      render: (v) => <span style={{ fontFamily: '"SF Mono", monospace', fontSize: '12.5px' }}>{v}</span>,
    },
    {
      title: '接入设备',
      key: 'nas',
      render: (_v, r) => (
        <>
          {r.nasName}
          <div style={{ fontSize: '12.5px', color: '#6e6e73', fontFamily: '"SF Mono", monospace' }}>{r.nasSub}</div>
        </>
      ),
    },
    {
      title: '认证方式',
      dataIndex: 'eap',
      key: 'eap',
      filters: LOG_FILTER_OPTIONS.eap.filter((e) => e !== '全部').map((e) => ({ text: e, value: e })),
      onFilter: (value, record) => record.eap === value,
    },
    {
      title: '结果',
      key: 'result',
      width: 80,
      filters: [
        { text: '成功', value: '成功' },
        { text: '失败', value: '失败' },
      ],
      onFilter: (value, record) => (value === '成功') === (record.reply === 'Access-Accept'),
      render: (_v, r) => (
        <Tag color={r.reply === 'Access-Accept' ? 'green' : 'red'}>
          {r.reply === 'Access-Accept' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '失败原因',
      dataIndex: 'reason',
      key: 'reason',
      render: (v, r) =>
        v ? (
          <Link
            className={`rtag ${r.rtagClass}`}
            to={`/reports#reason=${encodeURIComponent(v)}`}
            title="跳转失败原因聚合分析"
          >
            {v}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_v, r) => (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setDetail(r);
          }}
        >
          详情
        </a>
      ),
    },
  ];

  return (
    <Shell page="认证日志">
      <PageHeader
        title="认证日志"
        subtitle={<>全量 Access-Request 审计记录 · 保留 180 天 · 失败原因点击可跳转聚合分析{prefillNote}</>}
        extra={
          <>
            <Link to="/reports" data-od-id="fail-aggregate" style={{ fontSize: 13 }}>失败原因聚合分析 →</Link>
            <Button type="primary" data-od-id="export-btn" onClick={() => toast('已按当前筛选导出 auth-logs-20260727.csv(12,713 条)')}>
              导出日志
            </Button>
          </>
        }
      />

      {/* 主卡片 */}
      <div
        data-od-id="log-card"
        style={{ background: '#fff', border: '1px solid #e8e8ed', borderRadius: 18 }}
      >
        {/* 筛选栏 */}
        <div data-od-id="log-filters" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '14px 20px', borderBottom: '1px solid #e8e8ed' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="time-range" style={{ fontSize: '11.5px', color: '#6e6e73' }}>时间范围</label>
            <Select
              id="time-range"
              value={timeRange}
              onChange={setTimeRange}
              options={[...LOG_FILTER_OPTIONS.timeRange.map((o) => ({ label: o, value: o })), { label: '自定义…', value: 'custom' }]}
              style={{ width: 180 }}
            />
          </div>
          {timeRange === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: '11.5px', color: '#6e6e73' }}>自定义日期</label>
              <Space>
                <Input aria-label="开始日期" type="date" style={{ width: 148 }} />
                <span>至</span>
                <Input aria-label="结束日期" type="date" style={{ width: 148 }} />
              </Space>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="f-user" style={{ fontSize: '11.5px', color: '#6e6e73' }}>用户</label>
            <Input
              id="f-user"
              placeholder="账号 / 姓名 / MAC"
              value={form.user}
              onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
              style={{ width: 160 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="f-result" style={{ fontSize: '11.5px', color: '#6e6e73' }}>认证结果</label>
            <Select
              id="f-result"
              value={form.result}
              onChange={(v) => setForm((f) => ({ ...f, result: v }))}
              options={[
                { label: '全部', value: '全部' },
                { label: '成功', value: '成功' },
                { label: '失败', value: '失败' },
              ]}
              style={{ width: 100 }}
            />
          </div>
          <Button type="primary" size="small" onClick={() => setApplied(form)}>筛选</Button>
          <Button size="small" onClick={() => resetFilters()}>重置</Button>
          <div style={{ flex: 1 }} />
          <Button size="small" aria-expanded={advOpen} data-od-id="adv-toggle" onClick={() => setAdvOpen((o) => !o)}>
            {advOpen ? '高级筛选 ▴' : '高级筛选 ▾'}
          </Button>
        </div>

        {/* 高级筛选 */}
        {advOpen && (
          <div data-od-id="adv-filters" className="filters adv" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '14px 20px', borderTop: '1px dashed #e8e8ed', background: '#fbfbfd', borderBottom: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label htmlFor="f-reason" style={{ fontSize: '11.5px', color: '#6e6e73' }}>失败原因</label>
              <Select
                id="f-reason"
                value={form.reason}
                onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
                options={LOG_FILTER_OPTIONS.reason.map((o) => ({ label: o, value: o }))}
                style={{ width: 140 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label htmlFor="f-nas" style={{ fontSize: '11.5px', color: '#6e6e73' }}>接入设备</label>
              <Select
                id="f-nas"
                value={form.nas}
                onChange={(v) => setForm((f) => ({ ...f, nas: v }))}
                options={LOG_FILTER_OPTIONS.nas.map((o) => ({ label: o, value: o }))}
                style={{ width: 150 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label htmlFor="f-eap" style={{ fontSize: '11.5px', color: '#6e6e73' }}>认证方式</label>
              <Select
                id="f-eap"
                value={form.eap}
                onChange={(v) => setForm((f) => ({ ...f, eap: v }))}
                options={LOG_FILTER_OPTIONS.eap.map((o) => ({ label: o, value: o }))}
                style={{ width: 130 }}
              />
            </div>
          </div>
        )}

        {/* 统计条 */}
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid #e8e8ed', fontSize: '12.5px', color: '#6e6e73' }}>
          <span>今日共 <b style={{ color: '#1d1d1f', fontWeight: 600 }}>12,713</b> 条</span>
          <span>成功 <b style={{ color: '#16a34a' }}>12,547</b>(98.7%)</span>
          <span>失败 <b style={{ color: '#dc2626' }}>166</b>(1.3%)</span>
          <span>涉及用户 <b style={{ color: '#1d1d1f', fontWeight: 600 }}>942</b> · 接入设备 <b style={{ color: '#1d1d1f', fontWeight: 600 }}>37</b></span>
        </div>

        {/* 表格 */}
        {view === 'loading' && (
          <div className="tbl-skel" style={{ padding: 40 }}>
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
        )}
        {view === 'ready' && visible.length > 0 && (
          <Table
            className="tbl"
            rowKey={(r) => r.time + r.user}
            dataSource={visible}
            columns={columns}
            data-od-id="log-table"
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              showTotal: (_total, range) => `本页 ${range[0]}-${range[1]} 条 / 今日全量 12,713 条`,
            }}
            size="middle"
          />
        )}
        {view === 'ready' && visible.length === 0 && (
          <Empty
            image={<FileSearch style={{ width: 64, height: 64, color: '#86868b' }} />}
            description="没有符合条件的认证记录"
            style={{ padding: '56px 24px' }}
          >
            <span style={{ fontSize: 13, color: '#6e6e73' }}>
              当前筛选条件下无日志。可放宽时间范围或失败原因筛选;日志保留 180 天。
            </span>
            <br />
            <Button style={{ marginTop: 12 }} onClick={() => resetFilters()}>
              清空筛选条件
            </Button>
          </Empty>
        )}
        {view === 'error' && (
          <Result
            status="error"
            title="日志数据加载失败"
            subTitle="日志存储查询超时(LOG-STORE 504)。180 天归档数据未受影响,请重试。"
            extra={<Button onClick={retry}>重试</Button>}
          />
        )}
      </div>

      {/* 详情模态 */}
      <Modal open={!!detail} title="认证详情" width={520} footer={null} onCancel={() => setDetail(null)}>
        {detail && (
          <>
            <dl className="kv">
              <dt>User-Name</dt><dd>{detail.user}</dd>
              <dt>Calling-Station-Id</dt><dd>{detail.mac}</dd>
              <dt>接入设备</dt><dd>{detail.nas}</dd>
              <dt>EAP 类型</dt><dd>{detail.eap}</dd>
              <dt>RADIUS 回应</dt><dd>{detail.reply}</dd>
              <dt>下发 / 返回属性</dt><dd>{detail.attr}</dd>
            </dl>
            <div style={{ marginTop: 14, fontSize: 12, color: '#6e6e73' }}>
              完整报文已归档,可通过导出获取 pcap / JSON 原始记录。
            </div>
          </>
        )}
      </Modal>
    </Shell>
  );
}
