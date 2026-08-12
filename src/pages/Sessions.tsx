import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import Shell from '../components/Shell';
import Modal from '../components/Modal';
import { SkeletonTable, EmptyState, ErrorState } from '../components/states';
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

/** 与原型 sessions.html applyFilters 完全一致的匹配规则 */
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

export default function Sessions() {
  const toast = useToast();
  const [view, setView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rows, setRows] = useState<SessionRow[]>(SESSION_ROWS);
  const [form, setForm] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [colpickOpen, setColpickOpen] = useState(false);
  const [colVis, setColVis] = useState<Record<ColKey, boolean>>({
    mac: true, nas: true, vlan: true, auth: true, duration: true,
  });
  const [kickTarget, setKickTarget] = useState<SessionRow[] | null>(null);

  /* 数据拉取(与原型一致:先展示骨架片刻) */
  useEffect(() => {
    if (view !== 'loading') return;
    let cancelled = false;
    fetchSessions()
      .then((data) => { if (!cancelled) { setRows(data); setView('ready'); } })
      .catch(() => { if (!cancelled) setView('error'); });
    return () => { cancelled = true; };
  }, [view]);

  /* 列选择面板:点击外部关闭 */
  useEffect(() => {
    if (!colpickOpen) return;
    const onClick = () => setColpickOpen(false);
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [colpickOpen]);

  const visible = useMemo(() => rows.filter((r) => matches(r, applied)), [rows, applied]);
  const selectedVisible = visible.filter((r) => selected.has(r.session));

  function resetFilters(silent = false) {
    setForm(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    if (!silent) toast('已清空筛选条件');
  }

  function toggleSelect(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((r) => (on ? next.add(r.session) : next.delete(r.session)));
      return next;
    });
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

  const colStyle = (k: ColKey) => (colVis[k] ? undefined : { display: 'none' });
  const allChecked = visible.length > 0 && visible.every((r) => selected.has(r.session));

  const kickIsBatch = (kickTarget?.length ?? 0) > 1;

  return (
    <Shell page="在线会话">
      <div className="page-head">
        <div>
          <h1>在线会话</h1>
          <div className="page-sub">当前 <b>1,286</b> 个终端在线 · 每 15 秒自动刷新 · 最近刷新 10:24:31</div>
        </div>
        <div className="page-actions">
          <div className="colpick">
            <button className="btn btn-outline" data-od-id="col-customize" onClick={(e) => { e.stopPropagation(); setColpickOpen((o) => !o); }}>列自定义 ▾</button>
            <div className={colpickOpen ? 'colpick-panel show' : 'colpick-panel'} onClick={(e) => e.stopPropagation()}>
              {([['mac', '终端 MAC'], ['nas', '接入设备'], ['vlan', 'VLAN'], ['auth', '认证方式'], ['duration', '接入时长']] as [ColKey, string][]).map(([k, label]) => (
                <label key={k}>
                  <input type="checkbox" checked={colVis[k]} onChange={(e) => setColVis((v) => ({ ...v, [k]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <button className="btn btn-outline" data-od-id="export-btn" onClick={() => toast('已按当前筛选导出 sessions-20260727.csv(1,286 条)')}>导出 CSV</button>
        </div>
      </div>

      <section className="card" data-od-id="session-table-card">
        <div className="filters" data-od-id="session-filters">
          <div className="f-item"><label htmlFor="f-dept">部门</label>
            <select className="sel" id="f-dept" value={form.dept} onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}>
              {SESSION_FILTER_OPTIONS.dept.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="f-item"><label htmlFor="f-method">接入方式</label>
            <select className="sel" id="f-method" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
              {SESSION_FILTER_OPTIONS.method.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="f-item"><label htmlFor="f-nas">接入设备</label>
            <select className="sel" id="f-nas" value={form.nas} onChange={(e) => setForm((f) => ({ ...f, nas: e.target.value }))}>
              {SESSION_FILTER_OPTIONS.nas.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="f-item"><label htmlFor="f-vlan">VLAN</label>
            <select className="sel" id="f-vlan" value={form.vlan} onChange={(e) => setForm((f) => ({ ...f, vlan: e.target.value }))}>
              {SESSION_FILTER_OPTIONS.vlan.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="f-item"><label htmlFor="f-auth">认证方式</label>
            <select className="sel" id="f-auth" value={form.auth} onChange={(e) => setForm((f) => ({ ...f, auth: e.target.value }))}>
              {SESSION_FILTER_OPTIONS.auth.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" style={{ height: 30 }} onClick={() => setApplied(form)}>筛选</button>
          <button className="btn btn-outline btn-sm" style={{ height: 30 }} onClick={() => resetFilters()}>重置</button>
          <div className="f-spacer"></div>
          <button className="btn btn-danger" data-od-id="batch-kick" disabled={selectedVisible.length === 0} onClick={() => setKickTarget(selectedVisible)}>
            {selectedVisible.length ? `强制下线(已选 ${selectedVisible.length})` : '强制下线'}
          </button>
        </div>

        {selectedVisible.length > 0 && (
          <div className="stat-strip" style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--fg-2)' }}>
            <span>已选 <b style={{ color: 'var(--accent)' }}>{selectedVisible.length}</b> 项</span>
            <a href="#" style={{ marginLeft: 'auto' }} onClick={(e) => { e.preventDefault(); setSelected(new Set()); }}>清除选择</a>
          </div>
        )}

        <div className="tbl-wrap">
          {view === 'loading' && <SkeletonTable cols={10} widths={['w-60', 'w-80', 'w-60', '', 'w-40', 'w-60', '', 'w-40', 'w-40', '']} />}
          {view === 'error' && (
            <ErrorState
              title="会话数据加载失败"
              desc={<>与 RADIUS 服务的连接超时(<b>NAS-API 504</b>)。请检查服务状态后重试;重试前列表保持最后一次成功快照。</>}
              onRetry={retry}
            />
          )}
          {view === 'ready' && visible.length === 0 && (
            <EmptyState
              icon={Inbox}
              title="当前没有在线会话"
              desc="没有符合条件的在线终端。可放宽筛选条件,或等待下一次刷新(每 15 秒自动拉取)。"
              actionText="清空筛选条件"
              onAction={() => resetFilters()}
            />
          )}
          {view === 'ready' && visible.length > 0 && (
            <table className="tbl" data-od-id="session-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}><input type="checkbox" aria-label="全选" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} /></th>
                  <th>用户名</th>
                  <th style={colStyle('mac')}>终端 MAC</th>
                  <th>接入方式</th>
                  <th style={colStyle('nas')}>接入设备</th>
                  <th style={colStyle('vlan')}>VLAN</th>
                  <th style={colStyle('auth')}>认证方式</th>
                  <th style={colStyle('duration')}>接入时长</th>
                  <th>状态</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <Fragment key={r.session}>
                    <tr>
                      <td><input type="checkbox" aria-label="选择" checked={selected.has(r.session)} onChange={(e) => toggleSelect(r.session, e.target.checked)} /></td>
                      <td><b>{r.name}</b><span className="sub mono">{r.user} · {r.dept}</span></td>
                      <td style={colStyle('mac')} className="mono">{r.mac}</td>
                      <td><span className="tag">{r.method}</span></td>
                      <td style={colStyle('nas')}>{r.nas}<span className="sub mono">{r.nasSub}</span></td>
                      <td style={colStyle('vlan')} className="mono">{r.vlanLabel}</td>
                      <td style={colStyle('auth')}>{r.auth}</td>
                      <td style={colStyle('duration')}>{r.duration}</td>
                      <td><span className={`badge ${r.status === '在线' ? 'bg-success' : 'bg-warn'}`}>{r.status}</span></td>
                      <td><div className="row-ops"><a href="#" onClick={(e) => { e.preventDefault(); setDetailId((d) => (d === r.session ? null : r.session)); }}>详情</a><a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); setKickTarget([r]); }}>强制下线</a></div></td>
                    </tr>
                    {detailId === r.session && (
                      <tr className="detail-row">
                        <td colSpan={10}>
                          <div className="d-sec-t" style={{ marginBottom: 10 }}>会话 {r.session} · 完整 RADIUS 属性</div>
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
                          <div style={{ marginTop: 12, fontSize: 12.5 }}><Link to={`/users#user=${encodeURIComponent(r.user)}`}>查看 {r.name} 的用户详情 →</Link></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {view === 'ready' && visible.length > 0 && (
          <div className="stat-strip" style={{ borderTop: '1px solid var(--border-soft)', borderBottom: 'none' }}>
            <span>共 <b>1,286</b> 条在线会话,本页显示 <b>{visible.length}</b> 条</span>
            <span style={{ marginLeft: 'auto' }}><a href="#" onClick={(e) => e.preventDefault()}>上一页</a> · <a href="#" onClick={(e) => e.preventDefault()}>下一页</a></span>
          </div>
        )}
      </section>

      <Modal
        open={!!kickTarget}
        title="确认强制下线"
        cancelText="取消"
        okText="确认下线"
        okClass="btn-danger-solid"
        onClose={() => setKickTarget(null)}
        onOk={confirmKick}
      >
        {kickTarget && !kickIsBatch && (
          <>将向接入设备 <b>{kickTarget[0].nasIp}</b> 发送 CoA Disconnect-Request,立即断开以下会话的网络连接。<b>终端将瞬间断网</b>,但可随时重新发起 802.1X 认证 —— 该操作用于异常处置,不是封禁,不影响账号与终端准入状态。
            <div className="mono-list">{kickTarget[0].name}({kickTarget[0].user})<br />{kickTarget[0].mac} · 会话 {kickTarget[0].session}</div>
          </>
        )}
        {kickTarget && kickIsBatch && (
          <>将对 <b>{kickTarget.length}</b> 个在线会话批量发送 Disconnect-Request,<b>这些终端将瞬间断网</b>。终端可重新认证接入,操作不封禁账号。请确认这些会话确需处置:
            <div className="mono-list">{kickTarget.map((r) => (<span key={r.session}>{r.name}({r.user}) · {r.mac}<br /></span>))}</div>
          </>
        )}
      </Modal>
    </Shell>
  );
}
