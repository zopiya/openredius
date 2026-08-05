import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileSearch } from 'lucide-react';
import Shell from '../components/Shell';
import Modal from '../components/Modal';
import { SkeletonTable, EmptyState, ErrorState } from '../components/states';
import { useToast } from '../components/Toast';
import { LOG_FILTER_OPTIONS, LOG_ROWS, type LogRow } from '../data/logs';

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

/** 与原型 auth-logs.html applyFilters 完全一致的匹配规则 */
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
  const [timeRange, setTimeRange] = useState('今日(00:00 至今)');
  const [form, setForm] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [advOpen, setAdvOpen] = useState(false);
  const [detail, setDetail] = useState<LogRow | null>(null);
  const [prefillNote, setPrefillNote] = useState('');
  const deepLinked = useRef(false);

  /* 骨架 → 数据(与原型一致:500ms) */
  useEffect(() => {
    if (view !== 'loading') return;
    const t = window.setTimeout(() => setView('ready'), 500);
    return () => window.clearTimeout(t);
  }, [view]);

  /* 深链预填筛选(仪表盘告警 / 用户详情 / 报表跳转):#result=失败&nas=SW-5F-01 */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => LOG_ROWS.filter((r) => matches(r, applied)), [applied]);

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

  return (
    <Shell page="认证日志">
      <div className="page-head">
        <div>
          <h1>认证日志</h1>
          <div className="page-sub">全量 Access-Request 审计记录 · 保留 180 天 · 失败原因点击可跳转聚合分析{prefillNote}</div>
        </div>
        <div className="page-actions">
          <Link className="btn btn-outline" to="/reports" data-od-id="fail-aggregate">失败原因聚合分析 →</Link>
          <button className="btn btn-primary" data-od-id="export-btn" onClick={() => toast('已按当前筛选导出 auth-logs-20260727.csv(12,713 条)')}>导出日志</button>
        </div>
      </div>

      <section className="card" data-od-id="log-card">
        <div className="filters" data-od-id="log-filters">
          <div className="f-item"><label htmlFor="time-range">时间范围</label>
            <select className="sel" id="time-range" value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              {LOG_FILTER_OPTIONS.timeRange.map((o) => <option key={o}>{o}</option>)}
              <option value="custom">自定义…</option>
            </select>
          </div>
          {timeRange === 'custom' && (
            <div className="f-item"><label>自定义日期</label>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input className="inp" type="date" style={{ width: 148 }} aria-label="开始日期" /> 至 <input className="inp" type="date" style={{ width: 148 }} aria-label="结束日期" />
              </span>
            </div>
          )}
          <div className="f-item"><label htmlFor="f-user">用户</label>
            <input className="inp" type="text" id="f-user" placeholder="账号 / 姓名 / MAC" value={form.user} onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))} />
          </div>
          <div className="f-item"><label htmlFor="f-result">认证结果</label>
            <select className="sel" id="f-result" value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}>
              <option>全部</option><option>成功</option><option>失败</option>
            </select>
          </div>
          <button className="btn btn-primary btn-sm" style={{ height: 30 }} onClick={() => setApplied(form)}>筛选</button>
          <button className="btn btn-outline btn-sm" style={{ height: 30 }} onClick={() => resetFilters()}>重置</button>
          <div className="f-spacer"></div>
          <button className="btn btn-outline btn-sm" style={{ height: 30 }} aria-expanded={advOpen} data-od-id="adv-toggle" onClick={() => setAdvOpen((o) => !o)}>{advOpen ? '高级筛选 ▴' : '高级筛选 ▾'}</button>
        </div>
        {advOpen && (
          <div className="filters adv" data-od-id="adv-filters">
            <div className="f-item"><label htmlFor="f-reason">失败原因</label>
              <select className="sel" id="f-reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}>
                {LOG_FILTER_OPTIONS.reason.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="f-item"><label htmlFor="f-nas">接入设备</label>
              <select className="sel" id="f-nas" value={form.nas} onChange={(e) => setForm((f) => ({ ...f, nas: e.target.value }))}>
                {LOG_FILTER_OPTIONS.nas.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="f-item"><label htmlFor="f-eap">认证方式</label>
              <select className="sel" id="f-eap" value={form.eap} onChange={(e) => setForm((f) => ({ ...f, eap: e.target.value }))}>
                {LOG_FILTER_OPTIONS.eap.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="stat-strip">
          <span>今日共 <b>12,713</b> 条</span>
          <span>成功 <b style={{ color: 'var(--success)' }}>12,547</b>(98.7%)</span>
          <span>失败 <b style={{ color: 'var(--danger)' }}>166</b>(1.3%)</span>
          <span>涉及用户 <b>942</b> · 接入设备 <b>37</b></span>
        </div>

        <div className="tbl-wrap">
          {view === 'loading' && <SkeletonTable cols={8} widths={['w-40', 'w-60', 'w-80', 'w-60', 'w-40', 'w-40', 'w-60', '']} />}
          {view === 'ready' && visible.length > 0 && (
            <table className="tbl" data-od-id="log-table">
              <thead>
                <tr>
                  <th>时间</th><th>用户名</th><th>终端 MAC</th><th>接入设备</th>
                  <th>认证方式</th><th>结果</th><th>失败原因</th><th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.time + r.user}>
                    <td className="mono">{r.time}</td>
                    <td><b>{r.name}</b><span className="sub mono">{r.sub}</span></td>
                    <td className="mono">{r.mac}</td>
                    <td>{r.nasName}<span className="sub mono">{r.nasSub}</span></td>
                    <td>{r.eap}</td>
                    <td><span className={`badge ${r.reply === 'Access-Accept' ? 'bg-success' : 'bg-danger'}`}>{r.reply === 'Access-Accept' ? '成功' : '失败'}</span></td>
                    <td>
                      {r.reason ? (
                        <Link className={`rtag ${r.rtagClass}`} to={`/reports#reason=${encodeURIComponent(r.reason)}`} title="跳转失败原因聚合分析">{r.reason}</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td><div className="row-ops"><a href="#" onClick={(e) => { e.preventDefault(); setDetail(r); }}>详情</a></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {view === 'ready' && visible.length === 0 && (
          <EmptyState
            icon={FileSearch}
            title="没有符合条件的认证记录"
            desc="当前筛选条件下无日志。可放宽时间范围或失败原因筛选;日志保留 180 天。"
            actionText="清空筛选条件"
            onAction={() => resetFilters()}
          />
        )}
        {view === 'error' && (
          <ErrorState
            title="日志数据加载失败"
            desc={<>日志存储查询超时(<b>LOG-STORE 504</b>)。180 天归档数据未受影响,请重试。</>}
            onRetry={retry}
          />
        )}
        {view === 'ready' && visible.length > 0 && (
          <div className="stat-strip" style={{ borderTop: '1px solid var(--border-soft)', borderBottom: 'none' }}>
            <span>本页 <b>{visible.length}</b> 条(筛选实时生效)/ 今日全量 <b>12,713</b> 条</span>
            <span style={{ marginLeft: 'auto' }}><a href="#" onClick={(e) => e.preventDefault()}>上一页</a> · 第 1 / 1,060 页 · <a href="#" onClick={(e) => e.preventDefault()}>下一页</a></span>
          </div>
        )}
      </section>

      <Modal open={!!detail} title="认证详情" width={520} onClose={() => setDetail(null)}>
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
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--muted)' }}>完整报文已归档,可通过导出获取 pcap / JSON 原始记录。</div>
          </>
        )}
      </Modal>
    </Shell>
  );
}
