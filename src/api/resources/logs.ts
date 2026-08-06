/**
 * 认证日志 API。
 *   GET /api/auth-logs → fetchAuthLogs
 * 筛选目前在前端执行(原型行为);http 时代筛选参数应上送服务端。
 */
import { delay, LATENCY } from '../mock/latency';
import { LOG_FILTER_OPTIONS, LOG_ROWS, type LogRow } from '../mock/logs';

export { LOG_FILTER_OPTIONS };

export async function fetchAuthLogs(): Promise<LogRow[]> {
  await delay(LATENCY.logs);
  return [...LOG_ROWS];
}
