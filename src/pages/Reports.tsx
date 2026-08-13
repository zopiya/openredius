import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, Row, Col, Segmented, Button, Typography, Table, Tabs, Flex, Progress, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import Donut, { DonutLegend } from '../components/charts/Donut';
import DeptBarChart from '../components/charts/DeptBarChart';
import { useToast } from '../components/Toast';
import {
  DEPT_ROWS, ETYPE_ROWS, exportReport, fetchDepartments, fetchEndpointTypes, fetchSummary, LOAD_TOP, REPORT_PERIODS,
} from '../api/resources/reports';

type Period = '今日' | '本周' | '本月';

const { Text } = Typography;

export default function Reports() {
  const toast = useToast();
  const { token } = theme.useToken();
  const location = useLocation();
  const [period, setPeriod] = useState<Period>('今日');
  const [exporting, setExporting] = useState<null | 'pdf' | 'xlsx'>(null);
  const deepLinked = useRef(false);

  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const h = decodeURIComponent(location.hash.replace('#', ''));
    const m = h.match(/reason=(.+)/);
    if (m) toast('已定位到「' + m[1] + '」的失败原因聚合视图');
  }, []);

  const [data, setData] = useState(REPORT_PERIODS[period]);
  const [etypeRows, setEtypeRows] = useState(ETYPE_ROWS);
  const [deptRows, setDeptRows] = useState(DEPT_ROWS);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSummary(period), fetchEndpointTypes(), fetchDepartments(period)])
      .then(([s, e, d]) => { if (!cancelled) { setData(s); setEtypeRows(e); setDeptRows(d); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [period]);

  const deptCols: ColumnsType<typeof deptRows[number]> = [
    { title: '部门', dataIndex: 'dept', key: 'dept' },
    { title: '在线 / 账号', dataIndex: 'online', key: 'online', render: (v) => <Typography.Text code>{v}</Typography.Text> },
    { title: '认证成功', dataIndex: 'ok', key: 'ok', render: (v) => <Typography.Text code>{v}</Typography.Text> },
    { title: '认证失败', dataIndex: 'fail', key: 'fail', render: (v) => <Typography.Text code>{v}</Typography.Text> },
    { title: '成功率', dataIndex: 'rate', key: 'rate', render: (v) => <Typography.Text code>{v}</Typography.Text> },
  ];

  const deptStats = deptRows.map((r) => ({
    dept: r.dept,
    ok: Number(String(r.ok).replace(/,/g, '')),
    fail: Number(String(r.fail).replace(/,/g, '')),
  }));

  async function handleExport(format: 'pdf' | 'xlsx') {
    setExporting(format);
    try {
      const filename = await exportReport(format, period);
      toast(`已导出 ${filename}`);
    } catch (error) {
      toast(`导出失败：${error instanceof Error ? error.message : '请稍后重试'}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <Shell page="报表统计">
      <PageHeader
        title="报表统计"
        subtitle={data.sub}
        extra={
          <>
            <Segmented
              data-od-id="period-seg"
              options={['今日', '本周', '本月']}
              value={period}
              onChange={(v) => { setPeriod(v as Period); toast('已切换至「' + v + '」统计口径'); }}
              size="small"
            />
            <Button loading={exporting === 'pdf'} disabled={exporting !== null} onClick={() => handleExport('pdf')}>导出 PDF</Button>
            <Button type="primary" data-od-id="export-report" loading={exporting === 'xlsx'} disabled={exporting !== null} onClick={() => handleExport('xlsx')}>导出 Excel</Button>
          </>
        }
      />

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card data-od-id="fail-dist" title="认证失败原因分布" extra={<Text type="secondary" style={{ fontSize: 12 }}>{data.total}</Text>} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <Donut rows={data.fail} ariaLabel="认证失败原因占比环图" />
              <DonutLegend rows={data.fail} />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card data-od-id="etype-dist" title="终端类型准入情况" extra={<Text type="secondary" style={{ fontSize: 12 }}>在线 1,286 台</Text>} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <Donut rows={etypeRows} ariaLabel="在线终端类型占比环图" />
              <DonutLegend rows={etypeRows} />
            </div>
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16 }}>哑终端走 MAC 白名单准入,不校验证书;其余均按策略校验。</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 0 }}>
        <Col xs={24} lg={12}>
          <Card data-od-id="dept-stat" title="部门准入情况" extra={<Link to="/auth-logs" style={{ fontSize: 12 }}>对应日志 →</Link>} style={{ marginBottom: 16 }}>
            <Tabs
              size="small"
              items={[
                { key: 'chart', label: '图表', children: <DeptBarChart rows={deptStats} ariaLabel="部门认证成功与失败对比柱状图" /> },
                { key: 'table', label: '明细', children: <Table rowKey="dept" dataSource={deptRows} columns={deptCols} pagination={false} size="small" /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card data-od-id="load-top" title="设备负载 TOP 6" extra={<Text type="secondary" style={{ fontSize: 12 }}>按当前接入终端 / 容量</Text>} style={{ marginBottom: 16 }}>
            {LOAD_TOP.map((r, i) => (
              <Flex key={r.name} gap={10} align="center" style={{ padding: '9px 0', borderTop: i > 0 ? `1px solid ${token.colorBorderSecondary}` : 'none' }}>
                <Typography.Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12, width: 24 }}>{String(i + 1).padStart(2, '0')}</Typography.Text>
                <div style={{ minWidth: 0 }}><b>{r.name}</b> <Typography.Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.meta}</Typography.Text></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Progress percent={r.pct} showInfo={false} size="small" strokeColor={r.danger ? token.colorError : token.colorText} style={{ width: 110, margin: 0 }} />
                  <span style={{ fontSize: 12, color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums' }}>{r.label}</span>
                </div>
              </Flex>
            ))}
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 14 }}>AP-4F-007 已连续 3 天超过 85% 负载,建议拆分 SSID 或增补 AP。</Typography.Text>
          </Card>
        </Col>
      </Row>
    </Shell>
  );
}
