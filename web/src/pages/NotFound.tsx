import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, EmptyState } from '../components';
import { useT } from '../lib/i18n';
import { Head } from '../app/Head';

export default function NotFound() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('notFound.title')} />
      <EmptyState icon={<Compass />} title={t('notFound.title')} description={t('notFound.description')} action={<Button variant="primary" onClick={() => navigate('/')}>{t('nav.home')}</Button>} secondaryAction={<Button variant="secondary" onClick={() => navigate(-1)}>{t('common.back')}</Button>} />
    </div>
  );
}
