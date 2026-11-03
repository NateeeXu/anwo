import type { ListingStatus } from '@shared/enums';
import { Badge } from '@/components';
import { useT } from '@/lib/i18n';

const VARIANT: Record<ListingStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = { draft: 'neutral', active: 'success', paused: 'warning', rented: 'info', expired: 'danger', removed: 'neutral' };

export function StatusBadge({ status, size = 'sm' }: { status: ListingStatus; size?: 'sm' | 'md' }) {
  const t = useT();
  return <Badge variant={VARIANT[status]} size={size}>{t(`listings.status.${status}`)}</Badge>;
}
