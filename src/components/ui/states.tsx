import type { ReactNode } from 'react';
import { CloudOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table } from './table';

const SK_WIDTHS: Record<string, string> = {
  'w-40': 'w-2/5',
  'w-60': 'w-3/5',
  'w-80': 'w-4/5',
};

/** 骨架屏表格(原型 .tbl-skel + .sk-line 微光) */
export function SkeletonTable({ cols, widths }: { cols: number; widths: string[] }) {
  return (
    <Table skeleton aria-label="加载中" className="[&_td]:p-3.5">
      <tbody>
        {[0, 1, 2].map((r) => (
          <tr key={r}>
            {Array.from({ length: cols }, (_, c) => (
              <td key={c}>
                {widths[c] ? (
                  <div
                    className={cn(
                      'my-[9px] h-[13px] rounded-[6px] bg-surface motion-safe:animate-shimmer',
                      SK_WIDTHS[widths[c]],
                    )}
                  />
                ) : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  desc,
  actionText,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  actionText?: string;
  onAction?: () => void;
}) {
  return (
    <div data-slot="empty-state" className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <Icon className="mb-1.5 size-[34px] text-meta" />
      <h3 className="m-0 text-[15px] font-semibold text-fg">{title}</h3>
      <p className="m-0 max-w-[380px] text-[13px] leading-[1.6] text-muted">{desc}</p>
      {actionText && (
        <button
          type="button"
          data-slot="button"
          className="mt-3 inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-line bg-bg px-3.5 text-[13px] font-medium whitespace-nowrap hover:bg-surface"
          onClick={onAction}
        >
          {actionText}
        </button>
      )}
    </div>
  );
}

export function ErrorState({ title, desc, onRetry }: { title: string; desc: ReactNode; onRetry: () => void }) {
  return (
    <div data-slot="error-state" className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <CloudOff className="mb-1.5 size-[34px] text-meta" />
      <h3 className="m-0 text-[15px] font-semibold text-fg">{title}</h3>
      <p className="m-0 max-w-[380px] text-[13px] leading-[1.6] text-muted [&_b]:text-danger">{desc}</p>
      <button
        type="button"
        data-slot="button"
        className="mt-3 inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-line bg-bg px-3.5 text-[13px] font-medium whitespace-nowrap hover:bg-surface"
        onClick={onRetry}
      >
        重试
      </button>
    </div>
  );
}
