// Document title per page: "<page> · 安窝 Anwo". Also feeds the mobile top-bar title.
// Usage: <Head title={t('settings.title')} /> at the top of a page, or useHead(title).
import { useEffect } from 'react';
import { NAME_DISPLAY } from '@shared/brand';
import { useShellStore } from './shell/shellStore';

export function useHead(title?: string, description?: string) {
  const setOptions = useShellStore((s) => s.setOptions);
  useEffect(() => {
    document.title = title ? `${title} · ${NAME_DISPLAY}` : NAME_DISPLAY;
    setOptions({ title: title ?? '' });
    if (description) {
      let el = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!el) {
        el = document.createElement('meta');
        el.name = 'description';
        document.head.appendChild(el);
      }
      el.content = description;
    }
    return () => {
      document.title = NAME_DISPLAY;
    };
  }, [title, description, setOptions]);
}

export function Head({ title, description }: { title?: string; description?: string }) {
  useHead(title, description);
  return null;
}

export default Head;
