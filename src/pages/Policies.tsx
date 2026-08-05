import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert } from 'lucide-react';
import Shell from '../components/Shell';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import { useToast } from '../components/Toast';
import { NEW_POLICY_FORM, POLICY_FORMS, POLICY_FORM_OPTIONS, POLICY_ROWS, type PolicyForm } from '../data/policies';

const STEPS = [
  { key: 's-basic', label: '基本信息' },
  { key: 's-eap', label: '认证协议' },
  { key: 's-vlan', label: 'VLAN 与合规' },
  { key: 's-apply', label: '生效条件' },
];

const EAP_OPTIONS = [
  { v: 'EAP-TLS', desc: '双向证书,安全性最高,推荐' },
  { v: 'PEAP-MSCHAPv2', desc: '账号密码,部署成本最低' },
  { v: 'EAP-FAST', desc: 'PAC 隧道,适合漫游频繁场景' },
];

export default function Policies() {
  const toast = useToast();
  const [order, setOrder] = useState(() => POLICY_ROWS.map((r) => r.id));
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(POLICY_ROWS.map((r) => [r.id, r.on]))
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyForm>(NEW_POLICY_FORM);
  const [stepIdx, setStepIdx] = useState(0);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rowById = (id: string) => POLICY_ROWS.find((r) => r.id === id)!;

  function move(id: string, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    toast('优先级已调整,新匹配顺序已下发至 37 台 NAS');
  }

  function openEdit(id: string) {
    setEditingId(id);
    setForm({ ...POLICY_FORMS[id] });
    setNameInvalid(false);
    setStepIdx(0);
    setDrawerOpen(true);
    window.setTimeout(() => {
      const scroller = document.querySelector('.drawer-body');
      if (scroller) scroller.scrollTop = 0;
    }, 0);
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...NEW_POLICY_FORM });
    setNameInvalid(false);
    setStepIdx(0);
    setDrawerOpen(true);
  }

  function gotoStep(idx: number) {
    setStepIdx(idx);
    const el = document.getElementById(STEPS[idx].key);
    const scroller = document.querySelector('.drawer-body');
    if (el && scroller) scroller.scrollTop = (el as HTMLElement).offsetTop - 12;
  }

  function trySave() {
    if (!form.name.trim()) {
      setNameInvalid(true);
      document.getElementById('f-name')?.focus();
      return;
    }
    setNameInvalid(false);
    setConfirmOpen(true);
  }

  function confirmPush() {
    setConfirmOpen(false);
    setDrawerOpen(false);
    toast('策略已下发,37 台 NAS 全部确认(耗时 1.8s)');
  }

  const compSummary = [
    ...(form.cert ? ['证书'] : []),
    ...(form.mac ? ['MAC 绑定'] : []),
    ...(form.edr ? ['安全状态'] : []),
  ].join(' + ') || '无强制要求';

  const drawerTitle = editingId ? '编辑策略 · ' + rowById(editingId).name : '新建策略';

  return (
    <Shell page="策略管理">
      <div className="page-head">
        <div>
          <h1>策略管理</h1>
          <div className="page-sub">802.1X 准入策略 · 多策略匹配时按优先级自上而下执行,先匹配先生效 · 变更即时下发至全部 NAS</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" data-od-id="new-policy" onClick={openNew}>新建策略</button>
        </div>
      </div>

      <div className="notice" data-od-id="policy-conflict" style={{ borderColor: 'color-mix(in oklab,var(--warn) 45%,var(--border))', background: 'color-mix(in oklab,var(--warn) 6%,var(--surface))' }}>
        <CircleAlert style={{ width: 16, height: 16, color: 'color-mix(in oklab,var(--warn) 80%,#92600a)' }} />
        <div className="grow"><b>策略匹配提示:</b>「办公默认策略」以<b>全体员工(兜底)</b>为适用范围,与「研发 / 财务 / 运维」策略在用户组上存在重叠。当前按优先级自上而下先匹配先生效,兜底策略排在 P4 不影响高优先级规则;调整顺序前请核查重叠用户组的预期 VLAN 是否一致。</div>
        <a href="#" onClick={(e) => { e.preventDefault(); toast('共 412 名研发 + 64 名财务 + 18 名运维用户与「办公默认」策略重叠,已按优先级生效专项策略'); }}>查看影响范围</a>
      </div>

      <section className="card" data-od-id="policy-card">
        <div className="tbl-wrap">
          <table className="tbl" data-od-id="policy-table">
            <thead>
              <tr>
                <th style={{ width: 96 }}>优先级</th>
                <th>策略名称</th><th>适用部门 / 用户组</th><th>认证方式</th>
                <th>下发 VLAN</th><th>终端合规要求</th><th>生效状态</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {order.map((id, i) => {
                const r = rowById(id);
                return (
                  <tr key={id}>
                    <td>
                      <span className="mono" style={{ fontWeight: 600 }}>P{i + 1}</span>
                      <a href="#" className="mv up" title="上移" onClick={(e) => { e.preventDefault(); move(id, -1); }}>↑</a>
                      <a href="#" className="mv down" title="下移" onClick={(e) => { e.preventDefault(); move(id, 1); }}>↓</a>
                    </td>
                    <td><b>{r.name}</b><span className="sub">{r.sub}</span></td>
                    <td>{r.scope}</td>
                    <td>{r.eap}</td>
                    <td className="mono">{r.vlan}</td>
                    <td>{r.compliance}</td>
                    <td><input type="checkbox" className="sw" checked={enabled[id]} aria-label="启用状态" onChange={(e) => setEnabled((prev) => ({ ...prev, [id]: e.target.checked }))} /></td>
                    <td><div className="row-ops"><a href="#" onClick={(e) => { e.preventDefault(); openEdit(id); }}>编辑</a></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="stat-strip" style={{ borderTop: '1px solid var(--border-soft)', borderBottom: 'none' }}>
          <span>共 <b>5</b> 条策略 · 停用的策略不参与匹配,仅作为配置存档</span>
        </div>
      </section>

      <Drawer
        open={drawerOpen}
        title={drawerTitle}
        width={620}
        onClose={() => setDrawerOpen(false)}
        steps={
          <div className="steps" aria-label="策略配置步骤">
            {STEPS.map((s, i) => (
              <span key={s.key} style={{ display: 'contents' }}>
                {i > 0 && <span className="step-bar" />}
                <div
                  className={i === stepIdx ? 'step-item active' : i < stepIdx ? 'step-item done' : 'step-item'}
                  onClick={() => gotoStep(i)}
                >
                  <span className="step-no">{i + 1}</span>
                  {s.label}
                </div>
              </span>
            ))}
          </div>
        }
        foot={<>
          <button className="btn btn-outline" onClick={() => setDrawerOpen(false)}>取消</button>
          <button className="btn btn-primary" data-od-id="policy-save" onClick={trySave}>保存策略</button>
        </>}
      >
        <div className="crumb"><Link to="/policies">策略管理</Link><span className="sep">/</span><span className="cur">{editingId ? "策略编辑" : "新建策略"}</span></div>
        <div className="form-grid">
          <div className="form-sec span2" id="s-basic">基本信息</div>
          <div className={nameInvalid ? 'field invalid' : 'field'}>
            <label htmlFor="f-name">策略名称<span className="req">*</span></label>
            <input className="inp" id="f-name" type="text" value={form.name} aria-required="true" onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (e.target.value.trim()) setNameInvalid(false); }} />
            <span className="field-error">请填写策略名称</span>
          </div>
          <div className="field">
            <label htmlFor="f-scope">适用部门 / 用户组</label>
            <select className="sel" id="f-scope" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
              {POLICY_FORM_OPTIONS.scope.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>

          <div className="form-sec span2" id="s-eap">认证协议</div>
          <div className="span2 radio-cards" data-od-id="eap-select">
            {EAP_OPTIONS.map((o) => (
              <div key={o.v} className={form.eap === o.v ? 'radio-card on' : 'radio-card'} data-v={o.v} onClick={() => setForm((f) => ({ ...f, eap: o.v }))}>
                <b>{o.v}</b><small>{o.desc}</small>
              </div>
            ))}
          </div>

          <div className="form-sec span2" id="s-vlan">VLAN 下发规则</div>
          <div className="field">
            <label htmlFor="f-vlan">默认下发 VLAN</label>
            <select className="sel" id="f-vlan" value={form.vlan} onChange={(e) => setForm((f) => ({ ...f, vlan: e.target.value }))}>
              {POLICY_FORM_OPTIONS.vlan.map((o) => <option key={o}>{o}</option>)}
            </select>
            <span className="hint">按 Tunnel-Private-Group-Id 下发;不匹配时拒绝接入</span>
          </div>
          <div className="field">
            <label htmlFor="f-acl">下发 ACL(Filter-ID)</label>
            <select className="sel" id="f-acl" value={form.acl} onChange={(e) => setForm((f) => ({ ...f, acl: e.target.value }))}>
              {POLICY_FORM_OPTIONS.acl.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>

          <div className="form-sec span2">终端合规校验</div>
          <div className="span2 checks">
            <label className="check"><input type="checkbox" checked={form.cert} onChange={(e) => setForm((f) => ({ ...f, cert: e.target.checked }))} />要求安装企业 CA 颁发的终端证书<small>无有效证书的终端直接拒绝</small></label>
            <label className="check"><input type="checkbox" checked={form.mac} onChange={(e) => setForm((f) => ({ ...f, mac: e.target.checked }))} />要求 MAC 预先绑定<small>仅允许终端准入清单中已登记的设备</small></label>
            <label className="check"><input type="checkbox" checked={form.edr} onChange={(e) => setForm((f) => ({ ...f, edr: e.target.checked }))} />检查终端安全状态(EDR 在线 / 病毒库 7 日内)<small>不合规终端进入隔离 VLAN 90 修复</small></label>
          </div>

          <div className="form-sec span2" id="s-apply">生效时间段(可选)</div>
          <div className="span2" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <label className="check" style={{ alignItems: 'center' }}><input type="checkbox" className="sw" checked={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.checked }))} />限制准入时间</label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg-2)' }}>
              <input className="inp" type="time" value={form.timeFrom} style={{ width: 110 }} onChange={(e) => setForm((f) => ({ ...f, timeFrom: e.target.value }))} /> 至
              <input className="inp" type="time" value={form.timeTo} style={{ width: 110 }} onChange={(e) => setForm((f) => ({ ...f, timeTo: e.target.value }))} />
            </span>
          </div>

          <div className="form-sec span2">限速下发(可选)</div>
          <div className="field">
            <label htmlFor="f-rate">上下行速率上限</label>
            <select className="sel" id="f-rate" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}>
              {POLICY_FORM_OPTIONS.rate.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>策略状态</label>
            <label className="check" style={{ alignItems: 'center', marginTop: 8 }}><input type="checkbox" className="sw" checked={form.on} onChange={(e) => setForm((f) => ({ ...f, on: e.target.checked }))} />启用该策略<small>停用后不参与匹配,配置保留</small></label>
          </div>
        </div>
      </Drawer>

      <Modal
        open={confirmOpen}
        title="确认保存策略变更"
        cancelText="再检查一下"
        okText="确认下发"
        okClass="btn-primary"
        onClose={() => setConfirmOpen(false)}
        onOk={confirmPush}
      >
        即将{editingId ? '修改' : '新建'}策略并即时下发至全部 NAS,匹配该策略的在线终端将收到 CoA 重新授权:
        <div className="mono-list">
          {form.name}<br />
          协议 {form.eap} · {form.vlan}<br />
          合规:{compSummary}<br />
          {form.time ? '准入时间 ' + form.timeFrom + ' – ' + form.timeTo : '全天可准入'} · 限速 {form.rate}
        </div>
      </Modal>
    </Shell>
  );
}
