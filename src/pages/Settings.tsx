import { useEffect, useRef, useState } from 'react';
import Shell from '../components/Shell';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { getAdmin } from '../api/auth';
import { fetchSettings } from '../api/resources/settings';

const SECTIONS = [
  { id: 'set-radius', label: 'RADIUS 参数' },
  { id: 'set-cert', label: '证书管理' },
  { id: 'set-ldap', label: 'AD / LDAP' },
  { id: 'set-rbac', label: '管理员与权限' },
  { id: 'set-alert', label: '告警通知' },
];

function portOk(v: string) {
  const s = v.trim();
  return /^\d{1,5}$/.test(s) && +s >= 1 && +s <= 65535;
}

interface AlertRule {
  key: string;
  name: string;
  sub: string;
  on: boolean;
  subs: { label: string; checked: boolean; radio?: boolean; value?: string }[];
}

const INITIAL_RULES: AlertRule[] = [
  {
    key: 'mail', name: '邮件', sub: '发送至 netops@example.com(3 名运维)', on: true,
    subs: [
      { label: '设备离线', checked: true },
      { label: '成功率 < 95%(10 分钟窗口)', checked: true },
      { label: '账号暴力破解锁定', checked: true },
      { label: '证书批量临期(每周一汇总)', checked: false },
    ],
  },
  {
    key: 'wecom', name: '企业微信', sub: '群机器人「网络运维告警群」 · Webhook 已验证', on: true,
    subs: [
      { label: '设备离线', checked: true },
      { label: '成功率 < 95%', checked: true },
      { label: '账号锁定', checked: false },
      { label: '未知 MAC 闯入隔离 VLAN', checked: true },
    ],
  },
  {
    key: 'webhook', name: '自定义 Webhook', sub: 'POST https://soc.example.com/api/alerts · 未启用', on: false,
    subs: [
      { label: '全部事件', checked: true, radio: true, value: 'all' },
      { label: '仅严重', checked: false, radio: true, value: 'critical' },
    ],
  },
];

