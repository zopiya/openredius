import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Shell from '../components/Shell';
import Donut, { DonutLegend } from '../components/charts/Donut';
import { useToast } from '../components/Toast';
import { DEPT_ROWS, ETYPE_ROWS, LOAD_TOP, REPORT_PERIODS } from '../data/reports';

type Period = '今日' | '本周' | '本月';

export default function Reports() {
  const toast = useToast();
  const location = useLocation();
  const [period, setPeriod] = useState<Period>('今日');
  const deepLinked = useRef(false);

  /* 深链:认证日志失败原因标签跳转,给出定位反馈 */
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const h = decodeURIComponent(location.hash.replace('#', ''));
    const m = h.match(/reason=(.+)/);
    if (m) toast('已定位到「' + m[1] + '」的失败原因聚合视图');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = REPORT_PERIODS[period];

  return (
    <Shell page="报表统计">
      <div className="page-head">
        <div>
          <h1>报表统计</h1>
          <div className="page-sub">{data.sub}</div>
        </div>
        <div className="page-actions">
          <div className="seg" data-od-id="period-seg">
            {(['今日', '本周', '本月'] as Period[]).map((p) => (
              <button key={p} className={period === p ? 'on' : ''} onClick={() => { setPeriod(p); toast('已切换至「' + p + '」统计口径'); }}>{p}</button>
            ))}
          </div>
          <button className="btn btn-outline" onClick={() => toast('已生成 access-report-20260727.pdf(含 4 个统计模块)')}>导出 PDF</button>
          <button className="btn btn-primary" data-od-id="export-report" onClick={() => toast('已导出 access-report-20260727.xlsx(3 个工作表)')}>导出 Excel</button>
        </div>
      </div>

      <div className="grid g-1-1">
        <section className="card" data-od-id="fail-dist">
          <div className="card-head">
            <div className="card-title">认证失败原因分布</div>
            <div className="card-extra">{data.total}</div>
          </div>
          <div className="card-body" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <Donut rows={data.fail} ariaLabel="认证失败原因占比环图" />
            <DonutLegend rows={data.fail} />
          </div>
        </section>

        <section className="card" data-od-id="etype-dist">
          <div className="card-head">
            <div className="card-title">终端类型准入情况</div>
            <div className="card-extra">在线 1,286 台</div>
          </div>
          <div className="card-body" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <Donut rows={ETYPE_ROWS} ariaLabel="在线终端类型占比环图" />
            <DonutLegend rows={ETYPE_ROWS} />
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>哑终端走 MAC 白名单准入,不校验证书;其余均按策略校验。</div>
          </div>
        </section>
      </div>

      <div className="grid g-1-1 mt">
        <section className="card" data-od-id="dept-stat">
          <div className="card-head">
            <div className="card-title">部门准入情况</div>
            <div className="card-extra"><Link to="/auth-logs">对应日志 →</Link></div>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>部门</th><th className="num">在线 / 账号</th><th className="num">认证成功</th><th className="num">认证失败</th><th className="num">成功率</th></tr></thead>
                <tbody>
                  {DEPT_ROWS.map((r) => (
                    <tr key={r.dept}>
                      <td>{r.dept}</td><td className="num mono">{r.online}</td><td className="num mono">{r.ok}</td><td className="num mono">{r.fail}</td><td className="num mono">{r.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="card" data-od-id="load-top">
          <div className="card-head">
            <div className="card-title">设备负载 TOP 6</div>
            <div className="card-extra">按当前接入终端 / 容量</div>
          </div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            {LOAD_TOP.map((r, i) => (
              <div className="rank-row" key={r.name}>
                <span className="rank-no">{String(i + 1).padStart(2, '0')}</span>
                <div className="rank-name"><b>{r.name}</b> <span className="mono">{r.meta}</span></div>
                <div className="rank-bar">
                  <div className="bar-track"><div className={`bar-fill ${r.danger ? 'fill-danger' : ''}`} style={{ width: r.pct + '%' }}></div></div>
                  <span className="bar-val">{r.label}</span>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--muted)' }}>AP-4F-007 已连续 3 天超过 85% 负载,建议拆分 SSID 或增补 AP。</div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
