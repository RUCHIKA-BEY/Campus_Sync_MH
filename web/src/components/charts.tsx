// Two small, dependency-free SVG charts for the admin overview.
// Single series each, so no legend (the title names the series); one
// validated hue (terracotta, ≥3:1 on white); text uses ink colours, never
// the series colour; recessive grid; hover tooltip with a hit area wider
// than the bar; and a table view so nothing depends on seeing the chart.
import { useEffect, useRef, useState } from 'react';

const BAR = 'var(--color-terracotta)';

/** Round the axis max up so 0 / max/2 / max are all whole, honest ticks. */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  let m = Math.ceil(v / p) * p;
  if (m % 2) m += p;
  return m;
}

/** Track the container's real width so SVG text stays at its true pixel size. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => { if (entry) setW(Math.max(240, Math.round(entry.contentRect.width))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function TableView({ rows, head }: { rows: Array<[string, number]>; head: [string, string] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-plum-soft hover:text-plum">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <thead><tr className="text-xs text-plum-muted"><th className="py-1 font-semibold">{head[0]}</th><th className="py-1 text-right font-semibold">{head[1]}</th></tr></thead>
        <tbody>{rows.map(([k, v]) => <tr key={k} className="border-t border-line"><td className="py-1">{k}</td><td className="py-1 text-right tabular-nums">{v}</td></tr>)}</tbody>
      </table>
    </details>
  );
}

/** Vertical bars over time (e.g. registrations per day). */
export function BarTimeline({ data, valueLabel }: { data: Array<{ label: string; short: string; value: number }>; valueLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [boxRef, W] = useWidth<HTMLDivElement>(480);
  const H = 200, padL = 28, padB = 24, padT = 12;
  const max = niceMax(Math.max(0, ...data.map(d => d.value)));
  const plotW = W - padL, plotH = H - padB - padT;
  const step = plotW / Math.max(1, data.length);
  const barW = Math.max(4, step - 2); // 2px surface gap between bars
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="relative" ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={`${valueLabel} per day, last ${data.length} days`}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-plum-muted)">{Math.round(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * step + 1;
            const top = y(d.value), hgt = padT + plotH - top;
            return (
              <g key={d.label}>
                {d.value > 0 && (
                  // Rounded top (4px), square base anchored to the baseline.
                  <path d={`M${x},${padT + plotH} V${top + Math.min(4, hgt)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${padT + plotH} Z`}
                        fill={BAR} opacity={hover === null || hover === i ? 1 : 0.45} />
                )}
                {/* Hit target: the full column, bigger than the bar. */}
                <rect x={padL + i * step} y={padT} width={step} height={plotH} fill="transparent"
                      onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                      tabIndex={0} aria-label={`${d.label}: ${d.value} ${valueLabel.toLowerCase()}`} />
                {(step >= 26 || i % 2 === (data.length - 1) % 2) && (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-plum-soft)">{d.short}</text>
                )}
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-xl border border-line bg-white px-3 py-1.5 text-xs shadow-lift"
               style={{ left: `${((padL + hover * step + step / 2) / W) * 100}%`, top: 0 }}>
            <span className="font-semibold text-plum">{h.value}</span> <span className="text-plum-soft">{valueLabel.toLowerCase()} · {h.label}</span>
          </div>
        )}
      </div>
      <TableView head={['Day', valueLabel]} rows={data.map(d => [d.label, d.value])} />
    </div>
  );
}

/** Horizontal bars for categories, largest first, value labelled at the end. */
export function HBarChart({ data, valueLabel }: { data: Array<{ label: string; value: number }>; valueLabel: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div>
      <ul className="grid gap-2" aria-label={valueLabel}>
        {data.map(d => (
          <li key={d.label} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-sm"
              onMouseEnter={() => setHover(d.label)} onMouseLeave={() => setHover(null)}>
            <span className="truncate text-plum-soft" title={d.label}>{d.label}</span>
            <span className="h-3.5 rounded-r-[4px] rounded-l-none" aria-hidden
                  style={{ width: `${(d.value / max) * 100}%`, minWidth: 4, background: BAR, opacity: hover === null || hover === d.label ? 1 : 0.45 }} />
            <span className="text-right font-semibold tabular-nums text-plum">{d.value}</span>
          </li>
        ))}
      </ul>
      <TableView head={['Category', valueLabel]} rows={data.map(d => [d.label, d.value])} />
    </div>
  );
}
