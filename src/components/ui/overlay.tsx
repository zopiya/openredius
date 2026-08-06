import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  cancelText?: string;
  okText?: string;
  okVariant?: 'primary' | 'danger-solid';
  width?: number;
  onClose: () => void;
  onOk?: () => void;
}

/** 二次确认 / 详情模态(原型 .modal-overlay + .modal),节点常驻 DOM */
export function Modal({
  open,
  title,
  children,
  cancelText,
  okText,
  okVariant = 'danger-solid',
  width,
  onClose,
  onOk,
}: ModalProps) {
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) focusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const okCls =
    okVariant === 'primary'
      ? 'border-transparent bg-accent text-white hover:bg-accent-hover'
      : 'border-transparent bg-danger text-white hover:bg-[color-mix(in_oklab,var(--color-danger)_88%,#000)]';

  return (
    <div
      data-slot="modal-overlay"
      data-state={open ? 'open' : 'closed'}
      className={cn('fixed inset-0 z-[100] items-center justify-center bg-black/30 p-5', open ? 'flex' : 'hidden')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-slot="modal"
        role={onOk ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={title}
        style={width ? { width } : undefined}
        className="w-[460px] max-w-[94vw] rounded-[14px] bg-bg shadow-modal"
      >
        <div data-slot="modal-title" className="font-display px-[22px] pt-[19px] text-[15px] font-semibold">
          {title}
        </div>
        <div data-slot="modal-body" className="px-[22px] pt-3 pb-1 text-[13.5px] leading-[1.65] text-fg-2">
          {children}
        </div>
        <div data-slot="modal-footer" className="flex justify-end gap-2.5 px-[22px] pt-4 pb-[19px]">
          {onOk ? (
            <>
              <button
                ref={focusRef}
                type="button"
                data-slot="button"
                className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-line bg-bg px-3.5 text-[13px] font-medium whitespace-nowrap hover:bg-surface"
                onClick={onClose}
              >
                {cancelText ?? '取消'}
              </button>
              <button
                type="button"
                data-slot="button"
                data-variant={okVariant}
                className={cn(
                  'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border px-3.5 text-[13px] font-medium whitespace-nowrap',
                  okCls,
                )}
                onClick={onOk}
              >
                {okText ?? '确认执行'}
              </button>
            </>
          ) : (
            <button
              ref={focusRef}
              type="button"
              data-slot="button"
              className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-line bg-bg px-3.5 text-[13px] font-medium whitespace-nowrap hover:bg-surface"
              onClick={onClose}
            >
              {okText ?? '关闭'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 模态内的等宽清单块(原型 .mono-list) */
export function MonoList({ children }: { children: ReactNode }) {
  return (
    <div data-slot="mono-list" className="mt-2.5 max-h-[140px] overflow-auto rounded-lg bg-surface px-3 py-2.5 font-mono text-xs">
      {children}
    </div>
  );
}

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
 * 右侧抽屉(原型 .drawer):节点常驻 DOM,位移过渡进出;
 * 打开时锁定页面滚动。
 */
export function Drawer({ open, title, children, foot, width, steps, onClose }: DrawerProps) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
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
      <div
        data-slot="drawer-overlay"
        onClick={onClose}
        className={cn('fixed inset-0 z-[90] bg-black/15', open ? 'block' : 'hidden')}
      />
      <div
        data-slot="drawer"
        data-state={open ? 'open' : 'closed'}
        role="dialog"
        aria-label={title}
        style={width ? { width } : undefined}
        className={cn(
          'fixed top-0 right-0 bottom-0 z-[95] flex w-[560px] max-w-[95vw] flex-col border-l border-line bg-bg shadow-drawer transition-transform duration-[220ms] ease-standard',
          open ? 'translate-x-0' : 'translate-x-[102%]',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-6 pt-[18px] pb-3.5">
          <div data-slot="drawer-title" className="font-display text-base font-semibold">
            {title}
          </div>
          <button
            type="button"
            data-slot="drawer-close"
            aria-label="关闭"
            onClick={onClose}
            className="size-7 cursor-pointer rounded-full border-0 bg-surface text-sm leading-none text-muted hover:text-fg"
          >
            ✕
          </button>
        </div>
        {steps}
        <div data-slot="drawer-body" className="flex-1 overflow-y-auto px-6 pt-[18px] pb-8">
          {children}
        </div>
        {foot && <div className="flex justify-end gap-2.5 border-t border-line-soft px-6 py-3.5">{foot}</div>}
      </div>
    </>
  );
}

/** 抽屉内分区标题(原型 .d-sec / .d-sec-t) */
export function DrawerSection({ title, className, children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('mt-[22px]', className)}>
      {title && (
        <div className="mb-2.5 text-xs font-semibold tracking-[0.04em] text-muted uppercase">{title}</div>
      )}
      {children}
    </div>
  );
}
