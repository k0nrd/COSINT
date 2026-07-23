/**
 * Configuration locale des raccourcis clavier (§3 v1.6), persistée par poste
 * (localStorage — « pas de compte, tout vit sur ce poste »).
 *
 * On ne stocke que les ÉCARTS par rapport aux valeurs par défaut (`overrides`) :
 *  - clé absente        → raccourci par défaut de l'action ;
 *  - valeur = chaîne    → raccourci réassigné ;
 *  - valeur = null      → raccourci SUPPRIMÉ (action sans raccourci).
 * Le raccourci EFFECTIF combine défauts (lib/shortcuts.ts) et overrides.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DRAG_MODIFIERS, SHORTCUT_ACTIONS, shortcutAction, type DragModifier } from '@/lib/shortcuts'

/** null = supprimé ; chaîne = réassigné. */
export type BindingOverride = string | null

interface ShortcutsState {
  overrides: Record<string, BindingOverride>
  /** §3 v1.8.6 : touche de maintien pour l'édition au glisser sur la frise. */
  dragModifier: DragModifier
  /** Réassigne une action à une combinaison. */
  setBinding: (actionId: string, binding: string) => void
  /** Supprime le raccourci d'une action (aucune combinaison). */
  unbindAction: (actionId: string) => void
  /** Réinitialise une action à sa valeur par défaut. */
  resetBinding: (actionId: string) => void
  /** Réinitialise TOUTES les actions aux valeurs par défaut. */
  resetAll: () => void
  /** Remplace la configuration par un jeu importé (déjà validé). */
  importOverrides: (overrides: Record<string, BindingOverride>) => void
  /** Change la touche de maintien du glisser (frise). */
  setDragModifier: (mod: DragModifier) => void
}

export const useShortcuts = create<ShortcutsState>()(
  persist(
    (set) => ({
      overrides: {},
      dragModifier: 'Mod',
      setBinding: (actionId, binding) =>
        set((state) => ({ overrides: { ...state.overrides, [actionId]: binding } })),
      unbindAction: (actionId) =>
        set((state) => ({ overrides: { ...state.overrides, [actionId]: null } })),
      resetBinding: (actionId) =>
        set((state) => {
          const next = { ...state.overrides }
          delete next[actionId]
          return { overrides: next }
        }),
      resetAll: () => set({ overrides: {} }),
      importOverrides: (overrides) => set({ overrides }),
      setDragModifier: (dragModifier) => set({ dragModifier })
    }),
    {
      name: 'cosint:shortcuts',
      version: 2,
      migrate: (persisted) => {
        const state = persisted as Partial<ShortcutsState>
        return {
          ...state,
          overrides:
            typeof state.overrides === 'object' && state.overrides !== null ? state.overrides : {},
          dragModifier: DRAG_MODIFIERS.includes(state.dragModifier as DragModifier)
            ? (state.dragModifier as DragModifier)
            : 'Mod'
        } as ShortcutsState
      }
    }
  )
)

/** Combinaison EFFECTIVE d'une action (override sinon défaut) ; null = aucune. */
export function effectiveBinding(
  actionId: string,
  overrides: Record<string, BindingOverride>
): string | null {
  if (Object.prototype.hasOwnProperty.call(overrides, actionId)) return overrides[actionId]
  return shortcutAction(actionId)?.defaultBinding ?? null
}

/**
 * Table inverse combinaison → id d'action, à partir des overrides fournis. Utilisée
 * par le répartiteur clavier (une combinaison ne pilote qu'une action).
 */
export function bindingToActionMap(overrides: Record<string, BindingOverride>): Map<string, string> {
  const map = new Map<string, string>()
  for (const action of SHORTCUT_ACTIONS) {
    const binding = effectiveBinding(action.id, overrides)
    // Premier arrivé gagne (le registre est ordonné) — les conflits sont prévenus
    // à l'assignation ; ce garde-fou évite qu'un conflit résiduel double-déclenche.
    if (binding && !map.has(binding)) map.set(binding, action.id)
  }
  return map
}

/**
 * Id de l'action qui utilise DÉJÀ une combinaison (hors `exceptId`), ou null.
 * Sert à la détection de conflits lors d'une réassignation.
 */
export function findConflict(
  binding: string,
  overrides: Record<string, BindingOverride>,
  exceptId: string
): string | null {
  for (const action of SHORTCUT_ACTIONS) {
    if (action.id === exceptId) continue
    if (effectiveBinding(action.id, overrides) === binding) return action.id
  }
  return null
}

/** Jeu EFFECTIF complet (toutes les actions) — pour l'export JSON. */
export function exportBindings(overrides: Record<string, BindingOverride>): Record<string, BindingOverride> {
  const out: Record<string, BindingOverride> = {}
  for (const action of SHORTCUT_ACTIONS) out[action.id] = effectiveBinding(action.id, overrides)
  return out
}

/** Valide un objet importé : ne garde que les ids connus et les valeurs plausibles. */
export function sanitizeImportedBindings(raw: unknown): Record<string, BindingOverride> | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const out: Record<string, BindingOverride> = {}
  for (const action of SHORTCUT_ACTIONS) {
    if (!Object.prototype.hasOwnProperty.call(record, action.id)) continue
    const value = record[action.id]
    if (value === null || typeof value === 'string') out[action.id] = value
  }
  return out
}
