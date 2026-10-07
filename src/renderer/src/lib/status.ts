/**
 * Définitions des badges de statut (§3 v1.5).
 *
 * Un badge par élément (entité, nœud libre, lien). Chaque valeur a une couleur,
 * un glyphe court (rendu dans une petite pastille en coin de nœud / près du lien)
 * et un libellé français affiché au survol. Liste unique et extensible : ajouter
 * une valeur ici, l'ajouter à `ElementStatus` (types.ts) et à la clé i18n
 * `status.badge.<id>` suffit à la propager (barre contextuelle, filtre, exports).
 */
import type { ElementStatus } from '@/types'
import type { MessageKey } from '@/i18n'

export interface StatusDef {
  id: ElementStatus
  /** Clé i18n du libellé (affiché au survol, dans le filtre et les exports). */
  labelKey: MessageKey
  /** Couleur de la pastille (#rrggbb). */
  color: string
  /** Glyphe court affiché dans la pastille ('' pour « aucun »). */
  glyph: string
}

/** Liste ordonnée des statuts (ordre d'affichage dans les sélecteurs). */
export const STATUS_DEFS: StatusDef[] = [
  // Refonte UI : teintes alignées sur les états sémantiques du thème (plus de couleurs vives).
  { id: 'none', labelKey: 'status.badge.none', color: '#6b7280', glyph: '' },
  { id: 'confirmed', labelKey: 'status.badge.confirmed', color: '#3fa873', glyph: '✓' },
  { id: 'issue', labelKey: 'status.badge.issue', color: '#d39a2f', glyph: '!' },
  { id: 'false_positive', labelKey: 'status.badge.false_positive', color: '#2b2f36', glyph: '✕' },
  { id: 'question', labelKey: 'status.badge.question', color: '#5b84d8', glyph: '?' },
  { id: 'stop', labelKey: 'status.badge.stop', color: '#d9584f', glyph: '−' },
  { id: 'onhold', labelKey: 'status.badge.onhold', color: '#808792', glyph: '⧗' }
]

const STATUS_BY_ID = new Map(STATUS_DEFS.map((def) => [def.id, def]))

/** Statuts « réels » (hors « aucun »), pour les filtres et compteurs. */
export const ACTIVE_STATUSES: ElementStatus[] = STATUS_DEFS.filter((def) => def.id !== 'none').map(
  (def) => def.id
)

/** Valide et normalise une valeur de statut (défaut : `none`). */
export function asStatus(value: unknown): ElementStatus {
  return typeof value === 'string' && STATUS_BY_ID.has(value as ElementStatus)
    ? (value as ElementStatus)
    : 'none'
}

/** Définition d'un statut (fallback « aucun »). */
export function statusDef(id: ElementStatus): StatusDef {
  return STATUS_BY_ID.get(id) ?? STATUS_DEFS[0]
}

/** true si le statut porte un badge visible (≠ « aucun »). */
export function hasStatusBadge(status: ElementStatus | undefined): status is ElementStatus {
  return status !== undefined && status !== 'none'
}
