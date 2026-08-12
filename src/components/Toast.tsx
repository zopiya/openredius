import { App } from 'antd';

/**
 * Toast 通知 —— 已迁移到 Ant Design App.useApp().message。
 * 所有页面无需修改 import 路径,内部实现已替换。
 */
export function useToast() {
  const { message } = App.useApp();
  return (msg: string) => message.info(msg);
}

/** 不再需要,保留空实现以兼容 main.tsx 中的应用(将被移除) */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
