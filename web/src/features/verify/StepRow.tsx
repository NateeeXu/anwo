// One rung of the verification ladder (DESIGN.md §7.7): status glyph · title · status line · toggle, expandable body.
import { useId, type ReactNode } from 'react';
import { Check, ChevronDown, Clock, Lock, X } from 'lucide-react';
import { Button } from '@/components';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export type StepState = 'done' | 'active' | 'todo' | 'locked' | 'pending' | 'rejected';

export interface StepRowProps {
  index: number;
  levelLabel: string;
  title: string;
  statusText: string;
  state: StepState;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
  /** DOM id for deep links (#edu, #id, ...) */
  anchor?: string;
}

function Glyph({ state, index }: { state: StepState; index: number }) {
  const base = 'flex size-8 shrink-0 items-center justify-center rounded-pill text-small font-semibold tnum';
  switch (state) {
    case 'done':
      return <span className={cn(base, 'bg-success text-on-accent')} aria-hidden><Check size={16} strokeWidth={2.25} /></span>;
    case 'pending':
      return <span className={cn(base, 'bg-warning-soft text-warning')} aria-hidden><Clock size={16} strokeWidth={2} /></span>;
    case 'rejected':
      return <span className={cn(base, 'bg-danger-soft text-danger')} aria-hidden><X size={16} strokeWidth={2.25} /></span>;
    case 'locked':
      return <span className={cn(base, 'bg-sunken text-ink-4')} aria-hidden><Lock size={14} strokeWidth={2} /></span>;
    case 'active':
      return <span className={cn(base, 'bg-accent text-on-accent')} aria-hidden>{index}</span>;
    default:
      return <span className={cn(base, 'border border-line-strong text-ink-3')} aria-hidden>{index}</span>;
  }
}

export function StepRow({ index, levelLabel, title, statusText, state, open, onToggle, children, anchor }: StepRowProps) {
  const t = useT();
  const id = useId();
  const statusTone = state === 'done' ? 'text-success' : state === 'rejected' ? 'text-danger' : state === 'pending' ? 'text-warning' : state === 'locked' ? 'text-ink-4' : 'text-ink-2';
  const toggleLabel = open ? t('verify.step.collapse') : state === 'done' || state === 'pending' || state === 'rejected' ? t('verify.step.view') : t('verify.step.start');
  return (
    <li id={anchor} className={cn('group', open && 'bg-surface')} data-state={state}>
      <div className="flex items-start gap-3 px-4 py-4 md:items-center md:px-5">
        <Glyph state={state} index={index} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-caption text-ink-3">{levelLabel}</span>
            <h3 className="text-body font-semibold text-ink">{title}</h3>
          </div>
          <p className={cn('mt-0.5 text-small', statusTone)}>{statusText}</p>
        </div>
        <Button
          variant={state === 'active' && !open ? 'primary' : 'ghost'}
          size="sm"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          disabled={state === 'locked'}
          iconRight={<ChevronDown className={cn('transition-transform duration-token-fast', open && 'rotate-180')} />}
        >
          {toggleLabel}
        </Button>
      </div>
      {open && (
        <div id={`${id}-body`} className="animate-fade-in border-t border-line px-4 py-5 md:px-5 md:pl-16">
          {children}
        </div>
      )}
    </li>
  );
}
