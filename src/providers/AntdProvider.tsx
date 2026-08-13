import type { ReactNode } from 'react';
import { ConfigProvider, App } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import theme from '../theme';

/**
 * 全局 Ant Design 6 Provider
 * - ConfigProvider: 主题 + 国际化
 * - App: 提供 message / modal / notification 静态方法（useApp）
 */
export default function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <App>
        {children}
      </App>
    </ConfigProvider>
  );
}
