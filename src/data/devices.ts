export interface NasRow {
  name: string;
  type: 'switch' | 'ac' | 'ap';
  typeLabel: string;
  ip: string;
  area: string;
  status: 'online' | 'offline';
  statusLabel: string; // 在线 / 离线 38 分钟 / 高负载
  statusBadge: 'bg-success' | 'bg-danger' | 'bg-warn';
  secret?: string;
  loadPct: number;
  loadDanger?: boolean;
  loadLabel: string;
  opLabel: string; // 端口状态 / SSID 状态
}

/** 与原型 devices.html NAS 表格行一一对应 */
export const NAS_ROWS: NasRow[] = [
  { name: 'SW-3F-01', type: 'switch', typeLabel: '交换机', ip: '10.99.0.11', area: '3F 办公区', status: 'online', statusLabel: '在线', statusBadge: 'bg-success', secret: 'R@dius-S3cr3t', loadPct: 58, loadLabel: '28/48 端口', opLabel: '端口状态' },
  { name: 'SW-3F-02', type: 'switch', typeLabel: '交换机', ip: '10.99.0.12', area: '3F 办公区', status: 'online', statusLabel: '在线', statusBadge: 'bg-success', secret: 'R@dius-S3cr3t', loadPct: 42, loadLabel: '20/48 端口', opLabel: '端口状态' },
  { name: 'SW-5F-01', type: 'switch', typeLabel: '交换机', ip: '10.99.0.14', area: '5F 办公区', status: 'offline', statusLabel: '离线 38 分钟', statusBadge: 'bg-danger', secret: 'R@dius-S3cr3t', loadPct: 0, loadDanger: true, loadLabel: '0/48 端口', opLabel: '端口状态' },
  { name: 'SW-5F-02', type: 'switch', typeLabel: '交换机', ip: '10.99.0.13', area: '5F 办公区', status: 'online', statusLabel: '在线', statusBadge: 'bg-success', secret: 'R@dius-S3cr3t', loadPct: 65, loadLabel: '31/48 端口', opLabel: '端口状态' },
  { name: 'SW-B1-IDC-01', type: 'switch', typeLabel: '交换机', ip: '10.99.0.21', area: 'B1 机房', status: 'online', statusLabel: '在线', statusBadge: 'bg-success', secret: 'R@dius-S3cr3t', loadPct: 25, loadLabel: '12/48 端口', opLabel: '端口状态' },
  { name: 'AC-HQ-01', type: 'ac', typeLabel: '无线 AC', ip: '10.99.0.30', area: 'B1 机房', status: 'online', statusLabel: '在线', statusBadge: 'bg-success', secret: 'R@dius-S3cr3t', loadPct: 71, loadLabel: '管理 24 台 AP · 488 终端', opLabel: 'SSID 状态' },
  { name: 'AP-3F-012', type: 'ap', typeLabel: 'AP', ip: '10.99.1.12', area: '3F 办公区', status: 'online', statusLabel: '在线', statusBadge: 'bg-success', loadPct: 64, loadLabel: '32/50 终端', opLabel: 'SSID 状态' },
  { name: 'AP-4F-007', type: 'ap', typeLabel: 'AP', ip: '10.99.1.47', area: '4F 办公区', status: 'online', statusLabel: '高负载', statusBadge: 'bg-warn', loadPct: 92, loadDanger: true, loadLabel: '46/50 终端', opLabel: 'SSID 状态' },
];

export interface EndpointRow {
  mac: string;
  fingerprint: string;
  userName: string;
  userSub: string;
  etype: string;
  comp: 'ok' | 'warn' | 'bad' | 'white';
  compLabel: string;
  compBadge: 'bg-success' | 'bg-warn' | 'bg-danger' | 'bg-muted';
  firstSeen: string;
  /** true = 白名单设备,操作为「移出白名单」 */
  whitelist?: boolean;
}

