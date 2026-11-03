// Top-level and route-level error boundary. Never shows a stack trace to users; logs to console.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, House } from 'lucide-react';
import { Button } from '../components';
import { useT } from '../lib/i18n';
import { NAME_DISPLAY } from '@shared/brand';

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  reset = () => this.setState({ error: null });
  override render() {
    if (this.state.error) return this.props.fallback ?? <ErrorFallback error={this.state.error} onRetry={this.reset} />;
    return this.props.children;
  }
}

export function ErrorFallback({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const t = useT();
  const message = error instanceof Error ? error.message : '';
  return (
    <div role="alert" className="mx-auto flex min-h-[60vh] max-w-[360px] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-4 flex size-[72px] items-center justify-center rounded-pill bg-sunken">
        <RefreshCw className="size-10 text-ink-4" strokeWidth={1.5} aria-hidden />
      </div>
      <h2 className="text-h3 text-ink">{t('error.boundary.title')}</h2>
      <p className="mt-2 text-body text-ink-2">{t('error.boundary.description')}</p>
      {import.meta.env.DEV && message && (
        <pre className="mt-3 max-w-full overflow-auto rounded-sm bg-sunken p-2 text-left font-mono text-caption text-ink-3">{message}</pre>
      )}
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
          {t('common.retry')}
        </Button>
        <Button variant="secondary" iconLeft={<House />} onClick={() => (window.location.href = '/')}>
          {t('nav.home')}
        </Button>
      </div>
      <p className="mt-8 text-caption text-ink-3">{NAME_DISPLAY}</p>
    </div>
  );
}

export default ErrorBoundary;
