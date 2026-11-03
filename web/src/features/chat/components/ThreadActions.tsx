// Thread header actions menu (mute / archive / block / report / leave / members) and its confirmation dialogs.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Bell, BellOff, Flag, LogOut, MoreHorizontal, Search, ShieldBan, ShieldCheck, User, Users } from 'lucide-react';
import type { ConversationDto } from '@shared/schemas/chat';
import { Avatar, Button, Checkbox, Input, Modal, Select, Textarea, TrustBadge, type MenuEntry } from '@/components';
import { ChatMenu } from './ChatMenu';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { errorMessage } from '@/app/errors';
import { UNREAD_KEY } from '@/app/shell/useUnread';
import * as chatApi from '../api';
import { CONVERSATIONS_KEY, UNREAD_MESSAGES_KEY, conversationKey } from '../hooks';
import { conversationTitle, type LocalMessage } from '../utils';

const REASONS = ['scam', 'spam', 'fake', 'harassment', 'inappropriate', 'other'] as const;

export function ThreadActions({ conv, meId, onSearch }: { conv: ConversationDto; meId: string; onSearch: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<null | 'mute' | 'block' | 'report' | 'leave' | 'members'>(null);
  const title = conversationTitle(conv, meId, t);
  const peer = conv.peer;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: conversationKey(conv.id) });
    qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    qc.invalidateQueries({ queryKey: UNREAD_MESSAGES_KEY });
    qc.invalidateQueries({ queryKey: UNREAD_KEY });
  };

  const patch = useMutation({
    mutationFn: (p: Parameters<typeof chatApi.patchConversation>[1]) => chatApi.patchConversation(conv.id, p),
    onSuccess: (data, p) => {
      qc.setQueryData(conversationKey(conv.id), data);
      refresh();
      if (p.archived !== undefined) {
        toast.success(t(p.archived ? 'chat.toast.archived' : 'chat.toast.unarchived'));
        if (p.archived) navigate('/chat');
      }
      if (p.mutedUntil !== undefined) toast.success(t(p.mutedUntil ? 'chat.toast.muted' : 'chat.toast.unmuted'));
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const items: MenuEntry[] = [
    { label: t('chat.actions.search'), icon: <Search />, onSelect: onSearch },
    ...(peer ? [{ label: t('chat.actions.profile'), icon: <User />, onSelect: () => navigate(`/u/${peer.id}`) }] : [{ label: t('chat.actions.members'), icon: <Users />, onSelect: () => setDialog('members') }]),
    'separator',
    conv.muted
      ? { label: t('chat.actions.unmute'), icon: <Bell />, onSelect: () => patch.mutate({ mutedUntil: null }) }
      : { label: t('chat.actions.mute'), icon: <BellOff />, onSelect: () => setDialog('mute') },
    conv.archived
      ? { label: t('chat.actions.unarchive'), icon: <ArchiveRestore />, onSelect: () => patch.mutate({ archived: false }) }
      : { label: t('chat.actions.archive'), icon: <Archive />, onSelect: () => patch.mutate({ archived: true }) },
    'separator',
    ...(peer
      ? [
          conv.blockedByMe
            ? { label: t('chat.actions.unblock'), icon: <ShieldCheck />, onSelect: () => void unblock(peer.id, peer.name) }
            : { label: t('chat.actions.block'), icon: <ShieldBan />, danger: true, onSelect: () => setDialog('block') },
        ]
      : []),
    { label: t('chat.actions.report'), icon: <Flag />, danger: true, onSelect: () => setDialog('report') },
    ...(conv.kind !== 'direct' ? [{ label: t('chat.actions.leave'), icon: <LogOut />, danger: true, onSelect: () => setDialog('leave') }] : []),
  ];

  async function unblock(userId: string, name: string) {
    try {
      await chatApi.unblockUser(userId);
      toast.success(t('chat.unblock.done', { name }));
      refresh();
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  }

  return (
    <>
      <ChatMenu
        label={t('chat.actions.menu')}
        align="end"
        trigger={<Button variant="ghost" iconOnly aria-label={t('chat.actions.menu')}><MoreHorizontal /></Button>}
        items={items}
      />
      <MuteDialog open={dialog === 'mute'} onClose={() => setDialog(null)} onPick={(until) => { patch.mutate({ mutedUntil: until }); setDialog(null); }} />
      {peer && <BlockDialog open={dialog === 'block'} onClose={() => setDialog(null)} userId={peer.id} name={peer.name} onDone={() => { refresh(); navigate('/chat'); }} />}
      <ReportDialog open={dialog === 'report'} onClose={() => setDialog(null)} target={{ kind: 'conversation', id: conv.id }} peer={peer ? { id: peer.id, name: peer.name } : null} onDone={refresh} />
      <LeaveDialog open={dialog === 'leave'} onClose={() => setDialog(null)} conv={conv} title={title} onDone={() => { refresh(); navigate('/chat'); }} />
      <MembersDialog open={dialog === 'members'} onClose={() => setDialog(null)} conv={conv} meId={meId} />
    </>
  );
}

function MuteDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (until: string) => void }) {
  const t = useT();
  const options = [
    { key: '8h', label: t('chat.actions.mute8h'), ms: 8 * 3_600_000 },
    { key: '1w', label: t('chat.actions.mute1w'), ms: 7 * 86_400_000 },
    { key: 'forever', label: t('chat.actions.muteForever'), ms: 100 * 365 * 86_400_000 },
  ];
  return (
    <Modal open={open} onClose={onClose} title={t('chat.actions.mute')} size="sm">
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <Button key={o.key} variant="secondary" fullWidth onClick={() => onPick(new Date(Date.now() + o.ms).toISOString())}>
            {o.label}
          </Button>
        ))}
      </div>
    </Modal>
  );
}

