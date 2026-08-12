import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import TrendChart, { TREND_TODAY } from '../components/charts/TrendChart';
import type { TrendSeries } from '../components/charts/TrendChart';
import { fetchAlerts, fetchKpis, fetchTrend } from '../api/resources/dashboard';
import type { AlertItem, KpiSnapshot } from '../api/resources/dashboard';

const DEFAULT_KPIS: KpiSnapshot = {
  online_sessions: 1286, auth_today: 12713, auth_success_rate_today: 98.7,
  nas_online: 6, nas_total: 8, locked_users: 1,
};

const ALERTS_FALLBACK = [
  { time: '10:12', badge: 'bg-danger', level: '严重', to: '/auth-logs#result=失败&nas=SW-5F-01', title: 'SW-5F-01 离线', msg: (<><b>SW-5F-01</b> 设备离线,5F 办公区 32 个在线会话中断</>) },
  { time: '09:48', badge: 'bg-warn', level: '警告', to: '/auth-logs#result=失败&reason=账号锁定', title: '账号锁定', msg: (<><span>账号 <b>zhang.wei</b> 连续 5 次密码错误,已锁定 30 分钟</span></>) },
  { time: '09:15', badge: 'bg-warn', level: '警告', to: '/auth-logs#result=失败&reason=MAC 未绑定', title: 'MAC 未绑定', msg: (<>财务隔离 <b>VLAN 40</b> 出现未绑定 MAC 接入尝试,已拒绝</>) },
  { time: '08:57', badge: 'bg-muted', level: '提示', to: '/devices#tab=ep', title: 'AP 高负载', msg: (<><b>AP-4F-007</b> 接入负载达 92%(46/50),建议扩容</>) },
  { time: '08:31', badge: 'bg-muted', level: '提示', to: '/devices#tab=ep', title: '证书临期', msg: (<><b>12 张</b>终端证书将于 7 日内到期,可批量换发</>) },
] as const;

const LEVEL_BADGE: Record<string, string> = { 严重: 'bg-danger', 警告: 'bg-warn', 提示: 'bg-muted' };

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

  return (
    <Shell page="仪表盘">
      <div className="page-head">
        <div>
          <h1>仪表盘</h1>
          <div className="page-sub">内网准入实时概览 · 数据每 30 秒自动刷新 · 2026-07-27(周一)</div>
        </div>
        <div className="page-actions">
          <Link className="btn btn-outline" to="/auth-logs">查看认证日志</Link>
          <Link className="btn btn-primary" to="/reports">生成报表</Link>
        </div>
      </div>

      <div className="grid-kpi" data-od-id="kpi-row">
        <div className="kpi" data-od-id="kpi-online">
          <div className="kpi-label">当前在线终端</div>
          <div className="kpi-value">{kpis.online_sessions.toLocaleString()}</div>
          <div className="kpi-delta"><b className="up">实时</b> 较昨日同时段</div>
        </div>
        <div className="kpi" data-od-id="kpi-rate">
          <div className="kpi-label">今日认证成功率</div>
          <div className="kpi-value">{rateVal}%</div>
          <div className="kpi-delta"><b className="up">实时</b> 较昨日(98.3%)</div>
          <div className="kpi-meta">成功 {(kpis.auth_today - failCount).toLocaleString()} / 共 {kpis.auth_today.toLocaleString()} 次</div>
        </div>
        <div className="kpi" data-od-id="kpi-fail">
          <div className="kpi-label">今日认证失败</div>
          <div className="kpi-value">{failCount}</div>
          <div className="kpi-delta"><b className="up">实时</b> 今日截止当前</div>
          <div className="kpi-meta">峰值时段 09:00–10:00 · —</div>
        </div>
        <div className="kpi" data-od-id="kpi-alert">
          <div className="kpi-label">准入设备离线告警</div>
          <div className="kpi-value">{kpis.nas_online}</div>
          <div className="kpi-delta"><b className="down">共 {kpis.nas_total}</b> 台 NAS 纳管</div>
          <div className="kpi-meta">{kpis.nas_total - kpis.nas_online} 台离线</div>
        </div>
      </div>

      <div className="grid g-2-1">
        <section className="card" data-od-id="trend-card">
          <div className="card-head">
            <div className="card-title">24 小时认证趋势</div>
            <div className="card-extra">
              <div className="seg" role="tablist" aria-label="趋势时间粒度">
                <button className={mode === 'today' ? 'on' : ''} role="tab" aria-selected={mode === 'today'} onClick={() => setMode('today')}>今日</button>
                <button className={mode === '7d' ? 'on' : ''} role="tab" aria-selected={mode === '7d'} onClick={() => setMode('7d')}>近 7 天</button>
              </div>
              <span className="legend"><span><i className="l-ok"></i>成功</span><span><i className="l-fail"></i>失败</span></span>
            </div>
          </div>
          <div className="card-body">
            <TrendChart series={trend} />
          </div>
        </section>

        <section className="card" data-od-id="access-dist">
          <div className="card-head">
            <div className="card-title">接入方式分布</div>
            <div className="card-extra">当前在线</div>
          </div>
          <div className="card-body">
            <div className="bar-row">
              <span>有线 802.1X</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: "62%" }}></div></div>
              <span className="bar-val">798 · 62%</span>
            </div>
            <div className="bar-row">
              <span>办公 WiFi</span>
              <div className="bar-track"><div className="bar-fill fill-fg" style={{ width: "38%" }}></div></div>
              <span className="bar-val">488 · 38%</span>
            </div>
            <div style={{ marginTop: 18, borderTop: '1px solid var(--border-soft)', paddingTop: 14, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
              有线接入以办公位网口为主,WiFi 覆盖会议室与移动办公区;访客统一走 VLAN 30 隔离,不占用员工带宽。
            </div>
          </div>
        </section>
      </div>

      <section className="card mt" data-od-id="alert-list">
        <div className="card-head">
          <div className="card-title">最近告警 / 异常 · TOP 5</div>
          <div className="card-extra"><Link to="/auth-logs">全部认证日志 →</Link></div>
        </div>
        <div className="card-body">
          {(alerts.length ? alerts.map((a) => (
            <Link key={a.id} className="alert-item" to={a.link} style={{ textDecoration: 'none', color: 'inherit' }} title={a.title}>
              <span className="alert-time">{a.created_at.slice(11, 16)}</span>
              <span className={`badge ${LEVEL_BADGE[a.level] ?? 'bg-muted'}`}>{a.level}</span>
              <span className="alert-msg">{a.message}</span>
            </Link>
          )) : ALERTS_FALLBACK.map((a) => (
            <Link key={a.time} className="alert-item" to={a.to} style={{ textDecoration: 'none', color: 'inherit' }} title={a.title}>
              <span className="alert-time">{a.time}</span>
              <span className={`badge ${a.badge}`}>{a.level}</span>
              <span className="alert-msg">{a.msg}</span>
            </Link>
          )))}
        </div>
      </section>
    </Shell>
  );
}
