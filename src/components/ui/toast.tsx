import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

/** 全局轻提示(原型 .toast) */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      <div
        data-slot="toast"
        role="status"
        className={cn(
          'fixed bottom-[34px] left-1/2 z-[200] max-w-[80vw] -translate-x-1/2 rounded-[10px] bg-fg px-[18px] py-2.5 text-[13px] text-white shadow-toast transition-all duration-[220ms] ease-standard',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[14px] opacity-0',
        )}
      >
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}
