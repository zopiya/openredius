/**
 * mock 后端模拟延迟:读接口保留原型骨架屏节奏(550/500ms),
 * AD 同步 1800ms;写接口为即时(页面做乐观更新)。
 */
export const LATENCY = {
  sessions: 550,
  logs: 500,
  users: 500,
  devices: 500,
  adSync: 1800,
} as const;

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
