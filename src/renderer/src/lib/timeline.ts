/**
 * Logique pure de la Chronologie (§4 v1.7) — dérivation des éléments datés, placement
 * en « voies » (lanes) sans chevauchement, et choix d'un pas d'échelle adaptatif.
 *
 * Date d'un élément : la date d'ÉVÉNEMENT (`eventDate`) si renseignée (elle date le
 * FAIT en OSINT), sinon la date de CRÉATION (`createdAt`).
 */
import type { BoardNodeData, ElementStatus, NodeKind } from '@/types'

export const DAY_MS = 86_400_000

/** Date à placer sur la frise : eventDate en priorité, sinon createdAt. */
export function timelineDate(node: BoardNodeData): number {
  return node.eventDate ?? node.createdAt
}

// ——— Datation d'événement (§1 v1.8) ———

/** Fenêtre temporelle d'un événement, résolue depuis les champs du nœud. */
export interface EventTiming {
  /** Date exacte (instant connu), si renseignée. */
  exact?: number
  /** Borne « au plus tôt » d'un instant incertain. */
  earliest?: number
  /** Borne « au plus tard » d'un instant incertain. */
  latest?: number
  /** true si l'heure est significative (sinon jour seul). */
  hasTime: boolean
  /** Extrémité gauche pour le placement (min des bornes connues). */
  start: number
  /** Extrémité droite pour le placement (max des bornes connues). */
  end: number
  /** true si la fenêtre couvre une plage (start < end) plutôt qu'un point. */
  isRange: boolean
}

/**
 * Résout la datation d'un nœud (§1 v1.8) : null si le nœud ne porte AUCUNE date
 * d'événement (ni exacte, ni fenêtre). `start`/`end` bornent la fenêtre pour la
 * frise ; un point (exact seul, ou une seule borne) a `start === end`.
 */
export function eventTimingOf(node: BoardNodeData): EventTiming | null {
  const { eventDate, eventEarliest, eventLatest } = node
  if (eventDate === undefined && eventEarliest === undefined && eventLatest === undefined) {
    return null
  }
  const known = [eventEarliest, eventDate, eventLatest].filter(
    (value): value is number => value !== undefined
  )
  const start = Math.min(...known)
  const end = Math.max(...known)
  return {
    exact: eventDate,
    earliest: eventEarliest,
    latest: eventLatest,
    hasTime: node.eventHasTime === true,
    start,
    end,
    isRange: end > start
  }
}

/** true si le nœud porte une datation d'événement (exacte ou fenêtre). */
export function hasEventTiming(node: BoardNodeData): boolean {
  return (
    node.eventDate !== undefined ||
    node.eventEarliest !== undefined ||
    node.eventLatest !== undefined
  )
}

/** Élément de la frise « Événements » (§1 v1.8) : un nœud daté + sa fenêtre. */
export interface TimelineEvent extends TimelineItem {
  timing: EventTiming
}

/** Clés de tri de la frise Événements. */
export type EventSortKey = 'start' | 'exact' | 'name' | 'type'

/**
 * Éléments de la frise Événements : tous les nœuds portant une datation, avec leur
 * fenêtre résolue. Triés selon `sortKey` (par défaut : extrémité de début). Le tri
 * « exact » place d'abord les dates exactes connues, puis les fenêtres (par début).
 * `typeLabelOf` fournit le libellé de type (résolu par l'appelant : taxonomie +
 * types personnalisés).
 */
