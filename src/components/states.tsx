import type { ReactNode } from 'react';
import { CloudOff, type LucideIcon } from 'lucide-react';

/** 骨架屏:与原型一致的 .tbl-skel 行 */
export function SkeletonTable({ cols, widths }: { cols: number; widths: string[] }) {
  return (
    <table className="tbl tbl-skel" aria-label="加载中">
      <tbody>
        {[0, 1, 2].map((r) => (
          <tr key={r}>
            {Array.from({ length: cols }, (_, c) => (
              <td key={c}>{widths[c] ? <div className={`sk-line ${widths[c]}`} /> : null}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
    <div className="state-empty">
      <Icon style={{ width: 34, height: 34 }} />
      <h3>{title}</h3>
      <p>{desc}</p>
      {actionText && (
        <button className="btn btn-outline" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
}

export function ErrorState({
  title,
  desc,
  onRetry,
}: {
  title: string;
  desc: ReactNode;
  onRetry: () => void;
}) {
  return (
    <div className="state-error">
      <CloudOff style={{ width: 34, height: 34 }} />
      <h3>{title}</h3>
      <p>{desc}</p>
      <button className="btn btn-outline" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}
