import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import '@/styles/base.css'
import { I18nProvider } from '@/lib/i18n'
import { queryClient } from '@/lib/query'
import { Toaster } from '@/components/Toaster'
import { Kitchen } from './Kitchen'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <I18nProvider>
          <Kitchen />
          <Toaster />
        </I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
