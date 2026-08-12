import { type ReactNode, useEffect, useState, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Gauge, KeyRound, LogOut,
  ScrollText, Search, Server, Settings, ShieldCheck, UserCog, Users,
} from 'lucide-react';
import { useTitle } from '../hooks/useTitle';
import { fetchMe, logout } from '../api/auth';
import { MODE } from '../api/config';

const ALL_ITEMS = [
  { to: '/dashboard', label: '仪表盘', icon: Gauge, roles: ['admin', 'operator', 'auditor'] },
  { to: '/sessions', label: '在线会话', icon: Activity, roles: ['admin', 'operator', 'auditor'] },
  { to: '/auth-logs', label: '认证日志', icon: ScrollText, roles: ['admin', 'operator', 'auditor'] },
  { to: '/users', label: '用户管理', icon: Users, roles: ['admin', 'operator'] },
  { to: '/policies', label: '策略管理', icon: ShieldCheck, roles: ['admin'] },
  { to: '/devices', label: '设备管理', icon: Server, roles: ['admin'] },
  { to: '/reports', label: '报表统计', icon: BarChart3, roles: ['admin', 'operator', 'auditor'] },
  { to: '/settings', label: '系统设置', icon: Settings, roles: ['admin'] },
  { to: '/settings/admins', label: '管理员账户', icon: UserCog, roles: ['admin'] },
];

interface AdminInfo { username: string; display_name: string; role: string; }

/** Mock admin (同步, CI 兼容) */
const MOCK_ADMIN: AdminInfo = {
  username: 'admin',
  display_name: '管理员',
  role: 'admin',
};

export default function Shell({ page, children }: { page: string; children: ReactNode }) {
  useTitle(page);
  const nav = useNavigate();
  const [me, setMe] = useState<AdminInfo>(MOCK_ADMIN);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (MODE === 'http') {
      fetchMe()
        .then((info) => setMe(info))
        .catch(() => { /* keep mock */ });
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const display = me.display_name || me.username;
  const initial = display.charAt(0).toUpperCase();
  const navItems = ALL_ITEMS.filter((item) => item.roles.includes(me.role));

  return (
    <>
      <aside className="sidebar" data-od-id="sidebar">
        <div className="side-brand">
          <div className="side-mark">R</div>
          <div className="side-brand-t">
            <b>准入认证控制台</b>
            <span>RADIUS 802.1X</span>
          </div>
        </div>
        <nav className="side-nav">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}
            >
              <Icon className="icon" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <span className="pulse-dot" />
          RADIUS 服务正常 · v2.4.1
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar" data-od-id="topbar">
          <div className="topbar-title">{page}</div>
          <div className="topbar-right">
            <div className="search">
              <Search className="icon" />
              <input type="search" placeholder="搜索用户 / MAC / 设备" aria-label="搜索" />
            </div>
            <div className="user-dropdown" ref={menuRef}>
              <button
                type="button"
                className="user-chip user-chip--btn"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <div className="avatar">{initial}</div>
                <div>
                  {display}<small>{me.role === 'admin' ? '管理员' : me.role === 'operator' ? '运维' : '审计'}</small>
                </div>
              </button>
              {menuOpen && (
                <div className="dropdown-menu">
                  <button type="button" className="dropdown-item" onClick={() => { setMenuOpen(false); setPwOpen(true); }}>
                    <KeyRound className="icon" />修改密码
                  </button>
                  <button type="button" className="dropdown-item" onClick={() => { logout(); nav('/login'); }}>
                    <LogOut className="icon" />退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content" data-od-id="main">
          {children}
        </main>
      </div>

      {pwOpen && (
        <ChangePasswordModal
          onClose={() => setPwOpen(false)}
        />
      )}
    </>
  );
}

/* ── 修改密码模态 ──────────────────────────────────────── */

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr('');
    if (newPw.length < 10) { setErr('新密码至少 10 位'); return; }
    if (newPw !== newPw2) { setErr('两次输入不一致'); return; }
    setBusy(true);
    try {
      const { fetchApi } = await import('../api/http');
      await fetchApi('/api/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      onClose();
    } catch (e: any) {
      setErr(e.message || '修改失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd"><b>修改密码</b></div>
        <div className="modal-bd">
          {err && <div className="toast toast--err">{err}</div>}
          <label><span>旧密码</span>
            <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoFocus />
          </label>
          <label><span>新密码</span>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="至少 10 位" />
          </label>
          <label><span>确认新密码</span>
            <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
          </label>
        </div>
        <div className="modal-act">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