/** 与原型 devices.html 终端准入清单表格行一一对应 */
export const ENDPOINT_ROWS: EndpointRow[] = [
  { mac: '3C:52:82:1A:4B:01', fingerprint: '9F:2A:…:71:C0', userName: '王磊', userSub: 'wang.lei', etype: '笔记本', comp: 'ok', compLabel: '合规', compBadge: 'bg-success', firstSeen: '2025-03-14 09:22' },
  { mac: 'A4:83:E7:22:9C:7E', fingerprint: 'B1:08:…:3E:9A', userName: '李娜', userSub: 'li.na', etype: '手机', comp: 'warn', compLabel: '证书 12 天后到期', compBadge: 'bg-warn', firstSeen: '2025-08-02 14:05' },
  { mac: '7C:2E:DD:41:0A:93', fingerprint: 'C4:77:…:0B:52', userName: '张伟', userSub: 'zhang.wei', etype: '笔记本', comp: 'ok', compLabel: '合规', compBadge: 'bg-success', firstSeen: '2024-11-30 10:48' },
  { mac: '3C:52:82:1A:8D:40', fingerprint: '4F:2A:…:88:1D', userName: '孙鹏', userSub: 'sun.peng', etype: '笔记本', comp: 'bad', compLabel: '证书已过期', compBadge: 'bg-danger', firstSeen: '2025-07-25 16:37' },
  { mac: 'F4:8C:50:77:BE:09', fingerprint: 'D2:91:…:6F:04', userName: '赵敏', userSub: 'zhao.min', etype: '手机', comp: 'ok', compLabel: '合规', compBadge: 'bg-success', firstSeen: '2026-01-19 11:12' },
  { mac: '00:25:96:FF:FE:12', fingerprint: '—(MAC 白名单)', userName: '3F 打印区', userSub: '共享设备', etype: '打印机', comp: 'white', compLabel: '白名单准入', compBadge: 'bg-muted', firstSeen: '2024-06-05 08:30', whitelist: true },
  { mac: '8C:85:90:5B:11:2F', fingerprint: 'E7:5C:…:29:F8', userName: '刘洋', userSub: 'liu.yang', etype: '笔记本', comp: 'ok', compLabel: '合规', compBadge: 'bg-success', firstSeen: '2025-12-08 09:54' },
  { mac: 'B0:6E:BF:12:78:E3', fingerprint: 'A0:33:…:D5:61', userName: '郑楠', userSub: 'zheng.nan', etype: '手机', comp: 'bad', compLabel: '不合规 · EDR 离线', compBadge: 'bg-danger', firstSeen: '2026-04-22 15:20' },
];

export const DEVICE_FILTER_OPTIONS = {
  nasType: ['全部类型', '交换机', '无线 AC', 'AP'],
  nasArea: ['全部区域', '3F 办公区', '4F 办公区', '5F 办公区', 'B1 机房', '1F 大堂'],
  nasStatus: ['全部', '在线', '离线'],
  epType: ['全部类型', '笔记本', '手机', '打印机', '摄像头'],
  epComp: ['全部', '合规', '证书临期', '不合规'],
} as const;

/** 端口抽屉:交换机接入明细(原型固定数据) */
export const SWITCH_PORT_DETAIL = [
  { port: 'Gi1/0/07', mac: '3C:52:82:1A:8D:40', user: '孙鹏', vlan: '20' },
  { port: 'Gi1/0/12', mac: '3C:52:82:1A:4B:01', user: '王磊', vlan: '20' },
  { port: 'Gi1/0/18', mac: '48:4D:7E:C3:56:B8', user: '吴昊', vlan: '99' },
];

/** 端口抽屉:占用端口 → 使用者(原型 busy 映射) */
export const SWITCH_BUSY_PORTS: Record<number, string> = {
  3: '王磊', 7: '孙鹏', 12: '王磊', 18: '吴昊', 21: '刘洋', 26: '打印机·3F',
};

/** SSID 抽屉数据(原型固定) */
export const SSID_ROWS = [
  { ssid: 'Corp', auth: '802.1X / EAP-TLS', count: '486', vlan: '按策略 10/20/40/99' },
  { ssid: 'Guest', auth: '802.1X / PEAP', count: '2', vlan: '30(仅互联网)' },
  { ssid: 'IoT-Hidden', auth: 'MAC 白名单', count: '37', vlan: '60(物联隔离)' },
];
