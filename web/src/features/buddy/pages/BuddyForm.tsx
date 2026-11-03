// /post/buddy (create) and /buddy/:id/edit — 3-step form: type → details (type-specific fields) → group & rules.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import type { BuddyType } from '@shared/enums';
import { BuddyType as BUDDY_TYPES } from '@shared/enums';
import { COST_SPLIT_BUDDY_TYPES, DESTINATION_BUDDY_TYPES, TIMED_BUDDY_TYPES, type BuddyInput } from '@shared/schemas/buddy';
import { Button, Checkbox, Chip, Input, PageHeader, SegmentedControl, Select, Skeleton, Switch, Textarea } from '@/components';
import { MapView, type MapMarker } from '@/components/map';
import { Head } from '@/app/Head';
import { RequireTrust } from '@/app/guards';
import { errorMessage, fieldError } from '@/app/errors';
import { useAuth } from '@/lib/auth';
import { useCampus, getCampusById } from '@/lib/campus';
import { campusCenter } from '@/lib/geo';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useBuddyDetail, useBuddyMutations } from '../api';
import { BuddyTypeIcon, LANGUAGES, SafetyCard } from '../shared';

type Occurrence = { key: string; startsAt: string; durationH: string; locationName: string };
type FormState = {
  type: BuddyType;
  title: string;
  description: string;
  flightNo: string;
  direction: 'arrive' | 'depart';
  noTime: boolean;
  isAllDay: boolean;
  startsAt: string; // YYYY-MM-DDTHH:MM (campus-local)
  endsAt: string;
  locationName: string;
  destinationName: string;
  destLat: number | null;
  destLng: number | null;
  costSplit: string; // dollars
  languages: string[];
  maxMembers: number;
  verifiedOnly: boolean;
  minTrustLevel: 1 | 2 | 3;
  requiresApproval: boolean;
  occurrences: Occurrence[];
};

// -------------------------------------------------- campus-local ⇄ ISO
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute')) - at.getTime();
}
function localToIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as number[];
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  return new Date(guess - tzOffsetMs(tz, new Date(guess))).toISOString();
}
function isoToLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}
function defaultStart(tz: string): string {
  const d = new Date(Date.now() + 26 * 3_600_000);
  const local = isoToLocal(d.toISOString(), tz);
  return local.slice(0, 14) + '00';
}
function hoursBetween(a: string | null, b: string | null | undefined): string {
  if (!a || !b) return '2';
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
  return h > 0 ? String(Math.round(h * 2) / 2) : '2';
}

