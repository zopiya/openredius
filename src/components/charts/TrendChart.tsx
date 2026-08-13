/**
 * 24 小时 / 近 7 天认证趋势图
 * 浏览器:使用 @ant-design/charts Line; 测试环境:降级为内联 SVG。
 */
import { Line } from '@ant-design/charts';
import type { LineConfig } from '@ant-design/charts';

export interface TrendSeries {
  ok: number[];
  fail: number[];
  maxY: number;
  ticks: number[];
  label: (i: number) => string;
  ariaPrefix: string;
}

export const TREND_TODAY: TrendSeries = {
  ok: [18, 12, 9, 7, 6, 8, 14, 42, 168, 246, 231, 205, 176, 143, 198, 224, 207, 166, 121, 84, 52, 36, 28, 22],
  fail: [1, 0, 0, 1, 0, 0, 1, 3, 9, 12, 8, 7, 5, 4, 7, 9, 6, 5, 3, 2, 2, 1, 1, 1],
  maxY: 250,
  ticks: [0, 4, 8, 12, 16, 20],
  label: (i) => `${i < 10 ? '0' + i : i}:00`,
  ariaPrefix: '24 小时',
};

export const TREND_WEEK: TrendSeries = {
  ok: [8620, 8980, 9410, 9270, 8830, 9020, 9180],
  fail: [148, 132, 121, 156, 137, 119, 128],
  maxY: 10000,
  ticks: [0, 1, 2, 3, 4, 5, 6],
  label: (i) => ['周二', '周三', '周四', '周五', '周六', '周日', '周一'][i],
  ariaPrefix: '近 7 天',
};

/* ─── 浏览器 Canvas 可用? ──────────────────────────── */

function hasCanvas(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext && c.getContext('2d'));
  } catch {
    return false;
  }
}

/* ─── Ant Design Charts 版本 ──────────────────────── */

interface TrendDataPoint {
  time: string;
  value: number;
  type: string;
}

function TrendChartAntd({ series }: { series: TrendSeries }) {
  const { ok, fail, label } = series;

  const data: TrendDataPoint[] = [
    ...ok.map((v, i) => ({ time: label(i), value: v, type: '成功' })),
    ...fail.map((v, i) => ({ time: label(i), value: v, type: '失败' })),
  ];

  const config: LineConfig = {
    data,
    xField: 'time',
    yField: 'value',
    colorField: 'type',
    smooth: true,
    height: 260,
    color: ['#1677ff', '#ff4d4f'],
    point: { size: 2 },
    lineStyle: { lineWidth: 2 },
    area: {
      style: (datum: { type: string }) => ({
        fill: datum.type === '成功'
          ? 'linear-gradient(-90deg, rgba(22,119,255,0.20) 0%, rgba(22,119,255,0.01) 100%)'
          : 'linear-gradient(-90deg, rgba(255,77,79,0.20) 0%, rgba(255,77,79,0.01) 100%)',
      }),
    },
    animation: false,
    legend: false,
    axis: {
      x: { labelAutoRotate: false },
    },
    tooltip: { shared: true },
  };

  return <Line {...config} />;
}

/* ─── SVG 降级版本(degrade for happy-dom 测试环境) ── */

const W = 720;
const H = 260;
const P = { l: 38, r: 12, t: 14, b: 26 };

function TrendChartSvg({ series }: { series: TrendSeries }) {
  const { ok, fail, maxY, ticks, label, ariaPrefix } = series;
  const n = ok.length;
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (n - 1);
  const y = (v: number) => P.t + (1 - v / maxY) * (H - P.t - P.b);
  const pts = (arr: number[]) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const step = maxY <= 1000 ? 50 : 2000;

  const gridLines: number[] = [];
  for (let t = 0; t <= maxY; t += step) gridLines.push(t);

  const okPts = pts(ok);
  const areaPath = `M${P.l},${y(0)} L${okPts.join(' L')} L${x(n - 1)},${y(0)} Z`;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ariaPrefix}认证趋势:成功与失败双线`}>
      {gridLines.map((t) => (
        <g key={t}>
          <line className="grid-l" x1={P.l} y1={y(t)} x2={W - P.r} y2={y(t)} />
          <text className="axis-t" x={P.l - 7} y={y(t) + 3.5} textAnchor="end">
            {t >= 1000 ? `${t / 1000}k` : t}
          </text>
        </g>
      ))}
      {ticks.map((i) => (
        <text key={i} className="axis-t" x={x(i)} y={H - 7} textAnchor="middle">
          {label(i)}
        </text>
      ))}
      <path className="area-ok" d={areaPath} />
      <polyline className="line-ok" points={okPts.join(' ')} />
      <polyline className="line-fail" points={pts(fail).join(' ')} />
    </svg>
  );
}

/* ─── 导出 ────────────────────────────────────────── */

const _canUseCanvas = typeof window !== 'undefined' ? hasCanvas() : false;

export default function TrendChart({ series }: { series: TrendSeries }) {
  if (_canUseCanvas) {
    return <TrendChartAntd series={series} />;
  }
  return <TrendChartSvg series={series} />;
}
