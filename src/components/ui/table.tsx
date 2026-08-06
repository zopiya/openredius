import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** 数据表格(原型 .tbl):表头/单元格/行 hover/末行无下边框 规则集中在此 */
export function Table({
  className,
  skeleton,
  ...rest
}: HTMLAttributes<HTMLTableElement> & { skeleton?: boolean }) {
  return (
    <table
      data-slot={skeleton ? 'skeleton-table' : 'table'}
      className={cn(
        'w-full border-collapse text-[13.5px]',
        '[&_th]:border-b [&_th]:border-line [&_th]:bg-bg [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-muted',
        '[&_td]:border-b [&_td]:border-line-soft [&_td]:px-3.5 [&_td]:py-[11px] [&_td]:align-middle',
        '[&_tbody_tr:hover_td]:bg-[color-mix(in_oklab,var(--color-fg)_2.2%,transparent)]',
        '[&_tbody_tr:last-child_td]:border-b-0',
        className,
      )}
      {...rest}
    />
  );
}

export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('overflow-x-auto', className)}>{children}</div>;
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={className} {...rest} />;
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={className} {...rest} />;
}

/** 单元格主文案下的副行(原型 .sub) */
export function CellSub({ mono, children }: { mono?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn('mt-px block text-[11.5px] text-muted', mono && 'font-mono text-[12.5px] tracking-[-0.01em]')}
    >
      {children}
    </span>
  );
}

/** 等宽字体数字/MAC/时间(原型 .mono) */
export function Mono({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('font-mono text-[12.5px] tracking-[-0.01em]', className)}>{children}</span>;
}

/** 行内操作列(原型 .row-ops) */
export function RowOps({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-3 text-[12.5px]">{children}</div>;
}

/** 行内操作链接;danger 用内联色保持 hover 不翻蓝(与原型一致) */
export function RowLink({
  danger,
  testId,
  onClick,
  children,
}: {
  danger?: boolean;
  testId?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <a
      href="#"
      data-testid={testId}
      style={danger ? { color: 'var(--color-danger)' } : undefined}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </a>
  );
}

/** 行展开详情(原型 tr.detail-row) */
export function DetailRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr
      data-slot="detail-row"
      className="[&>td]:bg-surface-warm! [&:hover>td]:bg-surface-warm! [&>td]:px-5 [&>td]:py-4"
    >
      <td colSpan={colSpan}>{children}</td>
    </tr>
  );
}
