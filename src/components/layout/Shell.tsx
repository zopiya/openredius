import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, BarChart3, Gauge, ScrollText, Search, Server, Settings, ShieldCheck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTitle } from '@/hooks/useTitle';

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

/** 应用外壳:固定侧边栏 + 粘性顶栏 + 内容区 */
export default function Shell({ page, children }: { page: string; children: ReactNode }) {
  useTitle(page);
  return (
    <>
      <aside data-slot="sidebar" className="fixed inset-y-0 left-0 z-40 flex w-(--size-side) flex-col border-r border-line-soft bg-surface">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-sm bg-fg font-display text-sm font-bold text-white">
            R
          </div>
          <div className="leading-[1.25]">
            <b className="block font-display text-[14.5px] font-semibold tracking-[-0.01em]">准入认证控制台</b>
            <span className="text-[11px] text-muted">RADIUS 802.1X</span>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-1.5 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13.5px] text-fg-2 transition-[background-color,color] duration-150 ease-standard hover:bg-fg/5 hover:no-underline',
                  isActive && 'bg-accent/11 font-semibold text-accent hover:bg-accent/11',
                )
              }
            >
              <Icon className="size-[17px] shrink-0" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t border-line-soft px-5 pt-3.5 pb-[18px] text-[11.5px] text-muted">
          <span className="size-[7px] shrink-0 rounded-full bg-success" />
          RADIUS 服务正常 · v2.4.1
        </div>
      </aside>

      <div className="ml-(--size-side) flex min-h-screen flex-col">
        <header
          data-slot="topbar"
          className="sticky top-0 z-30 flex h-[57px] items-center gap-[18px] border-b border-line-soft bg-bg/84 px-7 backdrop-saturate-[1.8] backdrop-blur-[12px]"
        >
          <div className="font-display text-[16.5px] font-semibold tracking-[-0.01em]">{page}</div>
          <div className="ml-auto flex items-center gap-3.5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-meta" strokeWidth={2} />
              <input
                type="search"
                placeholder="搜索用户 / MAC / 设备"
                aria-label="搜索"
                className="h-8 w-60 rounded-sm border-none bg-surface pr-3 pl-[31px] text-[13px] text-fg placeholder:text-meta focus:shadow-focus focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-[9px] text-[12.5px] text-fg-2">
              <div className="grid size-[30px] place-items-center rounded-full bg-fg text-[12.5px] font-semibold text-white">
                王
              </div>
              <div>
                王工<small className="block text-[11px] leading-[1.2] text-muted">网络运维部</small>
              </div>
            </div>
          </div>
        </header>
        <main className="w-full max-w-[1440px] px-7 pt-[26px] pb-[72px]">{children}</main>
      </div>
    </>
  );
}
