import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CircleAlert, Eye, Laptop, Server } from 'lucide-react';
import Shell from '../components/Shell';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import { SkeletonTable, EmptyState, ErrorState } from '../components/states';
import { useToast } from '../components/Toast';
import {
  DEVICE_FILTER_OPTIONS,
  fetchEndpoints,
  fetchNas,
  SSID_ROWS,
  SWITCH_BUSY_PORTS,
  SWITCH_PORT_DETAIL,
  type EndpointRow,
  type NasRow,
} from '../api/resources/devices';

interface NasFilters { type: string; area: string; status: string; }
interface EpFilters { type: string; comp: string; kw: string; }

const DEFAULT_NAS_FILTERS: NasFilters = { type: '全部类型', area: '全部区域', status: '全部' };
const DEFAULT_EP_FILTERS: EpFilters = { type: '全部类型', comp: '全部', kw: '' };

const NAS_TYPE_MAP: Record<string, NasRow['type']> = { 交换机: 'switch', '无线 AC': 'ac', AP: 'ap' };
const EP_COMP_MAP: Record<string, string> = { 合规: 'ok', 证书临期: 'warn', 不合规: 'bad' };

function matchNas(row: NasRow, f: NasFilters) {
  if (f.type !== '全部类型' && row.type !== NAS_TYPE_MAP[f.type]) return false;
  if (f.area !== '全部区域' && row.area !== f.area) return false;
  if (f.status !== '全部' && row.status !== (f.status === '在线' ? 'online' : 'offline')) return false;
  return true;
}

function matchEp(row: EndpointRow, f: EpFilters) {
  if (f.type !== '全部类型' && row.etype !== f.type) return false;
  if (f.comp !== '全部' && row.comp !== EP_COMP_MAP[f.comp]) return false;
  const kw = f.kw.trim().toLowerCase();
  if (kw) {
    const text = [row.mac, row.fingerprint, row.userName, row.userSub, row.etype, row.compLabel, row.firstSeen].join(' ').toLowerCase();
    if (text.indexOf(kw) < 0) return false;
  }
  return true;
}

type DeviceModal =
  | { kind: 'revoke'; row: EndpointRow }
  | { kind: 'remove'; row: EndpointRow }
  | { kind: 'import' }
  | null;

