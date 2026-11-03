// 「申请添加我的校区」 modal — campus without shuttle data (DESIGN §7.10 last line). Anonymous users may submit (email optional).
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Campus } from '@shared/types';
import { Button, Input, Modal, Textarea } from '@/components';
import { errorMessage, fieldError } from '@/app/errors';
import { useAuth } from '@/lib/auth';
import { useLocale, useT } from '@/lib/i18n';
import { useRequestCampus } from '../api';

export function RequestCampusForm({ open, onClose, campus }: { open: boolean; onClose: () => void; campus: Pick<Campus, 'id' | 'name' | 'nameZh' | 'shortName'> & { shuttleTrackerUrl?: string | null } }) {
  const t = useT();
  const { isZh } = useLocale();
  const { user } = useAuth();
  const req = useRequestCampus();
  const [url, setUrl] = useState(campus.shuttleTrackerUrl ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ status: string; duplicate?: boolean } | null>(null);
  const campusLabel = isZh && campus.nameZh ? `${campus.nameZh} ${campus.name}` : campus.name;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    req.mutate({ campusId: campus.id, officialUrl: url.trim() || undefined, email: email.trim() || undefined, note: note.trim() || undefined }, { onSuccess: (d) => setDone(d) });
  };
  const close = () => {
    onClose();
    window.setTimeout(() => { setDone(null); req.reset(); }, 300);
  };
  return (
    <Modal open={open} onClose={close} title={t('shuttle.request.title')} description={done ? undefined : t('shuttle.request.description')} size="sm"
      footer={done ? <Button onClick={close}>{t('common.close')}</Button> : (
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button type="submit" form="shuttle-request-form" loading={req.isPending}>{t('shuttle.request.submit')}</Button>
        </>
      )}>
      {done ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="size-10 text-success" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-h3 text-ink">{done.status === 'done' ? t('shuttle.request.done') : t('shuttle.request.success')}</p>
          <p className="text-body text-ink-2">{done.duplicate ? t('shuttle.request.duplicate') : done.status === 'done' ? '' : t('shuttle.request.successHint')}</p>
        </div>
      ) : (
        <form id="shuttle-request-form" onSubmit={submit} className="flex flex-col gap-4">
          <Input label={t('shuttle.request.campus')} value={campusLabel} readOnly />
          <Input label={t('shuttle.request.url')} hint={t('shuttle.request.urlHint')} type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} error={fieldError(t, req.error, 'officialUrl')} optional />
          <Input label={t('shuttle.request.email')} hint={t('shuttle.request.emailHint')} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(t, req.error, 'email')} optional />
          <Textarea label={t('shuttle.request.note')} rows={3} maxLength={500} showCount placeholder={t('shuttle.request.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} error={fieldError(t, req.error, 'note')} optional />
          {req.isError && !fieldError(t, req.error, 'officialUrl') && !fieldError(t, req.error, 'email') ? <p className="text-small text-danger" role="alert">{errorMessage(t, req.error)}</p> : null}
        </form>
      )}
    </Modal>
  );
}
