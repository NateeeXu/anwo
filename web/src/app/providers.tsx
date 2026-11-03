// Global providers: React Query, i18n, error boundary and the toast outlet.
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/query';
import { I18nProvider } from '../lib/i18n';
import { Toaster } from '../components/Toaster';
import { ErrorBoundary } from './ErrorBoundary';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ErrorBoundary>{children}</ErrorBoundary>
        <Toaster />
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default Providers;
