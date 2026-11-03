// Match score badge + breakdown bars (DATA_MODEL §7 components: price 30 · dates 25 · location 20 · must-haves 15 · fit 10 · trust +5).
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { BREAKDOWN_MAX, BREAKDOWN_ORDER, pct, scoreTone } from '../lib';

export function ScoreBadge({ score, size = 'md', className }: { score: number; size?: 'sm' | 'md'; className?: string }) {
  const t = useT();
  const tone = scoreTone(score);
  return (
    <Badge
      variant={tone === 'weak' ? 'neutral' : 'accent'}
      size={size}
      icon={tone === 'strong' ? <Sparkles /> : undefined}
      className={cn('tabular-nums', className)}
      title={t('wanted.match.scoreTitle', { score })}
    >
      {t('wanted.match.score', { score: pct(score) })}
    </Badge>
  );
}

/** Large numeral for the detail rail / match cards. */
export function ScoreDial({ score, className }: { score: number; className?: string }) {
  const t = useT();
  const tone = scoreTone(score);
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-card px-3 py-2 tabular-nums', tone === 'weak' ? 'bg-sunken text-ink' : 'bg-accent-soft text-accent-text-strong', className)} aria-label={t('wanted.match.scoreTitle', { score })}>
      <span className="text-price-lg leading-none">{score}</span>
      <span className="mt-0.5 text-caption">{t('wanted.match.scoreUnit')}</span>
    </div>
  );
}

export function ScoreBreakdown({ breakdown, compact, className }: { breakdown: Record<string, number>; compact?: boolean; className?: string }) {
  const t = useT();
  return (
    <ul className={cn('grid gap-x-4 gap-y-1.5', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2', className)} aria-label={t('wanted.match.breakdown')}>
      {BREAKDOWN_ORDER.map((key) => {
        const max = BREAKDOWN_MAX[key] ?? 1;
        const value = Math.max(0, Math.min(max, breakdown[key] ?? 0));
        const ratio = max ? value / max : 0;
        return (
          <li key={key} className="flex items-center gap-2 text-caption text-ink-2">
            <span className="w-16 shrink-0 truncate">{t(`wanted.match.part.${key}`)}</span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-line" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={t(`wanted.match.part.${key}`)}>
              <span className={cn('absolute inset-y-0 left-0 rounded-pill', ratio >= 0.99 ? 'bg-accent' : ratio >= 0.5 ? 'bg-accent-vivid/80' : 'bg-ink-3')} style={{ width: `${Math.round(ratio * 100)}%` }} />
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-ink-3">
              {value}/{max}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
