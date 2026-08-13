import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { EyeOutlined, LaptopOutlined, CloudServerOutlined } from '@ant-design/icons';
import { Table, Button, Modal, Drawer, Select, Input, Tabs, Tag, Skeleton, Empty, Result, Card, Typography, theme, Divider, Flex, Space, Alert } from 'antd';
import type { TableColumnsType } from 'antd';
import Shell from '../components/Shell';
import PageHeader from '../components/PageHeader';
import { FilterField } from '../components/TableToolbar';
import { useToast } from '../components/Toast';
import {
  DEVICE_FILTER_OPTIONS, fetchEndpoints, fetchNas, getNasSecret, importEndpoints, removeWhitelist, revokeCert,
  SSID_ROWS, SWITCH_BUSY_PORTS, SWITCH_PORT_DETAIL,
  type EndpointRow, type NasRow,
} from '../api/resources/devices';
import { MODE } from '../api/config';

interface NasFilters { type: string; area: string; status: string; }
interface EpFilters { type: string; comp: string; kw: string; }

const DEFAULT_NAS_FILTERS: NasFilters = { type: '全部类型', area: '全部区域', status: '全部' };
const DEFAULT_EP_FILTERS: EpFilters = { type: '全部类型', comp: '全部', kw: '' };

const NAS_TYPE_MAP: Record<string, NasRow['type']> = { 交换机: 'switch', '无线 AC': 'ac', AP: 'ap' };
const EP_COMP_MAP: Record<string, string> = { 合规: 'ok', 证书临期: 'warn', 不合规: 'bad' };

function matchNas(row: NasRow, f: NasFilters) {
  if (f.type !== '全部类型' && row.type !== NAS_TYPE_MAP[f.type]) return false;
  if (f.area !== '全部区域' && row.area !== f.area) return false;
  if (f.status !== '全部' && row.status !== (f.status === '在线' ? 'online' : 'offline')) return false;
  return true;
}

function matchEp(row: EndpointRow, f: EpFilters) {
  if (f.type !== '全部类型' && row.etype !== f.type) return false;
  if (f.comp !== '全部' && row.comp !== EP_COMP_MAP[f.comp]) return false;
  const kw = f.kw.trim().toLowerCase();
  if (kw) {
    const text = [row.mac, row.fingerprint, row.userName, row.userSub, row.etype, row.compLabel, row.firstSeen].join(' ').toLowerCase();
    if (text.indexOf(kw) < 0) return false;
  }
  return true;
}

type DeviceModal =
  | { kind: 'revoke'; row: EndpointRow }
  | { kind: 'remove'; row: EndpointRow }
  | { kind: 'import' }
  | null;