export default function Devices() {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'nas' | 'ep'>('nas');
  const [nasView, setNasView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [nasForm, setNasForm] = useState<NasFilters>(DEFAULT_NAS_FILTERS);
  const [nasApplied, setNasApplied] = useState<NasFilters>(DEFAULT_NAS_FILTERS);
  const [epForm, setEpForm] = useState<EpFilters>(DEFAULT_EP_FILTERS);
  const [epApplied, setEpApplied] = useState<EpFilters>(DEFAULT_EP_FILTERS);
  const [nasRows, setNasRows] = useState<NasRow[]>([]);
  const [epRows, setEpRows] = useState<EndpointRow[]>([]);
  const [drawerDevice, setDrawerDevice] = useState<NasRow | null>(null);
  const [modal, setModal] = useState<DeviceModal>(null);
  const [secretShown, setSecretShown] = useState<Set<string>>(new Set());

  /* 深链:#tab=ep → 打开终端准入清单 */
  useEffect(() => {
    const h = decodeURIComponent(location.hash.replace('#', ''));
    const kv: Record<string, string> = {};
    h.split('&').forEach((p) => {
      const i = p.indexOf('=');
      kv[p.slice(0, i)] = p.slice(i + 1);
    });
    if (kv.tab === 'ep') setTab('ep');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 数据拉取 — NAS */
  useEffect(() => {
    if (nasView !== 'loading') return;
    let cancelled = false;
    fetchNas()
      .then((data) => { if (!cancelled) { setNasRows(data); setNasView('ready'); } })
      .catch(() => { if (!cancelled) setNasView('error'); });
    return () => { cancelled = true; };
  }, [nasView]);

  /* 数据拉取 — endpoints(on tab switch) */
  useEffect(() => {
    if (tab !== 'ep') return;
    let cancelled = false;
    fetchEndpoints()
      .then((data) => { if (!cancelled) setEpRows(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tab]);

  function switchTab(name: 'nas' | 'ep') {
    setTab(name);
    navigate(location.pathname + '#tab=' + name, { replace: true });
  }

  const nasVisible = useMemo(() => nasRows.filter((r) => matchNas(r, nasApplied)), [nasRows, nasApplied]);
  const epVisible = useMemo(() => epRows.filter((r) => matchEp(r, epApplied)), [epRows, epApplied]);

  function resetNasFilters(silent = false) {
    setNasForm(DEFAULT_NAS_FILTERS);
    setNasApplied(DEFAULT_NAS_FILTERS);
    if (!silent) toast('已清空筛选条件');
  }

  function resetEpFilters(silent = false) {
    setEpForm(DEFAULT_EP_FILTERS);
    setEpApplied(DEFAULT_EP_FILTERS);
    if (!silent) toast('已清空筛选条件');
  }

  function nasRetry() {
    setNasView('loading');
    fetchNas()
      .then((data) => { setNasRows(data); setNasView('ready'); toast('已重新连接,设备清单已刷新'); })
      .catch(() => setNasView('error'));
  }

  function toggleSecret(name: string, shown: boolean) {
    setSecretShown((prev) => {
      const next = new Set(prev);
      if (shown) next.add(name); else next.delete(name);
      return next;
    });
    if (shown) toast('Shared Secret 已明文显示,仅超级管理员可见 · 已记录审计');
  }

  function confirmModal() {
    if (!modal) return;
    if (modal.kind === 'revoke') toast('证书已吊销,CRL 已同步至全部 NAS');
    if (modal.kind === 'remove') {
      setEpRows((prev) => prev.filter((r) => r.mac !== modal.row.mac));
      toast('已移出白名单');
    }
    if (modal.kind === 'import') toast('已导入 2 条,1 条格式错误已跳过(见导入记录)');
    setModal(null);
  }

  const isNas = tab === 'nas';

  return (
    <Shell page="设备管理">
      <div className="page-head">
        <div>
          <h1>设备管理</h1>
          <div className="page-sub">37 台准入网络设备(NAS)· 1,642 台已登记终端</div>
        </div>
        <div className="page-actions">
          {isNas && (
            <button className="btn btn-outline" onClick={() => toast('添加 NAS:填写 IP 与 Shared Secret 后可纳管(演示)')}>添加 NAS</button>
          )}
          {!isNas && (
            <button className="btn btn-primary" data-od-id="import-mac" onClick={() => setModal({ kind: 'import' })}>批量导入 MAC 白名单</button>
          )}
        </div>
      </div>

      <section className="card">
        <div className="tabs" data-od-id="device-tabs">
          <button className={isNas ? 'tab active' : 'tab'} onClick={() => switchTab('nas')}>准入网络设备(NAS)</button>
          <button className={!isNas ? 'tab active' : 'tab'} onClick={() => switchTab('ep')}>终端准入清单</button>
        </div>

        {isNas && (
          <div>
            <div className="filters">
              <div className="f-item"><label htmlFor="fn-type">类型</label>
                <select className="sel" id="fn-type" value={nasForm.type} onChange={(e) => setNasForm((f) => ({ ...f, type: e.target.value }))}>
                  {DEVICE_FILTER_OPTIONS.nasType.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="f-item"><label htmlFor="fn-area">区域</label>
                <select className="sel" id="fn-area" value={nasForm.area} onChange={(e) => setNasForm((f) => ({ ...f, area: e.target.value }))}>
                  {DEVICE_FILTER_OPTIONS.nasArea.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="f-item"><label htmlFor="fn-status">状态</label>
                <select className="sel" id="fn-status" value={nasForm.status} onChange={(e) => setNasForm((f) => ({ ...f, status: e.target.value }))}>
                  {DEVICE_FILTER_OPTIONS.nasStatus.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" style={{ height: 30 }} onClick={() => setNasApplied(nasForm)}>筛选</button>
              <button className="btn btn-outline btn-sm" style={{ height: 30 }} onClick={() => resetNasFilters()}>重置</button>
            </div>
            <div className="tbl-wrap">
              {nasView === 'loading' && <SkeletonTable cols={8} widths={['w-60', 'w-40', 'w-60', 'w-40', 'w-60', 'w-40', 'w-60', '']} />}
              {nasView === 'ready' && nasVisible.length > 0 && (
                <table className="tbl" data-od-id="nas-table">
                  <thead>
                    <tr><th>设备名称</th><th>类型</th><th>IP 地址</th><th>所属区域</th><th>Shared Secret</th><th>状态</th><th>端口 / 负载</th><th style={{ textAlign: 'right' }}>操作</th></tr>
                  </thead>
                  <tbody>
                    {nasVisible.map((r) => {
                      const shown = secretShown.has(r.name);
                      return (
                        <tr key={r.name}>
                          <td><b>{r.name}</b></td>
                          <td><span className="tag">{r.typeLabel}</span></td>
                          <td className="mono">{r.ip}</td>
                          <td>{r.area}</td>
                          <td className="mono">
                            {r.secret ? (
                              <div className="secret-wrap">
                                {!shown && <span className="secret-mask" style={{ display: 'inline' }}>••••••••</span>}
                                {shown && <span className="secret-val" style={{ display: 'inline' }}>{r.secret}</span>}
                                <button className="secret-toggle" type="button" aria-label="显示或隐藏 Shared Secret" title="仅超级管理员可解密" style={{ color: shown ? 'var(--accent)' : undefined }} onClick={() => toggleSecret(r.name, !shown)}>
                                  <Eye style={{ width: 13, height: 13 }} />
                                </button>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td><span className={`badge ${r.statusBadge}`}>{r.statusLabel}</span></td>
                          <td>
                            <div className="mini-load">
                              <div className="bar-track"><div className={`bar-fill ${r.loadDanger ? 'fill-danger' : ''}`} style={{ width: r.loadPct + '%' }}></div></div>
                              <span>{r.loadLabel}</span>
                            </div>
                          </td>
                          <td><div className="row-ops"><a href="#" onClick={(e) => { e.preventDefault(); setDrawerDevice(r); }}>{r.opLabel}</a></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {nasView === 'ready' && nasVisible.length === 0 && (
              <EmptyState icon={Server} title="没有符合条件的设备" desc="当前筛选条件下无 NAS 设备。可放宽类型 / 区域 / 状态条件。" actionText="清空筛选条件" onAction={() => resetNasFilters()} />
            )}
            {nasView === 'error' && (
              <ErrorState title="设备数据加载失败" desc={<>无法获取 NAS 清单(<b>NDEV-API 502</b>)。请检查设备纳管服务后重试。</>} onRetry={nasRetry} />
            )}
            {nasView === 'ready' && nasVisible.length > 0 && (
              <div className="stat-strip" style={{ borderTop: '1px solid var(--border-soft)', borderBottom: 'none' }}>
                <span>共 <b>37</b> 台 NAS,本页显示 <b>{nasVisible.length}</b> 台 · Shared Secret 加密存储,仅超级管理员可查看</span>
              </div>
            )}
          </div>
        )}

        {!isNas && (
          <div>
            <div className="filters">
              <div className="f-item"><label htmlFor="fe-type">终端类型</label>
                <select className="sel" id="fe-type" value={epForm.type} onChange={(e) => setEpForm((f) => ({ ...f, type: e.target.value }))}>
                  {DEVICE_FILTER_OPTIONS.epType.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="f-item"><label htmlFor="fe-comp">合规状态</label>
                <select className="sel" id="fe-comp" value={epForm.comp} onChange={(e) => setEpForm((f) => ({ ...f, comp: e.target.value }))}>
                  {DEVICE_FILTER_OPTIONS.epComp.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="f-item"><label htmlFor="fe-kw">关键词</label>
                <input className="inp" type="text" id="fe-kw" placeholder="MAC / 指纹 / 绑定用户" value={epForm.kw} onChange={(e) => setEpForm((f) => ({ ...f, kw: e.target.value }))} />
              </div>
              <button className="btn btn-primary btn-sm" style={{ height: 30 }} onClick={() => setEpApplied(epForm)}>筛选</button>
              <button className="btn btn-outline btn-sm" style={{ height: 30 }} onClick={() => resetEpFilters()}>重置</button>
              <div className="f-spacer"></div>
              <button className="btn btn-outline" onClick={() => toast('已导出 endpoints-20260727.csv(1,642 条)')}>导出清单</button>
            </div>
            <div className="tbl-wrap">
              {epVisible.length > 0 && (
                <table className="tbl" data-od-id="ep-table">
                  <thead>
                    <tr><th>终端 MAC</th><th>证书指纹(SHA-256)</th><th>绑定用户</th><th>终端类型</th><th>合规状态</th><th>首次接入时间</th><th style={{ textAlign: 'right' }}>操作</th></tr>
                  </thead>
                  <tbody>
                    {epVisible.map((r) => (
                      <tr key={r.mac}>
                        <td className="mono">{r.mac}</td>
                        <td className="mono">{r.fingerprint}</td>
                        <td>{r.userName}<span className="sub mono">{r.userSub}</span></td>
                        <td>{r.etype}</td>
                        <td><span className={`badge ${r.compBadge}`}>{r.compLabel}</span></td>
                        <td className="mono">{r.firstSeen}</td>
                        <td>
                          <div className="row-ops">
                            {r.whitelist ? (
                              <a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); setModal({ kind: 'remove', row: r }); }}>移出白名单</a>
                            ) : (
                              <a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); setModal({ kind: 'revoke', row: r }); }}>吊销证书</a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {epVisible.length === 0 && (
              <EmptyState icon={Laptop} title="没有符合条件的终端" desc="当前筛选条件下无已登记终端。可放宽终端类型 / 合规状态条件,或修改关键词。" actionText="清空筛选条件" onAction={() => resetEpFilters()} />
            )}
            {epVisible.length > 0 && (
              <div className="stat-strip" style={{ borderTop: '1px solid var(--border-soft)', borderBottom: 'none' }}>
                <span>共 <b>1,642</b> 台终端,本页显示 <b>{epVisible.length}</b> 条</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 端口 / SSID 详情抽屉 */}
      <Drawer
        open={!!drawerDevice}
        title={drawerDevice ? drawerDevice.name + ' · ' + (drawerDevice.type === 'switch' ? '端口接入状态' : 'SSID 接入状态') : '端口状态'}
        onClose={() => setDrawerDevice(null)}
      >
        {drawerDevice && (
          <>
            <div className="crumb"><a href="#" onClick={(e) => e.preventDefault()}>设备管理</a><span className="sep">/</span><span className="cur">{drawerDevice.name}</span></div>
            {drawerDevice.type === 'switch' ? (
              <div>
                {drawerDevice.status === 'offline' && (
                  <div className="notice" style={{ margin: '0 0 14px' }}>
                    <CircleAlert style={{ width: 15, height: 15, color: 'var(--danger)' }} />
                    <div className="grow">设备当前<b>离线</b>,以下为最后已知端口快照(10:12 前)· 32 个在线会话已中断,等待终端重认证。</div>
                  </div>
                )}
                <div className="d-sec-t">端口接入状态(蓝 = 有终端接入)</div>
                <div className="port-grid" style={{ marginTop: 10 }}>
                  {Array.from({ length: 24 }, (_, idx) => idx + 1).map((i) => {
                    const busy = drawerDevice.status === 'offline' ? undefined : SWITCH_BUSY_PORTS[i];
                    const sub = busy ? busy + ' 接入中' : drawerDevice.status === 'offline' ? '离线' : '空闲';
                    return (
                      <div key={i} className={busy ? 'port busy' : 'port idle'}>
                        <span className="p-name">Gi1/0/{i}</span>
                        <span className="p-sub">{sub}</span>
                      </div>
                    );
                  })}
                </div>
                {drawerDevice.status !== 'offline' && (
                  <div className="d-sec">
                    <div className="d-sec-t">接入明细</div>
                    <table className="tbl">
                      <thead><tr><th>端口</th><th>终端 MAC</th><th>用户</th><th>VLAN</th></tr></thead>
                      <tbody>
                        {SWITCH_PORT_DETAIL.map((d) => (
                          <tr key={d.port}><td className="mono">{d.port}</td><td className="mono">{d.mac}</td><td>{d.user}</td><td className="mono">{d.vlan}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="d-sec-t">SSID 接入状态</div>
                <table className="tbl" style={{ marginTop: 10 }}>
                  <thead><tr><th>SSID</th><th>认证方式</th><th>当前终端</th><th>下发 VLAN</th></tr></thead>
                  <tbody>
                    {SSID_ROWS.map((s) => (
                      <tr key={s.ssid}><td><b>{s.ssid}</b></td><td>{s.auth}</td><td className="mono">{s.count}</td><td className="mono">{s.vlan}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Drawer>

      <Modal
        open={!!modal}
        title={modal?.kind === 'revoke' ? '确认吊销证书' : modal?.kind === 'remove' ? '确认移出白名单' : '批量导入 MAC 白名单'}
        width={520}
        okText={modal?.kind === 'revoke' ? '确认吊销' : modal?.kind === 'remove' ? '确认移出' : '导入'}
        okClass={modal?.kind === 'import' ? 'btn-primary' : 'btn-danger-solid'}
        onClose={() => setModal(null)}
        onOk={confirmModal}
      >
        {modal?.kind === 'revoke' && (
          <>吊销终端 <span className="mono">{modal.row.mac}</span>({modal.row.userName})的准入证书后,该终端将立即无法通过 EAP-TLS 认证,在线会话断开。<b>吊销不可撤销</b>,需要重新签发证书才能恢复。</>
        )}
        {modal?.kind === 'remove' && (
          <>将 <span className="mono">{modal.row.mac}</span> 移出 MAC 白名单后,该设备下次认证将被拒绝。</>
        )}
        {modal?.kind === 'import' && (
          <>每行一条,格式:<span className="mono">MAC,绑定说明</span>。仅适用于打印机、摄像头等无法安装证书的哑终端,导入后走 MAC 白名单准入(不校验证书)。
            <div style={{ marginTop: 12 }}>
              <textarea className="inp" style={{ width: '100%' }} placeholder={'00:25:96:12:34:56, 4F 会议室打印机\n00:25:96:12:34:57, B1 门禁摄像头'} />
            </div>
          </>
        )}
      </Modal>
    </Shell>
  );
}
