// Theme preference handling (DESIGN.md §9 dark-mode rule 1).
// The app ALWAYS writes an explicit data-theme on <html> so CSS variables and the `dark:` variant agree.
import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'theme';
const listeners = new Set<() => void>();

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

function systemTheme(): 'light' | 'dark' {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(pref: ThemePreference = getThemePreference()): 'light' | 'dark' {
  return pref === 'system' ? systemTheme() : pref;
}

export function applyTheme(pref: ThemePreference = getThemePreference()) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  listeners.forEach((l) => l());
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}

let booted = false;
/** Called once from main.tsx: applies the stored preference and follows OS changes while on "system". */
export function bootTheme() {
  if (booted) return;
  booted = true;
  applyTheme();
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemePreference() === 'system') applyTheme('system');
    });
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) applyTheme();
  });
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);
  useEffect(() => {
    const l = () => setPref(getThemePreference());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [pref, setThemePreference];
}
