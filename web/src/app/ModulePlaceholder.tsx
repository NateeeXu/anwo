// Placeholder page used by module route stubs until the module agent replaces them.
import { Hammer } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, EmptyState, PageHeader } from '../components';
import { useT } from '../lib/i18n';
import { Head } from './Head';
import { SecondaryTabs } from './shell/SecondaryTabs';

export function ModulePlaceholder({ moduleKey, titleKey, tabs }: { moduleKey: string; titleKey: string; tabs?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const title = t(titleKey);
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={title} />
      {tabs && <SecondaryTabs />}
      <PageHeader title={title} />
      <EmptyState
        icon={<Hammer />}
        title={t(`${moduleKey}.placeholder.title`)}
        description={t(`${moduleKey}.placeholder.description`)}
        action={<Button variant="primary" onClick={() => navigate('/')}>{t('nav.home')}</Button>}
      />
    </div>
  );
}

export default ModulePlaceholder;
