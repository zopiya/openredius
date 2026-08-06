import type { DonutRow } from '../types';

export interface PeriodData {
  sub: string;
  total: string;
  fail: DonutRow[];
}

/** 报表周期键(与原型今日/本周/本月口径一致) */
export type ReportPeriodKey = '今日' | '本周' | '本月';

/** 与原型 reports.html 的周期切换数据一致 */
export const REPORT_PERIODS: Record<'今日' | '本周' | '本月', PeriodData> = {
  今日: {
    sub: '统计周期:今日(2026-07-27 00:00 至今)',
    total: '共 166 次失败',
    fail: [
      { label: '密码错误', value: 63 },
      { label: '证书过期', value: 40 },
      { label: '终端不合规', value: 27 },
      { label: 'MAC 未绑定', value: 20 },
      { label: '账号锁定', value: 10 },
      { label: '时间策略拒绝', value: 6 },
    ],
  },
  本周: {
    sub: '统计周期:本周(2026-07-21 至 2026-07-27)',
    total: '共 1,084 次失败',
    fail: [
      { label: '密码错误', value: 412 },
      { label: '证书过期', value: 246 },
      { label: '终端不合规', value: 178 },
      { label: 'MAC 未绑定', value: 138 },
      { label: '账号锁定', value: 74 },
      { label: '时间策略拒绝', value: 36 },
    ],
  },
  本月: {
    sub: '统计周期:本月(2026-07-01 至 2026-07-27)',
    total: '共 4,412 次失败',
    fail: [
      { label: '密码错误', value: 1683 },
      { label: '证书过期', value: 1052 },
      { label: '终端不合规', value: 712 },
      { label: 'MAC 未绑定', value: 528 },
      { label: '账号锁定', value: 296 },
      { label: '时间策略拒绝', value: 141 },
    ],
  },
};

/** 在线终端类型占比(原型固定) */
export const ETYPE_ROWS: DonutRow[] = [
  { label: '笔记本', value: 912 },
  { label: '手机', value: 243 },
  { label: '打印机', value: 48 },
  { label: '摄像头', value: 41 },
  { label: '其他哑终端', value: 42 },
];

/** 部门准入情况表(原型固定) */
export const DEPT_ROWS = [
  { dept: '研发中心', online: '486 / 412', ok: '4,982', fail: '52', rate: '99.0%' },
  { dept: '市场部', online: '301 / 268', ok: '2,764', fail: '47', rate: '98.3%' },
  { dept: '财务部', online: '72 / 64', ok: '688', fail: '23', rate: '96.8%' },
  { dept: '供应链', online: '198 / 176', ok: '1,902', fail: '21', rate: '98.9%' },
  { dept: '人事行政', online: '164 / 149', ok: '1,588', fail: '14', rate: '99.1%' },
  { dept: '运维部', online: '41 / 18', ok: '623', fail: '9', rate: '98.6%' },
];

/** 设备负载 TOP 6(原型固定) */
export const LOAD_TOP = [
  { name: 'AP-4F-007', meta: '10.99.1.47 · 4F 办公区', pct: 92, danger: true, label: '46/50' },
  { name: 'SW-5F-02', meta: '10.99.0.13 · 5F 办公区', pct: 65, danger: false, label: '31/48' },
  { name: 'AP-3F-012', meta: '10.99.1.12 · 3F 办公区', pct: 64, danger: false, label: '32/50' },
  { name: 'SW-3F-01', meta: '10.99.0.11 · 3F 办公区', pct: 58, danger: false, label: '28/48' },
  { name: 'AP-5F-003', meta: '10.99.1.53 · 5F 办公区', pct: 56, danger: false, label: '28/50' },
  { name: 'AP-1F-001', meta: '10.99.1.01 · 1F 大堂', pct: 44, danger: false, label: '22/50' },
];
