import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb, Flex, Typography, Tabs } from 'antd';
import type { TabsProps } from 'antd';

/**
 * 统一的页面页头，复刻 Ant Design Pro 的 PageContainer 设计：
 * 面包屑 + 标题 + 描述 + 右侧操作区 + 可选 TabBar。
 */
export default function PageHeader({
  title,
  subtitle,
  extra,
  breadcrumb,
  tabs,
  activeTab,
  onTabChange,
}: {
  title: string;
  subtitle?: ReactNode;
  extra?: ReactNode;
  /** 自定义面包屑项；缺省为「首页 / title」 */
  breadcrumb?: { title: ReactNode }[];
  /** 可选 TabBar（Pro PageContainer 特征） */
  tabs?: TabsProps['items'];
  activeTab?: string;
  onTabChange?: (key: string) => void;
}) {
  const items = breadcrumb ?? [
    { title: <Link to="/dashboard">首页</Link> },
    { title },
  ];

  return (
    <div style={{ marginBottom: 20 }}>
      <Breadcrumb items={items} style={{ marginBottom: 8 }} />
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
        {extra && (
          <Flex align="center" gap={8} wrap="wrap" flex="none">
            {extra}
          </Flex>
        )}
      </Flex>
      {tabs && (
        <Tabs
          activeKey={activeTab}
          onChange={onTabChange}
          items={tabs}
          style={{ marginTop: 12 }}
        />
      )}
    </div>
  );
}
