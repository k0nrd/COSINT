/** Notifications éphémères (succès, erreurs) affichées en bas de l'écran. */
import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastsState {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let nextToastId = 1

export const useToasts = create<ToastsState>((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = nextToastId++
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }))
    // Disparition automatique (erreurs affichées plus longtemps)
    window.setTimeout(
      () => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
      kind === 'error' ? 8000 : 4000
    )
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}))
