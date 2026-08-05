export interface LogRow {
  time: string;
  user: string;
  name: string;
  sub: string;
  mac: string;
  nas: string; // "SW-3F-01 · Gi1/0/12"
  nasName: string;
  nasSub: string;
  eap: string;
  reply: 'Access-Accept' | 'Access-Reject';
  reason?: string;
  rtagClass?: string; // rt-warn / rt-danger / rt-muted
  attr: string;
}

/** 与原型 auth-logs.html 表格行一一对应 */
export const LOG_ROWS: LogRow[] = [
  {
    time: '10:24:16', user: 'wang.lei', name: '王磊', sub: 'wang.lei',
    mac: '3C:52:82:1A:4B:01', nas: 'SW-3F-01 · Gi1/0/12', nasName: 'SW-3F-01', nasSub: 'Gi1/0/12',
    eap: 'EAP-TLS', reply: 'Access-Accept',
    attr: 'Tunnel-Private-Group-Id=VLAN 20; Filter-ID=acl_rd_std; Session-Timeout=28800',
  },
  {
    time: '09:48:03', user: 'zhang.wei', name: '张伟', sub: 'zhang.wei',
    mac: '7C:2E:DD:41:0A:93', nas: 'SW-5F-02 · Gi1/0/03', nasName: 'SW-5F-02', nasSub: 'Gi1/0/03',
    eap: 'PEAP-MSCHAPv2', reply: 'Access-Reject', reason: '账号锁定', rtagClass: 'rt-warn',
    attr: 'Reply-Message=Account locked (5 failures in 10m)',
  },
  {
    time: '09:41:52', user: 'li.na', name: '李娜', sub: 'li.na',
    mac: 'A4:83:E7:22:9C:7E', nas: 'AC-HQ-01 · AP-3F-012', nasName: 'AC-HQ-01', nasSub: 'AP-3F-012',
    eap: 'PEAP-MSCHAPv2', reply: 'Access-Accept',
    attr: 'Tunnel-Private-Group-Id=VLAN 10; Filter-ID=acl_staff',
  },
  {
    time: '09:15:27', user: '(unknown)', name: '未知终端', sub: '无匹配账号',
    mac: '3C:52:82:9F:1C:44', nas: 'SW-5F-02 · Gi1/0/16', nasName: 'SW-5F-02', nasSub: 'Gi1/0/16',
    eap: 'EAP-TLS', reply: 'Access-Reject', reason: 'MAC 未绑定', rtagClass: 'rt-danger',
    attr: 'Reply-Message=MAC not bound to any account in VLAN 40 policy',
  },
  {
    time: '09:05:11', user: 'chen.chen', name: '陈晨', sub: 'chen.chen',
    mac: '00:1A:2B:3C:4D:5E', nas: 'AC-HQ-01 · AP-4F-007', nasName: 'AC-HQ-01', nasSub: 'AP-4F-007',
    eap: 'EAP-TLS', reply: 'Access-Accept',
    attr: 'Tunnel-Private-Group-Id=VLAN 20; Filter-ID=acl_rd_std',
  },
  {
    time: '08:52:40', user: 'sun.peng', name: '孙鹏', sub: 'sun.peng',
    mac: '3C:52:82:1A:8D:40', nas: 'SW-3F-01 · Gi1/0/07', nasName: 'SW-3F-01', nasSub: 'Gi1/0/07',
    eap: 'EAP-TLS', reply: 'Access-Reject', reason: '证书过期', rtagClass: 'rt-danger',
    attr: 'Reply-Message=Certificate expired 2026-07-25 (CN=sun.peng, Serial 4F:2A)',
  },
  {
    time: '08:31:19', user: 'guest.liu', name: '访客·刘', sub: 'guest.liu',
    mac: 'E8:9D:87:45:FA:02', nas: 'AC-HQ-01 · AP-1F-001', nasName: 'AC-HQ-01', nasSub: 'AP-1F-001',
    eap: 'PEAP-MSCHAPv2', reply: 'Access-Reject', reason: '时间策略拒绝', rtagClass: 'rt-muted',
    attr: 'Reply-Message=Outside allowed time window (policy guest-hours: 08:00-20:00)',
  },
  {
    time: '08:12:33', user: 'zhao.min', name: '赵敏', sub: 'zhao.min',
    mac: 'F4:8C:50:77:BE:09', nas: 'AC-HQ-01 · AP-3F-015', nasName: 'AC-HQ-01', nasSub: 'AP-3F-015',
    eap: 'PEAP-MSCHAPv2', reply: 'Access-Accept',
    attr: 'Tunnel-Private-Group-Id=VLAN 10; Filter-ID=acl_staff',
  },
  {
    time: '07:58:04', user: 'liu.yang', name: '刘洋', sub: 'liu.yang',
    mac: '8C:85:90:5B:11:2F', nas: 'SW-B1-IDC-01 · Gi1/0/21', nasName: 'SW-B1-IDC-01', nasSub: 'Gi1/0/21',
    eap: 'PEAP-MSCHAPv2', reply: 'Access-Reject', reason: '密码错误', rtagClass: 'rt-warn',
    attr: 'Reply-Message=Wrong password (attempt 2 of 5)',
  },
  {
    time: '07:33:51', user: 'wu.hao', name: '吴昊', sub: 'wu.hao',
    mac: '48:4D:7E:C3:56:B8', nas: 'SW-3F-02 · Gi1/0/18', nasName: 'SW-3F-02', nasSub: 'Gi1/0/18',
    eap: 'EAP-TLS', reply: 'Access-Accept',
    attr: 'Tunnel-Private-Group-Id=VLAN 99; Filter-ID=acl_ops_admin',
  },
  {
    time: '07:21:08', user: 'zheng.nan', name: '郑楠', sub: 'zheng.nan',
    mac: 'B0:6E:BF:12:78:E3', nas: 'AC-HQ-01 · AP-5F-006', nasName: 'AC-HQ-01', nasSub: 'AP-5F-006',
    eap: 'EAP-TLS', reply: 'Access-Reject', reason: '终端不合规', rtagClass: 'rt-warn',
    attr: 'Reply-Message=Endpoint posture failed: EDR agent offline > 24h',
  },
  {
    time: '07:02:46', user: 'zhou.ting', name: '周婷', sub: 'zhou.ting',
    mac: 'DC:A6:32:99:04:71', nas: 'AC-HQ-01 · AP-5F-003', nasName: 'AC-HQ-01', nasSub: 'AP-5F-003',
    eap: 'EAP-FAST', reply: 'Access-Accept',
    attr: 'Tunnel-Private-Group-Id=VLAN 10; Filter-ID=acl_staff',
  },
];

export const LOG_FILTER_OPTIONS = {
  timeRange: ['今日(00:00 至今)', '昨日', '近 7 天', '近 30 天'],
  reason: ['全部原因', '密码错误', '证书过期', '终端不合规', 'MAC 未绑定', '账号锁定', '时间策略拒绝'],
  nas: ['全部设备', 'SW-3F-01', 'SW-3F-02', 'SW-5F-02', 'SW-B1-IDC-01', 'AC-HQ-01'],
  eap: ['全部', 'EAP-TLS', 'PEAP-MSCHAPv2', 'EAP-FAST'],
} as const;
