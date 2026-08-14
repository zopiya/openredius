export interface UserRow {
  name: string;
  account: string;
  dept: string;
  status: '正常' | '停用' | '锁定';
  /** 状态徽章下的补充说明,如「10:18 自动解锁」 */
  statusSub?: string;
  policy: string;
  /** 后端 policy_group id(http 模式用于筛选/分配) */
  policyId?: number;
  title: string;
  devices: number;
  lastAuth: string;
  /** AD 同步的联系方式与备注(docs/15),非 AD 用户为空串 */
  email: string;
  mobile: string;
  description: string;
}

/** 与原型 users.html 表格行一一对应 */
export const USER_ROWS: UserRow[] = [
  { name: '王磊', account: 'wang.lei', dept: '研发中心', status: '正常', policy: '研发准入组', title: '高级后端工程师', devices: 2, lastAuth: '10:24:16', email: 'wang.lei@corp.example.com', mobile: '138-0000-0101', description: '核心研发,涉及生产网段' },
  { name: '李娜', account: 'li.na', dept: '市场部', status: '正常', policy: '办公默认组', title: '市场经理', devices: 3, lastAuth: '09:41:52', email: 'li.na@corp.example.com', mobile: '138-0000-0102', description: '' },
  { name: '张伟', account: 'zhang.wei', dept: '财务部', status: '锁定', statusSub: '10:18 自动解锁', policy: '财务隔离组', title: '财务主管', devices: 1, lastAuth: '09:48:03', email: 'zhang.wei@corp.example.com', mobile: '138-0000-0103', description: '' },
  { name: '陈晨', account: 'chen.chen', dept: '研发中心', status: '正常', policy: '研发准入组', title: '前端工程师', devices: 2, lastAuth: '09:05:11', email: 'chen.chen@corp.example.com', mobile: '138-0000-0104', description: '' },
  { name: '刘洋', account: 'liu.yang', dept: '供应链', status: '正常', policy: '办公默认组', title: '仓储专员', devices: 1, lastAuth: '07:58:04', email: '', mobile: '', description: '' },
  { name: '赵敏', account: 'zhao.min', dept: '人事行政', status: '正常', policy: '办公默认组', title: 'HRBP', devices: 2, lastAuth: '08:12:33', email: '', mobile: '', description: '' },
  { name: '孙鹏', account: 'sun.peng', dept: '研发中心', status: '正常', statusSub: '证书已过期', policy: '研发准入组', title: '测试工程师', devices: 1, lastAuth: '08:52:40', email: '', mobile: '', description: '' },
  { name: '周婷', account: 'zhou.ting', dept: '市场部', status: '停用', statusSub: 'AD 离职同步', policy: '办公默认组', title: '品牌专员(离职)', devices: 0, lastAuth: '2026-07-21 18:44', email: '', mobile: '', description: '' },
  { name: '吴昊', account: 'wu.hao', dept: '运维部', status: '正常', policy: '运维特权组', title: '网络工程师', devices: 4, lastAuth: '07:33:51', email: '', mobile: '', description: '' },
  { name: '郑楠', account: 'zheng.nan', dept: '财务部', status: '正常', policy: '财务隔离组', title: '会计', devices: 2, lastAuth: '07:21:08', email: '', mobile: '', description: '' },
];

export const USER_FILTER_OPTIONS = {
  dept: ['全部部门', '研发中心', '市场部', '财务部', '供应链', '人事行政', '运维部'],
  status: ['全部状态', '正常', '停用', '锁定'],
  policy: ['全部策略组', '办公默认组', '研发准入组', '财务隔离组', '运维特权组', '访客受限组'],
} as const;

/** 抽屉内展示的策略组下发规则(按策略组) */
export const POLICY_RULES: Record<string, string> = {
  研发准入组: 'VLAN 20 · ACL acl_rd_std · 会话 8h 重认证',
  办公默认组: 'VLAN 10 · ACL acl_staff · 会话 8h 重认证',
  财务隔离组: 'VLAN 40 · ACL acl_fin_iso · 会话 4h 重认证',
  运维特权组: 'VLAN 99 · ACL acl_ops_admin · 会话 12h 重认证',
  访客受限组: 'VLAN 30 · ACL acl_guest_only · 限速 20M · 限时准入',
};