export function toEventItems(
  nodes: BoardNodeData[],
  sortKey: EventSortKey = 'start',
  typeLabelOf?: (node: BoardNodeData) => string
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const node of nodes) {
    const timing = eventTimingOf(node)
    if (!timing) continue
    events.push({
      id: node.id,
      date: timing.start,
      kind: node.kind,
      entityType: node.entityType,
      author: node.createdBy,
      status: node.status,
      isEventDate: true,
      label: node.title.trim() || node.fields.find((f) => f.value.trim() !== '')?.value || '',
      timing
    })
  }
  const labelOf = (event: TimelineEvent): string => typeLabelOf
    ? typeLabelOf(nodes.find((n) => n.id === event.id)!)
    : (event.entityType ?? event.kind)
  events.sort((a, b) => {
    switch (sortKey) {
      case 'name':
        return a.label.localeCompare(b.label, 'fr') || a.timing.start - b.timing.start
      case 'type':
        return labelOf(a).localeCompare(labelOf(b), 'fr') || a.timing.start - b.timing.start
      case 'exact': {
        // Dates exactes d'abord (par valeur), puis fenêtres (par début).
        const ax = a.timing.exact
        const bx = b.timing.exact
        if (ax !== undefined && bx !== undefined) return ax - bx
        if (ax !== undefined) return -1
        if (bx !== undefined) return 1
        return a.timing.start - b.timing.start
      }
      default:
        return a.timing.start - b.timing.start || a.timing.end - b.timing.end
    }
  })
  return events
}

export interface TimelineItem {
  id: string
  date: number
  kind: NodeKind
  entityType?: string
  author: string
  status?: ElementStatus
  /** true si la date vient d'un eventDate explicite (vs date de création). */
  isEventDate: boolean
  /** Libellé brut (titre, sinon 1re valeur de champ) — l'UI complète par le type. */
  label: string
}

/** Convertit les nœuds en éléments de frise, triés par date croissante. */
export function toTimelineItems(nodes: BoardNodeData[]): TimelineItem[] {
  return nodes
    .map((node) => ({
      id: node.id,
      date: timelineDate(node),
      kind: node.kind,
      entityType: node.entityType,
      author: node.createdBy,
      status: node.status,
      isEventDate: node.eventDate !== undefined,
      label: node.title.trim() || node.fields.find((f) => f.value.trim() !== '')?.value || ''
    }))
    .sort((a, b) => a.date - b.date)
}

/**
 * Attribue une voie (ligne) à chaque élément pour éviter tout chevauchement
 * horizontal : un élément va dans la première voie libre à sa position `x`, sinon une
 * nouvelle voie est créée. Les éléments proches dans le temps s'empilent donc en
 * colonne (regroupement visuel). `width` (optionnel) permet une largeur propre à
 * l'élément (fenêtre d'événement) plutôt que la largeur de carte par défaut.
 *
 * §1 v1.8.1 — CORRECTIF : l'empilement est calculé de GAUCHE à DROITE (x croissants)
 * quel que soit l'ORDRE des `items`. Le tri d'affichage (nom, type, date précise…)
 * fournit les éléments dans un ordre quelconque : l'ancienne version, qui empilait
 * « dans l'ordre reçu », faisait alors se chevaucher les cartes (« tout s'emmêle »).
 * On empile sur une copie triée par x, puis on remappe vers l'ordre d'origine — le
 * résultat est identique pour une entrée déjà triée, corrigé sinon.
 */
export function assignLanes(
  items: Array<{ date: number; width?: number }>,
  minDate: number,
  pxPerMs: number,
  cardWidth: number,
  gap: number
): number[] {
  const order = items
    .map((item, index) => ({
      index,
      x: (item.date - minDate) * pxPerMs,
      width: item.width ?? cardWidth
    }))
    .sort((a, b) => a.x - b.x)
  const laneRight: number[] = []
  const lanes: number[] = new Array(items.length).fill(0)
  for (const item of order) {
    let lane = laneRight.findIndex((right) => item.x >= right + gap)
    if (lane === -1) {
      lane = laneRight.length
      laneRight.push(0)
    }
    laneRight[lane] = item.x + item.width
    lanes[item.index] = lane
  }
  return lanes
}

/**
 * Choisit un pas d'échelle (en jours) tel que l'écart écran entre deux graduations
 * avoisine `targetPx`. Échelle adaptative heure → jour → mois → année.
 */
export function chooseTickStepDays(pxPerDay: number, targetPx = 110): number {
  const candidates = [1 / 24, 1 / 8, 1 / 4, 1 / 2, 1, 2, 7, 14, 30, 61, 91, 182, 365, 730, 1825, 3650]
  for (const days of candidates) {
    if (days * pxPerDay >= targetPx) return days
  }
  return candidates[candidates.length - 1]
}
