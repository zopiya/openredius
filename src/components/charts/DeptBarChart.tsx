/**
 * 部门认证成功 / 失败对比柱状图
 * 浏览器:使用 @ant-design/charts Column(分组柱); 测试环境:降级为内联 SVG。
 */
import { Column } from '@ant-design/charts';
import type { ColumnConfig } from '@ant-design/charts';

export interface DeptStat {
  dept: string;
  ok: number;
  fail: number;
}

const OK_COLOR = '#1677ff';
const FAIL_COLOR = '#ff4d4f';

function hasCanvas(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext && c.getContext('2d'));
  } catch {
    return false;
  }
}

/* ─── Ant Design Charts 版本 ──────────────────────── */

function DeptBarAntd({ rows }: { rows: DeptStat[] }) {
  const data = rows.flatMap((r) => [
    { dept: r.dept, value: r.ok, type: '成功' },
    { dept: r.dept, value: r.fail, type: '失败' },
  ]);

  const config: ColumnConfig = {
    data,
    xField: 'dept',
    yField: 'value',
    seriesField: 'type',
    isGroup: true,
    height: 240,
    color: [OK_COLOR, FAIL_COLOR],
    legend: false,
    animation: false,
    columnStyle: { radiusTopLeft: 4, radiusTopRight: 4 },
    xAxis: {
      label: { style: { fill: 'rgba(0,0,0,0.45)', fontSize: 11, fontFamily: 'sans-serif' } },
      grid: null as unknown as undefined,
    },
    yAxis: {
      label: { style: { fill: 'rgba(0,0,0,0.45)', fontSize: 10.5 } },
      grid: { line: { style: { stroke: '#f0f0f0', lineWidth: 1 } } },
    },
    tooltip: { shared: true },
  };

  return <Column {...config} />;
}

/* ─── SVG 降级版本(测试环境) ─────────────────────── */

const W = 720;
const H = 240;
const P = { l: 40, r: 12, t: 14, b: 34 };

function DeptBarSvg({ rows, ariaLabel }: { rows: DeptStat[]; ariaLabel: string }) {
  const maxY = Math.max(1, ...rows.map((r) => Math.max(r.ok, r.fail)));
  const n = rows.length;
  const groupW = (W - P.l - P.r) / n;
  const barW = Math.min(14, groupW * 0.28);
  const y = (v: number) => P.t + (1 - v / maxY) * (H - P.t - P.b);

  const gridTicks = [0, maxY * 0.5, maxY];
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      {gridTicks.map((t) => (
        <g key={t}>
          <line className="grid-l" x1={P.l} y1={y(t)} x2={W - P.r} y2={y(t)} />
          <text className="axis-t" x={P.l - 7} y={y(t) + 3.5} textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cx = P.l + groupW * (i + 0.5);
        const okH = y(0) - y(r.ok);
        const failH = y(0) - y(r.fail);
        return (
          <g key={r.dept}>
            <rect
              className="bar-ok"
              x={cx - barW - 2}
              y={y(r.ok)}
              width={barW}
              height={okH}
              rx={3}
              fill={OK_COLOR}
            />
            <rect
              className="bar-fail"
              x={cx + 2}
              y={y(r.fail)}
              width={barW}
              height={failH}
              rx={3}
              fill={FAIL_COLOR}
            />
            <text className="axis-t" x={cx} y={H - 10} textAnchor="middle">
              {r.dept}
            </text>
          </g>
        );
      })}
      {/* 图例 */}
      <g transform={`translate(${W - P.r - 120}, ${P.t})`}>
        <rect x={0} y={0} width={9} height={9} rx={2} fill={OK_COLOR} />
        <text x={13} y={8} fontSize={11} fill="rgba(0,0,0,0.45)">成功</text>
        <rect x={52} y={0} width={9} height={9} rx={2} fill={FAIL_COLOR} />
        <text x={65} y={8} fontSize={11} fill="rgba(0,0,0,0.45)">失败</text>
      </g>
    </svg>
  );
}

/* ─── 导出 ────────────────────────────────────────── */

const _canUseCanvas = typeof window !== 'undefined' ? hasCanvas() : false;

export default function DeptBarChart({ rows, ariaLabel }: { rows: DeptStat[]; ariaLabel: string }) {
  if (_canUseCanvas) {
    return <DeptBarAntd rows={rows} />;
  }
  return <DeptBarSvg rows={rows} ariaLabel={ariaLabel} />;
}
