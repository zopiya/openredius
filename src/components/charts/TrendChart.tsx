/**
 * 24 小时 / 近 7 天认证趋势图 — 逐点移植原型 dashboard.html 中的
 * SVG 渲染逻辑(坐标系、网格步长、轴标签完全一致)。
 */
const W = 720;
const H = 260;
const P = { l: 38, r: 12, t: 14, b: 26 };

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

export default function TrendChart({ series }: { series: TrendSeries }) {
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
    <svg
      className="chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${ariaPrefix}认证趋势:成功与失败双线`}
    >
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
