export interface SessionRow {
  session: string;
  user: string;
  name: string;
  dept: string;
  mac: string;
  method: '有线' | 'WiFi';
  nas: string;
  nasSub: string;
  nasIp: string;
  nasPort: string;
  called: string;
  ip: string;
  vlan: string; // VLAN ID
  vlanLabel: string; // 如 "20 · 研发"
  auth: string;
  duration: string;
  status: '在线' | '待重认证';
  filterId: string;
  timeout: string;
  start: string;
}

/** 与原型 sessions.html 表格行一一对应 */
export const SESSION_ROWS: SessionRow[] = [
  {
    session: '8F3A-0021-C4', user: 'wang.lei', name: '王磊', dept: '研发中心',
    mac: '3C:52:82:1A:4B:01', method: '有线', nas: 'SW-3F-01', nasSub: 'Gi1/0/12',
    nasIp: '10.99.0.11', nasPort: 'Gi1/0/12', called: '00-1D-45-AC-10-01', ip: '10.20.3.41',
    vlan: '20', vlanLabel: '20 · 研发', auth: 'EAP-TLS', duration: '4h 12m', status: '在线',
    filterId: 'acl_rd_std', timeout: '28800', start: '2026-07-27 06:12:44',
  },
  {
    session: '8F3A-0022-17', user: 'li.na', name: '李娜', dept: '市场部',
    mac: 'A4:83:E7:22:9C:7E', method: 'WiFi', nas: 'AC-HQ-01', nasSub: 'AP-3F-012 · SSID Corp',
    nasIp: '10.99.0.30', nasPort: 'AP-3F-012', called: '84-16-F9-0A-33-20:Corp', ip: '10.10.5.87',
    vlan: '10', vlanLabel: '10 · 办公', auth: 'PEAP-MSCHAPv2', duration: '2h 47m', status: '在线',
    filterId: 'acl_staff', timeout: '28800', start: '2026-07-27 07:37:02',
  },
  {
    session: '8F3A-0023-9B', user: 'zhang.wei', name: '张伟', dept: '财务部',
    mac: '7C:2E:DD:41:0A:93', method: '有线', nas: 'SW-5F-02', nasSub: 'Gi1/0/03',
    nasIp: '10.99.0.13', nasPort: 'Gi1/0/03', called: '00-1D-45-AC-14-01', ip: '10.40.2.19',
    vlan: '40', vlanLabel: '40 · 财务隔离', auth: 'EAP-TLS', duration: '6h 03m', status: '在线',
    filterId: 'acl_fin_iso', timeout: '14400', start: '2026-07-27 04:21:36',
  },
  {
    session: '8F3A-0024-E0', user: 'chen.chen', name: '陈晨', dept: '研发中心',
    mac: '00:1A:2B:3C:4D:5E', method: 'WiFi', nas: 'AC-HQ-01', nasSub: 'AP-4F-007 · SSID Corp',
    nasIp: '10.99.0.30', nasPort: 'AP-4F-007', called: '84-16-F9-0A-41-08:Corp', ip: '10.20.6.52',
    vlan: '20', vlanLabel: '20 · 研发', auth: 'EAP-TLS', duration: '1h 19m', status: '待重认证',
    filterId: 'acl_rd_std', timeout: '28800', start: '2026-07-27 09:05:11',
  },
  {
    session: '8F3A-0025-33', user: 'liu.yang', name: '刘洋', dept: '供应链',
    mac: '8C:85:90:5B:11:2F', method: '有线', nas: 'SW-B1-IDC-01', nasSub: 'Gi1/0/21',
    nasIp: '10.99.0.21', nasPort: 'Gi1/0/21', called: '00-1D-45-B8-02-01', ip: '10.50.1.66',
    vlan: '50', vlanLabel: '50 · 供应链', auth: 'PEAP-MSCHAPv2', duration: '3h 34m', status: '在线',
    filterId: 'acl_scm', timeout: '28800', start: '2026-07-27 06:50:58',
  },
  {
    session: '8F3A-0026-A8', user: 'zhao.min', name: '赵敏', dept: '人事行政',
    mac: 'F4:8C:50:77:BE:09', method: 'WiFi', nas: 'AC-HQ-01', nasSub: 'AP-3F-015 · SSID Corp',
    nasIp: '10.99.0.30', nasPort: 'AP-3F-015', called: '84-16-F9-0A-33-2F:Corp', ip: '10.10.4.120',
    vlan: '10', vlanLabel: '10 · 办公', auth: 'PEAP-MSCHAPv2', duration: '5h 51m', status: '在线',
    filterId: 'acl_staff', timeout: '28800', start: '2026-07-27 04:33:45',
  },
  {
    session: '8F3A-0027-5C', user: 'sun.peng', name: '孙鹏', dept: '研发中心',
    mac: '3C:52:82:1A:8D:40', method: '有线', nas: 'SW-3F-01', nasSub: 'Gi1/0/07',
    nasIp: '10.99.0.11', nasPort: 'Gi1/0/07', called: '00-1D-45-AC-10-01', ip: '10.20.3.15',
    vlan: '20', vlanLabel: '20 · 研发', auth: 'EAP-TLS', duration: '7h 26m', status: '在线',
    filterId: 'acl_rd_std', timeout: '28800', start: '2026-07-27 02:58:20',
  },
  {
    session: '8F3A-0028-71', user: 'zhou.ting', name: '周婷', dept: '市场部',
    mac: 'DC:A6:32:99:04:71', method: 'WiFi', nas: 'AC-HQ-01', nasSub: 'AP-5F-003 · SSID Corp',
    nasIp: '10.99.0.30', nasPort: 'AP-5F-003', called: '84-16-F9-0A-50-13:Corp', ip: '10.10.7.34',
    vlan: '10', vlanLabel: '10 · 办公', auth: 'EAP-FAST', duration: '0h 42m', status: '在线',
    filterId: 'acl_staff', timeout: '28800', start: '2026-07-27 09:42:53',
  },
  {
    session: '8F3A-0029-0D', user: 'wu.hao', name: '吴昊', dept: '运维部',
    mac: '48:4D:7E:C3:56:B8', method: '有线', nas: 'SW-3F-02', nasSub: 'Gi1/0/18',
    nasIp: '10.99.0.12', nasPort: 'Gi1/0/18', called: '00-1D-45-AC-12-01', ip: '10.99.2.8',
    vlan: '99', vlanLabel: '99 · 运维管理', auth: 'EAP-TLS', duration: '9h 15m', status: '在线',
    filterId: 'acl_ops_admin', timeout: '43200', start: '2026-07-27 01:09:37',
  },
  {
    session: '8F3A-0030-B6', user: 'zheng.nan', name: '郑楠', dept: '财务部',
    mac: 'B0:6E:BF:12:78:E3', method: 'WiFi', nas: 'AC-HQ-01', nasSub: 'AP-5F-006 · SSID Corp',
    nasIp: '10.99.0.30', nasPort: 'AP-5F-006', called: '84-16-F9-0A-50-26:Corp', ip: '10.40.3.91',
    vlan: '40', vlanLabel: '40 · 财务隔离', auth: 'EAP-TLS', duration: '2h 08m', status: '在线',
    filterId: 'acl_fin_iso', timeout: '14400', start: '2026-07-27 08:16:29',
  },
];

export const SESSION_FILTER_OPTIONS = {
  dept: ['全部部门', '研发中心', '市场部', '财务部', '供应链', '人事行政', '运维部'],
  method: ['全部', '有线 802.1X', '办公 WiFi'],
  nas: ['全部设备', 'SW-3F-01', 'SW-3F-02', 'SW-5F-02', 'SW-B1-IDC-01', 'AC-HQ-01'],
  vlan: ['全部', '10 · 办公', '20 · 研发', '40 · 财务隔离', '50 · 供应链', '99 · 运维管理'],
  auth: ['全部', 'EAP-TLS', 'PEAP-MSCHAPv2', 'EAP-FAST'],
} as const;
