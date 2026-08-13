import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileSearchOutlined } from '@ant-design/icons';
import { Table, Select, Button, Space, Modal, Input, Tag, Empty, Skeleton, Result, Descriptions, Typography, theme, Flex, Card } from 'antd';
import type { TableColumnsType } from 'antd';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import TableToolbar, { FilterField } from '../components/TableToolbar';
import { useToast } from '../components/Toast';
import { exportAuthLogsCsv, fetchAuthLogs, LOG_FILTER_OPTIONS, type LogRow } from '../api/resources/logs';
import { MODE } from '../api/config';

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

/** 失败原因标签色调映射(rt-* → antd Tag color) */
const RTAG_COLOR: Record<string, string> = {
  'rt-warn': 'warning',
  'rt-danger': 'error',
  'rt-muted': 'default',
  'rt-info': 'processing',
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
  const { token } = theme.useToken();
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
    if (MODE === 'http') {
      setView('loading');
      fetchAuthLogs({ user: next.user, result: next.result, reason: next.reason, nas: next.nas, eap: next.eap })
        .then((data) => { setRows(data); setView('ready'); })
        .catch(() => setView('error'));
    }
    setPrefillNote('  · 已按链接预填筛选:' + notes.join(' / '));
    toast('已按链接预填筛选条件');
  }, []);

  const visible = useMemo(
    () => (MODE === 'http' ? rows : rows.filter((r) => matches(r, applied))),
    [rows, applied],
  );

  function applyFilters() {
    setApplied(form);
    if (MODE !== 'http') return;
    setView('loading');
    fetchAuthLogs({ user: form.user, result: form.result, reason: form.reason, nas: form.nas, eap: form.eap })
      .then((data) => { setRows(data); setView('ready'); })
      .catch(() => setView('error'));
  }

  function resetFilters(silent = false) {
    setTimeRange('今日(00:00 至今)');
    setForm(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    if (MODE === 'http') {
      setView('loading');
      fetchAuthLogs().then((data) => { setRows(data); setView('ready'); }).catch(() => setView('error'));
    }
    if (!silent) toast('已清空筛选条件');
  }

  function retry() {
    setView('loading');
    window.setTimeout(() => {
      setView('ready');
      toast('已重新连接,日志数据已刷新');
    }, 450);
  }

  const columns: TableColumnsType<LogRow> = [
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 110,
      render: (v) => <Typography.Text code>{v}</Typography.Text>,
    },
    {
      title: '用户名',
      key: 'user',
      render: (_v, r) => (
        <>
          <b>{r.name}</b>
          <Typography.Text type="secondary" style={{ display: 'block', fontFamily: 'monospace' }}>{r.sub}</Typography.Text>
        </>
      ),
    },
    {
      title: '终端 MAC',
      dataIndex: 'mac',
      key: 'mac',
      width: 172,
      render: (v) => <Typography.Text code>{v}</Typography.Text>,
    },
    {
      title: '接入设备',
      key: 'nas',
      render: (_v, r) => (
        <>
          {r.nasName}
          <Typography.Text type="secondary" style={{ display: 'block', fontFamily: 'monospace' }}>{r.nasSub}</Typography.Text>
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
          <Link to={`/reports#reason=${encodeURIComponent(v)}`} title="跳转失败原因聚合分析">
            <Tag color={RTAG_COLOR[r.rtagClass ?? ''] ?? 'default'}>{v}</Tag>
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
            <Button type="primary" data-od-id="export-btn" onClick={() => {
              if (MODE !== 'http') { toast('已导出 auth-logs.csv(mock 占位)'); return; }
              exportAuthLogsCsv({ user: applied.user, result: applied.result, reason: applied.reason, nas: applied.nas, eap: applied.eap }).then(() => toast('已导出认证日志 CSV')).catch((e) => toast(`导出失败:${e instanceof Error ? e.message : String(e)}`));
            }}>
              导出日志
            </Button>
          </>
        }
      />

      {/* 主卡片 */}
      <Card data-od-id="log-card" styles={{ body: { padding: 0 } }}>
        {/* 筛选栏 */}
        <TableToolbar
          data-od-id="log-filters"
          actions={
            <Button size="small" aria-expanded={advOpen} data-od-id="adv-toggle" onClick={() => setAdvOpen((o) => !o)}>
              {advOpen ? '高级筛选 ▴' : '高级筛选 ▾'}
            </Button>
          }
        >
          <FilterField label="时间范围" htmlFor="time-range">
            <Select
              id="time-range"
              value={timeRange}
              onChange={setTimeRange}
              options={[...LOG_FILTER_OPTIONS.timeRange.map((o) => ({ label: o, value: o })), { label: '自定义…', value: 'custom' }]}
              style={{ width: 180 }}
            />
          </FilterField>
          {timeRange === 'custom' && (
            <FilterField label="自定义日期">
              <Space>
                <Input aria-label="开始日期" type="date" style={{ width: 148 }} />
                <span>至</span>
                <Input aria-label="结束日期" type="date" style={{ width: 148 }} />
              </Space>
            </FilterField>
          )}
          <FilterField label="用户" htmlFor="f-user">
            <Input
              id="f-user"
              placeholder="账号 / 姓名 / MAC"
              value={form.user}
              onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
              style={{ width: 160 }}
            />
          </FilterField>
          <FilterField label="认证结果" htmlFor="f-result">
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
          </FilterField>
          <Space>
            <Button type="primary" size="small" onClick={applyFilters}>筛选</Button>
            <Button size="small" onClick={() => resetFilters()}>重置</Button>
          </Space>
        </TableToolbar>

        {/* 高级筛选 */}
        {advOpen && (
          <Flex wrap="wrap" align="flex-end" gap={12} data-od-id="adv-filters" style={{ padding: '14px 20px', borderTop: `1px dashed ${token.colorBorder}`, background: token.colorBgLayout, borderBottom: 'none' }}>
            <FilterField label="失败原因" htmlFor="f-reason">
              <Select
                id="f-reason"
                value={form.reason}
                onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
                options={LOG_FILTER_OPTIONS.reason.map((o) => ({ label: o, value: o }))}
                style={{ width: 140 }}
              />
            </FilterField>
            <FilterField label="接入设备" htmlFor="f-nas">
              <Select
                id="f-nas"
                value={form.nas}
                onChange={(v) => setForm((f) => ({ ...f, nas: v }))}
                options={LOG_FILTER_OPTIONS.nas.map((o) => ({ label: o, value: o }))}
                style={{ width: 150 }}
              />
            </FilterField>
            <FilterField label="认证方式" htmlFor="f-eap">
              <Select
                id="f-eap"
                value={form.eap}
                onChange={(v) => setForm((f) => ({ ...f, eap: v }))}
                options={LOG_FILTER_OPTIONS.eap.map((o) => ({ label: o, value: o }))}
                style={{ width: 130 }}
              />
            </FilterField>
          </Flex>
        )}

        {/* 统计条 */}
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', padding: '12px 20px', borderBottom: `1px solid ${token.colorBorderSecondary}`, color: token.colorTextTertiary }}>
          <span>今日共 <b style={{ color: token.colorText }}>12,713</b> 条</span>
          <span>成功 <b style={{ color: token.colorSuccess }}>12,547</b>(98.7%)</span>
          <span>失败 <b style={{ color: token.colorError }}>166</b>(1.3%)</span>
          <span>涉及用户 <b style={{ color: token.colorText }}>942</b> · 接入设备 <b style={{ color: token.colorText }}>37</b></span>
        </div>

        {/* 表格 */}
        {view === 'loading' && (
          <div style={{ padding: 40 }}>
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
        )}
        {view === 'ready' && visible.length > 0 && (
          <Table
           
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
            image={<FileSearchOutlined style={{ width: 64, height: 64, color: token.colorTextQuaternary }} />}
            description="没有符合条件的认证记录"
            style={{ padding: '56px 24px' }}
          >
            <Typography.Text type="secondary">
              当前筛选条件下无日志。可放宽时间范围或失败原因筛选;日志保留 180 天。
            </Typography.Text>
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
      </Card>

      {/* 详情模态 */}
      <Modal open={!!detail} title="认证详情" width={520} footer={null} onCancel={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'user', label: 'User-Name', children: detail.user },
                { key: 'csi', label: 'Calling-Station-Id', children: detail.mac },
                { key: 'nas', label: '接入设备', children: detail.nas },
                { key: 'eap', label: 'EAP 类型', children: detail.eap },
                { key: 'reply', label: 'RADIUS 回应', children: detail.reply },
                { key: 'attr', label: '下发 / 返回属性', children: detail.attr },
              ]}
            />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 14 }}>
              完整报文已归档,可通过导出获取 pcap / JSON 原始记录。
            </Typography.Text>
          </>
        )}
      </Modal>
    </Shell>
  );
}
