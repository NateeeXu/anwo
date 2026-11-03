// Inline-SVG charts for the admin console (no chart library). One hue: accent for the active series, ink tokens for text,
// line tokens for grid. Single-series line chart with crosshair + tooltip (mouse, touch, ←/→ keys) and a table view;
// horizontal bar list for magnitudes; funnel with step conversion. Colors come from CSS variables so dark mode is automatic.
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export type Fmt = (n: number) => string;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * exp;
}

export type LinePoint = { date: string; value: number };

/** Single-series line chart. `band` shades a reference window (e.g. move-in season) with the sunken token. */
export function LineChart({
  points,
  format,
  label,
  height = 220,
  dateLabel,
  showTable,
}: {
  points: LinePoint[];
  format: Fmt;
  label: string;
  height?: number;
  dateLabel: (d: string) => string;
  showTable?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const n = points.length;
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const xTicks = useMemo(() => {
    if (n <= 1) return [0];
    const step = Math.max(1, Math.round(n / 6));
    const out: number[] = [];
    for (let i = 0; i < n; i += step) out.push(i);
    if (out[out.length - 1] !== n - 1 && n - 1 - out[out.length - 1]! > step / 2) out.push(n - 1);
    return out;
  }, [n]);

  const locate = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !n) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((sx - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (!n) return;
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };
  const hp = hover !== null ? points[hover] : null;
  const total = points.reduce((s, p) => s + p.value, 0);

  if (showTable) {
    return (
      <div className="max-h-[300px] overflow-auto rounded-ctl border border-line">
        <table className="w-full text-small">
          <caption className="sr-only">{label}</caption>
          <thead className="sticky top-0 bg-sunken text-caption text-ink-2">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {t('admin.chart.date')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {label}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.date} className="border-t border-line">
                <td className="px-3 py-1.5 text-ink-2">{dateLabel(p.date)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink">{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-ctl"
        role="img"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        tabIndex={0}
        onMouseMove={(e) => locate(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => e.touches[0] && locate(e.touches[0].clientX)}
        onTouchMove={(e) => e.touches[0] && locate(e.touches[0].clientX)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        data-testid="line-chart"
      >
        <title id={`${id}-t`}>{label}</title>
        <desc id={`${id}-d`}>{t('admin.chart.desc', { from: points[0] ? dateLabel(points[0].date) : '', to: points[n - 1] ? dateLabel(points[n - 1]!.date) : '', total: format(total) })}</desc>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} strokeDasharray={i === 0 ? undefined : '2 4'} />
            <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-3)" className="tabular-nums">
              {format(v)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--ink-3)">
            {points[i] ? dateLabel(points[i]!.date) : ''}
          </text>
        ))}
        {n > 0 && <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {n > 0 && <circle cx={x(n - 1)} cy={y(points[n - 1]!.value)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
        {hp && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--line-strong)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(hp.value)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-1 z-[1] rounded-ctl border border-line bg-surface px-2.5 py-1.5 text-small shadow-md"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > n / 2 ? 'calc(-100% - 8px)' : '8px'})` }}
        >
          <div className="text-caption text-ink-3">{dateLabel(hp.date)}</div>
          <div className="font-medium tabular-nums text-ink">{format(hp.value)}</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a magnitude ranking (one hue; values as text tokens). */
export function BarList({ rows, format, emptyLabel, highlight }: { rows: { key: string; label: ReactNode; value: number; sub?: ReactNode }[]; format: Fmt; emptyLabel?: string; highlight?: string | null }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-small text-ink-3">{emptyLabel}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className={cn('truncate text-small', highlight === r.key ? 'font-semibold text-ink' : 'text-ink')}>{r.label}</span>
            {r.sub && <span className="truncate text-caption text-ink-3">{r.sub}</span>}
          </div>
          <span className="text-small tabular-nums text-ink">{format(r.value)}</span>
          <div className="col-span-2 h-2 overflow-hidden rounded-pill bg-sunken" aria-hidden>
            <div className={cn('h-full rounded-pill', highlight && highlight !== r.key ? 'bg-line-strong' : 'bg-accent')} style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Funnel: each step as a bar relative to the first step, with step-to-step conversion. */
export function Funnel({ steps, label }: { steps: { key: string; label: string; count: number }[]; label: string }) {
  const t = useT();
  const { formatNumber, formatPercent } = useLocale();
  const first = Math.max(1, steps[0]?.count ?? 1);
  return (
    <ol className="flex flex-col gap-3" aria-label={label}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.count : null;
        const conv = prev ? s.count / prev : null;
        return (
          <li key={s.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-small text-ink">{s.label}</span>
              <span className="text-small tabular-nums text-ink">
                {formatNumber(s.count)}
                {conv !== null && <span className="ml-2 text-caption text-ink-3">{t('admin.chart.conversion', { pct: formatPercent(conv, conv < 0.1 ? 1 : 0) })}</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-pill bg-sunken" aria-hidden>
              <div className={cn('h-full rounded-pill', i === steps.length - 1 ? 'bg-accent' : 'bg-line-strong')} style={{ width: `${Math.max(s.count > 0 ? 1.5 : 0, (s.count / first) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Tiny column chart for small multiples (one per revenue stream). */
export function MiniColumns({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const W = 120;
  const H = 36;
  const bw = W / Math.max(1, values.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-9 w-full" role="img" aria-label={label} preserveAspectRatio="none">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--line)" strokeWidth={1} />
      {values.map((v, i) => {
        const h = (v / max) * (H - 2);
        return v > 0 ? <rect key={i} x={i * bw + bw * 0.15} y={H - h} width={Math.max(0.8, bw * 0.7)} height={h} rx={Math.min(1.5, bw * 0.3)} fill="var(--accent)" /> : null;
      })}
    </svg>
  );
}
