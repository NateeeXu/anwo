// Star toggle for a stop or a route. Anonymous users are sent to login with `next` set.
import { Star } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components';
import { loginPath } from '@/app/guards';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useToggleFavorite } from '../api';

export function FavoriteButton({ entityType, id, favorited, size = 'sm', label = false, className }: { entityType: 'stop' | 'route'; id: string; favorited: boolean; size?: 'sm' | 'md'; label?: boolean; className?: string }) {
  const t = useT();
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toggle = useToggleFavorite();
  const text = favorited ? t('shuttle.favorited') : entityType === 'stop' ? t('shuttle.favoriteStop') : t('shuttle.favoriteRoute');
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status !== 'authed') {
      navigate(loginPath(location.pathname + location.search));
      return;
    }
    toggle.mutate({ entityType, id, favorited }, { onError: () => toast.error(t('error.generic')) });
  };
  const icon = <Star className={cn(favorited && 'fill-current')} />;
  if (label) {
    return (
      <Button variant={favorited ? 'secondary' : 'ghost'} size={size} iconLeft={icon} onClick={onClick} loading={toggle.isPending} aria-pressed={favorited} className={className}>
        {text}
      </Button>
    );
  }
  return (
    <Button variant="ghost" size={size} iconOnly aria-label={text} aria-pressed={favorited} onClick={onClick} className={cn(favorited && 'text-accent-text', className)}>
      {icon}
    </Button>
  );
}
