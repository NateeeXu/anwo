// Heart button used on cards (absolute, sibling of the card link) and on the detail page. Optimistic, login-aware.
import { Heart } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router';
import { useState, type MouseEvent } from 'react';
import { Button } from '@/components';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { cn } from '@/lib/cn';
import { loginPath } from '@/app/guards';
import { listingsApi } from '../api';

export function useSaveListing(id: string, initial: boolean | undefined) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const t = useT();
  const [saved, setSaved] = useState(!!initial);
  const [count, setCount] = useState<number | null>(null);
  const m = useMutation({
    mutationFn: (next: boolean) => (next ? listingsApi.save(id) : listingsApi.unsave(id)),
    onMutate: (next) => setSaved(next),
    onError: (_e, next) => setSaved(!next),
    onSuccess: (r) => {
      setSaved(r.saved);
      setCount(r.saveCount);
      void qc.invalidateQueries({ queryKey: ['listings', 'saved'] });
      if (r.saved) {
        track('listing.save', { entityType: 'listing', entityId: id });
        toast.success(t('listings.detail.saved'));
      } else toast.info(t('listings.detail.unsaved'));
    },
  });
  const toggle = () => {
    if (status !== 'authed') {
      toast.info(t('listings.detail.loginToSave'));
      navigate(loginPath(loc.pathname + loc.search));
      return;
    }
    if (!m.isPending) m.mutate(!saved);
  };
  return { saved, count, toggle, pending: m.isPending };
}

export function SaveButton({ id, saved: initial, variant = 'card', className }: { id: string; saved?: boolean; variant?: 'card' | 'rail'; className?: string }) {
  const t = useT();
  const { saved, toggle } = useSaveListing(id, initial);
  const label = saved ? t('listings.card.unsave') : t('listings.card.save');
  if (variant === 'rail') {
    return (
      <Button variant={saved ? 'secondary' : 'ghost'} size="sm" aria-pressed={saved} iconLeft={<Heart className={cn('size-4', saved && 'fill-current text-accent-text')} />} onClick={toggle} className={className}>
        {saved ? t('common.saved') : t('listings.card.save')}
      </Button>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={saved}
      onClick={(e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
      className={cn(
        'absolute right-2 top-2 z-layer-raised flex size-8 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-sm transition-transform duration-token-fast hover:scale-105 active:scale-95',
        className,
      )}
    >
      <Heart className={cn('size-4', saved ? 'fill-accent text-accent' : 'text-ink')} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
