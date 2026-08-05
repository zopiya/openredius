import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, BarChart3, Gauge, ScrollText, Search, Server, Settings, ShieldCheck, Users } from 'lucide-react';
import { useTitle } from '../hooks/useTitle';

export const NAV_ITEMS = [
  { to: '/dashboard', label: '仪表盘', icon: Gauge },
  { to: '/sessions', label: '在线会话', icon: Activity },
  { to: '/auth-logs', label: '认证日志', icon: ScrollText },
  { to: '/users', label: '用户管理', icon: Users },
  { to: '/policies', label: '策略管理', icon: ShieldCheck },
  { to: '/devices', label: '设备管理', icon: Server },
  { to: '/reports', label: '报表统计', icon: BarChart3 },
  { to: '/settings', label: '系统设置', icon: Settings },
] as const;

export default function Shell({ page, children }: { page: string; children: ReactNode }) {
  useTitle(page);
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
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
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
            <div className="user-chip">
              <div className="avatar">王</div>
              <div>
                王工<small>网络运维部</small>
              </div>
            </div>
          </div>
        </header>

        <main className="content" data-od-id="main">
          {children}
        </main>
      </div>
    </>
  );
}
