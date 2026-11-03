// Browse pages' underline tabs: 转租 · 求租 · 二手 · 搭子 · 校车 · 地图 (DESIGN.md §6.1).
// Module pages render <SecondaryTabs /> at the top of their browse page; the active tab follows the URL.
import { useLocation, useNavigate } from 'react-router';
import { Tabs } from '../../components';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/cn';

export const BROWSE_TABS: { key: string; path: string; labelKey: string }[] = [
  { key: 'listings', path: '/listings', labelKey: 'tabs.listings' },
  { key: 'wanted', path: '/wanted', labelKey: 'tabs.wanted' },
  { key: 'market', path: '/market', labelKey: 'tabs.market' },
  { key: 'buddy', path: '/buddy', labelKey: 'tabs.buddy' },
  { key: 'shuttle', path: '/shuttle', labelKey: 'tabs.shuttle' },
  { key: 'map', path: '/map', labelKey: 'tabs.map' },
];

export function SecondaryTabs({ className, counts }: { className?: string; counts?: Partial<Record<string, number>> }) {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = BROWSE_TABS.find((tab) => pathname === tab.path || pathname.startsWith(tab.path + '/'))?.key ?? '';
  return (
    <nav aria-label={t('tabs.browse')} className={cn('-mx-4 px-4 lg:mx-0 lg:px-0', className)}>
      <Tabs
        variant="underline"
        scrollable
        value={active}
        onChange={(key: string) => {
          const tab = BROWSE_TABS.find((x) => x.key === key);
          if (tab) navigate(tab.path);
        }}
        items={BROWSE_TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey), count: counts?.[tab.key] }))}
      />
    </nav>
  );
}

export default SecondaryTabs;
