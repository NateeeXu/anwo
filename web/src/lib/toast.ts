import { create } from 'zustand'

export type ToastVariant = 'info' | 'success' | 'error'
export interface ToastAction {
  label: string
  onClick: () => void
}
export interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  action?: ToastAction
  /** ms; 0 = sticky until dismissed */
  duration: number
  createdAt: number
}

const MAX_TOASTS = 3
let seq = 0

interface ToastState {
  toasts: ToastItem[]
  push: (t: Omit<ToastItem, 'id' | 'createdAt'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `t${++seq}`
    set((s) => ({ toasts: [...s.toasts, { ...t, id, createdAt: Date.now() }].slice(-MAX_TOASTS) }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

const DEFAULT_DURATION: Record<ToastVariant, number> = { info: 4000, success: 4000, error: 6000 }

function make(variant: ToastVariant) {
  return (title: string, description?: string, action?: ToastAction, duration?: number) =>
    useToastStore.getState().push({ variant, title, description, action, duration: duration ?? DEFAULT_DURATION[variant] })
}

/** `toast.success('已保存')`, `toast.error(title, description, { label, onClick })`. Rendered by `<Toaster />`. */
export const toast = {
  info: make('info'),
  success: make('success'),
  error: make('error'),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
}
