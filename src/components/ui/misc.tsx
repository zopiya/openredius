import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 页头(原型 .page-head) */
export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-2xl font-semibold">{title}</h1>
        {sub && (
          <div data-slot="page-sub" className="mt-1.5 text-[13px] text-muted [&_b]:font-semibold [&_b]:text-fg">
            {sub}
          </div>
        )}
      </div>
      {children && <div className="flex shrink-0 gap-2.5">{children}</div>}
    </div>
  );
}

/** 提示条(原型 .notice) */
export function Notice({ tone = 'default', testId, className, children }: { tone?: 'default' | 'warn'; testId?: string; className?: string; children: ReactNode }) {
  return (
    <div
      data-slot="notice"
      data-testid={testId}
      className={cn(
        'mb-4 flex items-center gap-3 rounded-md border px-4 py-[13px] text-[13px] text-fg-2 [&_b]:font-semibold [&_b]:text-fg',
        tone === 'warn'
          ? 'border-[color-mix(in_oklab,var(--color-warn)_45%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-warn)_6%,var(--color-surface))]'
          : 'border-line-soft bg-surface',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 表格上下统计条(原型 .stat-strip) */
export function StatStrip({
  top,
  borderless,
  strong,
  testId,
  className,
  children,
}: {
  top?: boolean;
  borderless?: boolean;
  strong?: boolean;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="stat-strip"
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-center gap-[26px] px-5 py-3 text-[12.5px] text-muted [&_b]:font-semibold [&_b]:text-fg [&_b]:tabular-nums',
        top && 'border-t border-line-soft',
        !top && !borderless && 'border-b border-line-soft',
        strong && 'text-fg-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** KV 定义列表(原型 .kv / .kv.plain) */
export function Kv({ plain, className, children }: { plain?: boolean; className?: string; children: ReactNode }) {
  return (
    <dl
      className={cn(
        'm-0 grid grid-cols-[190px_1fr] gap-x-4 gap-y-2 text-[13px] [&_dt]:text-muted [&_dd]:m-0 [&_dd]:break-all',
        plain ? '[&_dd]:font-sans [&_dd]:text-[13px]' : '[&_dd]:font-mono [&_dd]:text-[12.5px]',
        className,
      )}
    >
      {children}
    </dl>
  );
}

/** 面包屑(原型 .crumb) */
export function Breadcrumb({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('mb-4 flex items-center gap-[7px] text-[12.5px] text-muted [&_a]:text-muted [&_a:hover]:text-accent', className)}>
      {children}
    </div>
  );
}

export function CrumbSep() {
  return <span className="text-meta">/</span>;
}

export function CrumbCur({ children }: { children: ReactNode }) {
  return <span className="font-medium text-fg">{children}</span>;
}

/** 进度条(原型 .bar-track / .bar-fill) */
export function BarTrack({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('h-2 overflow-hidden rounded bg-surface', className)}>{children}</div>;
}

export function BarFill({ pct, tone = 'accent', className }: { pct: number; tone?: 'accent' | 'fg' | 'danger'; className?: string }) {
  return (
    <div
      className={cn(
        'h-full rounded',
        tone === 'accent' && 'bg-accent',
        tone === 'fg' && 'bg-[color-mix(in_oklab,var(--color-fg)_55%,#fff)]',
        tone === 'danger' && 'bg-danger',
        className,
      )}
      style={{ width: `${pct}%` }}
    />
  );
}

/** NAS 端口/负载小条(原型 .mini-load) */
export function MiniLoad({ pct, danger, label }: { pct: number; danger?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <BarTrack className="h-[5px] w-[60px]">
        <BarFill pct={pct} tone={danger ? 'danger' : 'accent'} />
      </BarTrack>
      <span className="text-xs text-muted tabular-nums">{label}</span>
    </div>
  );
}
