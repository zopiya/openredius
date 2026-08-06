export interface PolicyRow {
  id: string;
  name: string;
  sub: string;
  scope: string;
  eap: string;
  vlan: string; // 表格展示: "VLAN 40 · acl_fin_iso"
  compliance: string;
  on: boolean;
}

export interface PolicyForm {
  name: string;
  scope: string;
  eap: string;
  vlan: string; // 抽屉 select 值: "40 · 财务隔离"
  acl: string;
  cert: boolean;
  mac: boolean;
  edr: boolean;
  time: boolean;
  timeFrom: string;
  timeTo: string;
  rate: string;
  on: boolean;
}

/** 与原型 policies.html 表格行一一对应(P1–P5) */
export const POLICY_ROWS: PolicyRow[] = [
  { id: 'fin', name: '财务隔离策略', sub: '高安全域,强合规', scope: '财务部(64 人)', eap: 'EAP-TLS', vlan: 'VLAN 40 · acl_fin_iso', compliance: '证书 + MAC 绑定 + 安全状态检查', on: true },
  { id: 'rd', name: '研发准入策略', sub: '代码库访问域', scope: '研发中心(412 人)', eap: 'EAP-TLS', vlan: 'VLAN 20 · acl_rd_std', compliance: '证书 + MAC 绑定', on: true },
  { id: 'ops', name: '运维特权策略', sub: '网络设备管理域', scope: '运维部(18 人)', eap: 'EAP-TLS', vlan: 'VLAN 99 · acl_ops_admin', compliance: '证书 + 安全状态检查', on: true },
  { id: 'staff', name: '办公默认策略', sub: '全员兜底准入', scope: '全体员工(兜底)', eap: 'PEAP-MSCHAPv2', vlan: 'VLAN 10 · acl_staff', compliance: '无强制要求', on: true },
  { id: 'guest', name: '访客受限策略', sub: '仅互联网,限时准入', scope: '访客用户组', eap: 'PEAP-MSCHAPv2', vlan: 'VLAN 30 · acl_guest_only · 限速 20M', compliance: 'MAC 预先绑定', on: false },
];

/** 与原型 JS 中 policies 对象一致的抽屉表单初始值 */
export const POLICY_FORMS: Record<string, PolicyForm> = {
  fin: { name: '财务隔离策略', scope: '财务部', eap: 'EAP-TLS', vlan: '40 · 财务隔离', acl: 'acl_fin_iso(财务隔离)', cert: true, mac: true, edr: true, time: false, timeFrom: '08:00', timeTo: '20:00', rate: '不限速', on: true },
  rd: { name: '研发准入策略', scope: '研发中心', eap: 'EAP-TLS', vlan: '20 · 研发', acl: 'acl_rd_std(研发)', cert: true, mac: true, edr: false, time: false, timeFrom: '08:00', timeTo: '20:00', rate: '不限速', on: true },
  ops: { name: '运维特权策略', scope: '运维部', eap: 'EAP-TLS', vlan: '99 · 运维管理', acl: 'acl_ops_admin(运维)', cert: true, mac: false, edr: true, time: false, timeFrom: '08:00', timeTo: '20:00', rate: '不限速', on: true },
  staff: { name: '办公默认策略', scope: '全体员工(兜底)', eap: 'PEAP-MSCHAPv2', vlan: '10 · 办公', acl: 'acl_staff(标准办公)', cert: false, mac: false, edr: false, time: false, timeFrom: '08:00', timeTo: '20:00', rate: '不限速', on: true },
  guest: { name: '访客受限策略', scope: '访客用户组', eap: 'PEAP-MSCHAPv2', vlan: '30 · 访客', acl: 'acl_guest_only(访客仅互联网)', cert: false, mac: true, edr: false, time: true, timeFrom: '08:00', timeTo: '20:00', rate: '20 Mbps', on: false },
};

export const NEW_POLICY_FORM: PolicyForm = {
  name: '', scope: '全体员工(兜底)', eap: 'EAP-TLS', vlan: '10 · 办公', acl: '无',
  cert: true, mac: true, edr: false, time: false, timeFrom: '08:00', timeTo: '20:00', rate: '不限速', on: true,
};

export const POLICY_FORM_OPTIONS = {
  scope: ['财务部', '研发中心', '运维部', '全体员工(兜底)', '访客用户组'],
  vlan: ['10 · 办公', '20 · 研发', '30 · 访客', '40 · 财务隔离', '50 · 供应链', '99 · 运维管理'],
  acl: ['无', 'acl_staff(标准办公)', 'acl_rd_std(研发)', 'acl_fin_iso(财务隔离)', 'acl_ops_admin(运维)', 'acl_guest_only(访客仅互联网)'],
  rate: ['不限速', '10 Mbps', '20 Mbps', '50 Mbps', '100 Mbps'],
} as const;
