// Reading-width text page used by Help / Safety / Terms / Privacy. Sections come from i18n keys:
// `<prefix>.s<n>.title` and `<prefix>.s<n>.body` (body paragraphs separated by "\n").
import type { ReactNode } from 'react';
import { useT } from '../../lib/i18n';
import { Head } from '../../app/Head';

export function Paragraphs({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean);
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-5 flex list-disc flex-col gap-1 text-body text-ink-2">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const line of lines) {
    if (line.startsWith('- ')) bullets.push(line.slice(2));
    else {
      flush();
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-body text-ink-2">
          {line}
        </p>,
      );
    }
  }
  flush();
  return <>{blocks}</>;
}

export function TextPage({ prefix, sections, children, aside }: { prefix: string; sections: number; children?: ReactNode; aside?: ReactNode }) {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-reading px-4">
      <Head title={t(`${prefix}.title`)} />
      <h1 className="text-h1-sm md:text-h1 text-ink">{t(`${prefix}.title`)}</h1>
      {t(`${prefix}.intro`) !== `${prefix}.intro` && <p className="mt-2 text-body-lg text-ink-2">{t(`${prefix}.intro`)}</p>}
      {t(`${prefix}.updated`) !== `${prefix}.updated` && <p className="mt-1 text-caption text-ink-3">{t(`${prefix}.updated`)}</p>}
      {aside}
      <div className="mt-8 flex flex-col gap-8">
        {Array.from({ length: sections }, (_, i) => `${prefix}.s${i + 1}`).map((k) => (
          <section key={k} id={k.split('.').pop()} className="flex flex-col gap-2">
            <h2 className="text-h2 text-ink">{t(`${k}.title`)}</h2>
            <Paragraphs text={t(`${k}.body`)} />
          </section>
        ))}
      </div>
      {children}
    </div>
  );
}

export default TextPage;
