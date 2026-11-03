// /dev/kitchen: in-app link to the component kitchen (web/kitchen.html is owned by the foundation agent).
import { useEffect } from 'react';
import { Head } from '../app/Head';
import { useT } from '../lib/i18n';

export default function DevKitchen() {
  const t = useT();
  useEffect(() => {
    window.location.replace('/kitchen.html');
  }, []);
  return (
    <div className="mx-auto w-full max-w-content px-4 py-12 text-center text-body text-ink-2 lg:px-8">
      <Head title="UI kitchen" />
      <a href="/kitchen.html" className="text-accent-text hover:underline">{t('common.continue')} → /kitchen.html</a>
    </div>
  );
}