export function BlockDialog({ open, onClose, userId, name, onDone }: { open: boolean; onClose: () => void; userId: string; name: string; onDone?: () => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => chatApi.blockUser(userId, reason.trim() || undefined),
    onSuccess: () => {
      track('chat.block', { entityType: 'user', entityId: userId });
      toast.success(t('chat.block.done', { name }));
      onClose();
      onDone?.();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('chat.block.title', { name })}
      description={t('chat.block.body')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>{t('chat.block.confirm')}</Button>
        </>
      }
    >
      <Input label={t('chat.block.reason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
    </Modal>
  );
}

export function ReportDialog({
  open, onClose, target, peer, onDone,
}: {
  open: boolean;
  onClose: () => void;
  target: { kind: 'conversation' | 'message'; id: string };
  peer: { id: string; name: string } | null;
  onDone?: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState<(typeof REASONS)[number]>('scam');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const input = { reason, details: details.trim() || undefined };
      const r = target.kind === 'message' ? await chatApi.reportMessage(target.id, input) : await chatApi.reportConversation(target.id, input);
      if (alsoBlock && peer) await chatApi.blockUser(peer.id, t(`chat.reason.${reason}`));
      return r;
    },
    onSuccess: () => {
      track('chat.report', { entityType: target.kind, entityId: target.id, reason });
      toast.success(t('chat.report.done'));
      setDetails('');
      onClose();
      onDone?.();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('chat.report.title')}
      description={t('chat.report.body')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>{t('chat.report.submit')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label={t('chat.report.reason')} value={reason} onChange={(v) => setReason(v as (typeof REASONS)[number])} options={REASONS.map((r) => ({ value: r, label: t(`chat.reason.${r}`) }))} />
        <Textarea label={t('chat.report.details')} placeholder={t('chat.report.detailsPlaceholder')} value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} showCount optional />
        {peer && <Checkbox label={t('chat.report.alsoBlock')} checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />}
      </div>
    </Modal>
  );
}

function LeaveDialog({ open, onClose, conv, title, onDone }: { open: boolean; onClose: () => void; conv: ConversationDto; title: string; onDone: () => void }) {
  const t = useT();
  const m = useMutation({
    mutationFn: () => chatApi.leaveConversation(conv.id),
    onSuccess: () => {
      toast.success(t('chat.leave.done'));
      onClose();
      onDone();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('chat.leave.title', { title })}
      description={t('chat.leave.body')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>{t('chat.leave.confirm')}</Button>
        </>
      }
    />
  );
}

function MembersDialog({ open, onClose, conv, meId }: { open: boolean; onClose: () => void; conv: ConversationDto; meId: string }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Modal open={open} onClose={onClose} title={t('chat.membersTitle')} description={t('chat.members', { n: conv.memberCount })} size="sm">
      <ul className="-mx-2 divide-y divide-line">
        {conv.members.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => { onClose(); navigate(`/u/${m.id}`); }} className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left hover:bg-sunken">
              <Avatar size="sm" name={m.name} src={m.avatarUrl} trustLevel={m.trustLevel} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-body text-ink">
                  <span className="truncate">{m.name}</span>
                  <TrustBadge level={m.trustLevel} size="inline" />
                  {m.id === meId && <span className="text-caption text-ink-3">({t('chat.me')})</span>}
                </span>
                {m.program && <span className="block truncate text-caption text-ink-3">{m.program}</span>}
              </span>
              {m.memberRole === 'owner' && <span className="shrink-0 rounded-pill bg-sunken px-2 py-0.5 text-caption text-ink-2">{t('chat.owner')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Delete-own-message confirmation is inline (toast), kept here for symmetry with the other dialogs. */
export async function deleteOwnMessage(m: LocalMessage, t: (k: string) => string): Promise<boolean> {
  try {
    await chatApi.deleteMessage(m.id);
    toast.success(t('chat.toast.deleted'));
    return true;
  } catch (e) {
    toast.error(errorMessage(t as (key: string, vars?: Record<string, string | number>) => string, e));
    return false;
  }
}
