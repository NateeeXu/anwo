// L2 — student ID / passport / government ID upload → admin review. Private uploads (purpose=verification).
import { useMemo, useState, type FormEvent } from 'react';
import { CircleCheck, Clock, FileCheck, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { VerificationRequest } from '@shared/types';
import type { VerificationType } from '@shared/enums';
import { Badge, Button, Input, PhotoUploader, Select, type UploaderFile } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { errorMessage, fieldError } from '@/app/errors';
import type { VerifyStatus } from './api';
import { useCancelId, useSubmitId } from './api';
import { ID_TYPES, typeLabel } from './labels';

const ACCEPT = 'image/jpeg,image/png,image/webp';

function RequestCard({ request, onResubmit, onCancel, cancelling }: { request: VerificationRequest; onResubmit: () => void; onCancel: () => void; cancelling: boolean }) {
  const t = useT();
  const { formatDate } = useLocale();
  const type = typeLabel(t, request.type);
  if (request.status === 'pending' || request.status === 'in_review') {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-line bg-sunken p-4 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-warning-soft text-warning" aria-hidden><Clock size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">{t('verify.id.pending.title')}</p>
          <p className="text-small text-ink-2">
            {request.status === 'in_review' ? t('verify.id.inReview.body', { type }) : t('verify.id.pending.body', { type, date: formatDate(request.submittedAt, 'datetime') })}
          </p>
        </div>
        {request.status === 'pending' && (
          <Button variant="ghost" size="sm" onClick={onCancel} loading={cancelling}>{t('verify.id.cancel')}</Button>
        )}
      </div>
    );
  }
  if (request.status === 'rejected') {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-danger-soft bg-danger-soft/40 p-4" role="status">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink">{t('verify.id.rejected.title', { reason: request.reason ?? '—' })}</p>
            <p className="text-small text-ink-2">{t('verify.id.rejected.body')}</p>
            {request.reviewedAt && <p className="mt-1 text-caption text-ink-3">{type} · {formatDate(request.reviewedAt, 'datetime')}</p>}
          </div>
        </div>
        <div><Button variant="primary" size="sm" onClick={onResubmit}>{t('verify.id.resubmit')}</Button></div>
      </div>
    );
  }
  if (request.status === 'approved') {
    return (
      <div className="flex items-center gap-3 rounded-card border border-line bg-sunken p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-success-soft text-success" aria-hidden><ShieldCheck size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">{t('verify.id.approved.title')}</p>
          <p className="text-small text-ink-2">{t('verify.id.approved.body', { type, date: request.reviewedAt ? formatDate(request.reviewedAt, 'long') : '' })}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onResubmit}>{t('verify.id.another')}</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-sunken p-4 text-small text-ink-2">
      <Badge variant="neutral">{t('verify.id.cancelled')}</Badge>
      <span>{type} · {formatDate(request.submittedAt, 'datetime')}</span>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onResubmit}>{t('verify.id.resubmit')}</Button>
    </div>
  );
}

