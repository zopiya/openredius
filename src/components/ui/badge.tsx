import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'success' | 'danger' | 'warn' | 'muted' | 'info';

const TONES: Record<BadgeTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warn: 'text-warn-deep',
  muted: 'text-muted',
  info: 'text-accent',
};

/** 状态徽章:圆点 + 淡底胶囊(原型 .badge) */
export function Badge({
  tone = 'muted',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-[5px] rounded-pill bg-[color-mix(in_oklab,currentColor_9%,#fff)] px-[9px] py-[3.5px] text-xs leading-none font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      <i className="size-[5px] rounded-full bg-current" />
      {children}
    </span>
  );
}

/** 中性标签(原型 .tag) */
export function Tag({ warn, className, children }: { warn?: boolean; className?: string; children: ReactNode }) {
  return (
    <span
      data-slot="tag"
      className={cn(
        'inline-block rounded-[6px] border px-2 py-0.5 text-xs whitespace-nowrap',
        warn
          ? 'border-[color-mix(in_oklab,var(--color-warn)_45%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-warn)_8%,var(--color-bg))] text-[color-mix(in_oklab,var(--color-warn)_55%,var(--color-fg))]'
          : 'border-line bg-bg text-fg-2',
        className,
      )}
    >
      {children}
    </span>
  );
}

export type ReasonTone = 'default' | 'warn' | 'danger' | 'info' | 'muted';

const RTONES: Record<ReasonTone, string> = {
  default:
    'text-fg-2 border-[color-mix(in_oklab,var(--color-fg-2)_32%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-fg-2)_7%,var(--color-bg))]',
  warn: 'text-warn-deep border-[color-mix(in_oklab,var(--color-warn-deep)_32%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-warn-deep)_7%,var(--color-bg))]',
  danger:
    'text-danger border-[color-mix(in_oklab,var(--color-danger)_32%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-danger)_7%,var(--color-bg))]',
  info: 'text-accent border-[color-mix(in_oklab,var(--color-accent)_32%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-accent)_7%,var(--color-bg))]',
  muted:
    'text-muted border-[color-mix(in_oklab,var(--color-muted)_32%,var(--color-line))] bg-[color-mix(in_oklab,var(--color-muted)_7%,var(--color-bg))]',
};

/** 失败原因标签:左色条 + 淡底,较结果徽章更安静(原型 .rtag) */
export function ReasonTag({
  tone = 'default',
  className,
  children,
  title,
}: {
  tone?: ReasonTone;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      data-slot="reason-tag"
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[6px] border py-[3px] pr-[9px] pl-2 text-xs font-medium whitespace-nowrap',
        RTONES[tone],
        className,
      )}
    >
      <i className="h-[14px] w-1 shrink-0 rounded-[2px] bg-current" />
      {children}
    </span>
  );
}
