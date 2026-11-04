// Mounts other modules' admin panels (default export of web/src/features/<key>/admin.tsx) inside the admin shell.
// When a module exports `null`, content modules fall back to the generic moderation table.
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlert, Hammer } from 'lucide-react';
import type { ModeratedEntityType } from '@shared/schemas/admin';
import { Button, EmptyState } from '@/components';
import { useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import VerifyAdmin from '../../verify/admin';
import BillingAdmin from '../../billing/admin';
import ShuttleAdmin from '../../shuttle/admin';
import ListingsAdmin from '../../listings/admin';
import MarketAdmin from '../../market/admin';
import BuddyAdmin from '../../buddy/admin';
import WantedAdmin from '../../wanted/admin';
import ChatAdmin from '../../chat/admin';
import MapAdmin from '../../map/admin';
import { ModerationTable } from './Moderation';
import { PageTitle } from '../ui';

type Panel = ComponentType | null;
const asPanel = (p: unknown): Panel => (typeof p === 'function' ? (p as ComponentType) : null);

export const PANELS: Record<string, Panel> = {
  verify: asPanel(VerifyAdmin),
  billing: asPanel(BillingAdmin),
  shuttle: asPanel(ShuttleAdmin),
  listings: asPanel(ListingsAdmin),
  market: asPanel(MarketAdmin),
  buddy: asPanel(BuddyAdmin),
  wanted: asPanel(WantedAdmin),
  chat: asPanel(ChatAdmin),
  map: asPanel(MapAdmin),
};

/** Keeps a crashing module panel from taking the admin shell down. */
class PanelBoundary extends Component<{ children: ReactNode; fallback: (reset: () => void) => ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('admin panel crashed', error, info.componentStack);
  }
  override render() {
    return this.state.error ? this.props.fallback(() => this.setState({ error: null })) : this.props.children;
  }
}

function PanelError({ reset }: { reset: () => void }) {
  const t = useT();
  return <EmptyState icon={CircleAlert} title={t('admin.panel.crashed')} description={t('admin.panel.crashedHint')} action={<Button onClick={reset}>{t('common.retry')}</Button>} />;
}

/** Panels that render their own page heading. */
const OWN_TITLE = new Set(['verify', 'billing', 'shuttle', 'map']);

/** `/admin/<section>` for a module panel; `fallback` = entity type for the generic moderation table. */
export function ModuleSection({ moduleKey, navKey, fallback }: { moduleKey: string; navKey: string; fallback?: ModeratedEntityType }) {
  const t = useT();
  const P = PANELS[moduleKey];
  if (!P) {
    if (fallback) return <ModerationTable entityType={fallback} titleKey={`admin.nav.${navKey}`} />;
    return (
      <div className="flex flex-col gap-5">
        <Head title={t(`admin.nav.${navKey}`)} />
        <PageTitle title={t(`admin.nav.${navKey}`)} />
        <EmptyState icon={Hammer} title={t('admin.panel.none')} description={t('admin.panel.noneHint')} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-testid={`panel-${moduleKey}`}>
      <Head title={t(`admin.nav.${navKey}`)} />
      {!OWN_TITLE.has(moduleKey) && <PageTitle title={t(`admin.nav.${navKey}`)} subtitle={t(`admin.panel.subtitle.${moduleKey}`)} />}
      <PanelBoundary fallback={(reset) => <PanelError reset={reset} />}>
        <P />
      </PanelBoundary>
    </div>
  );
}
