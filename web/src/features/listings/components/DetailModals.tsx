// Share / report / contact modals for the listing detail page.
import { Check, Copy, MessageCircle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ReportReason } from '@shared/enums';
import type { Listing } from '@shared/types';
import { Button, Modal, Select, Textarea } from '@/components';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { errorMessage } from '@/app/errors';
import { keys, listingsApi } from '../api';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareModal({ listing, open, onClose }: { listing: Listing; open: boolean; onClose: () => void }) {
  const t = useT();
  const share = useQuery({ queryKey: keys.share(listing.id), queryFn: () => listingsApi.share(listing.id), enabled: open });
  const [copied, setCopied] = useState<'url' | 'text' | null>(null);
  const url = share.data?.url ?? `${window.location.origin}/listings/${listing.id}`;
  const doCopy = async (kind: 'url' | 'text') => {
    const ok = await copy(kind === 'url' ? url : share.data?.text ?? listing.title);
    if (ok) {
      setCopied(kind);
      toast.success(kind === 'url' ? t('listings.detail.share.copied') : t('listings.detail.share.textCopied'));
      track('listing.share', { entityType: 'listing', entityId: listing.id, kind });
      window.setTimeout(() => setCopied(null), 1500);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('listings.detail.share.title')} size="sm">
      <div className="flex flex-col items-center gap-4">
        {share.data?.qrSvg ? (
          <div className="rounded-card border border-line bg-surface p-3 text-ink" dangerouslySetInnerHTML={{ __html: share.data.qrSvg }} aria-hidden />
        ) : (
          <div className="size-[184px] rounded-card bg-sunken skeleton" />
        )}
        <p className="text-small text-ink-3">{t('listings.detail.share.qrHint')}</p>
        <div className="w-full rounded-ctl bg-sunken px-3 py-2 text-small text-ink-2 break-all">{url}</div>
        <div className="flex w-full gap-2">
          <Button fullWidth iconLeft={copied === 'url' ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => void doCopy('url')}>{t('listings.detail.share.copy')}</Button>
          <Button fullWidth variant="secondary" iconLeft={copied === 'text' ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => void doCopy('text')}>{t('listings.detail.share.text')}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function ReportModal({ listingId, open, onClose }: { listingId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const [reason, setReason] = useState<string>('scam');
  const [details, setDetails] = useState('');
  const m = useMutation({
    mutationFn: () => listingsApi.report(listingId, { reason, details: details.trim() || undefined }),
    onSuccess: () => { toast.success(t('listings.detail.report.done')); onClose(); setDetails(''); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('listings.detail.report.title')}
      size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>{t('listings.detail.report.submit')}</Button></>}
    >
      <div className="flex flex-col gap-4">
        <Select label={t('listings.detail.report.reason')} value={reason} onChange={setReason} options={ReportReason.map((r) => ({ value: r, label: t(`listings.detail.report.reason.${r}`) }))} />
        <Textarea label={t('listings.detail.report.details')} placeholder={t('listings.detail.report.detailsPlaceholder')} rows={4} maxLength={1000} showCount value={details} onChange={(e) => setDetails(e.target.value)} optional />
      </div>
    </Modal>
  );
}

export function ContactModal({ listing, open, onClose }: { listing: Listing; open: boolean; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const m = useMutation({
    mutationFn: () => listingsApi.contact(listing.id, message.trim() || undefined),
    onSuccess: (r) => {
      track('listing.contact_click', { entityType: 'listing', entityId: listing.id, created: r.created });
      toast.success(t('listings.detail.contact.sent'));
      onClose();
      navigate(`/chat/${r.conversationId}`);
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('listings.detail.contact.title')}
      description={listing.title}
      size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button loading={m.isPending} iconLeft={<MessageCircle className="size-4" />} onClick={() => m.mutate()}>{t('listings.detail.contact.send')}</Button></>}
    >
      <div className="flex flex-col gap-3">
        <p className="text-small text-ink-2">{t('listings.detail.contact.hint')}</p>
        <Textarea placeholder={t('listings.detail.contact.placeholder')} rows={4} maxLength={1000} showCount value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
        <p className="rounded-ctl bg-warning-soft px-3 py-2 text-small text-warning">{t('scam.banner')}</p>
      </div>
    </Modal>
  );
}
