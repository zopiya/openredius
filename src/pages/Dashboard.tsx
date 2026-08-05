import { useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import TrendChart, { TREND_TODAY, TREND_WEEK } from '../components/charts/TrendChart';

const ALERTS = [
  {
    time: '10:12', badge: 'bg-danger', level: '严重',
    to: '/auth-logs#result=失败&nas=SW-5F-01',
    title: '跳转至认证日志:SW-5F-01 相关失败记录',
    msg: (<><b>SW-5F-01</b> 设备离线,5F 办公区 32 个在线会话中断,等待终端重认证</>),
  },
  {
    time: '09:48', badge: 'bg-warn', level: '警告',
    to: '/auth-logs#result=失败&reason=账号锁定',
    title: '跳转至认证日志:账号锁定记录',
    msg: (<><span>账号 <b>zhang.wei</b> 连续 5 次密码错误,已按策略锁定 30 分钟</span></>),
  },
  {
    time: '09:15', badge: 'bg-warn', level: '警告',
    to: '/auth-logs#result=失败&reason=MAC 未绑定',
    title: '跳转至认证日志:MAC 未绑定记录',
    msg: (<>财务隔离 <b>VLAN 40</b> 出现未绑定 MAC(3C:52:82:9F:1C:44)接入尝试,已拒绝</>),
  },
  {
    time: '08:57', badge: 'bg-muted', level: '提示',
    to: '/devices#tab=ep',
    title: '跳转至设备管理:终端准入清单',
    msg: (<><b>AP-4F-007</b> 接入负载达 92%(46/50),建议扩容或分流</>),
  },
  {
    time: '08:31', badge: 'bg-muted', level: '提示',
    to: '/devices#tab=ep',
    title: '跳转至设备管理:证书临期终端',
    msg: (<><b>12 张</b>终端证书将于 7 日内到期,可在设备管理中批量换发</>),
  },
];

export default function Dashboard() {
  const [mode, setMode] = useState<'today' | '7d'>('today');
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
          <div className="kpi-value">1,286</div>
          <div className="kpi-delta"><b className="up">▲ 3.2%</b> 较昨日同时段</div>
        </div>
        <div className="kpi" data-od-id="kpi-rate">
          <div className="kpi-label">今日认证成功率</div>
          <div className="kpi-value">98.7%</div>
          <div className="kpi-delta"><b className="up">▲ 0.4pp</b> 较昨日(98.3%)</div>
          <div className="kpi-meta">成功 12,547 / 共 12,713 次</div>
        </div>
        <div className="kpi" data-od-id="kpi-fail">
          <div className="kpi-label">今日认证失败</div>
          <div className="kpi-value">166</div>
          <div className="kpi-delta"><b className="up">▼ 18.2%</b> 较昨日(203 次)</div>
          <div className="kpi-meta">峰值时段 09:00–10:00 · 27 次</div>
        </div>
        <div className="kpi" data-od-id="kpi-alert">
          <div className="kpi-label">准入设备离线告警</div>
          <div className="kpi-value">3</div>
          <div className="kpi-delta"><b className="down">▲ 2</b> 较昨日(1 台)</div>
          <div className="kpi-meta">SW-5F-01 等 · 最近离线 10:12</div>
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
            <TrendChart series={mode === 'today' ? TREND_TODAY : TREND_WEEK} />
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
          {ALERTS.map((a) => (
            <Link key={a.time} className="alert-item" to={a.to} style={{ textDecoration: 'none', color: 'inherit' }} title={a.title}>
              <span className="alert-time">{a.time}</span>
              <span className={`badge ${a.badge}`}>{a.level}</span>
              <span className="alert-msg">{a.msg}</span>
            </Link>
          ))}
        </div>
      </section>
    </Shell>
  );
}