export default function Settings() {
  const toast = useToast();
  useEffect(() => {
    fetchSettings().then((cfg) => {
      setAuthPort(String(cfg.radius_auth_port));
      setAcctPort(String(cfg.radius_acct_port));
    }).catch(() => {});
  }, []);
  const [active, setActive] = useState('set-radius');
  const [authPort, setAuthPort] = useState('1812');
  const [acctPort, setAcctPort] = useState('1813');
  const origPorts = useRef({ auth: '1812', acct: '1813' });
  const [authErr, setAuthErr] = useState('');
  const [acctErr, setAcctErr] = useState('');
  const [rules, setRules] = useState<AlertRule[]>(INITIAL_RULES);
  const [coreModal, setCoreModal] = useState(false);

  /* 滚动高亮(与原型 scrollspy 一致) */
  useEffect(() => {
    const onScroll = () => {
      const top = window.pageYOffset + 120;
      let cur = SECTIONS[0].id;
      SECTIONS.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= top) cur = id;
      });
      setActive(cur);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function gotoSection(id: string) {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 70, behavior: 'smooth' });
    setActive(id);
  }

  function saveRadius() {
    let okA = portOk(authPort);
    let okB = portOk(acctPort);
    setAuthErr(okA ? '' : '请输入 1–65535 的整数端口');
    setAcctErr(okB ? '' : '请输入 1–65535 的整数端口');
    if (okA && okB && authPort.trim() === acctPort.trim()) {
      okB = false;
      setAcctErr('计费端口不能与认证端口相同');
    }
    if (!okA) { document.getElementById('r-auth-port')?.focus(); return; }
    if (!okB) { document.getElementById('r-acct-port')?.focus(); return; }
    if (authPort !== origPorts.current.auth || acctPort !== origPorts.current.acct) {
      setCoreModal(true);
      return;
    }
    toast('「RADIUS 服务参数」已保存并记录审计日志');
  }

  function confirmCore() {
    origPorts.current = { auth: authPort, acct: acctPort };
    setCoreModal(false);
    toast('核心端口已变更并重启监听,37 台 NAS 正在重连');
  }

  function toggleRule(key: string, on: boolean) {
    setRules((prev) => prev.map((r) => (r.key === key ? { ...r, on } : r)));
  }

  function toggleSub(key: string, idx: number, checked: boolean) {
    setRules((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const subs = r.subs.map((s, i) => {
        if (s.radio) return { ...s, checked: i === idx };
        return i === idx ? { ...s, checked } : s;
      });
      return { ...r, subs };
    }));
  }

  return (
    <Shell page="系统设置">
      <div className="page-head">
        <div>
          <h1>系统设置</h1>
          <div className="page-sub">所有配置变更即时生效并记录审计日志 · 当前操作人:{getAdmin()?.display_name || getAdmin()?.username || '管理员'}</div>
        </div>
      </div>

      <div className="set-layout">
        <nav className="set-nav" data-od-id="settings-subnav" aria-label="系统设置模块">
          {SECTIONS.map((s) => (
            <a key={s.id} href={'#' + s.id} className={active === s.id ? 'active' : ''} onClick={(e) => { e.preventDefault(); gotoSection(s.id); }}>{s.label}</a>
          ))}
        </nav>
        <div className="set-grid with-nav">
          {/* RADIUS 服务参数 */}
          <section className="card set-card" id="set-radius" data-od-id="set-radius">
            <div className="card-head"><div className="card-title">RADIUS 服务参数</div><div className="card-extra"><span className="tag tag-warn">含核心端口 · 改动需二次确认</span></div></div>
            <div className="card-body form-grid">
              <div className={authErr ? 'field invalid' : 'field'}>
                <label htmlFor="r-auth-port">认证端口(UDP)<span className="req">*</span></label>
                <input className="inp" id="r-auth-port" value={authPort} inputMode="numeric" aria-describedby="hint-auth-port err-auth-port" onChange={(e) => { setAuthPort(e.target.value); setAuthErr(''); }} />
                <span className="hint" id="hint-auth-port">修改后需重启 NAS 连接,会短暂中断认证</span>
                <span className="field-error" id="err-auth-port" role="alert">{authErr || '请输入 1–65535 的整数端口'}</span>
              </div>
              <div className={acctErr ? 'field invalid' : 'field'}>
                <label htmlFor="r-acct-port">计费端口(UDP,会话审计)<span className="req">*</span></label>
                <input className="inp" id="r-acct-port" value={acctPort} inputMode="numeric" aria-describedby="err-acct-port" onChange={(e) => { setAcctPort(e.target.value); setAcctErr(''); }} />
                <span className="field-error" id="err-acct-port" role="alert">{acctErr || '请输入 1–65535 的整数端口'}</span>
              </div>
              <div className="field"><label htmlFor="r-timeout">NAS 请求超时</label>
                <select className="sel" id="r-timeout" defaultValue="3 秒"><option>2 秒</option><option>3 秒</option><option>5 秒</option></select></div>
              <div className="field"><label htmlFor="r-retry">超时重试次数</label>
                <select className="sel" id="r-retry" defaultValue="2 次"><option>1 次</option><option>2 次</option><option>3 次</option></select></div>
              <div className="field span2"><label htmlFor="r-coa">CoA / Disconnect 监听端口</label><input className="inp" id="r-coa" defaultValue="3799" />
                <span className="hint">强制下线与策略重授权均通过 CoA 下发</span></div>
              <div className="span2" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={saveRadius}>保存</button>
              </div>
            </div>
          </section>

          {/* 证书管理 */}
          <section className="card set-card" id="set-cert" data-od-id="set-cert">
            <div className="card-head"><div className="card-title">证书管理</div><div className="card-extra"><span className="badge bg-success">CA 有效</span></div></div>
            <div className="card-body form-grid">
              <div className="field span2"><label>企业 CA 证书</label>
                <dl className="kv" style={{ rowGap: 5 }}>
                  <dt>颁发者</dt><dd>CN=Corp Root CA 2024, O=Example Inc.</dd>
                  <dt>有效期</dt><dd>2024-01-01 至 2034-01-01(剩余 8.4 年)</dd>
                </dl>
                <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                  <button className="btn btn-outline" onClick={() => toast('「CA 证书更新申请」已提交并记录审计日志')}>上传新 CA 证书</button>
                  <button className="btn btn-outline" onClick={() => toast('CRL(吊销列表)已开始下载,共 23 条记录')}>下载 CRL</button>
                </div>
              </div>
              <div className="field"><label htmlFor="c-valid">终端证书有效期</label>
                <select className="sel" id="c-valid" defaultValue="365 天"><option>180 天</option><option>365 天</option><option>730 天</option></select></div>
              <div className="field"><label htmlFor="c-remind">到期提醒</label>
                <select className="sel" id="c-remind" defaultValue="前 30 天"><option>前 7 天</option><option>前 30 天</option><option>前 60 天</option></select></div>
              <div className="field span2">
                <label className="check" style={{ alignItems: 'center' }}><input type="checkbox" className="sw" defaultChecked />过期证书直接拒绝接入(不进入隔离区)</label>
              </div>
              <div className="span2" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={() => toast('「证书策略」已保存并记录审计日志')}>保存</button>
              </div>
            </div>
          </section>

          {/* AD / LDAP 对接 */}
          <section className="card set-card" id="set-ldap" data-od-id="set-ldap">
            <div className="card-head"><div className="card-title">AD / LDAP 对接</div><div className="card-extra"><span className="badge bg-success">已连接</span></div></div>
            <div className="card-body form-grid">
              <div className="field"><label htmlFor="l-host">服务器地址</label><input className="inp" id="l-host" defaultValue="ldaps://dc01.corp.example.com:636" /></div>
              <div className="field"><label htmlFor="l-dn">Base DN</label><input className="inp" id="l-dn" defaultValue="OU=Employees,DC=corp,DC=example,DC=com" /></div>
              <div className="field"><label htmlFor="l-bind">绑定账号</label><input className="inp" id="l-bind" defaultValue="CN=svc-radius,OU=Service,DC=corp,DC=example,DC=com" /></div>
              <div className="field"><label htmlFor="l-cycle">同步周期</label>
                <select className="sel" id="l-cycle" defaultValue="60 分钟"><option>15 分钟</option><option>60 分钟</option><option>6 小时</option><option>每日 02:00</option></select></div>
              <div className="field span2"><label>字段映射</label>
                <table className="tbl map-tbl">
                  <thead><tr><th>AD 属性</th><th>本系统字段</th></tr></thead>
                  <tbody>
                    <tr><td className="mono">sAMAccountName</td><td>登录账号</td></tr>
                    <tr><td className="mono">displayName</td><td>姓名</td></tr>
                    <tr><td className="mono">department</td><td>所属部门(决定策略组匹配)</td></tr>
                    <tr><td className="mono">mail</td><td>通知邮箱</td></tr>
                    <tr><td className="mono">userAccountControl</td><td>停用状态(AD 禁用 → 本系统停用)</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="span2" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-outline" onClick={() => toast('连接 dc01.corp.example.com:636 成功,耗时 84ms,可读取 1,472 个账号')}>测试连接</button>
                <button className="btn btn-primary" onClick={() => toast('「AD/LDAP 对接配置」已保存并记录审计日志')}>保存</button>
              </div>
            </div>
          </section>

          {/* 管理员与权限 */}
          <section className="card set-card" id="set-rbac" data-od-id="set-rbac">
            <div className="card-head"><div className="card-title">管理员账号与权限(RBAC)</div>
              <div className="card-extra"><a className="btn btn-outline btn-sm" href="/settings/admins">管理管理员</a></div></div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>账号</th><th>角色</th><th>权限范围</th><th>最近登录</th></tr></thead>
                  <tbody>
                    <tr><td><b>王工</b><span className="sub mono">wang.ops</span></td>
                      <td><span className="badge bg-info">超级管理员</span></td>
                      <td>全部功能 + 系统设置 + Shared Secret 查看</td><td className="mono">10:02(当前)</td></tr>
                    <tr><td><b>吴昊</b><span className="sub mono">wu.hao</span></td>
                      <td><span className="badge bg-muted">策略管理员</span></td>
                      <td><span className="truncate" title="策略 / 设备 / 用户管理,可强制下线,不可改系统参数">策略 / 设备 / 用户管理,可强制下线,不可改系统参数</span></td><td className="mono">09:31</td></tr>
                    <tr><td><b>赵敏</b><span className="sub mono">zhao.min</span></td>
                      <td><span className="badge bg-muted">只读审计</span></td>
                      <td>仪表盘 / 会话 / 日志 / 报表,仅查看与导出</td><td className="mono">昨天 17:44</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>角色为预设三种,权限粒度不可自定义;敏感操作(强制下线、吊销、改策略)全部记录审计日志。</div>
            </div>
          </section>

          {/* 告警通知 */}
          <section className="card set-card" id="set-alert" data-od-id="set-alert" style={{ gridColumn: '1 / -1' }}>
            <div className="card-head"><div className="card-title">告警通知配置</div>
              <div className="card-extra"><button className="btn btn-primary btn-sm" onClick={() => toast('「告警通知配置」已保存并记录审计日志')}>保存</button></div></div>
            <div className="card-body">
              {rules.map((rule) => (
                <div key={rule.key} className={rule.on ? 'alert-rule' : 'alert-rule off'}>
                  <input type="checkbox" className="sw" checked={rule.on} aria-label={rule.name + '通知'} onChange={(e) => toggleRule(rule.key, e.target.checked)} />
                  <div className="grow"><b>{rule.name}</b><small>{rule.sub}</small></div>
                  <span className="rule-sub">
                    {rule.subs.map((s, i) => (
                      <label key={s.label} className="check" style={{ alignItems: 'center' }}>
                        {s.radio ? (
                          <input type="radio" name={'webhook-severity-' + rule.key} value={s.value} checked={s.checked} disabled={!rule.on} onChange={() => toggleSub(rule.key, i, true)} />
                        ) : (
                          <input type="checkbox" checked={s.checked} disabled={!rule.on} onChange={(e) => toggleSub(rule.key, i, e.target.checked)} />
                        )}
                        {s.label}
                      </label>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* 核心端口变更二次确认 */}
      <Modal
        open={coreModal}
        title="确认修改核心端口"
        cancelText="再检查一下"
        okText="确认修改并重启监听"
        okClass="btn-danger-solid"
        onClose={() => setCoreModal(false)}
        onOk={confirmCore}
      >
        核心端口将由 <span className="mono">{origPorts.current.auth} / {origPorts.current.acct}</span> 修改为 <span className="mono">{authPort.trim()} / {acctPort.trim()}</span>。变更影响:<br />
        • 全部 NAS 将中断当前监听并重连,期间认证请求超时或失败<br />
        • 在线会话不会立即断开,但计费报文可能丢失<br />
        • 操作记录审计,建议在低峰时段执行。
      </Modal>
    </Shell>
  );
}
