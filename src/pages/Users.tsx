import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Users } from 'lucide-react';
import Shell from '../components/Shell';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import { SkeletonTable, EmptyState, ErrorState } from '../components/states';
import { useToast } from '../components/Toast';
import { POLICY_RULES, USER_FILTER_OPTIONS, USER_ROWS, type UserRow } from '../data/users';

interface Filters {
  dept: string;
  status: string;
  policy: string;
  kw: string;
}

const DEFAULT_FILTERS: Filters = { dept: '全部部门', status: '全部状态', policy: '全部策略组', kw: '' };

function matches(row: UserRow, f: Filters) {
  if (f.dept !== '全部部门' && row.dept !== f.dept) return false;
  if (f.status !== '全部状态' && row.status !== f.status) return false;
  if (f.policy !== '全部策略组' && row.policy !== f.policy) return false;
  const kw = f.kw.trim().toLowerCase();
  if (kw && (row.name + ' ' + row.account).toLowerCase().indexOf(kw) < 0) return false;
  return true;
}

const STATUS_BADGE: Record<UserRow['status'], string> = {
  正常: 'bg-success',
  停用: 'bg-muted',
  锁定: 'bg-danger',
};

type ModalKind =
  | { kind: 'batch'; verb: string; danger: boolean; rows: UserRow[] }
  | { kind: 'policy'; rows: UserRow[] }
  | { kind: 'disable'; row: UserRow }
  | { kind: 'sync-log' }
  | { kind: 'sync-error' }
  | null;

