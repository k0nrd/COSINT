/**
 * Logique pure de la Chronologie (§4 v1.7) — dérivation des éléments datés, placement
 * en « voies » (lanes) sans chevauchement, et choix d'un pas d'échelle adaptatif.
 *
 * Deux frises, deux dates DISTINCTES (§1 v1.8.2) :
 *  - « Ajouts »     : QUAND l'élément a été AJOUTÉ au tableau → toujours `createdAt`.
 *                     La date d'événement n'y intervient JAMAIS (une entité datée du
 *                     8 mars mais saisie le 20 juillet figure au 20 juillet ici).
 *  - « Événements » : QUAND LE FAIT s'est déroulé → datation d'événement résolue
 *                     (`eventTimingOf` : date exacte, fenêtre, ou durée de/à).
 */
import type { BoardNodeData, ElementStatus, EventMark, NodeKind } from '@/types'
import { newId } from '@/lib/id'

export const DAY_MS = 86_400_000

/** Borne de date valide (epoch ms) partagée par les lectures d'événement. */
const MAX_EVENT_MS = 8.64e15

/**
 * §1 v1.8.4 : normalise une liste de repères lue depuis une source non sûre (CRDT,
 * fichier, presse-papiers). Rétro-compatible v1.8.3 : un simple nombre devient un repère
 * `{ at }` doté d'un id. Les entrées invalides sont écartées ; le résultat est trié.
 */
export function sanitizeEventMarks(value: unknown): EventMark[] {
  if (!Array.isArray(value)) return []
  const out: EventMark[] = []
  for (const raw of value) {
    if (typeof raw === 'number') {
      if (Number.isFinite(raw) && Math.abs(raw) <= MAX_EVENT_MS) out.push({ id: newId(), at: raw })
      continue
    }
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const at = r.at
    if (typeof at !== 'number' || !Number.isFinite(at) || Math.abs(at) > MAX_EVENT_MS) continue
    const mark: EventMark = { id: typeof r.id === 'string' && r.id ? r.id : newId(), at }
    if (typeof r.label === 'string' && r.label.trim() !== '') mark.label = r.label
    if (typeof r.color === 'string' && r.color !== '') mark.color = r.color
    if (Array.isArray(r.tags)) {
      const tags = r.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
      if (tags.length > 0) mark.tags = tags
    }
    out.push(mark)
  }
  return out.sort((a, b) => a.at - b.at)
}

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
  /** Début d'une durée précise (de/à), si le nœud décrit une durée (§1 v1.8.2). */
  from?: number
  /** Fin d'une durée précise (de/à). */
  to?: number
  /**
   * true si la datation décrit une DURÉE réelle (de/à) plutôt qu'un instant. Une durée
   * s'affiche en barre pleine (le fait s'étend sur toute la plage) ; une fenêtre
   * d'incertitude s'affiche estompée (instant unique mal localisé). §1 v1.8.2.
   */
  isDuration: boolean
  /** true si l'heure est significative (sinon jour seul). */
  hasTime: boolean
  /** Extrémité gauche pour le placement (min des bornes connues). */
  start: number
  /** Extrémité droite pour le placement (max des bornes connues). */
  end: number
  /** true si la fenêtre couvre une plage (start < end) plutôt qu'un point. */
  isRange: boolean
  /** §1 v1.8.3/§1 v1.8.4 : repères (objets) posés sur la plage, filtrés à [start, end]. */
  marks: EventMark[]
}

/** §1 v1.8.3 : nature de la datation d'un nœud, mutuellement exclusive. */
export type DatationMode = 'exact' | 'window' | 'duration'

/** §1 v1.8.3 : mode de datation courant d'un nœud (durée > fenêtre > date exacte). */
export function datationMode(node: BoardNodeData): DatationMode {
  if (node.eventFrom !== undefined || node.eventTo !== undefined) return 'duration'
  if (node.eventEarliest !== undefined || node.eventLatest !== undefined) return 'window'
  return 'exact'
}

/**
 * Résout la datation d'un nœud (§1 v1.8, durées §1 v1.8.2) : null si le nœud ne porte
 * AUCUNE date d'événement (ni exacte, ni fenêtre, ni durée). `start`/`end` bornent la
 * plage pour la frise ; un point (exact seul, ou une seule borne) a `start === end`.
 * La DURÉE (`eventFrom`/`eventTo`) prime : si l'un des deux est renseigné, le nœud est
 * traité comme une durée et les champs d'instant sont ignorés (l'éditeur les tient
 * mutuellement exclusifs, mais on reste robuste à une donnée mixte importée).
 */
export function eventTimingOf(node: BoardNodeData): EventTiming | null {
  const { eventDate, eventEarliest, eventLatest, eventFrom, eventTo } = node
  const isDuration = eventFrom !== undefined || eventTo !== undefined
  if (
    !isDuration &&
    eventDate === undefined &&
    eventEarliest === undefined &&
    eventLatest === undefined
  ) {
    return null
  }
  const hasTime = node.eventHasTime === true
  // Repères conservés seulement s'ils tombent dans la plage résolue (§1 v1.8.3/§1 v1.8.4).
  const marksIn = (start: number, end: number): EventMark[] =>
    (node.eventMarks ?? []).filter((m) => m.at >= start && m.at <= end).sort((a, b) => a.at - b.at)
  if (isDuration) {
    const known = [eventFrom, eventTo].filter((value): value is number => value !== undefined)
    const start = Math.min(...known)
    const end = Math.max(...known)
    return {
      from: eventFrom,
      to: eventTo,
      isDuration: true,
      hasTime,
      start,
      end,
      isRange: end > start,
      marks: marksIn(start, end)
    }
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
    isDuration: false,
    hasTime,
    start,
    end,
    isRange: end > start,
    marks: marksIn(start, end)
  }
}

/** true si le nœud porte une datation d'événement (exacte, fenêtre ou durée). */
export function hasEventTiming(node: BoardNodeData): boolean {
  return (
    node.eventDate !== undefined ||
    node.eventEarliest !== undefined ||
    node.eventLatest !== undefined ||
    node.eventFrom !== undefined ||
    node.eventTo !== undefined
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

/**
 * Éléments de la frise « Ajouts » (§1 v1.8.2) : chaque nœud placé à sa date d'AJOUT au
 * tableau (`createdAt`) — jamais à sa date d'événement. Triés par date croissante.
 * `isEventDate` est donc toujours faux ici (la date affichée est celle de la saisie).
 */
export function toTimelineItems(nodes: BoardNodeData[]): TimelineItem[] {
  return nodes
    .map((node) => ({
      id: node.id,
      date: node.createdAt,
      kind: node.kind,
      entityType: node.entityType,
      author: node.createdBy,
      status: node.status,
      isEventDate: false,
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
