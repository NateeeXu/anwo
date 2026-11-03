// /post/wanted (create) and /wanted/:id/edit — single-page form with an area picker (MapView circles + city / campus).
import { CircleAlert, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { MUST_HAVE_KEYS, WantedInput, type AreaInput } from '@shared/schemas/wanted';
import { PropertyType } from '@shared/enums';
import { Button, Checkbox, DateRange, EmptyState, FilterChip, Input, PriceRange, SegmentedControl, Select, Switch, Textarea } from '@/components';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { errorMessage, fieldError } from '@/app/errors';
import { PageSkeleton } from '@/app/PageSkeleton';
import { RequireTrust } from '@/app/guards';
import { createWanted, patchWanted, useInvalidateWanted, useWanted } from '../api';
import { areaToInput, BUDGET_BOUNDS, BUDGET_STEP } from '../lib';
import { AreaPicker } from '../components/AreaPicker';

type FormState = {
  title: string; description: string; scope: 'campus' | 'nationwide'; campusId: string;
  budgetMinCents: number; budgetMaxCents: number; moveInFrom: string | null; moveInTo: string | null; moveOutDate: string | null; flexibleDays: number;
  groupSize: number; bedroomsMin: number; furnishedPref: 'any' | 'partial' | 'full'; genderPref: 'any' | 'female' | 'male'; hasPets: boolean; needsParking: boolean;
  propertyTypes: string[]; mustHaves: string[]; niceToHaves: string[]; areas: AreaInput[];
};
const DRAFT_KEY = 'anwo.wanted.draft';

function emptyForm(campusId: string): FormState {
  return {
    title: '', description: '', scope: 'campus', campusId, budgetMinCents: 80_000, budgetMaxCents: 140_000, moveInFrom: null, moveInTo: null, moveOutDate: null, flexibleDays: 7,
    groupSize: 1, bedroomsMin: 0, furnishedPref: 'any', genderPref: 'any', hasPets: false, needsParking: false, propertyTypes: [], mustHaves: [], niceToHaves: [], areas: [],
  };
}

function toInput(f: FormState) {
  return {
    title: f.title.trim(), description: f.description.trim(), campusId: f.campusId || undefined, scope: f.scope,
    budgetMinCents: Math.round(f.budgetMinCents), budgetMaxCents: Math.round(f.budgetMaxCents), moveInFrom: f.moveInFrom ?? '', moveInTo: f.moveInTo ?? '', moveOutDate: f.moveOutDate,
    flexibleDays: f.flexibleDays, groupSize: f.groupSize, bedroomsMin: f.bedroomsMin, furnishedPref: f.furnishedPref, genderPref: f.genderPref, hasPets: f.hasPets, needsParking: f.needsParking,
    propertyTypes: f.propertyTypes as z.infer<typeof WantedInput>['propertyTypes'], mustHaves: f.mustHaves, niceToHaves: f.niceToHaves, areas: f.areas,
  };
}

function FormInner({ editId }: { editId?: string }) {
  const t = useT();
  const { formatMoneyRange } = useLocale();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campus, campusId, campuses } = useCampus();
  const invalidate = useInvalidateWanted();
  const existing = useWanted(editId);
  const [form, setForm] = useState<FormState>(() => emptyForm(user?.campusId ?? campusId ?? 'northwestern'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedDraft, setLoadedDraft] = useState(false);
  const [hydrated, setHydrated] = useState(!editId);
  const summaryRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: 'propertyTypes' | 'mustHaves' | 'niceToHaves', v: string) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  // edit: hydrate from the post
  useEffect(() => {
    if (!editId || !existing.data || hydrated) return;
    const w = existing.data;
    setForm({
      title: w.title, description: w.description, scope: w.scope, campusId: w.campusId, budgetMinCents: w.budgetMinCents, budgetMaxCents: w.budgetMaxCents,
      moveInFrom: w.moveInFrom, moveInTo: w.moveInTo, moveOutDate: w.moveOutDate, flexibleDays: w.flexibleDays, groupSize: w.groupSize, bedroomsMin: w.bedroomsMin,
      furnishedPref: w.furnishedPref, genderPref: w.genderPref, hasPets: w.hasPets, needsParking: w.needsParking, propertyTypes: w.propertyTypes, mustHaves: w.mustHaves,
      niceToHaves: w.niceToHaves, areas: w.areas.map(areaToInput).filter((a): a is AreaInput => !!a),
    });
    setHydrated(true);
  }, [editId, existing.data, hydrated]);
  // create: restore / autosave a local draft
  useEffect(() => {
    if (editId || loadedDraft) return;
    const d = storage.get<Partial<FormState> | null>(DRAFT_KEY, null);
    if (d && typeof d === 'object') setForm((f) => ({ ...f, ...d }));
    setLoadedDraft(true);
  }, [editId, loadedDraft]);
  useEffect(() => {
    if (editId || !loadedDraft) return;
    const id = window.setTimeout(() => storage.set(DRAFT_KEY, form), 400);
    return () => window.clearTimeout(id);
  }, [form, editId, loadedDraft]);

  const campusObj = campuses.find((c) => c.id === form.campusId) ?? campus;
  const campusOptions = useMemo(() => campuses.map((c) => ({ value: c.id, label: c.nameZh ? `${c.nameZh} · ${c.shortName}` : c.name, description: `${c.city}, ${c.state}`, text: `${c.name} ${c.nameZh ?? ''}` })), [campuses]);

  const mutation = useMutation({
    mutationFn: () => (editId ? patchWanted(editId, toInput(form)) : createWanted(toInput(form) as z.infer<typeof WantedInput>)),
    onSuccess: (w) => {
      if (!editId) storage.remove(DRAFT_KEY);
      track(editId ? 'wanted.update' : 'wanted.create', { entityType: 'wanted', entityId: w.id });
      invalidate(w.id);
      toast.success(editId ? t('wanted.form.updated') : t('wanted.form.created'), !editId && w.matchCount > 0 ? t('wanted.form.createdMatches', { n: w.matchCount }) : undefined);
      navigate(`/wanted/${w.id}`);
    },
    onError: (e) => {
      const fields: Record<string, string> = {};
      for (const k of Object.keys(form)) { const m = fieldError(t, e, k); if (m) fields[k] = m; }
      setErrors(fields);
      toast.error(errorMessage(t, e));
      summaryRef.current?.focus();
    },
  });

  const submit = () => {
    const parsed = WantedInput.safeParse(toInput(form));
    const next: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) { const k = String(issue.path[0] ?? ''); if (k && !next[k]) next[k] = t(`wanted.form.errors.${k}`, { n: 0 }) === `wanted.form.errors.${k}` ? issue.message : t(`wanted.form.errors.${k}`); }
    if (form.scope === 'nationwide' && form.areas.length === 0) next.areas = t('wanted.form.errors.areasNationwide');
    setErrors(next);
    if (Object.keys(next).length) { summaryRef.current?.focus(); return; }
    mutation.mutate();
  };

  if (editId && existing.isPending) return <PageSkeleton />;
  if (editId && (existing.isError || !existing.data)) return <div className="mx-auto max-w-form px-4"><EmptyState icon={CircleAlert} title={t('wanted.detail.notFound')} action={{ label: t('wanted.detail.backToBrowse'), onClick: () => navigate('/wanted') }} /></div>;
  if (editId && existing.data && user && existing.data.author.id !== user.id && user.role !== 'admin') return <div className="mx-auto max-w-form px-4"><EmptyState icon={CircleAlert} title={t('wanted.matchesPage.notOwner')} action={{ label: t('common.back'), onClick: () => navigate(-1) }} /></div>;

  const errorList = Object.entries(errors);
  const sectionCls = 'flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-5';
  const h2Cls = 'text-h3 text-ink';

  return (
    <div className="mx-auto w-full max-w-form px-4 pb-28 lg:px-8 lg:pb-8">
      <Head title={editId ? t('wanted.form.editTitle') : t('wanted.post.wanted.title')} />
      <div className="py-4">
        <h1 className="text-h1 text-ink">{editId ? t('wanted.form.editTitle') : t('wanted.post.wanted.title')}</h1>
        <p className="mt-1 text-small text-ink-2">{t('wanted.form.intro')}</p>
      </div>
      {errorList.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="mb-4 rounded-card border border-danger-soft bg-danger-soft p-3 text-small text-danger">
          <p className="font-semibold">{t('wanted.form.fixErrors', { n: errorList.length })}</p>
          <ul className="mt-1 list-disc pl-5">{errorList.map(([k, v]) => <li key={k}>{t(`wanted.form.field.${k}`)}: {v}</li>)}</ul>
        </div>
      )}
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <section className={sectionCls}>
          <h2 className={h2Cls}>{t('wanted.form.sectionBasics')}</h2>
          <Input label={t('wanted.form.title')} required value={form.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder={t('wanted.form.titlePlaceholder')} error={errors.title} hint={t('wanted.form.titleHint')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SegmentedControl
              label={t('wanted.form.scope')}
              fullWidth
              value={form.scope}
              onChange={(v) => set('scope', v)}
              options={[{ value: 'campus', label: t('wanted.form.scopeCampus') }, { value: 'nationwide', label: t('wanted.form.scopeNationwide') }]}
            />
            <Select label={t('wanted.form.campus')} value={form.campusId} onChange={(v) => set('campusId', v)} options={campusOptions} searchable error={errors.campusId} />
          </div>
          <p className="-mt-2 text-caption text-ink-3">{form.scope === 'nationwide' ? t('wanted.form.scopeNationwideHint') : t('wanted.form.scopeCampusHint')}</p>
          <Textarea label={t('wanted.form.description')} optional rows={5} maxLength={3000} showCount value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={t('wanted.form.descriptionPlaceholder')} error={errors.description} />
        </section>

        <section className={sectionCls}>
          <h2 className={h2Cls}>{t('wanted.form.sectionBudget')}</h2>
          <PriceRange label={t('wanted.form.budget')} value={[form.budgetMinCents, form.budgetMaxCents]} bounds={BUDGET_BOUNDS} step={BUDGET_STEP} unit="/mo" onChange={([lo, hi]) => setForm((f) => ({ ...f, budgetMinCents: lo, budgetMaxCents: hi }))} />
          <p className="-mt-2 text-small text-ink-2">{t('wanted.form.budgetSummary', { range: formatMoneyRange(form.budgetMinCents, form.budgetMaxCents) })}</p>
          {errors.budgetMaxCents && <p className="text-small text-danger" role="alert">{errors.budgetMaxCents}</p>}
        </section>

        <section className={sectionCls}>
          <h2 className={h2Cls}>{t('wanted.form.sectionDates')}</h2>
          <DateRange label={t('wanted.form.moveInWindow')} hint={t('wanted.form.moveInHint')} value={{ start: form.moveInFrom, end: form.moveInTo }} onChange={(v) => setForm((f) => ({ ...f, moveInFrom: v.start, moveInTo: v.end }))} error={errors.moveInFrom ?? errors.moveInTo} months={2} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input type="date" label={t('wanted.form.moveOut')} optional value={form.moveOutDate ?? ''} min={form.moveInFrom ?? undefined} onChange={(e) => set('moveOutDate', e.target.value || null)} hint={t('wanted.form.moveOutHint')} error={errors.moveOutDate} />
            <Select label={t('wanted.form.flexibleDays')} value={String(form.flexibleDays)} onChange={(v) => set('flexibleDays', Number(v))} options={[0, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d === 0 ? t('wanted.form.flexNone') : t('wanted.form.flexDays', { n: d }) }))} />
          </div>
        </section>

        <section className={sectionCls}>
          <h2 className={h2Cls}>{t('wanted.form.sectionNeeds')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label={t('wanted.form.groupSize')} value={String(form.groupSize)} onChange={(v) => set('groupSize', Number(v))} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: n === 1 ? t('wanted.group.one') : t('wanted.group.n', { n }) }))} />
            <Select label={t('wanted.form.bedroomsMin')} value={String(form.bedroomsMin)} onChange={(v) => set('bedroomsMin', Number(v))} options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 0 ? t('wanted.bedrooms.any') : t('wanted.bedrooms.min', { n }) }))} />
            <Select label={t('wanted.form.furnished')} value={form.furnishedPref} onChange={(v) => set('furnishedPref', v as FormState['furnishedPref'])} options={(['any', 'partial', 'full'] as const).map((v) => ({ value: v, label: t(`wanted.furnished.${v}`) }))} />
            <Select label={t('wanted.form.genderPref')} value={form.genderPref} onChange={(v) => set('genderPref', v as FormState['genderPref'])} options={(['any', 'female', 'male'] as const).map((v) => ({ value: v, label: t(`wanted.gender.${v}`) }))} />
          </div>
          <fieldset>
            <legend className="mb-1.5 text-caption text-ink-2">{t('wanted.form.propertyTypes')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {PropertyType.map((p) => <FilterChip key={p} selected={form.propertyTypes.includes(p)} onClick={() => toggle('propertyTypes', p)}>{t(`wanted.propertyType.${p}`)}</FilterChip>)}
            </div>
            <p className="mt-1 text-caption text-ink-3">{t('wanted.form.propertyTypesHint')}</p>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Switch label={t('wanted.form.hasPets')} description={t('wanted.form.hasPetsHint')} checked={form.hasPets} onChange={(v) => set('hasPets', v)} />
            <Switch label={t('wanted.form.needsParking')} description={t('wanted.form.needsParkingHint')} checked={form.needsParking} onChange={(v) => { set('needsParking', v); if (v && !form.mustHaves.includes('parking')) toggle('mustHaves', 'parking'); }} />
          </div>
        </section>

        <section className={sectionCls}>
          <h2 className={h2Cls}>{t('wanted.form.sectionMustHaves')}</h2>
          <fieldset>
            <legend className="mb-1.5 text-caption text-ink-2">{t('wanted.form.mustHaves')} <span className="text-ink-3">· {t('wanted.form.mustHavesHint')}</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {MUST_HAVE_KEYS.map((k) => <FilterChip key={k} selected={form.mustHaves.includes(k)} onClick={() => toggle('mustHaves', k)}>{t(`wanted.mustHave.${k}`)}</FilterChip>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-caption text-ink-2">{t('wanted.form.niceToHaves')} <span className="text-ink-3">· {t('wanted.form.niceToHavesHint')}</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {MUST_HAVE_KEYS.filter((k) => !form.mustHaves.includes(k)).map((k) => <FilterChip key={k} size="sm" selected={form.niceToHaves.includes(k)} onClick={() => toggle('niceToHaves', k)}>{t(`wanted.mustHave.${k}`)}</FilterChip>)}
            </div>
          </fieldset>
        </section>

        <section className={sectionCls}>
          <h2 className={h2Cls}>{t('wanted.form.sectionAreas')}</h2>
          <p className="-mt-2 text-small text-ink-2">{t('wanted.form.areasHint')}</p>
          <AreaPicker value={form.areas} onChange={(areas) => set('areas', areas)} campus={campusObj} error={errors.areas} />
        </section>

        <section className={cn(sectionCls, 'bg-sunken')}>
          <Checkbox label={t('wanted.form.consent')} description={t('wanted.form.consentHint')} checked readOnly />
        </section>

        <div className="fixed inset-x-0 bottom-14 z-layer-sticky flex items-center gap-2 border-t border-line bg-surface/95 px-4 py-2.5 pb-safe lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
          <span className="ml-auto text-caption text-ink-3 max-lg:hidden">{!editId && t('wanted.form.draftSaved')}</span>
          <Button type="submit" variant="primary" size="lg" iconLeft={<Save />} loading={mutation.isPending}>{editId ? t('common.save') : t('common.publish')}</Button>
        </div>
      </form>
    </div>
  );
}

export default function WantedPostForm() {
  const { id } = useParams();
  return (
    <RequireTrust level={1} reason="post">
      <FormInner editId={id} />
    </RequireTrust>
  );
}