export default function UsersPage() {
  const toast = useToast();
  const location = useLocation();
  const [view, setView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [form, setForm] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerUser, setDrawerUser] = useState<UserRow | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [policyPick, setPolicyPick] = useState('办公默认组');
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<'success' | 'syncing'>('success');
  const [syncLast, setSyncLast] = useState('10:00');
  const [syncSummary, setSyncSummary] = useState('(新增 12 / 更新 3 / 停用 1)');
  const deepLinked = useRef(false);

  /* 骨架 → 数据(与原型一致:500ms) */
  useEffect(() => {
    if (view !== 'loading') return;
    const t = window.setTimeout(() => setView('ready'), 500);
    return () => window.clearTimeout(t);
  }, [view]);

  /* 深链:#user=wang.lei → 打开对应用户详情抽屉 */
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const h = decodeURIComponent(location.hash.replace('#', ''));
    const m = h.match(/user=(.+)/);
    if (!m) return;
    const row = USER_ROWS.find((r) => r.account === m[1]);
    if (row) setDrawerUser(row);
    else toast('用户 ' + m[1] + ' 不在当前页,请通过关键词搜索定位');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => USER_ROWS.filter((r) => matches(r, applied)), [applied]);
  const selectedVisible = visible.filter((r) => selected.has(r.account));

  function resetFilters(silent = false) {
    setForm(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    if (!silent) toast('已清空筛选条件');
  }

  function toggleSelect(account: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(account); else next.delete(account);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((r) => (on ? next.add(r.account) : next.delete(r.account)));
      return next;
    });
  }

  function startSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncState('syncing');
    setSyncSummary('(正在拉取 AD 增量变更…)');
    window.setTimeout(() => {
      setSyncing(false);
      setSyncState('success');
      setSyncLast('10:26');
      setSyncSummary('(新增 2 / 更新 5 / 停用 0)');
      toast('AD 增量同步完成:新增 2 / 更新 5,耗时 38 秒');
    }, 1800);
  }

  function confirmModal() {
    if (!modal) return;
    if (modal.kind === 'batch') toast('已对 ' + modal.rows.length + ' 个账号执行「' + modal.verb + '」');
    if (modal.kind === 'policy') toast('已为 ' + modal.rows.length + ' 个账号更新策略组');
    if (modal.kind === 'disable') {
      toast('账号 ' + modal.row.account + ' 已停用');
      setDrawerUser(null);
    }
    if (modal.kind === 'sync-log') toast('已重新触发昨天 22:00 的失败任务,请留意通知');
    if (modal.kind === 'sync-error') toast('已重新触发同步,请留意通知');
    setModal(null);
  }

  function retry() {
    setView('loading');
    window.setTimeout(() => {
      setView('ready');
      toast('已重新连接,用户目录已刷新');
    }, 450);
  }

  const allChecked = visible.length > 0 && visible.every((r) => selected.has(r.account));
  const drawerRule = drawerUser ? (POLICY_RULES[drawerUser.policy] ?? '—') : '—';

  return (
    <Shell page="用户管理">
      <div className="page-head">
        <div>
          <h1>用户管理</h1>
          <div className="page-sub">共 <b>1,472</b> 个账号,源自 AD 域同步 · 正常 1,408 / 停用 52 / 锁定 12</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => toast('已导出 users-20260727.csv(1,472 条)')}>导出清单</button>
          <button className="btn btn-primary" data-od-id="sync-now" disabled={syncing} onClick={startSync}>{syncing ? '同步中…' : '立即同步 AD'}</button>
        </div>
      </div>

      <div className="notice" data-od-id="ad-sync-status">
        <Check style={{ width: 16, height: 16, color: 'var(--success)' }} />
        <div className="grow">AD 域 <b>corp.example.com</b> · 上次同步 <b>{syncLast}</b> <span className={syncState === 'success' ? 'badge bg-success' : 'badge bg-info'}>{syncState === 'success' ? '成功' : '同步中'}</span><span>{syncSummary}</span>,下次同步 <b>11:00</b> · 周期 60 分钟 · <Link to="/settings">对接配置</Link></div>
        <a href="#" onClick={(e) => { e.preventDefault(); setModal({ kind: 'sync-log' }); }}>同步记录</a>
      </div>

      <section className="card" data-od-id="user-card">
        <div className="filters" data-od-id="user-filters">
          <div className="f-item"><label htmlFor="fu-dept">部门</label>
            <select className="sel" id="fu-dept" value={form.dept} onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}>
              {USER_FILTER_OPTIONS.dept.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="f-item"><label htmlFor="fu-status">状态</label>
            <select className="sel" id="fu-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {USER_FILTER_OPTIONS.status.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="f-item"><label htmlFor="fu-policy">策略组</label>
            <select className="sel" id="fu-policy" value={form.policy} onChange={(e) => setForm((f) => ({ ...f, policy: e.target.value }))}>
              {USER_FILTER_OPTIONS.policy.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="f-item"><label htmlFor="fu-kw">关键词</label>
            <input className="inp" type="text" id="fu-kw" placeholder="姓名 / 账号" value={form.kw} onChange={(e) => setForm((f) => ({ ...f, kw: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-sm" style={{ height: 30 }} onClick={() => setApplied(form)}>筛选</button>
          <button className="btn btn-outline btn-sm" style={{ height: 30 }} onClick={() => resetFilters()}>重置</button>
          <div className="f-spacer"></div>
          <button className="btn btn-outline" disabled={selectedVisible.length === 0} onClick={() => setModal({ kind: 'batch', verb: '启用', danger: false, rows: selectedVisible })}>批量启用</button>
          <button className="btn btn-danger" disabled={selectedVisible.length === 0} onClick={() => setModal({ kind: 'batch', verb: '停用', danger: true, rows: selectedVisible })}>批量停用</button>
          <button className="btn btn-outline" disabled={selectedVisible.length === 0} onClick={() => { setPolicyPick('办公默认组'); setModal({ kind: 'policy', rows: selectedVisible }); }}>分配策略组</button>
        </div>

        {selectedVisible.length > 0 && (
          <div className="stat-strip" style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--fg-2)' }}>
            <span>已选 <b style={{ color: 'var(--accent)' }}>{selectedVisible.length}</b> 项,可执行右上方批量操作</span>
            <a href="#" style={{ marginLeft: 'auto', color: 'var(--muted)' }} onClick={(e) => { e.preventDefault(); setSelected(new Set()); }}>清除选择</a>
          </div>
        )}

        <div className="tbl-wrap">
          {view === 'loading' && <SkeletonTable cols={8} widths={['', 'w-60', 'w-40', 'w-40', 'w-40', 'w-60', 'w-40', '']} />}
          {view === 'ready' && visible.length > 0 && (
            <table className="tbl" data-od-id="user-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}><input type="checkbox" aria-label="全选" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} /></th>
                  <th>姓名 / 账号</th><th>所属部门</th><th>状态</th><th>绑定终端数</th>
                  <th>所属策略组</th><th>最近认证时间</th><th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.account}>
                    <td><input type="checkbox" aria-label="选择" checked={selected.has(r.account)} onChange={(e) => toggleSelect(r.account, e.target.checked)} /></td>
                    <td><b>{r.name}</b><span className="sub mono">{r.account}</span></td>
                    <td>{r.dept}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      {r.statusSub && <span className="sub">{r.statusSub}</span>}
                    </td>
                    <td className="mono">{r.devices}</td>
                    <td>{r.policy}</td>
                    <td className="mono">{r.lastAuth}</td>
                    <td><div className="row-ops"><a href="#" onClick={(e) => { e.preventDefault(); setDrawerUser(r); }}>详情</a></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {view === 'ready' && visible.length === 0 && (
          <EmptyState icon={Users} title="没有符合条件的用户" desc="当前筛选条件下无账号。可放宽部门 / 状态 / 策略组条件,或修改关键词。" actionText="清空筛选条件" onAction={() => resetFilters()} />
        )}
        {view === 'error' && (
          <ErrorState title="用户数据加载失败" desc={<>无法读取用户目录(<b>DIR-SYNC 503</b>)。可重试,或先到「系统设置 → AD/LDAP」检查对接状态。</>} onRetry={retry} />
        )}
        {view === 'ready' && visible.length > 0 && (
          <div className="stat-strip" style={{ borderTop: '1px solid var(--border-soft)', borderBottom: 'none' }}>
            <span>共 <b>1,472</b> 个账号,本页显示 <b>{visible.length}</b> 条</span>
            <span style={{ marginLeft: 'auto' }}><a href="#" onClick={(e) => e.preventDefault()}>上一页</a> · <a href="#" onClick={(e) => e.preventDefault()}>下一页</a></span>
          </div>
        )}
      </section>

      <Drawer
        open={!!drawerUser}
        title={drawerUser ? drawerUser.name + ' · ' + drawerUser.account : '用户详情'}
        onClose={() => setDrawerUser(null)}
        foot={<>
          <button className="btn btn-danger" onClick={() => drawerUser && setModal({ kind: 'disable', row: drawerUser })}>停用账号</button>
          <button className="btn btn-primary" onClick={() => toast('终端绑定编辑:请在设备管理 → 终端准入清单中操作')}>编辑绑定终端</button>
        </>}
      >
        {drawerUser && (
          <>
            <div className="crumb"><Link to="/users">用户管理</Link><span className="sep">/</span><span className="cur">用户详情</span></div>
            <dl className="kv plain">
              <dt>姓名 / 账号</dt><dd>{drawerUser.name} · {drawerUser.account}</dd>
              <dt>所属部门 / 职位</dt><dd>{drawerUser.dept} · {drawerUser.title}</dd>
              <dt>账号状态</dt><dd>{drawerUser.status}</dd>
              <dt>账号来源</dt><dd>AD 同步(corp.example.com)</dd>
              <dt>最近认证</dt><dd>2026-07-27,SW-3F-01 · EAP-TLS</dd>
            </dl>

            <div className="d-sec">
              <div className="d-sec-t">所属策略组</div>
              <dl className="kv plain">
                <dt>当前策略组</dt><dd>{drawerUser.policy}</dd>
                <dt>下发规则</dt><dd>{drawerRule}</dd>
              </dl>
            </div>

            <div className="d-sec">
              <div className="d-sec-t">绑定终端(2)</div>
              <table className="tbl">
                <thead><tr><th>MAC</th><th>证书指纹(SHA-256)</th><th>合规</th></tr></thead>
                <tbody>
                  <tr><td className="mono">3C:52:82:1A:4B:01</td><td className="mono">9F:2A:…:71:C0</td><td><span className="badge bg-success">合规</span></td></tr>
                  <tr><td className="mono">A4:83:E7:22:9C:7E</td><td className="mono">B1:08:…:3E:9A</td><td><span className="badge bg-warn">证书 30 天内到期</span></td></tr>
                </tbody>
              </table>
            </div>

            <div className="d-sec">
              <div className="d-sec-t">历史认证记录(最近 5 条)</div>
              <table className="tbl">
                <thead><tr><th>时间</th><th>接入设备</th><th>结果</th></tr></thead>
                <tbody>
                  <tr><td className="mono">07-27 10:24</td><td>SW-3F-01 · Gi1/0/12</td><td><span className="badge bg-success">成功</span></td></tr>
                  <tr><td className="mono">07-27 06:12</td><td>SW-3F-01 · Gi1/0/12</td><td><span className="badge bg-success">成功</span></td></tr>
                  <tr><td className="mono">07-26 18:02</td><td>AC-HQ-01 · AP-3F-012</td><td><span className="badge bg-success">成功</span></td></tr>
                  <tr><td className="mono">07-26 09:31</td><td>SW-3F-01 · Gi1/0/12</td><td><span className="badge bg-success">成功</span></td></tr>
                  <tr><td className="mono">07-25 21:14</td><td>AC-HQ-01 · AP-3F-012</td><td><span className="badge bg-danger">失败</span></td></tr>
                </tbody>
              </table>
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                <Link to={`/auth-logs#user=${encodeURIComponent(drawerUser.account)}`}>查看该用户全部认证日志 →</Link>
              </div>
            </div>
          </>
        )}
      </Drawer>

      <Modal
        open={!!modal}
        title={modal?.kind === 'batch' ? '确认批量' + modal.verb
          : modal?.kind === 'policy' ? '批量分配策略组'
          : modal?.kind === 'disable' ? '确认停用账号'
          : modal?.kind === 'sync-log' ? 'AD 同步记录 · 近 7 天'
          : 'AD 同步未完成'}
        cancelText={modal?.kind === 'sync-log' ? undefined : '取消'}
        okText={modal?.kind === 'batch' ? (modal.danger ? '确认停用' : '确认' + modal.verb)
          : modal?.kind === 'policy' ? '确认分配'
          : modal?.kind === 'disable' ? '确认停用'
          : modal?.kind === 'sync-log' ? '重试失败任务'
          : '立即重试'}
        okClass={modal?.kind === 'policy' || modal?.kind === 'sync-log' || modal?.kind === 'sync-error' ? 'btn-primary' : 'btn-danger-solid'}
        onClose={() => setModal(null)}
        onOk={confirmModal}
      >
        {modal?.kind === 'batch' && (
          <>将对以下 <b>{modal.rows.length}</b> 个账号执行「{modal.verb}」:
            <div className="mono-list">{modal.rows.map((r) => (<span key={r.account}>{r.name}({r.account})<br /></span>))}</div>
            {modal.danger && '停用后这些账号将立即无法通过 802.1X 认证,在线会话会被断开。'}
          </>
        )}
        {modal?.kind === 'policy' && (
          <>将 <b>{modal.rows.length}</b> 个选中账号分配到:
            <div style={{ marginTop: 12 }}>
              <select className="sel" style={{ width: '100%', height: 34 }} value={policyPick} onChange={(e) => setPolicyPick(e.target.value)}>
                {USER_FILTER_OPTIONS.policy.slice(1).map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>变更在下次认证时生效;在线终端将收到 CoA 重新授权。</div>
          </>
        )}
        {modal?.kind === 'disable' && (
          <>停用 <b>{modal.row.name}({modal.row.account})</b> 后,该账号所有认证请求将被拒绝,在线会话立即断开。此操作可随时通过「启用」恢复。</>
        )}
        {modal?.kind === 'sync-log' && (
          <>共 168 次同步:<b>167 次成功 / 1 次失败</b>。失败任务已自动回退至最近一次成功快照,用户数据未受影响。
            <div className="mono-list">
              今日 10:00 · 成功 · 新增 12 / 更新 3 / 停用 1<br />
              今日 09:00 · 成功 · 无变更<br />
              今日 08:00 · 成功 · 新增 1 / 更新 2<br />
              昨天 22:00 · <b style={{ color: 'var(--danger)' }}>失败</b> · dc01 连接超时(已回退){' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setModal({ kind: 'sync-error' }); }}>查看原因</a><br />
              昨天 21:00 · 成功 · 无变更
            </div>
          </>
        )}
        {modal?.kind === 'sync-error' && (
          <>上次连接 <b>dc01.corp.example.com:636</b> 超时(等待 8s),已重试 2 次均失败。建议检查:<br />• 网络到域控的 636 端口是否放行<br />• 绑定账号 <span className="mono">svc-radius</span> 凭据是否过期<br />• 域控服务是否正常</>
        )}
      </Modal>
    </Shell>
  );
}
