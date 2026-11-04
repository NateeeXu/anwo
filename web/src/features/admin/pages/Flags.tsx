// /admin/flags — 功能开关: switch per row (reason required, audited, broadcast live via ws `system.flags`),
// JSON config + per-campus scoping editor, create + delete for non-core flags.
import { useEffect, useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { AdminFlag } from '@shared/schemas/admin';
import { Badge, Button, Chip, Input, Modal, Switch, Table, Textarea } from '@/components';
import { useCampus, getCampusById } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { errorMessage } from '@/app/errors';
import { Head } from '@/app/Head';
import { adminApi, useAdminMutation, useFlags } from '../api';
import { CampusFilter, ErrorState, PageTitle, ReasonDialog } from '../ui';

const CORE = new Set(['boosts.enabled', 'pro.enabled', 'escrow.enabled', 'affiliate.enabled', 'nationwide.enabled', 'scam_banner.enabled', 'verified_only_default', 'maintenance_banner']);

export default function Flags() {
  const t = useT();
  const { formatRelative } = useLocale();
  const flags = useFlags();
  const [q, setQ] = useState('');
  const [toggle, setToggle] = useState<AdminFlag | null>(null);
  const [edit, setEdit] = useState<AdminFlag | 'new' | null>(null);
  const [del, setDel] = useState<AdminFlag | null>(null);
  const put = useAdminMutation((v: { key: string; body: Record<string, unknown> }) => adminApi.putFlag(v.key, v.body));
  const remove = useAdminMutation((v: { key: string; reason: string }) => adminApi.deleteFlag(v.key, v.reason));
  const rows = useMemo(() => (flags.data ?? []).filter((f) => !q || f.key.includes(q.toLowerCase()) || (f.description ?? '').toLowerCase().includes(q.toLowerCase())), [flags.data, q]);
  const on = (flags.data ?? []).filter((f) => f.enabled).length;

  return (
    <div className="flex flex-col gap-5">
      <Head title={t('admin.nav.flags')} />
      <PageTitle
        title={t('admin.nav.flags')}
        subtitle={flags.data ? t('admin.flags.subtitle', { on, total: flags.data.length }) : undefined}
        actions={
          <Button iconLeft={<Plus />} onClick={() => setEdit('new')} data-testid="flag-new">
            {t('admin.flags.new')}
          </Button>
        }
      />
      <div className="max-w-sm">
        <Input size="sm" iconLeft={<Search />} placeholder={t('admin.flags.search')} aria-label={t('admin.flags.search')} value={q} onChange={(e) => setQ(e.target.value)} clearable />
      </div>
      {flags.isError ? (
        <ErrorState error={flags.error} onRetry={() => void flags.refetch()} />
      ) : (
        <Table<AdminFlag>
          rows={rows}
          rowKey="key"
          loading={flags.isLoading}
          caption={t('admin.nav.flags')}
          data-testid="flags-table"
          columns={[
            {
              key: 'enabled',
              header: t('admin.flags.state'),
              width: 96,
              render: (f) => (
                <Switch
                  checked={f.enabled}
                  disabled={f.locked && f.enabled}
                  aria-label={t('admin.flags.toggle', { key: f.key })}
                  onChange={() => setToggle(f)}
                  data-flag={f.key}
                />
              ),
            },
            {
              key: 'key',
              header: t('admin.flags.key'),
              render: (f) => (
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-small text-ink">
                    {t(`admin.flag.${f.key}`) !== `admin.flag.${f.key}` ? t(`admin.flag.${f.key}`) : f.key}
                    {f.locked && <Lock size={12} className="text-ink-3" aria-label={t('admin.flags.locked')} />}
                  </p>
                  <p className="font-mono text-caption text-ink-3">{f.key}</p>
                  <p className="truncate text-caption text-ink-3">{f.description}</p>
                </div>
              ),
            },
            {
              key: 'scope',
              header: t('admin.flags.scope'),
              hideOnMobile: true,
              render: (f) =>
                f.campusIds.length ? (
                  <span className="text-small text-ink-2">{f.campusIds.map((c) => getCampusById(c)?.shortName ?? c).join(', ')}</span>
                ) : (
                  <span className="text-small text-ink-3">{t('admin.flags.allCampuses')}</span>
                ),
            },
            { key: 'value', header: t('admin.flags.value'), hideOnMobile: true, render: (f) => (f.value === null ? <span className="text-ink-3">—</span> : <code className="line-clamp-1 max-w-[220px] font-mono text-caption text-ink-2">{JSON.stringify(f.value)}</code>) },
            {
              key: 'updated',
              header: t('admin.flags.updated'),
              width: 190,
              hideOnMobile: true,
              render: (f) => (
                <div className="flex flex-col text-caption">
                  <span className="truncate text-ink-2">{f.updatedByUser?.name ?? t('admin.common.system')}</span>
                  <span className="whitespace-nowrap text-ink-3">{formatRelative(f.updatedAt)}</span>
                </div>
              ),
            },
          ]}
          rowActions={(f) => (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" iconOnly aria-label={t('admin.flags.edit', { key: f.key })} onClick={() => setEdit(f)}>
                <Pencil />
              </Button>
              {!CORE.has(f.key) && !f.locked && (
                <Button size="sm" variant="ghost" iconOnly aria-label={t('admin.flags.delete', { key: f.key })} onClick={() => setDel(f)}>
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        />
      )}

      <ReasonDialog
        open={!!toggle}
        danger={!!toggle?.enabled}
        title={toggle ? t(toggle.enabled ? 'admin.flags.confirmOff' : 'admin.flags.confirmOn', { key: toggle.key }) : ''}
        description={t('admin.flags.liveHint')}
        confirmLabel={toggle?.enabled ? t('admin.flags.turnOff') : t('admin.flags.turnOn')}
        onClose={() => setToggle(null)}
        onConfirm={async (reason) => {
          const f = toggle!;
          await put.mutateAsync({ key: f.key, body: { enabled: !f.enabled, reason } });
          toast.success(t(f.enabled ? 'admin.flags.offDone' : 'admin.flags.onDone', { key: f.key }));
        }}
      />
      <ReasonDialog
        open={!!del}
        danger
        title={del ? t('admin.flags.confirmDelete', { key: del.key }) : ''}
        description={t('admin.flags.deleteHint')}
        confirmLabel={t('admin.flags.deleteVerb')}
        onClose={() => setDel(null)}
        onConfirm={async (reason) => {
          await remove.mutateAsync({ key: del!.key, reason });
          toast.success(t('admin.flags.deleted'));
        }}
      />
      <FlagEditor flag={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function FlagEditor({ flag, onClose }: { flag: AdminFlag | 'new' | null; onClose: () => void }) {
  const t = useT();
  const { campuses } = useCampus();
  const isNew = flag === 'new';
  const [key, setKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [campusIds, setCampusIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const qcMut = useAdminMutation((v: { body: Record<string, unknown> }) => (isNew ? adminApi.createFlag(v.body) : adminApi.putFlag((flag as AdminFlag).key, v.body)));

  useEffect(() => {
    if (!flag) return;
    setErrors({});
    setReason('');
    if (flag === 'new') {
      setKey('');
      setEnabled(false);
      setDescription('');
      setValue('');
      setCampusIds([]);
    } else {
      setKey(flag.key);
      setEnabled(flag.enabled);
      setDescription(flag.description ?? '');
      setValue(flag.value === null ? '' : JSON.stringify(flag.value, null, 2));
      setCampusIds(flag.campusIds);
    }
  }, [flag]);

  const save = async () => {
    const errs: Record<string, string> = {};
    let parsed: unknown = null;
    if (value.trim()) {
      try {
        parsed = JSON.parse(value);
      } catch {
        errs.value = t('admin.flags.badJson');
      }
    }
    if (isNew && !/^[a-z][a-z0-9_.]{2,63}$/.test(key)) errs.key = t('admin.flags.badKey');
    if (!isNew && reason.trim().length < 3) errs.reason = t('admin.reason.tooShort');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await qcMut.mutateAsync({ body: { ...(isNew ? { key } : {}), enabled, description: description || undefined, value: parsed, campusIds, reason: reason || undefined } });
      toast.success(isNew ? t('admin.flags.created', { key }) : t('admin.flags.saved', { key }));
      onClose();
    } catch (e) {
      setErrors({ form: errorMessage(t, e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!flag}
      onClose={onClose}
      title={isNew ? t('admin.flags.new') : t('admin.flags.editTitle')}
      description={isNew ? t('admin.flags.newHint') : key}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} onClick={save} data-testid="flag-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {isNew && <Input label={t('admin.flags.key')} placeholder="e.g. housing.tours_enabled" value={key} onChange={(e) => setKey(e.target.value.trim())} error={errors.key} name="flag-key" />}
        <Switch label={t('admin.flags.enabled')} checked={enabled} onChange={setEnabled} disabled={flag !== 'new' && !!flag?.locked && enabled} />
        <Input label={t('admin.flags.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} name="flag-description" />
        <Textarea label={t('admin.flags.value')} hint={t('admin.flags.valueHint')} rows={5} value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} className="font-mono" name="flag-value" />
        <div className="flex flex-col gap-2">
          <p className="text-small font-medium text-ink">{t('admin.flags.scope')}</p>
          <p className="text-caption text-ink-3">{t('admin.flags.scopeHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            {campusIds.length === 0 && <Badge size="sm">{t('admin.flags.allCampuses')}</Badge>}
            {campusIds.map((c) => (
              <Chip key={c} size="sm" onRemove={() => setCampusIds(campusIds.filter((x) => x !== c))}>
                {campuses.find((x) => x.id === c)?.shortName ?? c}
              </Chip>
            ))}
          </div>
          <CampusFilter value={null} label={t('admin.flags.addCampus')} onChange={(id) => id && !campusIds.includes(id) && setCampusIds([...campusIds, id])} />
          {campusIds.length > 0 && (
            <Button variant="ghost" size="sm" iconLeft={<X />} onClick={() => setCampusIds([])} className="self-start">
              {t('admin.flags.clearScope')}
            </Button>
          )}
        </div>
        {!isNew && <Textarea label={t('admin.reason.label')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} name="flag-reason" />}
        {errors.form && (
          <p role="alert" className="text-small text-danger">
            {errors.form}
          </p>
        )}
      </div>
    </Modal>
  );
}
