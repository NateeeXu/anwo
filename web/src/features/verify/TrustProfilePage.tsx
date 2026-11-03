// /verify/trust/:userId — standalone public trust profile (the same card the core Profile page can embed).
import { useParams } from 'react-router';
import { useT } from '@/lib/i18n';
import { Head } from '@/app/Head';
import { TrustProfileCard } from './TrustProfileCard';
import { useTrustProfile } from './api';

export default function TrustProfilePage() {
  const t = useT();
  const { userId } = useParams<{ userId: string }>();
  const q = useTrustProfile(userId);
  return (
    <div className="mx-auto w-full max-w-reading px-4">
      <Head title={q.data ? `${q.data.user.name} · ${t('verify.profile.title')}` : t('verify.profile.title')} />
      <header className="mb-4">
        <h1 className="text-h1-sm md:text-h1 text-ink">{t('verify.profile.title')}</h1>
        <p className="mt-1 text-small text-ink-2">{t('verify.profile.subtitle')}</p>
      </header>
      <TrustProfileCard userId={userId} profile={q.data} />
    </div>
  );
}
