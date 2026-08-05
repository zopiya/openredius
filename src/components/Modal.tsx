import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** 取消按钮文字;onOk 存在时渲染 取消/确认 两个按钮 */
  cancelText?: string;
  okText?: string;
  okClass?: string;
  width?: number;
  /** 点击取消 / 遮罩 / Esc */
  onClose: () => void;
  onOk?: () => void;
}

/** 与原型一致的二次确认 / 详情模态(.modal-overlay + .modal) */
export default function Modal({
  open,
  title,
  children,
  cancelText,
  okText,
  okClass = 'btn-danger-solid',
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

  const role = onOk ? 'alertdialog' : 'dialog';

  return (
    <div
      className={open ? 'modal-overlay show' : 'modal-overlay'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role={role} aria-modal="true" aria-label={title} style={width ? { width } : undefined}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          {onOk ? (
            <>
              <button ref={focusRef} className="btn btn-outline" onClick={onClose}>
                {cancelText ?? '取消'}
              </button>
              <button className={`btn ${okClass}`} onClick={onOk}>
                {okText ?? '确认执行'}
              </button>
            </>
          ) : (
            <button ref={focusRef} className="btn btn-outline" onClick={onClose}>
              {okText ?? '关闭'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
