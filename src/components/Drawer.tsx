import { useEffect, type ReactNode } from 'react';

export interface DrawerProps {
  open: boolean;
  title: string;
  children: ReactNode;
  foot?: ReactNode;
  width?: number;
  steps?: ReactNode;
  onClose: () => void;
}

/**
 * 右侧抽屉。与原型一致:抽屉节点常驻 DOM,通过 body.drawer-open
 * 触发 CSS 位移过渡,关闭时保留滑出动画。
 */
export default function Drawer({ open, title, children, foot, width, steps, onClose }: DrawerProps) {
  useEffect(() => {
    document.body.classList.toggle('drawer-open', open);
    return () => {
      document.body.classList.remove('drawer-open');
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} style={open ? undefined : { display: 'none' }} />
      <div className="drawer" role="dialog" aria-label={title} style={width ? { width } : undefined}>
        <div className="drawer-head">
          <div className="drawer-title">{title}</div>
          <button className="drawer-close" aria-label="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        {steps}
        <div className="drawer-body">{children}</div>
        {foot && <div className="drawer-foot">{foot}</div>}
      </div>
    </>
  );
}
