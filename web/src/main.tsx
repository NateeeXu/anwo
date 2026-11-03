import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import { bootTheme } from './app/theme';
import { App } from './App';

// Resolve the theme before first render so CSS variables and `dark:` utilities agree (DESIGN.md §9).
bootTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
