import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb, Typography } from 'antd';

/**
 * 统一的页面页头，复刻 Ant Design Pro 的 PageContainer 设计：
 * 面包屑 + 大标题 + 描述 + 右侧操作区。
 */
export default function PageHeader({
  title,
  subtitle,
  extra,
  breadcrumb,
}: {
  title: string;
  subtitle?: ReactNode;
  extra?: ReactNode;
  /** 自定义面包屑项；缺省为「首页 / title」 */
  breadcrumb?: { title: ReactNode }[];
}) {
  const items = breadcrumb ?? [
    { title: <Link to="/dashboard">首页</Link> },
    { title },
  ];

  return (
    <div style={{ marginBottom: 20 }}>
      <Breadcrumb items={items} style={{ marginBottom: 10, fontSize: 12 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Typography.Title
            level={1}
            style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Text
              type="secondary"
              style={{ fontSize: 13, marginTop: 6, display: 'block' }}
            >
              {subtitle}
            </Typography.Text>
          )}
        </div>
        {extra && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {extra}
          </div>
        )}
      </div>
    </div>
  );
}