export default function Devices() {
  const toast = useToast();
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'nas' | 'ep'>('nas');
  const [nasView, setNasView] = useState<'loading' | 'ready' | 'error'>('loading');
  const [nasForm, setNasForm] = useState<NasFilters>(DEFAULT_NAS_FILTERS);
  const [nasApplied, setNasApplied] = useState<NasFilters>(DEFAULT_NAS_FILTERS);
  const [epForm, setEpForm] = useState<EpFilters>(DEFAULT_EP_FILTERS);
  const [epApplied, setEpApplied] = useState<EpFilters>(DEFAULT_EP_FILTERS);
  const [nasRows, setNasRows] = useState<NasRow[]>([]);
  const [epRows, setEpRows] = useState<EndpointRow[]>([]);
  const [drawerDevice, setDrawerDevice] = useState<NasRow | null>(null);
  const [modal, setModal] = useState<DeviceModal>(null);
  const [secretShown, setSecretShown] = useState<Set<string>>(new Set());
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [importText, setImportText] = useState('');

  useEffect(() => {
    const h = decodeURIComponent(location.hash.replace('#', ''));
    const kv: Record<string, string> = {};
    h.split('&').forEach((p) => { const i = p.indexOf('='); kv[p.slice(0, i)] = p.slice(i + 1); });
    if (kv.tab === 'ep') setTab('ep');
  }, [location.hash]);

  useEffect(() => {
    if (nasView !== 'loading') return;
    let cancelled = false;
    fetchNas().then((data) => { if (!cancelled) { setNasRows(data); setNasView('ready'); } }).catch(() => { if (!cancelled) setNasView('error'); });
    return () => { cancelled = true; };
  }, [nasView]);

  useEffect(() => {
    if (tab !== 'ep') return;
    let cancelled = false;
    fetchEndpoints().then((data) => { if (!cancelled) setEpRows(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [tab]);

  const nasVisible = useMemo(() => nasRows.filter((r) => matchNas(r, nasApplied)), [nasRows, nasApplied]);
  const epVisible = useMemo(() => epRows.filter((r) => matchEp(r, epApplied)), [epRows, epApplied]);

  async function toggleSecret(r: NasRow, shown: boolean) {
    if (!shown) {
      setSecretShown((prev) => { const next = new Set(prev); next.delete(r.name); return next; });
      return;
    }
    if (MODE !== 'http') {
      setSecrets((prev) => ({ ...prev, [r.name]: r.secret ?? '' }));
      setSecretShown((prev) => { const next = new Set(prev); next.add(r.name); return next; });
      toast('Shared Secret 已明文显示,仅超级管理员可见 · 已记录审计');
      return;
    }
    if (!secrets[r.name]) {
      try {
        const plain = await getNasSecret(r.id ?? '');
        setSecrets((prev) => ({ ...prev, [r.name]: plain }));
      } catch (e) {
        toast(`获取 Secret 失败:${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    setSecretShown((prev) => { const next = new Set(prev); next.add(r.name); return next; });
    toast('Shared Secret 已明文显示,仅超级管理员可见 · 已记录审计');
  }

  function reloadEp() {
    fetchEndpoints().then((d) => setEpRows(d)).catch(() => {});
  }

  async function confirmModal() {
    const m = modal;
    if (!m) return;
    setModal(null);
    try {
      if (m.kind === 'revoke') {
        await revokeCert(m.row.mac);
        toast('证书已吊销,CRL 已同步至全部 NAS');
        reloadEp();
      } else if (m.kind === 'remove') {
        await removeWhitelist(m.row.mac);
        setEpRows((prev) => prev.filter((r) => r.mac !== m.row.mac));
        toast('已移出白名单');
      } else if (m.kind === 'import') {
        const macs = importText.split('\n').map((l) => l.split(',')[0]?.trim() ?? '').filter(Boolean);
        if (macs.length === 0) { toast('请至少输入一条 MAC'); return; }
        const r = await importEndpoints(macs);
        toast(`已导入 ${r.imported} 条`);
        setImportText('');
        reloadEp();
      }
    } catch (e) {
      toast(`操作失败:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const nasRetry = useCallback(() => { setNasView('loading'); fetchNas().then((d) => { setNasRows(d); setNasView('ready'); }).catch(() => setNasView('error')); }, []);

  const nasCols: TableColumnsType<NasRow> = [
    { title: '设备名称', key: 'name', render: (_v, r) => <b>{r.name}</b> },
    { title: '类型', key: 'type', render: (_v, r) => <Tag>{r.typeLabel}</Tag> },
    { title: 'IP 地址', dataIndex: 'ip', key: 'ip', render: (v) => <span style={{ fontFamily: 'monospace', fontSize: '12.5px' }}>{v}</span> },
    { title: '所属区域', dataIndex: 'area', key: 'area' },
    { title: 'Shared Secret', key: 'secret', render: (_v, r) => r.secret ? (
      <span>
        {secretShown.has(r.name) ? <span style={{ fontFamily: 'monospace', fontSize: '12.5px' }}>{secrets[r.name] ?? r.secret}</span> : '••••••••'}
        <Button type="link" size="small" icon={<EyeOutlined style={{ fontSize: 13 }} />} onClick={() => toggleSecret(r, !secretShown.has(r.name))} />
      </span>
    ) : '—' },
    { title: '状态', key: 'status', render: (_v, r) => <Tag color={r.statusBadge === 'bg-success' ? 'green' : r.statusBadge === 'bg-danger' ? 'red' : 'default'}>{r.statusLabel}</Tag> },
    { title: '端口 / 负载', key: 'load', render: (_v, r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 60, height: 5, borderRadius: 3, background: token.colorFillSecondary, overflow: 'hidden' }}>
          <div style={{ width: r.loadPct + '%', height: '100%', borderRadius: 3, background: r.loadDanger ? token.colorError : token.colorText, opacity: r.loadDanger ? 1 : 0.55 }} />
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{r.loadLabel}</Typography.Text>
      </div>
    )},
    { title: '操作', key: 'actions', render: (_v, r) => <a href="#" onClick={(e) => { e.preventDefault(); setDrawerDevice(r); }}>{r.opLabel}</a> },
  ];

  const epCols: TableColumnsType<EndpointRow> = [
    { title: '终端 MAC', dataIndex: 'mac', key: 'mac', width: 172, render: (v) => <Typography.Text code>{v}</Typography.Text> },
    { title: '证书指纹(SHA-256)', dataIndex: 'fingerprint', key: 'fingerprint', render: (v) => <span style={{ fontFamily: 'monospace', fontSize: '12.5px' }}>{v}</span> },
    { title: '绑定用户', key: 'user', render: (_v, r) => <>{r.userName}<Typography.Text type="secondary" style={{ display: 'block', fontFamily: 'monospace' }}>{r.userSub}</Typography.Text></> },
    { title: '终端类型', dataIndex: 'etype', key: 'etype' },
    { title: '合规状态', key: 'comp', render: (_v, r) => <Tag color={r.compBadge === 'bg-success' ? 'green' : r.compBadge === 'bg-warn' ? 'orange' : 'red'}>{r.compLabel}</Tag> },
    { title: '首次接入时间', dataIndex: 'firstSeen', key: 'firstSeen', render: (v) => <span style={{ fontFamily: 'monospace', fontSize: '12.5px' }}>{v}</span> },
    { title: '操作', key: 'actions', render: (_v, r) => (
      r.whitelist
        ? <a href="#" style={{ color: token.colorError }} onClick={(e) => { e.preventDefault(); setModal({ kind: 'remove', row: r }); }}>移出白名单</a>
        : <a href="#" style={{ color: token.colorError }} onClick={(e) => { e.preventDefault(); setModal({ kind: 'revoke', row: r }); }}>吊销证书</a>
    )},
  ];

  return (
    <Shell page="设备管理">
      <PageHeader
        title="设备管理"
        subtitle="37 台准入网络设备(NAS)· 1,642 台已登记终端"
        extra={
          <>
            {tab === 'nas' && <Button onClick={() => toast('添加 NAS:填写 IP 与 Shared Secret 后可纳管(演示)')}>添加 NAS</Button>}
            {tab === 'ep' && <Button type="primary" data-od-id="import-mac" onClick={() => setModal({ kind: 'import' })}>批量导入 MAC 白名单</Button>}
          </>
        }
      />

      <Card data-od-id="device-tabs" styles={{ body: { padding: 0 } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => { setTab(k as 'nas' | 'ep'); navigate(location.pathname + '#tab=' + k, { replace: true }); }}
          style={{ padding: '0 20px' }}
          items={[
            { key: 'nas', label: '准入网络设备(NAS)', children: (
              <div>
                <Flex wrap="wrap" align="flex-end" gap={12} style={{ padding: '14px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                  <FilterField label="类型" htmlFor="fn-type"><Select id="fn-type" value={nasForm.type} onChange={(v) => setNasForm((f) => ({ ...f, type: v }))} options={DEVICE_FILTER_OPTIONS.nasType.map((o) => ({ label: o, value: o }))} style={{ width: 120 }} /></FilterField>
                  <FilterField label="区域" htmlFor="fn-area"><Select id="fn-area" value={nasForm.area} onChange={(v) => setNasForm((f) => ({ ...f, area: v }))} options={DEVICE_FILTER_OPTIONS.nasArea.map((o) => ({ label: o, value: o }))} style={{ width: 120 }} /></FilterField>
                  <FilterField label="状态" htmlFor="fn-status"><Select id="fn-status" value={nasForm.status} onChange={(v) => setNasForm((f) => ({ ...f, status: v }))} options={DEVICE_FILTER_OPTIONS.nasStatus.map((o) => ({ label: o, value: o }))} style={{ width: 100 }} /></FilterField>
                  <Space>
                    <Button type="primary" size="small" onClick={() => setNasApplied(nasForm)}>筛选</Button>
                    <Button size="small" onClick={() => { setNasForm(DEFAULT_NAS_FILTERS); setNasApplied(DEFAULT_NAS_FILTERS); }}>重置</Button>
                  </Space>
                </Flex>
                {nasView === 'loading' && <div style={{ padding: 40 }}><Skeleton active paragraph={{ rows: 8 }} /></div>}
                {nasView === 'ready' && nasVisible.length > 0 && <Table rowKey="name" dataSource={nasVisible} columns={nasCols} data-od-id="nas-table" pagination={false} size="middle" />}
                {nasView === 'ready' && nasVisible.length === 0 && <Empty image={<CloudServerOutlined style={{ width: 64, height: 64, color: token.colorTextQuaternary }} />} description="没有符合条件的设备" style={{ padding: '56px 24px' }}><Button onClick={() => { setNasForm(DEFAULT_NAS_FILTERS); setNasApplied(DEFAULT_NAS_FILTERS); }}>清空筛选条件</Button></Empty>}
                {nasView === 'error' && <Result status="error" title="设备数据加载失败" subTitle="无法获取 NAS 清单(NDEV-API 502)。" extra={<Button onClick={nasRetry}>重试</Button>} />}
              </div>
            )},
            { key: 'ep', label: '终端准入清单', children: (
              <div>
                <Flex wrap="wrap" align="flex-end" gap={12} style={{ padding: '14px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                  <FilterField label="终端类型" htmlFor="fe-type"><Select id="fe-type" value={epForm.type} onChange={(v) => setEpForm((f) => ({ ...f, type: v }))} options={DEVICE_FILTER_OPTIONS.epType.map((o) => ({ label: o, value: o }))} style={{ width: 120 }} /></FilterField>
                  <FilterField label="合规状态" htmlFor="fe-comp"><Select id="fe-comp" value={epForm.comp} onChange={(v) => setEpForm((f) => ({ ...f, comp: v }))} options={DEVICE_FILTER_OPTIONS.epComp.map((o) => ({ label: o, value: o }))} style={{ width: 120 }} /></FilterField>
                  <FilterField label="关键词" htmlFor="fe-kw"><Input id="fe-kw" placeholder="MAC / 指纹 / 绑定用户" value={epForm.kw} onChange={(e) => setEpForm((f) => ({ ...f, kw: e.target.value }))} style={{ width: 160 }} /></FilterField>
                  <Space>
                    <Button type="primary" size="small" onClick={() => setEpApplied(epForm)}>筛选</Button>
                    <Button size="small" onClick={() => { setEpForm(DEFAULT_EP_FILTERS); setEpApplied(DEFAULT_EP_FILTERS); }}>重置</Button>
                  </Space>
                  <Button onClick={() => toast('已导出 endpoints-20260727.csv(1,642 条)')}>导出清单</Button>
                </Flex>
                {epVisible.length > 0 && <Table rowKey="mac" dataSource={epVisible} columns={epCols} data-od-id="ep-table" pagination={false} size="middle" />}
                {epVisible.length === 0 && <Empty image={<LaptopOutlined style={{ width: 64, height: 64, color: token.colorTextQuaternary }} />} description="没有符合条件的终端" style={{ padding: '56px 24px' }}><Button onClick={() => { setEpForm(DEFAULT_EP_FILTERS); setEpApplied(DEFAULT_EP_FILTERS); }}>清空筛选条件</Button></Empty>}
              </div>
            )},
          ]}
        />
      </Card>

      <Drawer open={!!drawerDevice} title={drawerDevice ? drawerDevice.name + ' · ' + (drawerDevice.type === 'switch' ? '端口接入状态' : 'SSID 接入状态') : ''} onClose={() => setDrawerDevice(null)} size={560}>
        {drawerDevice && (
          <>
            <div style={{ display: 'flex', gap: 7, color: token.colorTextTertiary, marginBottom: 16 }}><a href="#" onClick={(e) => e.preventDefault()}>设备管理</a><span>/</span><span style={{ color: token.colorText, fontWeight: 500 }}>{drawerDevice.name}</span></div>
            {drawerDevice.type === 'switch' ? (
              <div>
                {drawerDevice.status === 'offline' && <Alert type="warning" showIcon title={<>设备当前<b>离线</b>,以下为最后已知端口快照(10:12 前)· 32 个在线会话已中断。</>} style={{ marginBottom: 14 }} />}
                <Divider titlePlacement="start" plain>端口接入状态(蓝 = 有终端接入)</Divider>
                <div className="port-grid" style={{ marginTop: 10 }}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((p) => {
                    const busy = drawerDevice.status === 'offline' ? undefined : SWITCH_BUSY_PORTS[p];
                    return <div key={p} className={busy ? 'port busy' : 'port idle'}><span className="p-name">Gi1/0/{p}</span><span className="p-sub">{busy ? busy + ' 接入中' : drawerDevice.status === 'offline' ? '离线' : '空闲'}</span></div>;
                  })}
                </div>
                {drawerDevice.status !== 'offline' && <><Divider titlePlacement="start" plain>接入明细</Divider><Table rowKey="port" size="small" pagination={false} dataSource={SWITCH_PORT_DETAIL} columns={[{ title: '端口', dataIndex: 'port', key: 'port', render: (v: string) => <Typography.Text code>{v}</Typography.Text> }, { title: '终端 MAC', dataIndex: 'mac', key: 'mac', render: (v: string) => <Typography.Text code>{v}</Typography.Text> }, { title: '用户', dataIndex: 'user', key: 'user' }, { title: 'VLAN', dataIndex: 'vlan', key: 'vlan', render: (v: string) => <Typography.Text code>{v}</Typography.Text> }]} /></>}
              </div>
            ) : (
              <div><Divider titlePlacement="start" plain>SSID 接入状态</Divider><Table rowKey="ssid" size="small" pagination={false} dataSource={SSID_ROWS} columns={[{ title: 'SSID', dataIndex: 'ssid', key: 'ssid', render: (v: string) => <b>{v}</b> }, { title: '认证方式', dataIndex: 'auth', key: 'auth' }, { title: '当前终端', dataIndex: 'count', key: 'count', render: (v: string) => <Typography.Text code>{v}</Typography.Text> }, { title: '下发 VLAN', dataIndex: 'vlan', key: 'vlan', render: (v: string) => <Typography.Text code>{v}</Typography.Text> }]} /></div>
            )}
          </>
        )}
      </Drawer>

      <Modal open={!!modal} title={modal?.kind === 'revoke' ? '确认吊销证书' : modal?.kind === 'remove' ? '确认移出白名单' : '批量导入 MAC 白名单'} width={520} okText={modal?.kind === 'revoke' ? '确认吊销' : modal?.kind === 'remove' ? '确认移出' : '导入'} okButtonProps={{ danger: modal?.kind !== 'import' }} onCancel={() => setModal(null)} onOk={confirmModal}>
        {modal?.kind === 'revoke' && <p>吊销终端 <Typography.Text code>{modal.row.mac}</Typography.Text>({modal.row.userName})的准入证书后,该终端将立即无法通过 EAP-TLS 认证。<b>吊销不可撤销</b>。</p>}
        {modal?.kind === 'remove' && <p>将 <Typography.Text code>{modal.row.mac}</Typography.Text> 移出 MAC 白名单后,该设备下次认证将被拒绝。</p>}
        {modal?.kind === 'import' && <><p>每行一条,格式:<Typography.Text code>MAC,绑定说明</Typography.Text>。仅适用于打印机、摄像头等无法安装证书的哑终端。</p><textarea value={importText} onChange={(e) => setImportText(e.target.value)} style={{ width: '100%', minHeight: 96, marginTop: 12 }} placeholder="00:25:96:12:34:56, 4F 会议室打印机" /></>}
      </Modal>
    </Shell>
  );
}
