import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function clusterLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** HTML string for the cluster divIcon: 36px `inverse` circle (44px when ≥ 50) with a count. */
export function clusterPinHtml(count: number): string {
  return `<span class="anwo-cluster" data-size="${count >= 50 ? 'lg' : 'md'}">${clusterLabel(count)}</span>`;
}

export type ClusterPinProps = { count: number } & HTMLAttributes<HTMLSpanElement>;

/** React rendering of the cluster circle (legend / docs). */
export function ClusterPin({ count, className, style, ...rest }: ClusterPinProps) {
  return (
    <span className={cn('anwo-cluster anwo-cluster--static', className)} data-size={count >= 50 ? 'lg' : 'md'} style={style} {...rest}>
      {clusterLabel(count)}
    </span>
  );
}

export default ClusterPin;
