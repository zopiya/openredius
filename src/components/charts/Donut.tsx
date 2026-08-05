/**
 * 环形占比图 — 逐点移植原型 reports.html 的 renderDonut:
 * 半径 62、缺口 0.02、描边 22、中心合计数字,色板取自设计 token。
 */
export interface DonutRow {
  label: string;
  value: number;
}

const COLORS = [
  'var(--danger)',
  'var(--warn)',
  'var(--accent)',
  'var(--meta)',
  'var(--muted)',
  'var(--fg-2)',
];

export function donutTotal(rows: DonutRow[]) {
  return rows.reduce((a, r) => a + r.value, 0);
}

export default function Donut({ rows, ariaLabel }: { rows: DonutRow[]; ariaLabel: string }) {
  const total = donutTotal(rows);
  const r = 62;
  const cx = 90;
  const cy = 90;
  const gap = 0.02;

  let acc = 0;
  const arcs = rows.map((row, i) => {
    const frac = row.value / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2 + gap;
    const a1 = (acc + frac) * 2 * Math.PI - Math.PI / 2 - gap;
    acc += frac;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return (
      <path
        key={row.label}
        d={`M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`}
        fill="none"
        stroke={COLORS[i % COLORS.length]}
        strokeWidth={22}
      />
    );
  });

  return (
    <svg className="chart-svg" viewBox="0 0 180 180" width={180} height={180} role="img" aria-label={ariaLabel}>
      {arcs}
      <text className="donut-total" x={90} y={86} textAnchor="middle" fontSize={22}>
        {total.toLocaleString('zh-CN')}
      </text>
      <text className="donut-unit" x={90} y={104} textAnchor="middle" fontSize={10}>
        次
      </text>
    </svg>
  );
}

export function DonutLegend({ rows }: { rows: DonutRow[] }) {
  const total = donutTotal(rows);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, fontSize: 12.5 }}>
      {rows.map((row, i) => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <i
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: COLORS[i % COLORS.length],
              flex: 'none',
            }}
          />
          <span style={{ flex: 1 }}>{row.label}</span>
          <span className="mono" style={{ color: 'var(--fg-2)' }}>
            {row.value}
          </span>
          <span className="mono" style={{ color: 'var(--meta)', width: 42, textAlign: 'right' }}>
            {((row.value / total) * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
