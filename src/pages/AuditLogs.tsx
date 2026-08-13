import { useEffect, useMemo, useState } from 'react';
import { Table, Button, Select, Space, Tag, Empty, Skeleton, Result, Typography, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { exportAuditCsv, fetchAudit, type AuditRow } from '../api/resources/audit';
import { MODE } from '../api/config';

const { Text } = Typography;

const ACTION_LABELS: Record<string, string> = {
  'auth.login': '登录成功',
  'auth.login_failed': '登录失败',
  'auth.change_password': '修改密码',
  'session.disconnect': '强制下线',
  'session.reauthorize': '批量重授权',
  'user.status': '用户启停',
  'user.policy': '分配策略',
  'ad_sync.triggered': 'AD 同步',
  'policy.create': '策略新建',
  'policy.update': '策略编辑',
  'policy.toggle': '策略启停',
  'policy.reorder': '策略重排',
  'policy.delete': '策略删除',
  'policy.compile': '策略编译',
  'nas.create': 'NAS 添加',
  'nas.update': 'NAS 修改',
  'nas.delete': 'NAS 删除',
  'secret.reveal': '查看 Secret',
  'endpoint.import': '终端导入',
  'endpoint.revoke_cert': '吊销证书',
  'endpoint.remove_whitelist': '移出白名单',
  'settings.update': '设置变更',
  'alert_rules.update': '告警配置',
  'admin.create': '管理员新增',
  'admin.update': '管理员变更',
  'admin.delete': '管理员撤销',
  'admin.bootstrap': '初始管理员',
  'ops.reload_radius': 'RADIUS 重载',
  'report.export': '报表导出',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function detailText(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const entries = Object.entries(detail).filter(([, v]) => v !== null && v !== '');
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(' · ');
}

export default function AuditLogs() {
  const toast = useToast();
  const [view, setView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState<string>('');

  function load() {
    fetchAudit(action ? { action } : undefined)
      .then((r) => { setRows(r.items); setTotal(r.total); setView('ready'); })
      .catch(() => setView('error'));
  }

  useEffect(() => { load(); }, [action]);

  const columns: ColumnsType<AuditRow> = useMemo(() => [
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (v: string) => <Text code style={{ fontSize: 12 }}>{v ? v.replace('T', ' ').slice(0, 19) : '—'}</Text> },
    { title: '操作者', dataIndex: 'actor', key: 'actor', width: 130, render: (v: string) => <b>{v}</b> },
    { title: '动作', dataIndex: 'action', key: 'action', width: 130, render: (v: string) => <Tag color="blue">{actionLabel(v)}</Tag> },
    { title: '目标', key: 'target', width: 150, render: (_v, r) => r.targetType ? <Text code style={{ fontSize: 12 }}>{r.targetType}{r.targetId ? '#' + r.targetId : ''}</Text> : '—' },
    { title: '详情', dataIndex: 'detail', key: 'detail', ellipsis: true, render: (_v, r) => <Text type="secondary" style={{ fontSize: 12 }}>{detailText(r.detail) || '—'}</Text> },
    { title: 'IP', dataIndex: 'ip', key: 'ip', width: 130, render: (v: string) => <Text code style={{ fontSize: 12 }}>{v || '—'}</Text> },
  ], []);

  const actionOptions = useMemo(() => Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })), []);

  return (
    <Shell page="审计日志">
      <PageHeader
        title="审计日志"
        subtitle={<>全量后台操作审计 · 保留 180 天 · 仅管理员与审计员可见</>}
        extra={
          <>
            <Select
              allowClear
              placeholder="按动作筛选"
              value={action || undefined}
              onChange={(v) => setAction(v ?? '')}
              options={actionOptions}
              style={{ width: 180 }}
            />
            <Button type="primary" onClick={() => {
              if (MODE !== 'http') { toast('已导出 audit.csv(mock 占位)'); return; }
              exportAuditCsv().then(() => toast('已导出审计日志 CSV')).catch((e) => toast(`导出失败:${e instanceof Error ? e.message : String(e)}`));
            }}>导出 CSV</Button>
          </>
        }
      />
      <Card styles={{ body: { padding: 0 } }}>
        {view === 'loading' && <div style={{ padding: 40 }}><Skeleton active paragraph={{ rows: 10 }} /></div>}
        {view === 'ready' && rows.length > 0 && (
          <Table
            rowKey="id"
            dataSource={rows}
            columns={columns}
            size="middle"
            data-od-id="audit-table"
            pagination={{ pageSize: 50, showTotal: (t) => `共 ${t} 条` }}
          />
        )}
        {view === 'ready' && rows.length === 0 && (
          <Empty description={action ? '该动作暂无审计记录' : '暂无审计记录'} style={{ padding: '56px 24px' }}>
            {action && <Button onClick={() => setAction('')} style={{ marginTop: 12 }}>清除筛选</Button>}
          </Empty>
        )}
        {view === 'error' && <Result status="error" title="审计日志加载失败" subTitle="无法读取审计记录(AUDIT-API 500)。" extra={<Button onClick={() => { setView('loading'); load(); }}>重试</Button>} />}
      </Card>
      <Space style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>共 {total} 条审计记录 · 变更类操作均在此留痕</Text>
      </Space>
    </Shell>
  );
}
