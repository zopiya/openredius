import type { ReactNode } from 'react';
import { Flex, Typography, theme } from 'antd';

/**
 * 表格页统一工具栏（参考 Ant Design Pro 的 ProTable toolbar）：
 * 左侧筛选字段 + 右侧操作按钮。
 */

/** 筛选字段：label + 控件，统一 label 排版与颜色 */
export function FilterField({ label, htmlFor, children }: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <Flex vertical gap={5}>
      <label htmlFor={htmlFor}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{label}</Typography.Text>
      </label>
      {children}
    </Flex>
  );
}

export default function TableToolbar({
  'data-od-id': dataOdId,
  children,
  actions,
}: {
  'data-od-id'?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <Flex
      wrap="wrap"
      align="flex-end"
      gap={12}
      data-od-id={dataOdId}
      style={{ padding: '14px 20px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}
    >
      {children}
      {actions && <div style={{ marginLeft: 'auto' }}>{actions}</div>}
    </Flex>
  );
}
