// Report a wanted post (reasons from DATA_MODEL §4 reportReason).
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Modal, Select, Textarea } from '@/components';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { errorMessage } from '@/app/errors';
import { reportWanted } from '../api';

const REASONS = ['scam', 'spam', 'fake', 'harassment', 'inappropriate', 'duplicate', 'wrong_info', 'other'] as const;

export function ReportModal({ open, onClose, wantedId }: { open: boolean; onClose: () => void; wantedId: string }) {
  const t = useT();
  const [reason, setReason] = useState<string>('spam');
  const [details, setDetails] = useState('');
  const m = useMutation({
    mutationFn: () => reportWanted(wantedId, reason, details.trim() || undefined),
    onSuccess: () => { toast.success(t('wanted.report.sent')); onClose(); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('wanted.report.title')}
      description={t('wanted.report.description')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => m.mutate()} loading={m.isPending}>{t('common.report')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label={t('wanted.report.reason')} value={reason} onChange={(v) => setReason(v)} options={REASONS.map((r) => ({ value: r, label: t(`wanted.report.reasons.${r}`) }))} />
        <Textarea label={t('wanted.report.details')} optional rows={3} maxLength={1000} showCount value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
    </Modal>
  );
}

export default ReportModal;