export function IdStep({ status, onSubmitted }: { status: VerifyStatus; onSubmitted?: () => void }) {
  const t = useT();
  const step = status.steps.id;
  const latest = step.request;
  const openRequest = latest && (latest.status === 'pending' || latest.status === 'in_review') ? latest : null;
  const [showForm, setShowForm] = useState(!latest);
  const submit = useSubmitId();
  const cancel = useCancelId();

  const [type, setType] = useState<VerificationType>(latest?.type ?? 'student_id');
  const [fullName, setFullName] = useState(latest?.fullName ?? '');
  const [last4, setLast4] = useState('');
  const [front, setFront] = useState<UploaderFile[]>([]);
  const [back, setBack] = useState<UploaderFile[]>([]);
  const [selfie, setSelfie] = useState<UploaderFile[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const typeOptions = useMemo(() => ID_TYPES.map((v) => ({ value: v, label: typeLabel(t, v), description: t(`verify.id.type.${v}.desc`) })), [t]);
  const uploading = [...front, ...back, ...selfie].some((f) => f.progress !== undefined && f.progress < 1 && !f.uploadId && !f.error);

  if (!status.steps.edu.done) {
    return <p className="text-small text-ink-2">{t('verify.id.needEdu')}</p>;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const frontId = front.find((f) => f.uploadId)?.uploadId;
    if (!frontId) {
      setLocalError(t('verify.id.frontRequired'));
      return;
    }
    try {
      await submit.mutateAsync({
        type,
        frontUploadId: frontId,
        backUploadId: back.find((f) => f.uploadId)?.uploadId,
        selfieUploadId: selfie.find((f) => f.uploadId)?.uploadId,
        fullName: fullName.trim(),
        docNumberLast4: last4.trim() || undefined,
      });
      track('verify.submit_ui', { type });
      toast.success(t('verify.id.submitted'));
      setShowForm(false);
      setFront([]); setBack([]); setSelfie([]); setLast4('');
      onSubmitted?.();
    } catch { /* inline */ }
  };

  return (
    <div className="flex flex-col gap-5">
      {latest && (
        <RequestCard
          request={latest}
          onResubmit={() => setShowForm(true)}
          cancelling={cancel.isPending}
          onCancel={async () => {
            try {
              await cancel.mutateAsync(latest.id);
              toast.info(t('verify.id.cancelled'));
              setShowForm(true);
            } catch (err) {
              toast.error(errorMessage(t, err));
            }
          }}
        />
      )}
      {!openRequest && showForm && (
        <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]" noValidate>
          <div className="flex flex-col gap-4">
            <p className="text-small text-ink-2">{t('verify.id.description')}</p>
            <Select<VerificationType> label={t('verify.id.type')} options={typeOptions} value={type} onChange={(v) => setType(v)} required />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
              <Input label={t('verify.id.fullName')} value={fullName} onChange={(e) => setFullName(e.target.value)} hint={t('verify.id.fullNameHint')} required maxLength={80} error={fieldError(t, submit.error, 'fullName')} autoComplete="name" />
              <Input label={t('verify.id.last4')} value={last4} onChange={(e) => setLast4(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4))} hint={t('verify.id.last4Hint')} optional maxLength={4} inputMode="text" error={fieldError(t, submit.error, 'docNumberLast4')} inputClassName="font-mono" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <PhotoUploader label={t('verify.id.front')} files={front} onChange={setFront} max={1} purpose="verification" isPrivate accept={ACCEPT} maxSizeMB={10} />
              <PhotoUploader label={`${t('verify.id.back')} · ${t('verify.id.optional')}`} files={back} onChange={setBack} max={1} purpose="verification" isPrivate accept={ACCEPT} maxSizeMB={10} />
              <PhotoUploader label={`${t('verify.id.selfie')} · ${t('verify.id.optional')}`} files={selfie} onChange={setSelfie} max={1} purpose="verification" isPrivate accept={ACCEPT} maxSizeMB={10} />
            </div>
            {(localError || submit.error != null) && (
              <p role="alert" className="text-small text-danger">{localError ?? errorMessage(t, submit.error)}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" loading={submit.isPending} disabled={uploading} iconLeft={<FileCheck />}>{t('verify.id.submit')}</Button>
              {latest && <Button variant="ghost" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>}
            </div>
          </div>
          <aside className="flex flex-col gap-4 text-small text-ink-2">
            <div>
              <h4 className="text-caption text-ink-3">{t('verify.id.guide.title')}</h4>
              <ul className="mt-1 flex flex-col gap-1">
                {[1, 2, 3].map((n) => (
                  <li key={n} className="flex gap-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />{t(`verify.id.guide.${n}`)}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-card bg-sunken p-3">
              <h4 className="text-caption text-ink-3">{t('verify.id.privacy.title')}</h4>
              <p className="mt-1 text-small text-ink-2">{t('verify.id.privacy.body')}</p>
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}
