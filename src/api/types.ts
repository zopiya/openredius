/**
 * 领域模型 / API 契约类型。
 * 当前由 src/api/mock 提供实现;接入真实后端后,此文件是前后端
 * 唯一共享的 DTO 定义(建议届时由 OpenAPI 生成)。
 */

/** 状态徽章色调(与 UI Badge 组件一一对应) */
export type BadgeTone = 'success' | 'danger' | 'warn' | 'muted' | 'info';

/** 失败原因标签色调 */
export type ReasonTone = 'default' | 'warn' | 'danger' | 'info' | 'muted';

/** 环图切片 */
export interface DonutRow {
  label: string;
  value: number;
}

export type { SessionRow } from './mock/sessions';
export type { LogRow } from './mock/logs';
export type { UserRow } from './mock/users';
export type { PolicyForm, PolicyRow } from './mock/policies';
export type { EndpointRow, NasRow } from './mock/devices';
export type { PeriodData, ReportPeriodKey } from './mock/reports';
