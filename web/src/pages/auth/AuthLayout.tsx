// Centered panel for auth / onboarding pages (max-w-form).
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Mark } from '../../components/brand';
import { NAME_DISPLAY } from '@shared/brand';
import { Head } from '../../app/Head';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-form px-4 py-4 md:py-10">
      <Head title={title} />
      <div className="rounded-lg border border-line bg-surface p-6 md:p-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 rounded-sm text-small text-ink-2" aria-label={NAME_DISPLAY}>
          <Mark size={28} />
          <span>{NAME_DISPLAY}</span>
        </Link>
        <h1 className="text-h1-sm md:text-h1 text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-body text-ink-2">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-4 text-center text-small text-ink-2">{footer}</div>}
    </div>
  );
}

export default AuthLayout;
