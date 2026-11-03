import { useEffect } from 'react'
import { create } from 'zustand'
import type { Campus } from '@shared/types'
import { CAMPUSES } from '@shared/campuses'
import { api } from './api'
import { useAuthStore } from './auth'
import { getCookie, setCookie, storage } from './storage'
import { track } from './track'

export type Scope = 'campus' | 'nationwide'

const SCOPE_KEY = 'anwo.scope'

function readInitialCampusId(): string | null {
  if (typeof window === 'undefined') return null
  const fromUrl = new URLSearchParams(window.location.search).get('campus')
  if (fromUrl && CAMPUSES.some((c) => c.id === fromUrl)) {
    setCookie('campus', fromUrl)
    return fromUrl
  }
  const c = getCookie('campus')
  return c && CAMPUSES.some((x) => x.id === c) ? c : null
}

interface CampusState {
  campusId: string | null
  scope: Scope
  campuses: Campus[]
  recent: string[]
  setCampus: (id: string | null) => void
  setScope: (s: Scope) => void
}

export const useCampusStore = create<CampusState>((set, get) => ({
  campusId: readInitialCampusId(),
  scope: storage.get<Scope>(SCOPE_KEY, 'campus'),
  campuses: CAMPUSES,
  recent: storage.get<string[]>('anwo.recentCampuses', []),
  setCampus: (id) => {
    const prev = get().campusId
    if (id) setCookie('campus', id)
    const recent = id ? [id, ...get().recent.filter((x) => x !== id)].slice(0, 3) : get().recent
    storage.set('anwo.recentCampuses', recent)
    set({ campusId: id, recent })
    if (id && id !== prev) {
      track('campus.switch', { from: prev, to: id })
      const auth = useAuthStore.getState()
      if (auth.status === 'authed' && auth.user && auth.user.campusId !== id) {
        api('/api/users/me', { method: 'PATCH', body: { campusId: id } })
          .then((u) => auth.setUser(u as typeof auth.user))
          .catch(() => {})
      }
    }
  },
  setScope: (scope) => {
    storage.set(SCOPE_KEY, scope)
    set({ scope })
  },
}))

// When a user logs in with a campus and the device has none yet, adopt theirs.
useAuthStore.subscribe((s, prev) => {
  if (s.user && s.user !== prev.user && s.user.campusId && !useCampusStore.getState().campusId) {
    useCampusStore.getState().setCampus(s.user.campusId)
  }
})

export interface UseCampus {
  /** The selected campus object, or null before onboarding. */
  campus: Campus | null
  campusId: string | null
  scope: Scope
  setCampus: (id: string | null) => void
  setScope: (s: Scope) => void
  campuses: Campus[]
  /** Up to 3 recently selected campus ids. */
  recent: string[]
  /** Convenience: the short name for the header pill, or the nationwide label key. */
  isNationwide: boolean
}

/** `const { campus, campusId, scope, setCampus, setScope, campuses } = useCampus()` */
export function useCampus(): UseCampus {
  const s = useCampusStore()
  useEffect(() => {
    // keep the `?campus=` param in sync if the page uses it
    if (!s.campusId) return
    const url = new URL(window.location.href)
    if (url.searchParams.has('campus') && url.searchParams.get('campus') !== s.campusId) {
      url.searchParams.set('campus', s.campusId)
      window.history.replaceState(window.history.state, '', url.toString())
    }
  }, [s.campusId])
  const campus = s.campusId ? (s.campuses.find((c) => c.id === s.campusId) ?? null) : null
  return {
    campus,
    campusId: s.campusId,
    scope: s.scope,
    setCampus: s.setCampus,
    setScope: s.setScope,
    campuses: s.campuses,
    recent: s.recent,
    isNationwide: s.scope === 'nationwide',
  }
}

export function getCampusById(id: string | null | undefined): Campus | null {
  return id ? (CAMPUSES.find((c) => c.id === id) ?? null) : null
}

/** Query params every scoped list endpoint takes (API.md §1.4). */
export function scopeQuery(): { campusId?: string; scope: Scope } {
  const { campusId, scope } = useCampusStore.getState()
  return scope === 'nationwide' ? { scope } : { campusId: campusId ?? undefined, scope }
}
