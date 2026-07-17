/**
 * Journal d'événements de synchronisation (§1d v1.5).
 *
 * Anneau borné d'événements techniques (synchro initiale reçue, ré-essai/backoff,
 * rafraîchissement de l'affichage, fragmentation d'un gros message, révocation
 * distante…) affiché dans le panneau de diagnostic pour faciliter le débogage des
 * disparitions/synchros. Purement local, aucune donnée sensible, jamais persisté.
 */
import { create } from 'zustand'

/** Nature d'un événement (pilote la pastille de couleur dans le diagnostic). */
export type SyncLogLevel = 'info' | 'warn' | 'success'

export interface SyncLogEntry {
  id: number
  at: number
  level: SyncLogLevel
  message: string
}

/** Nombre maximum d'événements conservés (les plus anciens sont évincés). */
const MAX_ENTRIES = 60

interface SyncLogState {
  entries: SyncLogEntry[]
  log: (level: SyncLogLevel, message: string) => void
  clear: () => void
}

let sequence = 0

export const useSyncLog = create<SyncLogState>((set) => ({
  entries: [],
  log: (level, message) =>
    set((state) => {
      sequence += 1
      const entry: SyncLogEntry = { id: sequence, at: Date.now(), level, message }
      const entries = [entry, ...state.entries]
      return { entries: entries.length > MAX_ENTRIES ? entries.slice(0, MAX_ENTRIES) : entries }
    }),
  clear: () => set({ entries: [] })
}))

/** Ajoute un événement au journal (hors composant React). */
export function logSync(level: SyncLogLevel, message: string): void {
  useSyncLog.getState().log(level, message)
}
