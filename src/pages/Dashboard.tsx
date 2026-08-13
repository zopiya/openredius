import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Row, Col, Card, Statistic, Segmented, Typography, Space, Tag, Progress, theme } from 'antd';
import {
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import TrendChart, { TREND_TODAY } from '../components/charts/TrendChart';
import type { TrendSeries } from '../components/charts/TrendChart';
import { fetchAlerts, fetchKpis, fetchTrend } from '../api/resources/dashboard';
import type { AlertItem, KpiSnapshot } from '../api/resources/dashboard';

const { Text } = Typography;

const DEFAULT_KPIS: KpiSnapshot = {
  online_sessions: 1286, auth_today: 12713, auth_success_rate_today: 98.7,
  nas_online: 6, nas_total: 8, locked_users: 1,
};

const ALERTS_FALLBACK: { time: string; color: string; level: string; to: string; title: string; msg: string }[] = [
  { time: '10:12', color: 'red', level: '严重', to: '/auth-logs#result=失败&nas=SW-5F-01', title: 'SW-5F-01 离线', msg: 'SW-5F-01 设备离线,5F 办公区 32 个在线会话中断' },
  { time: '09:48', color: 'orange', level: '警告', to: '/auth-logs#result=失败&reason=账号锁定', title: '账号锁定', msg: '账号 zhang.wei 连续 5 次密码错误,已锁定 30 分钟' },
  { time: '09:15', color: 'orange', level: '警告', to: '/auth-logs#result=失败&reason=MAC 未绑定', title: 'MAC 未绑定', msg: '财务隔离 VLAN 40 出现未绑定 MAC 接入尝试,已拒绝' },
  { time: '08:57', color: 'default', level: '提示', to: '/devices#tab=ep', title: 'AP 高负载', msg: 'AP-4F-007 接入负载达 92%(46/50),建议扩容' },
  { time: '08:31', color: 'default', level: '提示', to: '/devices#tab=ep', title: '证书临期', msg: '12 张终端证书将于 7 日内到期,可批量换发' },
];

const LEVEL_COLOR: Record<string, string> = { 严重: 'red', 警告: 'orange', 提示: 'default' };

function KpiCard({
  icon, tone, title, value, suffix, valueColor, footer, dataOdId,
}: {
  icon: ReactNode;
  tone: 'primary' | 'success' | 'error' | 'warning';
  title: string;
  value: number | string;
  suffix?: ReactNode;
  valueColor?: string;
  footer: ReactNode;
  dataOdId: string;
}) {
  const { token } = theme.useToken();
  const toneMap = {
    primary: { bg: token.colorPrimaryBg, color: token.colorPrimary },
    success: { bg: token.colorSuccessBg, color: token.colorSuccess },
    error: { bg: token.colorErrorBg, color: token.colorError },
    warning: { bg: token.colorWarningBg, color: token.colorWarning },
  } as const;
  const toneToken = toneMap[tone];
  return (
    <Card data-od-id={dataOdId} size="small">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: toneToken.bg, color: toneToken.color, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>
          {icon}
        </div>
        <Typography.Text type="secondary">{title}</Typography.Text>
      </div>
      <Statistic
        value={value}
        suffix={suffix}
        styles={{ content: { fontSize: 30, fontWeight: 600, lineHeight: 1.2, color: valueColor } }}
      />
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>{footer}</Typography.Text>
    </Card>
  );
}

export default function Dashboard() {
  const { token } = theme.useToken();
  const [mode, setMode] = useState<'today' | '7d'>('today');
  const [kpis, setKpis] = useState<KpiSnapshot>(DEFAULT_KPIS);
  const [trend, setTrend] = useState<TrendSeries>(TREND_TODAY);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchKpis(), fetchTrend(mode), fetchAlerts(20)]).then(([k, t, a]) => {
      if (cancelled) return;
      setKpis(k);
      setTrend(t);
      if (a.length) setAlerts(a);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [mode]);

  const rateVal = kpis.auth_success_rate_today?.toFixed(1) ?? '0.0';
  const failCount = Math.round(kpis.auth_today * (1 - kpis.auth_success_rate_today / 100));
  const alertItems = alerts.length
    ? alerts.map((a) => ({ time: a.created_at.slice(11, 16), level: a.level, to: a.link, title: a.title, msg: a.message }))
    : ALERTS_FALLBACK;

  return (
    <Shell page="仪表盘">
      <PageHeader
        title="仪表盘"
        subtitle="内网准入实时概览 · 数据每 30 秒自动刷新 · 2026-07-27(周一)"
        extra={
          <>
            <Link to="/auth-logs" style={{ fontSize: 13 }}>查看认证日志</Link>
            <Link to="/reports" style={{ fontSize: 13 }}>生成报表</Link>
          </>
        }
      />

      {/* KPI 卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }} data-od-id="kpi-row">
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            dataOdId="kpi-online"
            icon={<TeamOutlined />}
            tone="primary"
            title="当前在线终端"
            value={kpis.online_sessions}
            footer={<>实时 · 较昨日同时段 <Typography.Text type="success">↑ 3.2%</Typography.Text></>}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            dataOdId="kpi-rate"
            icon={<CheckCircleOutlined />}
            tone="success"
            title="今日认证成功率"
            value={rateVal}
            suffix="%"
            footer={<>成功 {(kpis.auth_today - failCount).toLocaleString()} / 共 {kpis.auth_today.toLocaleString()} 次</>}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            dataOdId="kpi-fail"
            icon={<CloseCircleOutlined />}
            tone="error"
            title="今日认证失败"
            value={failCount}
            valueColor={failCount > 20 ? token.colorError : undefined}
            footer="峰值时段 09:00–10:00 · 需关注"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            dataOdId="kpi-alert"
            icon={<WarningOutlined />}
            tone="warning"
            title="准入设备离线告警"
            value={kpis.nas_online}
            suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>/ {kpis.nas_total}</Typography.Text>}
            valueColor={kpis.nas_total - kpis.nas_online > 0 ? token.colorError : undefined}
            footer={<>{kpis.nas_total - kpis.nas_online} 台离线</>}
          />
        </Col>
      </Row>

      {/* 趋势图 + 接入分布 */}
      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card
            data-od-id="trend-card"
            title="24 小时认证趋势"
            extra={
              <Space>
                <Segmented
                  options={[
                    { label: '今日', value: 'today' },
                    { label: '近 7 天', value: '7d' },
                  ]}
                  value={mode}
                  onChange={(v) => setMode(v as 'today' | '7d')}
                  size="small"
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: token.colorPrimary, marginRight: 6 }} />成功
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: token.colorError, margin: '0 6px 0 12px' }} />失败
                </Typography.Text>
              </Space>
            }
          >
            <TrendChart series={trend} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            data-od-id="access-dist"
            title="接入方式分布"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>当前在线</Text>}
          >
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 118, flexShrink: 0 }}>有线 802.1X</span>
                <Progress percent={62} size="small" style={{ flex: 1, margin: 0 }} />
                <span style={{ width: 64, textAlign: 'right', color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums', fontSize: '12.5px' }}>798 · 62%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 118, flexShrink: 0 }}>办公 WiFi</span>
                <Progress percent={38} size="small" strokeColor="#13c2c2" style={{ flex: 1, margin: 0 }} />
                <span style={{ width: 64, textAlign: 'right', color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums', fontSize: '12.5px' }}>488 · 38%</span>
              </div>
            </Space>
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${token.colorBorderSecondary}`, lineHeight: 1.7 }}>
              有线接入以办公位网口为主,WiFi 覆盖会议室与移动办公区;访客统一走 VLAN 30 隔离,不占用员工带宽。
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      {/* 告警列表 */}
      <Card
        data-od-id="alert-list"
        title="最近告警 / 异常 · TOP 5"
        extra={<Link to="/auth-logs">全部认证日志 →</Link>}
        style={{ marginTop: 16 }}
      >
        <div>
          {alertItems.map((a: any, i: number) => (
            <div key={i} style={{ padding: '11px 0', borderBottom: i < alertItems.length - 1 ? `1px solid ${token.colorBorderSecondary}` : 'none' }}>
              <Link className="alert-item" to={a.to} style={{ display: 'flex', alignItems: 'baseline', gap: 12, width: '100%', color: 'inherit', textDecoration: 'none' }}>
                <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12, width: 44, flexShrink: 0 }}>{a.time}</Text>
                <Tag color={LEVEL_COLOR[a.level] ?? 'default'} style={{ flexShrink: 0 }}>{a.level}</Tag>
                <span style={{ color: token.colorTextSecondary }}>{(a as any).msg}</span>
              </Link>
            </div>
          ))}
        </div>
      </Card>
    </Shell>
  );
}
