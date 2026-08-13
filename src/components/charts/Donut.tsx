/**
 * 环形占比图
 * 浏览器:使用 @ant-design/charts Pie; 测试环境:降级为内联 SVG。
 */
import { Pie } from '@ant-design/charts';
import type { PieConfig } from '@ant-design/charts';

export interface DonutRow {
  label: string;
  value: number;
}

const COLORS = ['#ff4d4f', '#faad14', '#1677ff', '#52c41a', '#722ed1', '#13c2c2'];

export function donutTotal(rows: DonutRow[]) {
  return rows.reduce((a, r) => a + r.value, 0);
}

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

function DonutAntd({ rows }: { rows: DonutRow[] }) {
  const total = donutTotal(rows);

  const data = rows.map((row) => ({
    type: row.label,
    value: row.value,
  }));

  const config: PieConfig = {
    data,
    angleField: 'value',
    colorField: 'type',
    color: COLORS.slice(0, rows.length),
    radius: 1,
    innerRadius: 0.64,
    height: 180,
    width: 180,
    animation: false,
    legend: false,
    label: false as false,
    tooltip: { shared: true },
    statistic: {
      title: {
        offsetY: -8,
        style: {
          fontSize: '22px',
          fontWeight: 600,
          fontFamily: 'sans-serif',
          color: 'rgba(0,0,0,0.88)',
        },
        content: total.toLocaleString('zh-CN'),
      },
      content: {
        offsetY: 10,
        style: {
          fontSize: '10px',
          color: 'rgba(0,0,0,0.45)',
        },
        content: '次',
      },
    },
  };

  return <Pie {...config} />;
}

/* ─── SVG 降级版本(测试环境) ─────────────────────── */

function DonutSvg({ rows, ariaLabel }: { rows: DonutRow[]; ariaLabel: string }) {
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

/* ─── 导出 ────────────────────────────────────────── */

const _canUseCanvas = typeof window !== 'undefined' ? hasCanvas() : false;

export default function Donut({ rows, ariaLabel }: { rows: DonutRow[]; ariaLabel: string }) {
  if (_canUseCanvas) {
    return <DonutAntd rows={rows} />;
  }
  return <DonutSvg rows={rows} ariaLabel={ariaLabel} />;
}

export function DonutLegend({ rows }: { rows: DonutRow[] }) {
  const total = donutTotal(rows);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, fontSize: '12.5px' }}>
      {rows.map((row, i) => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <i style={{ width: 9, height: 9, borderRadius: 2, background: COLORS[i % COLORS.length], flex: 'none' }} />
          <span style={{ flex: 1 }}>{row.label}</span>
          <span className="mono" style={{ color: 'rgba(0,0,0,0.65)' }}>{row.value}</span>
          <span className="mono" style={{ color: 'rgba(0,0,0,0.45)', width: 42, textAlign: 'right' }}>{((row.value / total) * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
