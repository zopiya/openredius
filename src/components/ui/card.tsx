import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      data-slot="card"
      className={cn('min-w-0 rounded-lg border border-line-soft bg-bg', className)}
      {...rest}
    />
  );
}

export function CardHead({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex items-center justify-between gap-3 px-5 pt-4', className)}>{children}</div>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <div className="font-display text-[15px] font-semibold tracking-[-0.01em]">{children}</div>;
}

export function CardExtra({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex items-center gap-2.5 text-xs text-muted', className)}>{children}</div>;
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 pt-3.5 pb-5', className)}>{children}</div>;
}

/** KPI 卡片行(原型 .grid-kpi,<1280px 折为 2 列) */
export function KpiGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div data-slot="kpi-grid" className={cn('mb-4 grid grid-cols-4 gap-4 max-[1280px]:grid-cols-2', className)}>
      {children}
    </div>
  );
}

export function Kpi({ testId, className, children }: { testId?: string; className?: string; children: ReactNode }) {
  return (
    <div
      data-slot="kpi"
      data-testid={testId}
      className={cn('rounded-lg border border-line-soft bg-bg px-5 pt-[18px] pb-4', className)}
    >
      {children}
    </div>
  );
}

export function KpiLabel({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between text-[13px] text-muted">{children}</div>;
}

export function KpiValue({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 font-display text-[33px] leading-[1.1] font-semibold tracking-[-0.02em] tabular-nums">
      {children}
    </div>
  );
}

export function KpiDelta({ children }: { children: ReactNode }) {
  return (
    <div className="mt-[7px] text-xs text-muted [&_b]:font-semibold [&_b.up]:text-success [&_b.down]:text-danger">
      {children}
    </div>
  );
}

export function KpiMeta({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 text-[11.5px] text-meta">{children}</div>;
}
