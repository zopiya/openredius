import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 页签容器(原型 .tabs) */
export function Tabs({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div data-slot="tabs" className={cn('flex gap-1 border-b border-line px-5', className)}>
      {children}
    </div>
  );
}

export function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-slot="tab"
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        '-mb-px cursor-pointer border-b-2 border-transparent bg-transparent px-[13px] pt-[11px] pb-[10px] text-[13.5px] text-muted hover:text-fg',
        active && 'border-accent font-semibold text-fg',
      )}
    >
      {children}
    </button>
  );
}

/** 分段控件(原型 .seg) */
export function Segmented({ testId, ariaLabel, className, children }: { testId?: string; ariaLabel?: string; className?: string; children: ReactNode }) {
  return (
    <div data-slot="segmented" data-testid={testId} aria-label={ariaLabel} className={cn('inline-flex gap-0.5 rounded-[9px] bg-surface p-0.5', className)}>
      {children}
    </div>
  );
}

export function SegmentedItem({
  on,
  onClick,
  role,
  ariaSelected,
  children,
}: {
  on: boolean;
  onClick: () => void;
  role?: string;
  ariaSelected?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={ariaSelected}
      data-state={on ? 'on' : undefined}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-[7px] bg-transparent px-[15px] py-[5px] text-[12.5px] text-muted',
        on && 'bg-bg font-semibold text-fg shadow-[0_1px_3px_rgba(0,0,0,0.1)]',
      )}
    >
      {children}
    </button>
  );
}
