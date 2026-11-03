// The colored line segment that identifies a route everywhere (list, map legend, stop sheet, admin table).
import { cn } from '@/lib/cn';

export function RouteSwatch({ color, shortName, size = 'md', className }: { color: string; shortName?: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const h = size === 'lg' ? 'h-1.5' : size === 'sm' ? 'h-[3px]' : 'h-1';
  const w = size === 'lg' ? 'w-10' : size === 'sm' ? 'w-5' : 'w-7';
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5', className)} aria-hidden="true">
      <span className={cn('inline-block rounded-pill', h, w)} style={{ backgroundColor: color }} />
      {shortName ? <span className="text-caption tnum text-ink-3">{shortName}</span> : null}
    </span>
  );
}

/** Small filled dot for stop markers in lists (matches the 10 px map circle). */
export function RouteDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2.5 shrink-0 rounded-pill ring-2 ring-surface', className)} style={{ backgroundColor: color }} aria-hidden="true" />;
}
