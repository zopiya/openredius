import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Row, Col, Card, Statistic, Segmented, List, Typography, Space, Tag } from 'antd';
import {
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import Shell from '../components/Shell';
import TrendChart, { TREND_TODAY } from '../components/charts/TrendChart';
import type { TrendSeries } from '../components/charts/TrendChart';
import { fetchAlerts, fetchKpis, fetchTrend } from '../api/resources/dashboard';
import type { AlertItem, KpiSnapshot } from '../api/resources/dashboard';

const { Title, Text } = Typography;

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

export default function Dashboard() {
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
      {/* 页头 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <Title level={1} style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>仪表盘</Title>
          <Text type="secondary" style={{ fontSize: 13, marginTop: 6, display: 'block' }}>
            内网准入实时概览 · 数据每 30 秒自动刷新 · 2026-07-27(周一)
          </Text>
        </div>
        <Space>
          <Link to="/auth-logs" style={{ fontSize: 13 }}>查看认证日志</Link>
          <Link to="/reports" style={{ fontSize: 13 }}>生成报表</Link>
        </Space>
      </div>

      {/* KPI 卡片 */}
      <Row gutter={16} className="grid-kpi" style={{ marginBottom: 16 }} data-od-id="kpi-row">
        <Col xs={24} sm={12} lg={6}>
          <Card className="kpi" data-od-id="kpi-online" size="small" style={{ borderRadius: 18 }}>
            <Statistic
              title="当前在线终端"
              value={kpis.online_sessions}
              valueStyle={{ fontSize: 33, fontWeight: 600, fontFamily: '"SF Pro Display", sans-serif' }}
              prefix={<TeamOutlined />}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>实时 · 较昨日同时段</Text>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="kpi" data-od-id="kpi-rate" size="small" style={{ borderRadius: 18 }}>
            <Statistic
              title="今日认证成功率"
              value={rateVal}
              precision={1}
              suffix="%"
              valueStyle={{ fontSize: 33, fontWeight: 600, fontFamily: '"SF Pro Display", sans-serif' }}
              prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              成功 {(kpis.auth_today - failCount).toLocaleString()} / 共 {kpis.auth_today.toLocaleString()} 次
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="kpi" data-od-id="kpi-fail" size="small" style={{ borderRadius: 18 }}>
            <Statistic
              title="今日认证失败"
              value={failCount}
              valueStyle={{ fontSize: 33, fontWeight: 600, fontFamily: '"SF Pro Display", sans-serif', color: failCount > 20 ? '#dc2626' : undefined }}
              prefix={<CloseCircleOutlined style={{ color: '#dc2626' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              峰值时段 09:00–10:00 · —
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="kpi" data-od-id="kpi-alert" size="small" style={{ borderRadius: 18 }}>
            <Statistic
              title="准入设备离线告警"
              value={kpis.nas_online}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>/ {kpis.nas_total}</Text>}
              valueStyle={{ fontSize: 33, fontWeight: 600, fontFamily: '"SF Pro Display", sans-serif', color: kpis.nas_total - kpis.nas_online > 0 ? '#dc2626' : undefined }}
              prefix={<WarningOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              {kpis.nas_total - kpis.nas_online} 台离线
            </Text>
          </Card>
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
                <span style={{ fontSize: 12, color: '#6e6e73' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#0071e3', marginRight: 6 }} />成功
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#dc2626', margin: '0 6px 0 12px' }} />失败
                </span>
              </Space>
            }
            style={{ borderRadius: 18 }}
          >
            <TrendChart series={trend} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            data-od-id="access-dist"
            title="接入方式分布"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>当前在线</Text>}
            style={{ borderRadius: 18 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <span style={{ width: 118, flexShrink: 0 }}>有线 802.1X</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#f5f5f7', overflow: 'hidden' }}>
                  <div style={{ width: '62%', height: '100%', borderRadius: 4, background: '#0071e3' }} />
                </div>
                <span style={{ width: 64, textAlign: 'right', color: '#424245', fontVariantNumeric: 'tabular-nums', fontSize: '12.5px' }}>798 · 62%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <span style={{ width: 118, flexShrink: 0 }}>办公 WiFi</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#f5f5f7', overflow: 'hidden' }}>
                  <div style={{ width: '38%', height: '100%', borderRadius: 4, background: '#1d1d1f', opacity: 0.55 }} />
                </div>
                <span style={{ width: 64, textAlign: 'right', color: '#424245', fontVariantNumeric: 'tabular-nums', fontSize: '12.5px' }}>488 · 38%</span>
              </div>
            </div>
            <div style={{ marginTop: 18, borderTop: '1px solid #e8e8ed', paddingTop: 14, fontSize: '12.5px', color: '#6e6e73', lineHeight: 1.7 }}>
              有线接入以办公位网口为主,WiFi 覆盖会议室与移动办公区;访客统一走 VLAN 30 隔离,不占用员工带宽。
            </div>
          </Card>
        </Col>
      </Row>

      {/* 告警列表 */}
      <Card
        data-od-id="alert-list"
        title="最近告警 / 异常 · TOP 5"
        extra={<Link to="/auth-logs">全部认证日志 →</Link>}
        style={{ borderRadius: 18, marginTop: 16 }}
      >
        <List
          dataSource={alertItems}
          split={false}
          renderItem={(a: any) => (
            <List.Item style={{ padding: '11px 0', borderBottom: '1px solid #e8e8ed' }}>
              <Link className="alert-item" to={a.to} style={{ display: 'flex', alignItems: 'baseline', gap: 12, width: '100%', color: 'inherit', textDecoration: 'none', fontSize: 13 }}>
                <Text type="secondary" style={{ fontFamily: '"SF Mono", monospace', fontSize: 12, width: 44, flexShrink: 0 }}>{a.time}</Text>
                <Tag color={LEVEL_COLOR[a.level] ?? 'default'} style={{ flexShrink: 0 }}>{a.level}</Tag>
                <span style={{ color: '#424245' }}>
                  {/* render bold parts by splitting on bold markers or using the original msg */}
                  {(a as any).msg}
                </span>
              </Link>
            </List.Item>
          )}
        />
      </Card>
    </Shell>
  );
}
