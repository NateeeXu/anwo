import { useEffect } from 'react'
import { create } from 'zustand'
import type { UserMe } from '@shared/types'
import { api, ApiError, UNAUTHORIZED_EVENT } from './api'
import { getCookie, setCookie } from './storage'

export type AuthStatus = 'loading' | 'anon' | 'authed'

export interface RegisterPayload {
  email: string
  password: string
  name: string
  locale?: 'zh-CN' | 'en'
  campusId?: string
  referralCode?: string
}

export interface AuthState {
  user: UserMe | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<UserMe>
  register: (payload: RegisterPayload) => Promise<UserMe & { eduCodeSent?: boolean }>
  logout: () => Promise<void>
  /** Re-fetch `/api/auth/me`; resolves to the user or null. */
  refresh: () => Promise<UserMe | null>
  setUser: (u: UserMe | null) => void
}

function adoptCookies(u: UserMe) {
  // The server also sets `campus`; mirror client-side so the first render after login is right.
  if (u.campusId && !getCookie('campus')) setCookie('campus', u.campusId)
  if (u.locale && !getCookie('lang')) setCookie('lang', u.locale)
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  setUser: (u) => {
    if (u) adoptCookies(u)
    set({ user: u, status: u ? 'authed' : 'anon' })
  },
  login: async (email, password) => {
    const u = await api<UserMe>('/api/auth/login', { method: 'POST', body: { email, password } })
    get().setUser(u)
    return u
  },
  register: async (payload) => {
    const u = await api<UserMe & { eduCodeSent?: boolean }>('/api/auth/register', { method: 'POST', body: payload })
    get().setUser(u)
    return u
  },
  logout: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: {} })
    } catch {
      /* already logged out */
    }
    set({ user: null, status: 'anon' })
  },
  refresh: async () => {
    try {
      const u = await api<UserMe>('/api/auth/me')
      get().setUser(u)
      return u
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) set({ user: null, status: 'anon' })
      else if (get().status === 'loading') set({ status: 'anon' })
      return null
    }
  },
}))

let booted = false
/** Fetch the session once at boot; safe to call repeatedly. */
export function bootAuth(): void {
  if (booted || typeof window === 'undefined') return
  booted = true
  void useAuthStore.getState().refresh()
  window.addEventListener(UNAUTHORIZED_EVENT, () => {
    const s = useAuthStore.getState()
    if (s.status === 'authed') s.setUser(null)
  })
}

/**
 * `const { user, status, login, register, logout, refresh, setUser } = useAuth()`.
 * `status`: 'loading' until `/api/auth/me` answers, then 'anon' | 'authed'.
 */
export function useAuth(): AuthState {
  const state = useAuthStore()
  useEffect(() => {
    bootAuth()
  }, [])
  return state
}

/** Non-hook access (ws.ts, campus.ts). */
export const authStore = useAuthStore
