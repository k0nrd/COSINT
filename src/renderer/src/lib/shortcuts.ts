/**
 * Gestion CENTRALE des raccourcis clavier (§3 v1.6).
 *
 * Toute l'application lit ses raccourcis depuis ce module (plus de combinaisons
 * codées en dur dispersées) : ici sont déclarées les ACTIONS raccourciables et
 * leur combinaison PAR DÉFAUT ; la configuration effective (réassignations de
 * l'utilisateur) vit dans `store/shortcuts.ts` (persistée par poste).
 *
 * Format d'une combinaison (« binding ») : chaîne normalisée `Mod+Shift+K`, où
 * `Mod` = Ctrl (ou Cmd sur macOS). L'ordre des modificateurs est fixe
 * (Mod, Alt, Shift) pour que deux combinaisons identiques aient la MÊME chaîne.
 */
import { t, type MessageKey } from '@/i18n'

/** Catégories d'actions (regroupement dans l'UI). */
export type ShortcutCategory = 'edition' | 'navigation' | 'creation' | 'view'

/**
 * §3 v1.8.6 : touche de MAINTIEN pour l'édition au glisser (déplacer/redimensionner
 * une barre sur la frise, glisser un repère). Configurable dans les Paramètres —
 * `Mod` = Ctrl (⌘ sur macOS), `Alt`, ou `Shift`. Sert à la fois à filtrer le geste
 * et à afficher l'indice « Maintenez [touche] pour … ».
 */
export type DragModifier = 'Mod' | 'Alt' | 'Shift'
export const DRAG_MODIFIERS: DragModifier[] = ['Mod', 'Alt', 'Shift']

/** Libellé lisible (traduit) d'une touche de maintien — ex. `Mod` → « Ctrl ». */
export function modifierKeyLabel(mod: DragModifier): string {
  return t(mod === 'Mod' ? 'key.ctrl' : mod === 'Alt' ? 'key.alt' : 'key.shift')
}

/** true si l'événement pointeur/clavier porte la touche de maintien demandée. */
export function eventHasModifier(
  e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean },
  mod: DragModifier
): boolean {
  if (mod === 'Mod') return e.ctrlKey || e.metaKey
  if (mod === 'Alt') return e.altKey
  return e.shiftKey
}

/** Une action raccourciable. `defaultBinding = null` = sans raccourci par défaut. */
export interface ShortcutAction {
  id: string
  category: ShortcutCategory
  labelKey: MessageKey
  defaultBinding: string | null
}

/**
 * Registre des actions. L'ordre pilote l'affichage. Les ids sont stables (jamais
 * traduits) et servent de clés dans la configuration persistée.
 */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // Édition
  { id: 'undo', category: 'edition', labelKey: 'shortcut.undo', defaultBinding: 'Mod+Z' },
  { id: 'redo', category: 'edition', labelKey: 'shortcut.redo', defaultBinding: 'Mod+Y' },
  { id: 'duplicate', category: 'edition', labelKey: 'shortcut.duplicate', defaultBinding: 'Mod+D' },
  { id: 'delete', category: 'edition', labelKey: 'shortcut.delete', defaultBinding: 'Delete' },
  // Navigation
  { id: 'zoomIn', category: 'navigation', labelKey: 'shortcut.zoomIn', defaultBinding: 'Mod+=' },
  { id: 'zoomOut', category: 'navigation', labelKey: 'shortcut.zoomOut', defaultBinding: 'Mod+-' },
  { id: 'fitView', category: 'navigation', labelKey: 'shortcut.fitView', defaultBinding: 'Mod+0' },
  // Création
  { id: 'newText', category: 'creation', labelKey: 'shortcut.newText', defaultBinding: null },
  { id: 'newTimestamped', category: 'creation', labelKey: 'shortcut.newTimestamped', defaultBinding: null },
  { id: 'newGroup', category: 'creation', labelKey: 'shortcut.newGroup', defaultBinding: null },
  { id: 'newSource', category: 'creation', labelKey: 'shortcut.newSource', defaultBinding: null },
  { id: 'newEntity', category: 'creation', labelKey: 'shortcut.newEntity', defaultBinding: null },
  { id: 'newCode', category: 'creation', labelKey: 'shortcut.newCode', defaultBinding: null },
  // Vue
  { id: 'search', category: 'view', labelKey: 'shortcut.search', defaultBinding: 'Mod+F' },
  { id: 'toggleFilter', category: 'view', labelKey: 'shortcut.toggleFilter', defaultBinding: null },
  { id: 'toggleSources', category: 'view', labelKey: 'shortcut.toggleSources', defaultBinding: null },
  { id: 'toggleLegend', category: 'view', labelKey: 'shortcut.toggleLegend', defaultBinding: null }
]

/** Toutes les catégories, dans l'ordre d'affichage. */
export const SHORTCUT_CATEGORIES: ShortcutCategory[] = ['edition', 'navigation', 'creation', 'view']

const ACTION_BY_ID = new Map(SHORTCUT_ACTIONS.map((action) => [action.id, action]))

/** Action par id (ou undefined si l'id ne fait pas/plus partie du registre). */
export function shortcutAction(id: string): ShortcutAction | undefined {
  return ACTION_BY_ID.get(id)
}

/** Touches purement modificatrices : ne forment jamais une combinaison à elles seules. */
const MODIFIER_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'Hyper',
  'Super'
])

/**
 * Combinaison normalisée d'un événement clavier, ou `null` si seule une touche
 * modificatrice est enfoncée (on attend une vraie touche pendant la capture).
 */
export function bindingFromEvent(event: KeyboardEvent): string | null {
  const rawKey = event.key
  // Touche modificatrice seule (dont AltGr) : pas encore une combinaison complète.
  if (MODIFIER_KEYS.has(rawKey)) return null
  let key = rawKey
  let shift = event.shiftKey
  // Ctrl++ (avec Maj) ≡ Ctrl+= (zoom) : on normalise « + » vers « = » sans Maj.
  if (key === '+') {
    key = '='
    shift = false
  } else if (key.length === 1) {
    key = key.toUpperCase()
  }
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  if (shift) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

/** Libellés (traduits) des touches spéciales à l'affichage ; symboles universels sinon. */
function keyLabel(part: string): string {
  switch (part) {
    case 'Delete':
      return t('key.delete')
    case 'Backspace':
      return '⌫'
    case 'Escape':
      return t('key.escape')
    case 'Enter':
      return t('key.enter')
    case 'ArrowUp':
      return '↑'
    case 'ArrowDown':
      return '↓'
    case 'ArrowLeft':
      return '←'
    case 'ArrowRight':
      return '→'
    case ' ':
      return t('key.space')
    default:
      return part
  }
}

/** Combinaison → texte lisible (ex. `Mod+Shift+Z` → `Ctrl + Maj + Z`). */
export function formatBinding(binding: string | null): string {
  if (!binding) return '—'
  return binding
    .split('+')
    .map((part) => {
      if (part === 'Mod') return t('key.ctrl')
      if (part === 'Shift') return t('key.shift')
      if (part === 'Alt') return t('key.alt')
      return keyLabel(part)
    })
    .join(' + ')
}
