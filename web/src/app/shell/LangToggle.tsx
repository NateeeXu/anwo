// 中 / EN toggle (SegmentedControl sm) bound to useLocale().
import { SegmentedControl } from '../../components';
import { useLocale, useT } from '../../lib/i18n';
import { cn } from '../../lib/cn';

export function LangToggle({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'md' }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <div className={cn('shrink-0', className)} aria-label={t('nav.language')}>
      <SegmentedControl
        size={size}
        value={locale}
        onChange={(v: string) => setLocale(v as 'zh-CN' | 'en')}
        options={[
          { value: 'zh-CN', label: '中' },
          { value: 'en', label: 'EN' },
        ]}
      />
    </div>
  );
}

export default LangToggle;