function FormInner({ editId }: { editId?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campus: currentCampus } = useCampus();
  const existing = useBuddyDetail(editId);
  const m = useBuddyMutations(editId);
  const campusId = existing.data?.campusId ?? user?.campusId ?? currentCampus?.id ?? null;
  const campus = getCampusById(campusId) ?? currentCampus;
  const tz = campus?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [step, setStep] = useState<1 | 2 | 3>(editId ? 2 : 1);
  const [f, setF] = useState<FormState>(() => ({
    type: 'airport_pickup', title: '', description: '', flightNo: '', direction: 'arrive', noTime: false, isAllDay: false, startsAt: defaultStart(tz), endsAt: '',
    locationName: '', destinationName: '', destLat: null, destLng: null, costSplit: '', languages: ['zh', 'en'], maxMembers: 4, verifiedOnly: false, minTrustLevel: 1, requiresApproval: false, occurrences: [],
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const patch = (p: Partial<FormState>) => setF((s) => ({ ...s, ...p }));

  // prefill when editing
  useEffect(() => {
    const d = existing.data;
    if (!d || loaded) return;
    const flight = /·\s*([A-Z]{2}\s?\d{2,4})\s*$/.exec(d.locationName ?? '');
    setF({
      type: d.type, title: d.title, description: d.description, flightNo: flight?.[1] ?? '', direction: d.type === 'airport_pickup' && d.destinationName && /airport|ORD|MDW|JFK|LGA|EWR|LAX|CMI|航站楼|机场/i.test(d.destinationName) ? 'depart' : 'arrive',
      noTime: !d.startsAt, isAllDay: d.isAllDay, startsAt: isoToLocal(d.startsAt, tz) || defaultStart(tz), endsAt: isoToLocal(d.endsAt, tz),
      locationName: flight ? (d.locationName ?? '').replace(/·\s*[A-Z]{2}\s?\d{2,4}\s*$/, '').trim() : d.locationName ?? '', destinationName: d.destinationName ?? '', destLat: d.destLat, destLng: d.destLng,
      costSplit: d.costSplitCents ? String(d.costSplitCents / 100) : '', languages: d.languages, maxMembers: d.maxMembers, verifiedOnly: d.verifiedOnly, minTrustLevel: (Math.max(1, d.minTrustLevel) as 1 | 2 | 3),
      requiresApproval: d.requiresApproval,
      occurrences: d.events.filter((e) => e.status === 'scheduled').map((e) => ({ key: e.id, startsAt: isoToLocal(e.startsAt, tz), durationH: hoursBetween(e.startsAt, e.endsAt), locationName: e.locationName ?? '' })),
    });
    setLoaded(true);
  }, [existing.data, loaded, tz]);

  const timed = TIMED_BUDDY_TYPES.includes(f.type);
  const hasDest = DESTINATION_BUDDY_TYPES.includes(f.type);
  const hasCost = COST_SPLIT_BUDDY_TYPES.includes(f.type);
  const isAirport = f.type === 'airport_pickup';
  const canVerifiedOnly = (user?.trustLevel ?? 0) >= 2 || user?.role === 'admin';

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    if (campus) out.push({ id: 'campus', kind: 'campus', lat: campus.lat, lng: campus.lng, label: campus.shortName });
    if (f.destLat != null && f.destLng != null) out.push({ id: 'dest', kind: 'buddy', lat: f.destLat, lng: f.destLng, label: f.destinationName.slice(0, 16) || '•', selected: true });
    return out;
  }, [campus, f.destLat, f.destLng, f.destinationName]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 2) e.title = t('buddy.form.error.title');
    if (!f.noTime) {
      const s = localToIso(f.startsAt, tz);
      if (!s) e.startsAt = t('buddy.form.error.startsAt');
      else {
        if (!editId && new Date(s).getTime() < Date.now() - 3_600_000) e.startsAt = t('buddy.form.pastTime');
        const en = f.endsAt ? localToIso(f.endsAt, tz) : null;
        if (en && new Date(en).getTime() < new Date(s).getTime()) e.endsAt = t('buddy.form.invalidTime');
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const build = (): BuddyInput => {
    const startsAt = f.noTime ? null : localToIso(f.startsAt, tz);
    const endsAt = f.noTime || !f.endsAt ? null : localToIso(f.endsAt, tz);
    const locationName = isAirport && f.flightNo.trim() ? `${f.locationName.trim()} · ${f.flightNo.trim().toUpperCase()}`.replace(/^·\s*/, '') : f.locationName.trim();
    const cost = f.costSplit.trim() ? Math.round(Number(f.costSplit) * 100) : null;
    const events = f.occurrences
      .map((o) => ({ s: localToIso(o.startsAt, tz), o }))
      .filter((x): x is { s: string; o: Occurrence } => !!x.s)
      .map(({ s, o }) => ({ startsAt: s, endsAt: new Date(new Date(s).getTime() + (Number(o.durationH) || 2) * 3_600_000).toISOString(), locationName: o.locationName.trim() || undefined }));
    return {
      type: f.type, title: f.title.trim(), description: f.description.trim(), campusId: campusId ?? undefined,
      startsAt: events.length && !startsAt ? events[0]!.startsAt : startsAt, endsAt, isAllDay: f.isAllDay && !f.noTime,
      locationName: locationName || undefined, lat: campus?.lat, lng: campus?.lng,
      destinationName: hasDest && f.destinationName.trim() ? f.destinationName.trim() : undefined,
      destLat: hasDest && f.destLat != null ? f.destLat : undefined, destLng: hasDest && f.destLng != null ? f.destLng : undefined,
      languages: (f.languages.length ? f.languages : ['zh', 'en']) as BuddyInput['languages'], maxMembers: f.maxMembers,
      verifiedOnly: f.verifiedOnly && canVerifiedOnly, minTrustLevel: f.verifiedOnly ? f.minTrustLevel : 1, requiresApproval: f.requiresApproval,
      costSplitCents: hasCost && cost != null && Number.isFinite(cost) ? cost : null,
      events: events.length ? events : undefined,
    };
  };

  const submit = async () => {
    if (!validate()) {
      setStep(2);
      return;
    }
    const body = build();
    try {
      if (editId) {
        const { campusId: _c, ...rest } = body;
        void _c;
        const d = await m.update.mutateAsync({ ...rest, events: body.events ?? [] });
        toast.success(t('buddy.toast.updated'));
        navigate(`/buddy/${d.id}`, { replace: true });
      } else {
        const d = await m.create.mutateAsync(body);
        toast.success(t('buddy.toast.created'));
        navigate(`/buddy/${d.id}`, { replace: true });
      }
    } catch (e) {
      const fe: Record<string, string> = {};
      for (const k of ['title', 'startsAt', 'endsAt', 'description', 'maxMembers']) {
        const msg = fieldError(t, e, k);
        if (msg) fe[k] = msg;
      }
      setErrors(fe);
      toast.error(errorMessage(t, e));
      if (Object.keys(fe).length) setStep(2);
    }
  };

  if (editId && existing.isPending) {
    return (
      <div className="mx-auto w-full max-w-form px-4 lg:px-8" aria-busy>
        <Skeleton variant="text" lines={6} />
      </div>
    );
  }

  const steps = [t('buddy.form.step.type'), t('buddy.form.step.details'), t('buddy.form.step.rules')];
  const title = editId ? t('buddy.form.editTitle') : t('buddy.form.title');

  return (
    <div className="mx-auto w-full max-w-form px-4 lg:px-8">
      <Head title={title} />
      <PageHeader title={title} back={editId ? `/buddy/${editId}` : '/buddy'} subtitle={campus ? `${t('buddy.form.campus')}：${campus.shortName} · ${t('buddy.form.campusHint')}` : undefined} />
      {/* progress: caption + 2 px accent bar (DESIGN §7.4) */}
      <div className="mb-6">
        <p className="text-caption text-ink-2">
          {t('buddy.form.stepOf', { n: step, total: 3 })} · {steps[step - 1]}
        </p>
        <div className="mt-2 h-0.5 w-full rounded-pill bg-line" aria-hidden>
          <div className="h-full rounded-pill bg-accent transition-[width] duration-token-base ease-out" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      {step === 1 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-h3 text-ink">{t('buddy.form.typeLabel')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {BUDDY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={f.type === type}
                onClick={() => patch({ type, noTime: !TIMED_BUDDY_TYPES.includes(type) })}
                className={cn(
                  'flex items-center gap-3 rounded-card border p-3 text-left transition-colors duration-token-fast ease-out',
                  f.type === type ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-sm', f.type === type ? 'bg-surface text-accent-text-strong' : 'bg-sunken text-ink-2')}>
                  <BuddyTypeIcon type={type} size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-semibold text-ink">{t(`buddy.type.${type}`)}</span>
                  <span className="block text-caption text-ink-2">{t(`buddy.form.typeHint.${type}`)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" iconRight={<ArrowRight />} onClick={() => setStep(2)}>
              {t('common.next')}
            </Button>
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2 text-small text-ink-2">
            <Chip icon={<BuddyTypeIcon type={f.type} size={12} />}>{t(`buddy.type.${f.type}`)}</Chip>
            {!editId && (
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                {t('common.change')}
              </Button>
            )}
          </div>
          <Input label={t('buddy.form.titleLabel')} required value={f.title} onChange={(e) => patch({ title: e.target.value })} placeholder={t(`buddy.form.titlePlaceholder.${f.type}`)} maxLength={120} error={errors.title} />

          {isAirport && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SegmentedControl
                className="sm:col-span-2"
                label={t('buddy.form.direction')}
                fullWidth
                value={f.direction}
                onChange={(v) => patch({ direction: v })}
                options={[
                  { value: 'arrive', label: t('buddy.form.direction.arrive') },
                  { value: 'depart', label: t('buddy.form.direction.depart') },
                ]}
              />
              <Input label={t('buddy.form.flightNo')} value={f.flightNo} onChange={(e) => patch({ flightNo: e.target.value })} placeholder={t('buddy.form.flightNoPlaceholder')} maxLength={10} optional />
              <Input label={t('buddy.form.flightTime')} required type="datetime-local" value={f.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} error={errors.startsAt} suffix={campus ? <span className="text-caption text-ink-3">{campus.shortName}</span> : undefined} />
              <Input
                className="sm:col-span-2"
                label={f.direction === 'arrive' ? t('buddy.form.airport') : t('buddy.form.location')}
                value={f.locationName}
                onChange={(e) => patch({ locationName: e.target.value })}
                placeholder={f.direction === 'arrive' ? t('buddy.form.airportPlaceholder') : t('buddy.form.locationPlaceholder')}
                maxLength={100}
              />
            </div>
          )}

          {!isAirport && timed && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t('buddy.form.startsAt')} required type="datetime-local" value={f.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} error={errors.startsAt} disabled={f.noTime} />
              <Input label={t('buddy.form.endsAtOptional')} type="datetime-local" value={f.endsAt} min={f.startsAt} onChange={(e) => patch({ endsAt: e.target.value })} error={errors.endsAt} disabled={f.noTime} />
              <div className="flex flex-wrap gap-4 sm:col-span-2">
                <Checkbox label={t('buddy.form.allDay')} checked={f.isAllDay} onChange={(e) => patch({ isAllDay: e.target.checked })} disabled={f.noTime} />
                <Checkbox label={t('buddy.form.noTime')} checked={f.noTime} onChange={(e) => patch({ noTime: e.target.checked })} />
              </div>
            </div>
          )}
          {!isAirport && !timed && (
            <Checkbox label={t('buddy.form.noTime')} description={t('buddy.form.typeHint.roommate')} checked={f.noTime} onChange={(e) => patch({ noTime: e.target.checked })} />
          )}
          {!isAirport && !timed && !f.noTime && (
            <Input label={t('buddy.form.startsAt')} type="datetime-local" value={f.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} error={errors.startsAt} />
          )}
          {!isAirport && (
            <Input label={t('buddy.form.location')} value={f.locationName} onChange={(e) => patch({ locationName: e.target.value })} placeholder={t('buddy.form.locationPlaceholder')} maxLength={100} />
          )}

          {hasDest && (
            <div className="flex flex-col gap-2">
              <Input
                label={t('buddy.form.destination')}
                value={f.destinationName}
                onChange={(e) => patch({ destinationName: e.target.value })}
                placeholder={isAirport && f.direction === 'depart' ? t('buddy.form.airportPlaceholder') : t('buddy.form.destinationPlaceholder')}
                maxLength={100}
                hint={t('buddy.form.destinationMapHint')}
              />
              <div className="overflow-hidden rounded-card border border-line">
                <MapView
                  center={campusCenter(campus)}
                  zoom={11}
                  height={220}
                  markers={markers}
                  locate={false}
                  clusterThreshold={Infinity}
                  onMapReady={(map) => {
                    map.on('click', (e: { latlng: { lat: number; lng: number } }) => patch({ destLat: +e.latlng.lat.toFixed(5), destLng: +e.latlng.lng.toFixed(5) }));
                  }}
                  aria-label={t('buddy.form.destination')}
                />
              </div>
              {f.destLat != null && (
                <div className="flex items-center gap-2 text-caption text-ink-2">
                  <Check size={14} aria-hidden /> {t('buddy.form.pinSet')} · {f.destLat}, {f.destLng}
                  <Button variant="ghost" size="sm" onClick={() => patch({ destLat: null, destLng: null })}>
                    {t('buddy.form.pinClear')}
                  </Button>
                </div>
              )}
            </div>
          )}

          <Textarea label={t('buddy.form.descriptionLabel')} hint={t('buddy.form.descriptionHint')} rows={4} maxRows={10} maxLength={3000} showCount value={f.description} onChange={(e) => patch({ description: e.target.value })} error={errors.description} />

          {hasCost && (
            <Input label={t('buddy.form.costSplit')} hint={t('buddy.form.costSplitHint')} type="number" inputMode="decimal" min={0} step={1} prefix="$" value={f.costSplit} onChange={(e) => patch({ costSplit: e.target.value })} optional className="sm:w-56" />
          )}

          {(f.type === 'study' || f.type === 'gym' || f.type === 'costco_run' || f.type === 'event' || f.type === 'travel') && (
            <section className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-body font-semibold text-ink">{t('buddy.form.recurring')}</h2>
                  <p className="text-caption text-ink-2">{t('buddy.form.recurringHint')}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Plus />}
                  onClick={() => {
                    const last = f.occurrences[f.occurrences.length - 1];
                    const base = last ? localToIso(last.startsAt, tz) : localToIso(f.startsAt, tz);
                    const next = base ? isoToLocal(new Date(new Date(base).getTime() + 7 * 86_400_000).toISOString(), tz) : f.startsAt;
                    patch({ occurrences: [...f.occurrences, { key: `${Date.now()}`, startsAt: next, durationH: last?.durationH ?? '2', locationName: '' }] });
                  }}
                >
                  {t('buddy.form.addOccurrence')}
                </Button>
              </div>
              {f.occurrences.length > 0 && (
                <ul className="mt-3 flex flex-col gap-3">
                  {f.occurrences.map((o, i) => (
                    <li key={o.key} className="grid items-end gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
                      <Input label={t('buddy.form.occurrence', { n: i + 1 })} type="datetime-local" size="sm" value={o.startsAt} onChange={(e) => patch({ occurrences: f.occurrences.map((x) => (x.key === o.key ? { ...x, startsAt: e.target.value } : x)) })} />
                      <Input label="h" type="number" size="sm" min={0.5} step={0.5} value={o.durationH} onChange={(e) => patch({ occurrences: f.occurrences.map((x) => (x.key === o.key ? { ...x, durationH: e.target.value } : x)) })} />
                      <Input label={t('buddy.form.location')} size="sm" value={o.locationName} placeholder={f.locationName} onChange={(e) => patch({ occurrences: f.occurrences.map((x) => (x.key === o.key ? { ...x, locationName: e.target.value } : x)) })} />
                      <Button variant="ghost" size="sm" iconOnly aria-label={t('buddy.form.removeOccurrence')} onClick={() => patch({ occurrences: f.occurrences.filter((x) => x.key !== o.key) })}>
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="mt-2 flex justify-between">
            <Button variant="ghost" iconLeft={<ArrowLeft />} onClick={() => (editId ? navigate(-1) : setStep(1))}>
              {t('common.back')}
            </Button>
            <Button
              variant="primary"
              iconRight={<ArrowRight />}
              onClick={() => {
                if (validate()) setStep(3);
              }}
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t('buddy.form.maxMembers')}
              value={String(f.maxMembers)}
              onChange={(v) => patch({ maxMembers: Number(v) })}
              options={[2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 50].map((n) => ({ value: String(n), label: `${n}` }))}
            />
            <div>
              <p className="mb-1.5 text-small font-medium text-ink">{t('buddy.form.languages')}</p>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => {
                  const on = f.languages.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on}
                      onClick={() => patch({ languages: on ? f.languages.filter((x) => x !== l) : [...f.languages, l] })}
                      className={cn('h-8 rounded-pill border px-3 text-small transition-colors duration-token-fast', on ? 'border-inverse bg-inverse text-ink-inverse' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}
                    >
                      {t(`buddy.lang.${l}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
            <Switch label={t('buddy.form.verifiedOnly')} description={t('buddy.form.verifiedOnlyHint')} checked={f.verifiedOnly && canVerifiedOnly} disabled={!canVerifiedOnly} onChange={(v) => patch({ verifiedOnly: v })} />
            {f.verifiedOnly && canVerifiedOnly && (
              <Select
                label={t('buddy.form.minTrust')}
                value={String(f.minTrustLevel)}
                onChange={(v) => patch({ minTrustLevel: Number(v) as 1 | 2 | 3 })}
                options={[1, 2, 3].map((n) => ({ value: String(n), label: t(`buddy.form.minTrust.${n}`) }))}
                className="sm:w-64"
              />
            )}
            <Switch label={t('buddy.form.requiresApproval')} description={t('buddy.form.requiresApprovalHint')} checked={f.requiresApproval} onChange={(v) => patch({ requiresApproval: v })} />
          </div>
          <SafetyCard compact />
          <p className="text-caption text-ink-3">{t('buddy.form.safetyReminder')}</p>
          <div className="mt-2 flex justify-between">
            <Button variant="ghost" iconLeft={<ArrowLeft />} onClick={() => setStep(2)}>
              {t('common.back')}
            </Button>
            <Button variant="primary" iconLeft={<Check />} loading={m.create.isPending || m.update.isPending} onClick={submit}>
              {editId ? t('buddy.form.save') : t('buddy.form.submit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuddyForm() {
  const { id } = useParams<{ id?: string }>();
  return (
    <RequireTrust level={1} reason="post">
      <FormInner editId={id} />
    </RequireTrust>
  );
}
