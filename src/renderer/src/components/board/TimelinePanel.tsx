/**
 * Chronologie (§4 v1.7, enrichie §3 v1.8) — deux frises complémentaires :
 *  - « Ajouts »     : quand les éléments ont été ajoutés au tableau (date de saisie
 *                     ou d'événement), comportement v1.7 inchangé ;
 *  - « Événements » : QUAND LES FAITS SE SONT DÉROULÉS. Les éléments datés (entités
 *                     « Événement » et tout nœud portant une datation) y figurent
 *                     avec leur fenêtre (barre hachurée au plus tôt → au plus tard,
 *                     ou point à la date exacte). Tri par date de début / date
 *                     précise / nom / type ; vue frise OU liste.
 * Filtres (catégorie, statut, auteur, plage), échelle adaptative, export PNG/CSV.
 * La frise se met à jour en temps réel (dérivée de `nodes`, source Yjs).
 */
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { toPng } from 'html-to-image'
import {
  ArrowLeft,
  Clock,
  Code2,
  Contact,
  Crosshair,
  Diamond,
  FileText,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  List,
  LocateFixed,
  Minus,
  Plus,
  Square,
  StickyNote,
  Trash2,
  X,
  type LucideIcon
} from 'lucide-react'
import type { BoardNodeData, ElementStatus, EventMark, NodeKind } from '@/types'
import { t, type MessageKey } from '@/i18n'
import {
  taxonomyCategory,
  taxonomyType,
  TAXONOMY_CATEGORIES,
  type CategoryId
} from '@/lib/taxonomy'
import { resolveType, type CustomTypeMap } from '@/lib/entityTypes'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { StatusBadge } from '@/components/board/StatusBadge'
import { hasStatusBadge, statusDef } from '@/lib/status'
import { NodeDetails } from '@/components/board/SidePanel'
import { ColorField } from '@/components/common/ColorPicker'
import { TagInput } from '@/components/common/TagInput'
import { useBoardContext } from '@/flow/BoardContext'
import { setEventTiming, type EventTimingPatch } from '@/sync/boardOps'
import { colorHex, withAlpha } from '@/lib/colors'
import { newId } from '@/lib/id'
import { stringifyCsv } from '@/lib/csv'
import {
  assignLanes,
  chooseTickStepDays,
  DAY_MS,
  toEventItems,
  toTimelineItems,
  type AddTiming,
  type DatationMode,
  type EventSortKey,
  type EventTiming,
  type TimelineEvent,
  type TimelineItem
} from '@/lib/timeline'
import { useShortcuts } from '@/store/shortcuts'
import { eventHasModifier, modifierKeyLabel, type DragModifier } from '@/lib/shortcuts'
import { useToasts } from '@/store/toasts'
import './timeline.css'

const CARD_W = 244
/** Hauteur d'une carte (date, titre, type sur trois lignes). */
const CARD_H = 56
const GAP = 8
// Refonte UI : l'axe passe AU MILIEU — les voies paires se rangent sous l'axe, les voies
// impaires au-dessus (cartes reliées à leur date par un fil). Une plage garde sa barre,
// posée entre la carte et l'axe.
const LANE_H = 74
/** Bande sous l'axe : graduations + barre de plage de la 1re voie du bas. */
const AXIS_BAND = 40
/** Écart entre le bas des cartes du haut et l'axe (place de leur barre de plage). */
const AXIS_GAP_UP = 22
const TOP_PAD = 20
const BOTTOM_PAD = 28
const MIN_PX_PER_DAY = 0.02
const MAX_PX_PER_DAY = 800
// §1 v1.8.2 : marge de défilement de part et d'autre du contenu, pour pouvoir se
// déplacer librement à gauche/droite « même s'il n'y a plus d'éléments plus loin ».
// Le bouton « Recentrer » ramène la vue sur les éléments.
const PAN_PAD = 1600

/** Outils d'ajout de la barre horizontale de la frise (§2 v1.8.2). Un ajout depuis la
 * frise n'aboutit qu'après avoir renseigné une date (voir le sélecteur de date). */
const TL_ADD_TOOLS: Array<{ kind: NodeKind; icon: LucideIcon; titleKey: MessageKey }> = [
  { kind: 'entity', icon: Contact, titleKey: 'toolbar.addEntity' },
  { kind: 'text', icon: StickyNote, titleKey: 'toolbar.addText' },
  { kind: 'source', icon: FileText, titleKey: 'toolbar.addSource' },
  { kind: 'link', icon: LinkIcon, titleKey: 'toolbar.addLink' },
  { kind: 'image', icon: ImageIcon, titleKey: 'toolbar.addImage' },
  { kind: 'timestamped', icon: Clock, titleKey: 'toolbar.addTimestamped' },
  { kind: 'group', icon: Square, titleKey: 'toolbar.addGroup' },
  { kind: 'code', icon: Code2, titleKey: 'toolbar.addCode' }
]

/** Icônes des types de nœud « non entité ». */
const KIND_ICONS: Record<Exclude<NodeKind, 'entity'>, LucideIcon> = {
  text: StickyNote,
  link: LinkIcon,
  image: ImageIcon,
  timestamped: Clock,
  group: Square,
  source: FileText,
  code: Code2,
  file: FileText
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const fullFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnlyFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
/** Date compacte affichée dans les cartes de la frise (jj/mm/aa). */
const cardDateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Formate une borne d'événement (jour, ou jour + heure selon `hasTime`). */
function fmtBound(ms: number, hasTime: boolean): string {
  return hasTime ? fullFmt.format(new Date(ms)) : dateOnlyFmt.format(new Date(ms))
}

type Tab = 'added' | 'events'
type EventView = 'frise' | 'list'

interface TimelinePanelProps {
  nodes: BoardNodeData[]
  boardTitle: string
  /** false = visiteur : la barre d'ajout de la frise est masquée (§6). */
  canEdit: boolean
  onLocate: (nodeId: string) => void
  /** §2 v1.8.2 (§2 v1.8.6) : crée un élément DATÉ depuis la frise. La datation peut être
   * une date PRÉCISE, une FOURCHETTE (au plus tôt / au plus tard) ou une DURÉE (de / à).
   * Pour une entité, l'appelant ouvre le sélecteur de type puis applique la datation. */
  onAddDated: (kind: NodeKind, timing: AddTiming) => void
  onClose: () => void
}

export function TimelinePanel({
  nodes,
  boardTitle,
  canEdit,
  onLocate,
  onAddDated,
  onClose
}: TimelinePanelProps): JSX.Element {
  const pushToast = useToasts((state) => state.push)
  const { customTypeMap, handle, author } = useBoardContext()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // §5 v1.8.3 : position/largeur du défilement, suivies pour le navigateur de zoom (barre
  // du bas, façon Premiere). Mises à jour au défilement et au redimensionnement.
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportW, setViewportW] = useState(0)
  // §5 v1.8.3 : après un changement de zoom, on veut replacer une date précise au bord
  // gauche du viewport — appliqué APRÈS le re-calcul de mise en page (voir l'effet).
  const pendingScrollMsRef = useRef<number | null>(null)

  // §3 v1.8.1 : à l'ouverture, on montre d'abord la frise des ÉVÉNEMENTS (quand les
  // faits se sont déroulés), puis celle des ajouts — les onglets sont ordonnés ainsi.
  const [tab, setTab] = useState<Tab>('events')
  const [eventSort, setEventSort] = useState<EventSortKey>('start')
  const [eventView, setEventView] = useState<EventView>('frise')
  // §1 v1.8.1 : élément dont le détail est affiché SUR la frise (un clic n'emmène
  // plus directement au tableau ; le détail propose ensuite « Voir sur le tableau »).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // §2 v1.8.4 : repère sélectionné (édition titre/couleur/tags). Nœud et repère sont
  // mutuellement exclusifs ; cliquer dans le vide désélectionne les deux.
  const [selectedMark, setSelectedMark] = useState<{ nodeId: string; markId: string } | null>(null)
  const selectNode = (id: string): void => {
    setSelectedId(id)
    setSelectedMark(null)
  }
  const selectMark = (nodeId: string, markId: string): void => {
    setSelectedMark({ nodeId, markId })
    setSelectedId(null)
  }
  const deselect = (): void => {
    setSelectedId(null)
    setSelectedMark(null)
  }
  // §2 v1.8.2 (§2 v1.8.6) : ajout d'un élément DATÉ depuis la barre d'outils de la frise.
  // Cliquer un outil ouvre le sélecteur de datation (date précise / fourchette / durée) ;
  // sans date validée, RIEN n'est créé.
  const [addKind, setAddKind] = useState<NodeKind | null>(null)
  const [addMode, setAddMode] = useState<DatationMode>('exact')
  const [addHasTime, setAddHasTime] = useState(false)
  const [addExact, setAddExact] = useState('')
  const [addEarliest, setAddEarliest] = useState('')
  const [addLatest, setAddLatest] = useState('')
  const [addFrom, setAddFrom] = useState('')
  const [addTo, setAddTo] = useState('')

  // §3 v1.8.6 : touche de maintien configurable + indice discret « Maintenez [touche]
  // pour … » affiché quand on tente d'éditer une barre sans la maintenir enfoncée.
  const dragModifier = useShortcuts((state) => state.dragModifier)
  const modKeyLabel = modifierKeyLabel(dragModifier)
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showHint = (text: string, x: number, y: number): void => {
    setHint({ text, x, y })
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(null), 1700)
  }
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current)
  }, [])

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const selectedNode = selectedId ? (nodeById.get(selectedId) ?? null) : null

  /** Libellé de type d'un élément (types personnalisés inclus §2 v1.8). */
  const typeLabelOf = (item: TimelineItem): string => {
    if (item.kind === 'entity' && item.entityType) return resolveType(item.entityType, customTypeMap).label
    return t(`nodeType.${item.kind}` as MessageKey)
  }
  const typeLabelOfNode = (node: BoardNodeData): string => {
    if (node.kind === 'entity' && node.entityType) return resolveType(node.entityType, customTypeMap).label
    return t(`nodeType.${node.kind}` as MessageKey)
  }

  const addedItems = useMemo(() => toTimelineItems(nodes), [nodes])
  const eventItemsAll = useMemo(
    () => toEventItems(nodes, eventSort, typeLabelOfNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, eventSort, customTypeMap]
  )

  // ——— Filtres (communs aux deux onglets) ———
  const [activeAuthors, setActiveAuthors] = useState<Set<string>>(new Set())
  const [category, setCategory] = useState<CategoryId | ''>('')
  const [activeStatuses, setActiveStatuses] = useState<Set<ElementStatus>>(new Set())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const sourceItems = tab === 'added' ? addedItems : eventItemsAll

  const authors = useMemo(() => {
    const set = new Set<string>()
    for (const item of sourceItems) set.add(item.author)
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [sourceItems])

  const categories = useMemo(() => {
    const set = new Set<CategoryId>()
    for (const item of sourceItems) {
      if (item.kind === 'entity' && item.entityType) {
        const cat = taxonomyType(item.entityType)?.category
        if (cat) set.add(cat)
      }
    }
    return TAXONOMY_CATEGORIES.filter((c) => set.has(c.id)).map((c) => c.id)
  }, [sourceItems])

  const passesFilters = useMemo(() => {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity
    return (item: TimelineItem): boolean => {
      if (activeAuthors.size > 0 && !activeAuthors.has(item.author)) return false
      if (activeStatuses.size > 0 && !activeStatuses.has(item.status ?? 'none')) return false
      if (category !== '') {
        const cat = item.kind === 'entity' && item.entityType ? taxonomyType(item.entityType)?.category : undefined
        if (cat !== category) return false
      }
      if (item.date < fromMs || item.date >= toMs) return false
      return true
    }
  }, [activeAuthors, activeStatuses, category, dateFrom, dateTo])

  const items = useMemo(() => addedItems.filter(passesFilters), [addedItems, passesFilters])
  const eventItems = useMemo(() => eventItemsAll.filter(passesFilters), [eventItemsAll, passesFilters])

  // Bornes temporelles selon l'onglet (les événements couvrent des fenêtres).
  const { minDate, maxDate } = useMemo(() => {
    if (tab === 'added') {
      return {
        minDate: items.length > 0 ? items[0].date : 0,
        maxDate: items.length > 0 ? Math.max(...items.map((i) => i.date)) : 0
      }
    }
    if (eventItems.length === 0) return { minDate: 0, maxDate: 0 }
    return {
      minDate: Math.min(...eventItems.map((e) => e.timing.start)),
      maxDate: Math.max(...eventItems.map((e) => e.timing.end))
    }
  }, [tab, items, eventItems])
  const spanDays = Math.max((maxDate - minDate) / DAY_MS, 0.5)
  const hasContent = tab === 'added' ? items.length > 0 : eventItems.length > 0
  const showFrise = tab === 'added' || eventView === 'frise'
  // Refonte UI : sous la frise des Événements, un tableau récapitulatif des mêmes éléments.
  const showTable = tab === 'events' && eventView === 'frise' && eventItems.length > 0

  // ——— Zoom (px par jour) ———
  const [pxPerDay, setPxPerDay] = useState<number | null>(null)
  // §1 v1.8.2 : demande de recentrage — après (re)calcul de la mise en page, on ramène
  // le défilement sur le début du contenu (au-delà de la marge de pan libre PAN_PAD).
  const pendingCenterRef = useRef(true)
  // Deux effets, DANS CET ORDRE (React les exécute dans l'ordre de déclaration) :
  //  1. au changement d'onglet/vue, le zoom repasse à « à recalculer » (null) + recentrage ;
  //  2. dès que le zoom est à recalculer ET que la piste est montée, on l'ajuste à toute la
  //     période.
  // L'ordre inverse (historique) annulait l'ajustement : le (2) posait une valeur, le (1) la
  // remettait à null dans le même lot, et React — ne voyant aucun changement d'état — ne
  // relançait pas de rendu. La frise restait alors à l'échelle par défaut (60 px/jour) à
  // l'ouverture, au retour de la vue liste et à chaque changement d'onglet.
  // Le (1) ne fait rien au montage ; le (2) n'a volontairement PAS de dépendances (la piste
  // est démontée en vue liste : il doit pouvoir s'exécuter au rendu où elle réapparaît), et
  // ne boucle pas puisqu'il ne fait rien dès que le zoom est défini.
  const viewKeyRef = useRef(`${tab}/${eventView}`)
  useLayoutEffect(() => {
    const key = `${tab}/${eventView}`
    if (viewKeyRef.current === key) return
    viewKeyRef.current = key
    setPxPerDay(null)
    pendingCenterRef.current = true
  }, [tab, eventView])
  useLayoutEffect(() => {
    if (pxPerDay === null && scrollRef.current) {
      const width = scrollRef.current.clientWidth - 2 * GAP - CARD_W
      setPxPerDay(Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, width / spanDays)))
    }
  })
  // Le détail affiché se referme si l'on change d'onglet/vue (l'élément peut ne pas
  // figurer dans l'autre frise).
  useEffect(() => {
    setSelectedId(null)
    setSelectedMark(null)
  }, [tab, eventView])

  // ——— §1 v1.8.1 : déplacement au glisser (les deux frises se parcourent) ———
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(
    null
  )
  const onPanPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    // On ne démarre PAS un déplacement depuis un élément interactif (carte, bouton,
    // ligne de liste, champ, panneau de détail) : clic et sélection y restent normaux.
    if (
      (event.target as HTMLElement).closest(
        '.tl-item, .tl-eventrow, .tl-list, .tl-detail, button, a, input, select'
      )
    ) {
      return
    }
    const el = scrollRef.current
    if (!el) return
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false
    }
    el.setPointerCapture(event.pointerId)
    el.classList.add('tl-scroll--panning')
  }
  const onPanPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = panRef.current
    const el = scrollRef.current
    if (!pan || !el) return
    if (Math.abs(event.clientX - pan.x) > 3 || Math.abs(event.clientY - pan.y) > 3) pan.moved = true
    el.scrollLeft = pan.scrollLeft - (event.clientX - pan.x)
    el.scrollTop = pan.scrollTop - (event.clientY - pan.y)
  }
  const onPanPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const el = scrollRef.current
    const pan = panRef.current
    if (pan && el) {
      try {
        el.releasePointerCapture(event.pointerId)
      } catch {
        /* pointeur déjà relâché */
      }
      el.classList.remove('tl-scroll--panning')
      // §2 v1.8.4 : un CLIC dans le vide (sans déplacement) désélectionne.
      if (!pan.moved) deselect()
    }
    panRef.current = null
  }

  const ppd = pxPerDay ?? 60
  const pxPerMs = ppd / DAY_MS

  // Placement en voies : pour les événements, la largeur visuelle d'un item est le
  // max de la carte et de sa fenêtre (barre) — sinon deux fenêtres qui se
  // chevauchent temporellement se superposeraient à l'écran.
  const laneItems = useMemo(() => {
    if (tab === 'added') return items.map((item) => ({ date: item.date, span: 0 }))
    return eventItems.map((event) => ({
      date: event.timing.start,
      span: (event.timing.end - event.timing.start) * pxPerMs
    }))
  }, [tab, items, eventItems, pxPerMs])

  // §1 v1.8.1 : voies calculées par assignLanes (robuste à l'ordre de tri : la carte
  // est positionnée par sa DATE, pas par son rang, donc le tri par nom/type/date
  // précise ne fait plus se chevaucher les éléments). Largeur = max(carte, fenêtre).
  const lanes = useMemo(
    () =>
      assignLanes(
        laneItems.map((item) => ({ date: item.date, width: Math.max(CARD_W, item.span + CARD_W) })),
        minDate,
        pxPerMs,
        CARD_W,
        GAP
      ),
    [laneItems, minDate, pxPerMs]
  )

  const laneCount = lanes.length > 0 ? Math.max(...lanes) + 1 : 1
  const contentWidth = Math.max((maxDate - minDate) * pxPerMs + CARD_W + 2 * GAP, 600)
  // Voies paires sous l'axe, impaires au-dessus ; on réserve toujours une rangée en haut
  // pour que l'axe ne colle pas au bord quand il n'y a qu'une voie.
  const lanesBelow = Math.ceil(laneCount / 2)
  const lanesAbove = Math.max(1, Math.floor(laneCount / 2))
  const axisY = TOP_PAD + AXIS_GAP_UP + CARD_H + (lanesAbove - 1) * LANE_H
  const contentHeight = axisY + AXIS_BAND + lanesBelow * LANE_H + BOTTOM_PAD
  const laneSide = (lane: number): 'up' | 'down' => (lane % 2 === 1 ? 'up' : 'down')
  const laneTop = (lane: number): number => {
    const depth = Math.floor(lane / 2)
    return laneSide(lane) === 'down'
      ? axisY + AXIS_BAND + depth * LANE_H
      : axisY - AXIS_GAP_UP - CARD_H - depth * LANE_H
  }

  // §1 v1.8.2 / §5 v1.8.3 : après (re)layout, applique le défilement en attente —
  // priorité au repositionnement de zoom (une date précise ramenée au bord gauche),
  // sinon au recentrage sur le début des éléments.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !hasContent || !showFrise) return
    if (pendingScrollMsRef.current !== null) {
      const leftMs = pendingScrollMsRef.current
      pendingScrollMsRef.current = null
      pendingCenterRef.current = false
      el.scrollLeft = PAN_PAD + (leftMs - minDate) * pxPerMs
      return
    }
    if (pendingCenterRef.current) {
      el.scrollLeft = PAN_PAD - GAP
      el.scrollTop = 0
      pendingCenterRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerDay, contentWidth, hasContent, showFrise, minDate, pxPerMs])

  // §5 v1.8.3 : suit la largeur visible (viewport) de la frise pour le navigateur de zoom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = (): void => setViewportW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [showFrise, tab, eventView])

  const recenter = (): void => {
    setPxPerDay(null)
    pendingCenterRef.current = true
    const el = scrollRef.current
    if (el) {
      el.scrollLeft = PAN_PAD - GAP
      el.scrollTop = 0
    }
  }

  // §2 v1.8.6 : validation du sélecteur de datation d'ajout. Sans AUCUNE date valide →
  // aucune création (exigence : « si on met pas de date ça ne s'ajoute pas »).
  const parseAddMs = (raw: string): number | undefined => {
    if (raw === '') return undefined
    const ms = addHasTime ? new Date(raw).getTime() : new Date(`${raw}T00:00:00`).getTime()
    return Number.isFinite(ms) ? ms : undefined
  }
  const resetAdd = (): void => {
    setAddKind(null)
    setAddMode('exact')
    setAddHasTime(false)
    setAddExact('')
    setAddEarliest('')
    setAddLatest('')
    setAddFrom('')
    setAddTo('')
  }
  const buildAddTiming = (): AddTiming | null => {
    if (addMode === 'exact') {
      const exact = parseAddMs(addExact)
      return exact !== undefined ? { exact, hasTime: addHasTime } : null
    }
    if (addMode === 'window') {
      const earliest = parseAddMs(addEarliest)
      const latest = parseAddMs(addLatest)
      if (earliest === undefined && latest === undefined) return null
      return { earliest, latest, hasTime: addHasTime }
    }
    const from = parseAddMs(addFrom)
    const to = parseAddMs(addTo)
    if (from === undefined && to === undefined) return null
    return { from, to, hasTime: addHasTime }
  }
  const confirmAdd = (): void => {
    if (addKind === null) return
    const timing = buildAddTiming()
    if (!timing) return
    onAddDated(addKind, timing)
    resetAdd()
  }
  const cancelAdd = (): void => resetAdd()
  const onAddKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'Enter') confirmAdd()
    else if (e.key === 'Escape') cancelAdd()
  }

  // ——— Graduations adaptatives ———
  const ticks = useMemo(() => {
    if (!hasContent) return [] as Array<{ x: number; label: string }>
    const stepDays = chooseTickStepDays(ppd)
    const out: Array<{ x: number; label: string }> = []
    const xOf = (ms: number): number => (ms - minDate) * pxPerMs
    let guard = 0
    if (stepDays >= 365) {
      const every = Math.max(1, Math.round(stepDays / 365))
      let year = new Date(minDate).getFullYear()
      year -= year % every
      for (; guard < 500; guard += 1) {
        const ms = new Date(year, 0, 1).getTime()
        if (ms > maxDate + every * 365 * DAY_MS) break
        if (ms >= minDate - every * 365 * DAY_MS) out.push({ x: xOf(ms), label: String(year) })
        year += every
        if (new Date(year, 0, 1).getTime() > maxDate) break
      }
    } else if (stepDays >= 28) {
      const every = Math.max(1, Math.round(stepDays / 30))
      const cursor = new Date(minDate)
      cursor.setDate(1)
      cursor.setHours(0, 0, 0, 0)
      for (; cursor.getTime() <= maxDate && guard < 500; guard += 1) {
        out.push({ x: xOf(cursor.getTime()), label: monthFmt.format(cursor) })
        cursor.setMonth(cursor.getMonth() + every)
      }
    } else {
      const stepMs = stepDays * DAY_MS
      const start = new Date(minDate)
      if (stepDays >= 1) start.setHours(0, 0, 0, 0)
      for (let ms = start.getTime(); ms <= maxDate && guard < 500; ms += stepMs, guard += 1) {
        out.push({ x: xOf(ms), label: stepDays < 1 ? timeFmt.format(new Date(ms)) : dayFmt.format(new Date(ms)) })
      }
    }
    return out
  }, [hasContent, ppd, minDate, maxDate, pxPerMs])

  const zoom = (factor: number): void => {
    setPxPerDay((prev) => Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, (prev ?? ppd) * factor)))
  }

  // §5 v1.8.3 : cadre la frise sur la fenêtre temporelle [startMs, endMs] — le zoom
  // (px/jour) s'ajuste pour qu'elle remplisse le viewport, puis on réancre le bord
  // indiqué (`left` = bord droit figé quand on tire la poignée gauche, et inversement).
  const applyView = (startMs: number, endMs: number, anchor: 'left' | 'right'): void => {
    const el = scrollRef.current
    if (!el) return
    const vw = el.clientWidth || viewportW || 1
    const days = Math.max((endMs - startMs) / DAY_MS, 1e-9)
    const nextPpd = Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, vw / days))
    const winMs = (vw / nextPpd) * DAY_MS
    pendingScrollMsRef.current = anchor === 'left' ? endMs - winMs : startMs
    setPxPerDay(nextPpd)
  }
  // §5 v1.8.3 : défile (sans changer le zoom) pour amener `startMs` au bord gauche.
  const panToStart = (startMs: number): void => {
    const el = scrollRef.current
    if (el) el.scrollLeft = PAN_PAD + (startMs - minDate) * pxPerMs
  }

  // §6 v1.8.3 : édition d'une datation depuis la frise (glisser une barre/un embout/un
  // repère), en réutilisant l'op du tableau — une seule étape d'annulation par geste.
  const editTiming = (id: string, patch: EventTimingPatch): void => {
    if (canEdit) setEventTiming(handle, id, patch, author)
  }

  // §2 v1.8.4 : repères éditables (titre/couleur/tags). Les opérations portent sur la
  // liste COMPLÈTE du nœud (pas seulement les repères visibles), pour ne rien perdre.
  const addMark = (nodeId: string, at: number): void => {
    const node = nodeById.get(nodeId)
    if (!node) return
    const mark: EventMark = { id: newId(), at }
    editTiming(nodeId, { marks: [...(node.eventMarks ?? []), mark] })
    selectMark(nodeId, mark.id)
  }
  const updateMark = (nodeId: string, markId: string, patch: Partial<EventMark>): void => {
    const node = nodeById.get(nodeId)
    if (!node?.eventMarks) return
    editTiming(nodeId, {
      marks: node.eventMarks.map((mark) => (mark.id === markId ? { ...mark, ...patch } : mark))
    })
  }
  const removeMark = (nodeId: string, markId: string): void => {
    const node = nodeById.get(nodeId)
    if (!node?.eventMarks) return
    editTiming(nodeId, { marks: node.eventMarks.filter((mark) => mark.id !== markId) })
    setSelectedMark((cur) => (cur?.markId === markId ? null : cur))
  }

  // Repère actuellement sélectionné (résolu depuis les données vivantes).
  const markNode = selectedMark ? (nodeById.get(selectedMark.nodeId) ?? null) : null
  const selectedMarkObj = markNode?.eventMarks?.find((m) => m.id === selectedMark?.markId) ?? null

  const exportPng = async (): Promise<void> => {
    if (!contentRef.current || !hasContent) {
      pushToast(t('export.emptyBoard'), 'info')
      return
    }
    try {
      const bg =
        getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#0b0c0e'
      // Polices embarquées en data: URI (même typographie que l'écran, cf. lib/fontEmbed).
      const { FONT_EMBED_CSS } = await import('@/lib/fontEmbed')
      const dataUrl = await toPng(contentRef.current, {
        backgroundColor: bg,
        fontEmbedCSS: FONT_EMBED_CSS,
        pixelRatio: 2,
        width: contentWidth,
        height: contentHeight
      })
      const result = await window.cosint.savePng(`${boardTitle || 'chronologie'}.png`, dataUrl)
      if (result.saved) pushToast(t('export.pngDone'), 'success')
      else if (result.error) pushToast(t('export.failed'), 'error')
    } catch (error) {
      pushToast(t('export.error', { message: String(error) }), 'error')
    }
  }

  const exportCsv = async (): Promise<void> => {
    if (!hasContent) {
      pushToast(t('csv.exportEmpty'), 'info')
      return
    }
    let rows: string[][]
    let name: string
    if (tab === 'added') {
      rows = [[t('timeline.csvElement'), t('timeline.csvDate'), t('timeline.csvType'), t('timeline.csvAuthor')]]
      for (const item of items) {
        rows.push([item.label || typeLabelOf(item), new Date(item.date).toISOString(), typeLabelOf(item), item.author])
      }
      name = `${boardTitle || 'chronologie'}_ajouts.csv`
    } else {
      rows = [[
        t('timeline.colName'),
        t('timeline.colType'),
        t('timeline.colStart'),
        t('timeline.colExact'),
        t('timeline.colEnd'),
        t('timeline.csvAuthor')
      ]]
      for (const event of eventItems) {
        const node = nodeById.get(event.id)
        rows.push([
          event.label || (node ? typeLabelOfNode(node) : ''),
          node ? typeLabelOfNode(node) : '',
          event.timing.earliest !== undefined ? new Date(event.timing.earliest).toISOString() : '',
          event.timing.exact !== undefined ? new Date(event.timing.exact).toISOString() : '',
          event.timing.latest !== undefined ? new Date(event.timing.latest).toISOString() : '',
          event.author
        ])
      }
      name = `${boardTitle || 'chronologie'}_evenements.csv`
    }
    const csv = stringifyCsv(rows, { bom: true })
    const result = await window.cosint.saveCsv(name, csv)
    if (result.saved) pushToast(t('csv.exportEntitiesDone'), 'success')
    else if (result.error) pushToast(t('export.failed'), 'error')
  }

  const toggleAuthor = (author: string): void =>
    setActiveAuthors((prev) => {
      const next = new Set(prev)
      if (next.has(author)) next.delete(author)
      else next.add(author)
      return next
    })

  const STATUS_FILTERS: ElementStatus[] = ['confirmed', 'issue', 'question', 'stop', 'onhold', 'false_positive']
  const toggleStatus = (status: ElementStatus): void =>
    setActiveStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })

  return (
    <div className={`tl-panel${showTable ? ' tl-panel--table' : ''}`}>
      <div className="tl-header">
        <span className="tl-title">{t('timeline.title')}</span>
        {/* Onglets Événements / Ajouts (§3 v1.8 ; ordre §3 v1.8.1 : Événements d'abord). */}
        <div className="tl-tabs" role="tablist">
          <button
            className={`tl-tab${tab === 'events' ? ' tl-tab--on' : ''}`}
            onClick={() => setTab('events')}
            title={t('timeline.tabEventsHint')}
            role="tab"
            aria-selected={tab === 'events'}
          >
            {t('timeline.tabEvents')}
          </button>
          <button
            className={`tl-tab${tab === 'added' ? ' tl-tab--on' : ''}`}
            onClick={() => setTab('added')}
            title={t('timeline.tabAddedHint')}
            role="tab"
            aria-selected={tab === 'added'}
          >
            {t('timeline.tabAdded')}
          </button>
        </div>
        <span className="tl-count">{t('timeline.count', { count: hasContent ? (tab === 'added' ? items.length : eventItems.length) : 0 })}</span>
        <div className="tl-header__spacer" />
        {/* Refonte UI : la période filtrée vit dans l'en-tête, à côté des exports. */}
        <label className="tl-date">
          <span className="tl-date__lbl">{t('timeline.from')}</span>
          <input type="date" className="csv-select" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="tl-date">
          <span className="tl-date__lbl">{t('timeline.to')}</span>
          <input type="date" className="csv-select" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <button className="cm-btn" onClick={() => void exportPng()} title={t('timeline.exportPng')}>
          <Download size={13} />
          {t('timeline.pngShort')}
        </button>
        <button className="cm-btn" onClick={() => void exportCsv()} title={t('timeline.exportCsv')}>
          <Download size={13} />
          {t('timeline.csvShort')}
        </button>
        <button className="cm-btn cm-btn--ghost tl-back" onClick={onClose}>
          <ArrowLeft size={14} />
          {t('timeline.backCanvas')}
        </button>
      </div>

      <div className="tl-filters">
        {/* Contrôles propres à l'onglet Événements : tri + vue frise/liste. */}
        {tab === 'events' && (
          <>
            <label className="tl-sort">
              {t('timeline.sortBy')}
              <select className="csv-select" value={eventSort} onChange={(e) => setEventSort(e.target.value as EventSortKey)}>
                <option value="start">{t('timeline.sortStart')}</option>
                <option value="exact">{t('timeline.sortExact')}</option>
                <option value="name">{t('timeline.sortName')}</option>
                <option value="type">{t('timeline.sortType')}</option>
              </select>
            </label>
            <div className="tl-viewtoggle" role="group">
              <button
                className={`tl-status-btn${eventView === 'frise' ? ' tl-status-btn--on' : ''}`}
                onClick={() => setEventView('frise')}
                title={t('timeline.viewFrise')}
              >
                <Clock size={15} />
              </button>
              <button
                className={`tl-status-btn${eventView === 'list' ? ' tl-status-btn--on' : ''}`}
                onClick={() => setEventView('list')}
                title={t('timeline.viewList')}
              >
                <List size={15} />
              </button>
            </div>
          </>
        )}
        {categories.length > 0 && (
          <select className="csv-select" value={category} onChange={(e) => setCategory(e.target.value as CategoryId | '')}>
            <option value="">{t('search.allCategories')}</option>
            {categories.map((id) => {
              const def = taxonomyCategory(id)
              return <option key={id} value={id}>{def ? t(def.nameKey) : id}</option>
            })}
          </select>
        )}
        <div className="tl-status-filter">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              className={`tl-status-btn${activeStatuses.has(status) ? ' tl-status-btn--on' : ''}`}
              onClick={() => toggleStatus(status)}
              title={t('timeline.filterStatus')}
            >
              <StatusBadge status={status} size={16} />
            </button>
          ))}
        </div>
        {authors.length > 1 && (
          <div className="tl-authors">
            {authors.map((author) => (
              <button
                key={author}
                className={`tl-author${activeAuthors.has(author) ? ' tl-author--on' : ''}`}
                onClick={() => toggleAuthor(author)}
              >
                {author}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ——— Vue LISTE (onglet Événements) ——— */}
      {tab === 'events' && eventView === 'list' ? (
        <div className="tl-scroll">
          {eventItems.length === 0 ? (
            <div className="tl-empty">{t('timeline.emptyEvents')}</div>
          ) : (
            <table className="tl-list">
              <thead>
                <tr>
                  <th>{t('timeline.colName')}</th>
                  <th>{t('timeline.colType')}</th>
                  <th>{t('timeline.colStart')}</th>
                  <th>{t('timeline.colExact')}</th>
                  <th>{t('timeline.colEnd')}</th>
                </tr>
              </thead>
              <tbody>
                {eventItems.map((event) => {
                  const node = nodeById.get(event.id)
                  return (
                    <tr
                      key={event.id}
                      className={`tl-list__row${selectedId === event.id ? ' tl-list__row--selected' : ''}`}
                      onClick={() => selectNode(event.id)}
                    >
                      <td className="tl-list__name">
                        <EventItemIcon entityType={event.entityType} kind={event.kind} customTypeMap={customTypeMap} />
                        {event.label || (node ? typeLabelOfNode(node) : '')}
                        {event.status && event.status !== 'none' && <StatusBadge status={event.status} size={12} />}
                      </td>
                      <td>{node ? typeLabelOfNode(node) : ''}</td>
                      <td>{event.timing.earliest !== undefined ? `${t('timeline.approx')} ${fmtBound(event.timing.earliest, event.timing.hasTime)}` : ''}</td>
                      <td>{event.timing.exact !== undefined ? fmtBound(event.timing.exact, event.timing.hasTime) : ''}</td>
                      <td>{event.timing.latest !== undefined ? `${t('timeline.approx')} ${fmtBound(event.timing.latest, event.timing.hasTime)}` : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* ——— Vue FRISE (Ajouts, ou Événements en mode frise) ——— */
        <div
          className="tl-scroll tl-scroll--pan"
          ref={scrollRef}
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          onPointerDown={onPanPointerDown}
          onPointerMove={onPanPointerMove}
          onPointerUp={onPanPointerEnd}
          onPointerCancel={onPanPointerEnd}
        >
          {!hasContent ? (
            <div className="tl-empty">{tab === 'added' ? t('timeline.empty') : t('timeline.emptyEvents')}</div>
          ) : (
            <div className="tl-track" style={{ paddingLeft: PAN_PAD, paddingRight: PAN_PAD }}>
              <div className="tl-content" ref={contentRef} style={{ width: contentWidth, height: contentHeight }}>
              <div className="tl-axis" style={{ top: axisY }} />
              {ticks.map((tick, i) => (
                <div key={i} className="tl-tick" style={{ left: tick.x }}>
                  <div className="tl-tick__line" style={{ top: 4, height: contentHeight - 8 }} />
                  <div className="tl-tick__mark" style={{ top: axisY - 4 }} />
                  <div className="tl-tick__label" style={{ top: axisY + 8 }}>{tick.label}</div>
                </div>
              ))}
              {tab === 'added'
                ? items.map((item, i) => {
                    const x = (item.date - minDate) * pxPerMs
                    const top = laneTop(lanes[i])
                    const side = laneSide(lanes[i])
                    const typeLabel = typeLabelOf(item)
                    const label = item.label || typeLabel
                    const itemNode = nodeById.get(item.id)
                    const color = itemNode ? colorHex(itemNode.color) : 'var(--accent)'
                    return (
                      <Fragment key={item.id}>
                        {/* Fil reliant la carte à sa date sur l'axe. */}
                        <span
                          className={`tl-thread tl-thread--${side}${selectedId === item.id ? ' tl-thread--sel' : ''}`}
                          style={
                            {
                              left: x,
                              top: side === 'down' ? axisY : top + CARD_H / 2,
                              height: side === 'down' ? top - axisY + CARD_H / 2 : axisY - top - CARD_H / 2,
                              '--evt': color
                            } as CSSProperties
                          }
                        />
                        <button
                          className={`tl-item${selectedId === item.id ? ' tl-item--selected' : ''}`}
                          style={{ left: x, top }}
                          onClick={() => selectNode(item.id)}
                          title={`${label}\n${typeLabel} · ${item.author}\n${fullFmt.format(new Date(item.date))}${item.isEventDate ? ` (${t('timeline.eventDate')})` : ''}`}
                        >
                          <TimelineCardBody
                            icon={<EventItemIcon entityType={item.entityType} kind={item.kind} customTypeMap={customTypeMap} />}
                            color={color}
                            date={cardDateFmt.format(new Date(item.date))}
                            label={label}
                            sub={label === typeLabel ? item.author : typeLabel}
                            status={item.status}
                          />
                        </button>
                      </Fragment>
                    )
                  })
                : eventItems.map((event, i) => {
                    const top = laneTop(lanes[i])
                    const node = nodeById.get(event.id)
                    const typeLabel = node ? typeLabelOfNode(node) : ''
                    const label = event.label || typeLabel
                    // §1 v1.8.4 : couleur = celle du nœud (reflète les changements
                    // graphiques faits dans l'éditeur), repli sur l'accent.
                    const color = node ? colorHex(node.color) : 'var(--accent)'
                    return (
                      <EventRow
                        key={event.id}
                        event={event}
                        top={top}
                        axisTop={axisY}
                        side={laneSide(lanes[i])}
                        label={label}
                        sub={label === typeLabel ? '' : typeLabel}
                        color={color}
                        minDate={minDate}
                        pxPerMs={pxPerMs}
                        selected={selectedId === event.id}
                        selectedMarkId={selectedMark?.nodeId === event.id ? selectedMark.markId : null}
                        canEdit={canEdit}
                        dragModifier={dragModifier}
                        modKeyLabel={modKeyLabel}
                        customTypeMap={customTypeMap}
                        allMarks={node?.eventMarks ?? []}
                        onSelect={() => selectNode(event.id)}
                        onCommit={(patch) => editTiming(event.id, patch)}
                        onSelectMark={(markId) => selectMark(event.id, markId)}
                        onMoveMark={(markId, at) => updateMark(event.id, markId, { at })}
                        onRemoveMark={(markId) => removeMark(event.id, markId)}
                        onAddMark={(at) => addMark(event.id, at)}
                        onHint={showHint}
                      />
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* §5 v1.8.3 : navigateur de zoom (barre du bas, façon Premiere Pro) — élargir la
          poignée dézoome, la rétrécir zoome ; glisser le milieu fait défiler. */}
      {showFrise && hasContent && (
        <ZoomBar
          minDate={minDate}
          maxDate={maxDate}
          pxPerMs={pxPerMs}
          scrollLeft={scrollLeft}
          viewportW={viewportW}
          panPad={PAN_PAD}
          onZoomTo={applyView}
          onPanTo={panToStart}
        />
      )}

      {showTable && (
        <div className="tl-table">
          <table className="tl-list">
            <thead>
              <tr>
                <th>{t('timeline.colElement')}</th>
                <th>{t('timeline.colEventDate')}</th>
                <th>{t('timeline.colKind')}</th>
                <th>{t('timeline.colAuthor')}</th>
                <th>{t('timeline.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {eventItems.map((event) => {
                const node = nodeById.get(event.id)
                const typeLabel = node ? typeLabelOfNode(node) : ''
                const { timing } = event
                return (
                  <tr
                    key={event.id}
                    className={`tl-list__row${selectedId === event.id ? ' tl-list__row--selected' : ''}`}
                    onClick={() => selectNode(event.id)}
                  >
                    <td className="tl-list__name">{event.label || typeLabel}</td>
                    <td>
                      {timing.isRange
                        ? `${cardDateFmt.format(new Date(timing.start))} → ${cardDateFmt.format(new Date(timing.end))}`
                        : fmtBound(timing.start, timing.hasTime)}
                    </td>
                    <td>{typeLabel}</td>
                    <td>{event.author}</td>
                    <td>
                      <StatusPill status={event.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* §2 v1.8.2 : barre d'outils HORIZONTALE en bas de la frise — retour au tableau,
          ajout d'éléments datés, zoom et recentrage (remplace la barre verticale du canvas). */}
      {showFrise && (
        <div className="tl-toolbar" role="toolbar" aria-label={t('timeline.toolbar')}>
          {/* §4 v1.8.3 : retour au tableau principal directement depuis la barre du bas. */}
          <div className="tl-toolbar__group">
            <button className="tl-toolbar__btn" onClick={onClose} title={t('timeline.backBoard')} aria-label={t('timeline.backBoard')}>
              <LayoutGrid size={17} />
            </button>
          </div>
          <div className="tl-toolbar__sep" />
          {canEdit && (
            <>
              <div className="tl-toolbar__group">
                {TL_ADD_TOOLS.map(({ kind, icon: Icon, titleKey }) => (
                  <button
                    key={kind}
                    className={`tl-toolbar__btn${addKind === kind ? ' tl-toolbar__btn--active' : ''}`}
                    onClick={() => {
                      const willOpen = addKind !== kind
                      resetAdd()
                      if (willOpen) setAddKind(kind)
                    }}
                    title={t(titleKey)}
                    aria-label={t(titleKey)}
                  >
                    <Icon size={17} />
                  </button>
                ))}
              </div>
              <div className="tl-toolbar__sep" />
            </>
          )}
          <div className="tl-toolbar__group">
            <button className="tl-toolbar__btn" onClick={() => zoom(1 / 1.4)} title={t('toolbar.zoomOut')} aria-label={t('toolbar.zoomOut')}>
              <Minus size={17} />
            </button>
            <button className="tl-toolbar__btn" onClick={() => zoom(1.4)} title={t('toolbar.zoomIn')} aria-label={t('toolbar.zoomIn')}>
              <Plus size={17} />
            </button>
            <button className="tl-toolbar__btn" onClick={recenter} title={t('timeline.recenter')} aria-label={t('timeline.recenter')}>
              <LocateFixed size={17} />
            </button>
          </div>

          {/* §2 v1.8.6 : sélecteur de datation — date précise / fourchette / durée.
              L'ajout n'aboutit qu'une fois AU MOINS une date renseignée. */}
          {addKind !== null && (
            <div className="tl-addpop" role="dialog" aria-label={t('timeline.addDated')}>
              <div className="tl-addpop__head">
                <span className="tl-addpop__title">{t('timeline.addDated')}</span>
                <span className="tl-addpop__kind">{t(`nodeType.${addKind}` as MessageKey)}</span>
              </div>
              <div className="bd-event__modes" role="group" aria-label={t('event.section')}>
                <button
                  type="button"
                  className={`bd-event__mode${addMode === 'exact' ? ' bd-event__mode--on' : ''}`}
                  onClick={() => setAddMode('exact')}
                >
                  {t('event.modeExact')}
                </button>
                <button
                  type="button"
                  className={`bd-event__mode${addMode === 'window' ? ' bd-event__mode--on' : ''}`}
                  onClick={() => setAddMode('window')}
                >
                  {t('event.modeWindow')}
                </button>
                <button
                  type="button"
                  className={`bd-event__mode${addMode === 'duration' ? ' bd-event__mode--on' : ''}`}
                  onClick={() => setAddMode('duration')}
                >
                  {t('event.modeDuration')}
                </button>
              </div>
              {addMode === 'exact' ? (
                <div className="bd-event__row">
                  <span className="bd-event__lbl">{t('event.exact')}</span>
                  <input
                    type={addHasTime ? 'datetime-local' : 'date'}
                    className="cm-input"
                    value={addExact}
                    autoFocus
                    onChange={(e) => setAddExact(e.target.value)}
                    onKeyDown={onAddKeyDown}
                  />
                </div>
              ) : addMode === 'window' ? (
                <>
                  <div className="bd-event__row">
                    <span className="bd-event__lbl">{t('event.earliest')}</span>
                    <input
                      type={addHasTime ? 'datetime-local' : 'date'}
                      className="cm-input"
                      value={addEarliest}
                      autoFocus
                      onChange={(e) => setAddEarliest(e.target.value)}
                      onKeyDown={onAddKeyDown}
                    />
                  </div>
                  <div className="bd-event__row">
                    <span className="bd-event__lbl">{t('event.latest')}</span>
                    <input
                      type={addHasTime ? 'datetime-local' : 'date'}
                      className="cm-input"
                      value={addLatest}
                      onChange={(e) => setAddLatest(e.target.value)}
                      onKeyDown={onAddKeyDown}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="bd-event__row">
                    <span className="bd-event__lbl">{t('event.from')}</span>
                    <input
                      type={addHasTime ? 'datetime-local' : 'date'}
                      className="cm-input"
                      value={addFrom}
                      autoFocus
                      onChange={(e) => setAddFrom(e.target.value)}
                      onKeyDown={onAddKeyDown}
                    />
                  </div>
                  <div className="bd-event__row">
                    <span className="bd-event__lbl">{t('event.to')}</span>
                    <input
                      type={addHasTime ? 'datetime-local' : 'date'}
                      className="cm-input"
                      value={addTo}
                      onChange={(e) => setAddTo(e.target.value)}
                      onKeyDown={onAddKeyDown}
                    />
                  </div>
                </>
              )}
              <label className="tl-addpop__time">
                <input type="checkbox" checked={addHasTime} onChange={(e) => setAddHasTime(e.target.checked)} />
                {t('event.withTime')}
              </label>
              <p className="tl-addpop__hint">
                {addMode === 'exact'
                  ? t('event.exactModeHint')
                  : addMode === 'window'
                    ? t('event.windowHint')
                    : t('event.durationHint')}
              </p>
              <div className="tl-addpop__foot">
                <button className="cm-btn cm-btn--sm" onClick={cancelAdd}>{t('common.cancel')}</button>
                <button
                  className="cm-btn cm-btn--primary cm-btn--sm"
                  onClick={confirmAdd}
                  disabled={buildAddTiming() === null}
                >
                  {t('timeline.addConfirm')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* §1 v1.8.1 : détail de l'élément cliqué — affiché SUR la frise. Le bouton
          « Voir sur le tableau » est le SEUL à emmener au canvas (plus de navigation
          au simple clic). Un repère sélectionné ouvre plutôt son mini-éditeur (§2 v1.8.4). */}
      {selectedMark && selectedMarkObj && markNode ? (
        <MarkEditor
          mark={selectedMarkObj}
          hasTime={markNode.eventHasTime === true}
          canEdit={canEdit}
          onChange={(patch) => updateMark(selectedMark.nodeId, selectedMark.markId, patch)}
          onDelete={() => removeMark(selectedMark.nodeId, selectedMark.markId)}
          onClose={() => setSelectedMark(null)}
        />
      ) : selectedNode ? (
        <TimelineDetail
          node={selectedNode}
          customTypeMap={customTypeMap}
          onLocate={() => onLocate(selectedNode.id)}
          onClose={deselect}
        />
      ) : null}

      {/* §3 v1.8.6 : indice discret « Maintenez [touche] pour … », près du pointeur,
          quand on tente d'éditer une barre sans maintenir le modificateur. */}
      {hint && (
        <div className="tl-hint" role="status" style={{ left: hint.x, top: hint.y }}>
          {hint.text}
        </div>
      )}
    </div>
  )
}

/**
 * Détail d'un élément affiché sur la frise (§1 v1.8.1 ; §6 v1.8.3) : embarque l'ÉDITEUR
 * COMPLET du tableau (`NodeDetails` — titre, champs, couleur, tags, datation, suppression)
 * pour modifier les DONNÉES sans quitter la frise. L'édition VISUELLE (glisser la barre)
 * se fait directement sur la piste. « Voir sur le tableau » bascule vers le canvas.
 */
function TimelineDetail({
  node,
  customTypeMap,
  onLocate,
  onClose
}: {
  node: BoardNodeData
  customTypeMap: CustomTypeMap
  onLocate: () => void
  onClose: () => void
}): JSX.Element {
  const label =
    node.title.trim() ||
    node.fields.find((field) => field.value.trim() !== '')?.value ||
    t(`nodeType.${node.kind}` as MessageKey)

  return (
    <div className="tl-detail" role="dialog" aria-label={label}>
      <div className="tl-detail__head">
        <span className="tl-detail__ico">
          <EventItemIcon entityType={node.entityType} kind={node.kind} customTypeMap={customTypeMap} />
        </span>
        <span className="tl-detail__title" title={label}>{label}</span>
        {node.status && node.status !== 'none' && <StatusBadge status={node.status} size={14} />}
        <button
          className="cm-btn cm-btn--ghost cm-btn--icon"
          onClick={onClose}
          title={t('timeline.detailClose')}
          aria-label={t('timeline.detailClose')}
        >
          <X size={14} />
        </button>
      </div>

      {/* §6 v1.8.3 : éditeur IDENTIQUE à celui du panneau latéral du tableau. */}
      <div className="tl-detail__editor">
        <NodeDetails key={node.id} node={node} />
      </div>

      <button className="cm-btn cm-btn--primary tl-detail__locate" onClick={onLocate}>
        <Crosshair size={14} />
        {t('timeline.openBoard')}
      </button>
    </div>
  )
}

/** Icône + couleur d'un élément (types personnalisés inclus). */
function EventItemIcon({
  entityType,
  kind,
  customTypeMap
}: {
  entityType?: string
  kind: NodeKind
  customTypeMap: CustomTypeMap
}): JSX.Element {
  if (kind === 'entity' && entityType) {
    const resolved = resolveType(entityType, customTypeMap)
    return <span style={{ color: resolved.color }}><EntityIcon icon={resolved.icon} size={14} /></span>
  }
  const Icon = KIND_ICONS[kind as Exclude<NodeKind, 'entity'>] ?? StickyNote
  return <Icon size={14} />
}

/** Résumé texte d'une fenêtre d'événement pour l'infobulle. */
function eventTooltip(timing: EventTiming): string {
  const parts: string[] = []
  if (timing.exact !== undefined) parts.push(fmtBound(timing.exact, timing.hasTime))
  if (timing.earliest !== undefined || timing.latest !== undefined) {
    const from = timing.earliest !== undefined ? fmtBound(timing.earliest, timing.hasTime) : '?'
    const to = timing.latest !== undefined ? fmtBound(timing.latest, timing.hasTime) : '?'
    parts.push(`${t('timeline.approx')} ${from} ${t('timeline.rangeSep')} ${to}`)
  }
  if (timing.from !== undefined || timing.to !== undefined) {
    const from = timing.from !== undefined ? fmtBound(timing.from, timing.hasTime) : '?'
    const to = timing.to !== undefined ? fmtBound(timing.to, timing.hasTime) : '?'
    parts.push(`${from} ${t('timeline.rangeSep')} ${to}`)
  }
  return parts.join(' · ') || t('timeline.unknownDate')
}

/**
 * Contenu d'une carte de la frise (refonte UI) : pastille d'icône teintée, puis date
 * (monospace), titre et type sur trois lignes ; statut à droite.
 */
function TimelineCardBody({
  icon,
  color,
  date,
  label,
  sub,
  status
}: {
  icon: JSX.Element
  color: string
  date: string
  label: string
  sub: string
  status?: ElementStatus
}): JSX.Element {
  return (
    <>
      <span
        className="tl-item__ico"
        style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        {icon}
      </span>
      <span className="tl-item__text">
        <span className="tl-item__date">{date}</span>
        <span className="tl-item__label">{label}</span>
        {sub !== '' && <span className="tl-item__sub">{sub}</span>}
      </span>
      {status && status !== 'none' && (
        <span className="tl-item__badge">
          <StatusBadge status={status} size={13} />
        </span>
      )}
    </>
  )
}

/** Pastille de statut du tableau récapitulatif (point coloré + libellé). */
function StatusPill({ status }: { status?: ElementStatus }): JSX.Element | null {
  if (!hasStatusBadge(status)) return null
  const def = statusDef(status)
  return (
    <span
      className="tl-pill"
      style={{ color: def.color, background: `color-mix(in srgb, ${def.color} 14%, transparent)` }}
    >
      <span className="tl-pill__dot" aria-hidden="true" />
      {t(def.labelKey)}
    </span>
  )
}

/**
 * §6 v1.8.3 (§7 v1.8.4) : ligne d'un événement sur la piste — carte + barre de plage
 * éditable VISUELLEMENT. L'édition ne démarre qu'avec **Ctrl (⌘) enfoncé** : Ctrl+glisser
 * la barre la déplace, Ctrl+glisser un embout ajuste début/fin ; sinon un simple clic
 * sélectionne. Double-clic = pose un repère (éditable : titre/couleur/tags, glissable en
 * Ctrl, clic droit pour retirer). Une DURÉE (de/à) est un trait plein ; une FOURCHETTE
 * incertaine est un trait hachuré gris ; toutes deux à embouts.
 */
interface EventRowProps {
  event: TimelineEvent
  top: number
  /** §4 v1.8.6 : ordonnée de l'axe temporel (haut), pour tracer les fils vers les dates. */
  axisTop: number
  /** Côté de l'axe où se range la carte (voies paires dessous, impaires dessus). */
  side: 'up' | 'down'
  label: string
  /** Seconde ligne de la carte (type de l'élément) ; vide si le titre est déjà le type. */
  sub: string
  color: string
  minDate: number
  pxPerMs: number
  selected: boolean
  selectedMarkId: string | null
  canEdit: boolean
  /** §3 v1.8.6 : touche de maintien exigée pour l'édition au glisser + son libellé. */
  dragModifier: DragModifier
  modKeyLabel: string
  customTypeMap: CustomTypeMap
  /** Liste COMPLÈTE des repères du nœud (pour un déplacement d'ensemble sans perte). */
  allMarks: EventMark[]
  onSelect: () => void
  onCommit: (patch: EventTimingPatch) => void
  onSelectMark: (markId: string) => void
  onMoveMark: (markId: string, at: number) => void
  onRemoveMark: (markId: string) => void
  onAddMark: (at: number) => void
  /** §3 v1.8.6 : affiche l'indice « Maintenez [touche] pour … » près du pointeur. */
  onHint: (text: string, clientX: number, clientY: number) => void
}

type TlDragKind = 'move' | 'l' | 'r' | 'mark'
interface TlDragState {
  kind: TlDragKind
  markId: string | null
  originX: number
  deltaMs: number
  moved: boolean
}

function EventRow({
  event,
  top,
  axisTop,
  side,
  label,
  sub,
  color,
  minDate,
  pxPerMs,
  selected,
  selectedMarkId,
  canEdit,
  dragModifier,
  modKeyLabel,
  customTypeMap,
  allMarks,
  onSelect,
  onCommit,
  onSelectMark,
  onMoveMark,
  onRemoveMark,
  onAddMark,
  onHint
}: EventRowProps): JSX.Element {
  const { timing } = event
  const [drag, setDrag] = useState<TlDragState | null>(null)
  const suppressClick = useRef(false)

  const isDuration = timing.isDuration
  const lowKey: 'from' | 'earliest' = isDuration ? 'from' : 'earliest'
  const highKey: 'to' | 'latest' = isDuration ? 'to' : 'latest'
  const origLow = isDuration ? timing.from : timing.earliest
  const origHigh = isDuration ? timing.to : timing.latest

  const snapMs = timing.hasTime ? 60_000 : DAY_MS
  const snap = (ms: number): number => Math.round(ms / snapMs) * snapMs
  const clampMs = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

  // Bornes de prévisualisation appliquées pendant le glisser (aucune écriture avant le
  // relâcher). En dehors d'un glisser, ce sont les bornes réelles de la datation.
  const d = drag ? snap(drag.deltaMs) : 0
  let pStart = timing.start
  let pEnd = timing.end
  if (drag) {
    if (drag.kind === 'move') {
      pStart += d
      pEnd += d
    } else if (drag.kind === 'l') {
      pStart = Math.min(timing.start + d, timing.end)
    } else if (drag.kind === 'r') {
      pEnd = Math.max(timing.end + d, timing.start)
    }
  }
  const x = (pStart - minDate) * pxPerMs
  const barW = Math.max(0, (pEnd - pStart) * pxPerMs)

  // Position d'aperçu d'un repère pendant un glisser.
  const markAt = (mark: EventMark): number => {
    if (!drag) return mark.at
    if (drag.kind === 'move') return mark.at + d
    if (drag.kind === 'mark' && drag.markId === mark.id) return clampMs(mark.at + d, timing.start, timing.end)
    return mark.at
  }

  // §3 v1.8.6 : libellé d'action pour l'indice « Maintenez [touche] pour … ».
  const dragActionLabel = (kind: TlDragKind): string => {
    if (kind === 'l') return t('timeline.holdResizeStart')
    if (kind === 'r') return t('timeline.holdResizeEnd')
    if (kind === 'mark') return t('timeline.holdMoveMark')
    return timing.isRange ? t('timeline.holdMoveBar') : t('timeline.holdMoveDate')
  }
  const beginDrag =
    (kind: TlDragKind, markId: string | null) =>
    (e: ReactPointerEvent): void => {
      if (!canEdit || e.button !== 0) return
      e.stopPropagation()
      // §3 v1.8.6 : l'édition visuelle exige la touche de maintien configurée. Sans elle,
      // un simple clic sélectionne (plus de déplacement accidentel) — et un indice discret
      // rappelle la touche à maintenir pour agir.
      if (!eventHasModifier(e, dragModifier)) {
        onHint(t('timeline.hold', { key: modKeyLabel, action: dragActionLabel(kind) }), e.clientX, e.clientY)
        return
      }
      e.preventDefault()
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* capture indisponible */
      }
      setDrag({ kind, markId, originX: e.clientX, deltaMs: 0, moved: false })
    }
  const moveDrag = (e: ReactPointerEvent): void =>
    setDrag((cur) =>
      cur
        ? { ...cur, deltaMs: (e.clientX - cur.originX) / pxPerMs, moved: cur.moved || Math.abs(e.clientX - cur.originX) > 3 }
        : cur
    )
  const endDrag = (e: ReactPointerEvent): void => {
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* déjà relâché */
    }
    setDrag((cur) => {
      if (!cur) return null
      const dd = snap(cur.deltaMs)
      if (!cur.moved || dd === 0) return null // simple clic → laissé à onClick (sélection)
      suppressClick.current = true
      if (cur.kind === 'mark' && cur.markId) {
        const mark = timing.marks.find((m) => m.id === cur.markId)
        if (mark) onMoveMark(cur.markId, clampMs(mark.at + dd, timing.start, timing.end))
        return null
      }
      const patch: EventTimingPatch = {}
      if (!timing.isRange) {
        // Point unique : on déplace la seule borne renseignée.
        if (timing.exact !== undefined) patch.exact = timing.exact + dd
        else if (origLow !== undefined) patch[lowKey] = origLow + dd
        else if (origHigh !== undefined) patch[highKey] = origHigh + dd
      } else if (cur.kind === 'l' && origLow !== undefined) {
        patch[lowKey] = Math.min(origLow + dd, origHigh ?? timing.end)
      } else if (cur.kind === 'r' && origHigh !== undefined) {
        patch[highKey] = Math.max(origHigh + dd, origLow ?? timing.start)
      } else if (cur.kind === 'move') {
        if (origLow !== undefined) patch[lowKey] = origLow + dd
        if (origHigh !== undefined) patch[highKey] = origHigh + dd
        // Les repères suivent le déplacement d'ensemble (liste complète → aucune perte).
        if (allMarks.length > 0) patch.marks = allMarks.map((m) => ({ ...m, at: m.at + dd }))
      }
      onCommit(patch)
      return null
    })
  }
  const dragProps = { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag }
  const clickSelect = (): void => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    onSelect()
  }

  const addMarkAt = (e: ReactMouseEvent): void => {
    if (!canEdit || !timing.isRange) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    onAddMark(clampMs(snap(timing.start + (e.clientX - rect.left) / pxPerMs), timing.start, timing.end))
  }

  // §4 v1.8.6 : hauteur des fils reliant la barre à l'axe (haut). Le fil part du niveau
  // de l'axe (au-dessus de la ligne) et descend jusqu'au centre de la barre.
  // Refonte UI : la carte est sous l'axe (fil qui descend) ou au-dessus (fil qui remonte).
  const threadTop = side === 'down' ? axisTop - top : CARD_H / 2
  const threadH = side === 'down' ? top - axisTop + CARD_H / 2 : axisTop - top - CARD_H / 2

  return (
    <div className={`tl-eventrow tl-eventrow--${side}`} style={{ left: x, top }}>
      {/* §4 v1.8.6 : fil fin reliant l'extrémité de DÉBUT (ou la date exacte) à sa date en
          haut ; pour une plage, un second fil relie la FIN. La date exacte s'affiche au
          sommet du fil quand l'élément est sélectionné. */}
      <span
        className={`tl-thread tl-thread--${side}${selected ? ' tl-thread--sel' : ''}`}
        style={{ left: 0, top: threadTop, height: threadH, '--evt': color } as CSSProperties}
      >
        {selected && <span className="tl-thread__date">{fmtBound(pStart, timing.hasTime)}</span>}
      </span>
      {timing.isRange && (
        <span
          className={`tl-thread tl-thread--${side} tl-thread--end${selected ? ' tl-thread--sel' : ''}`}
          style={{ left: barW, top: threadTop, height: threadH, '--evt': color } as CSSProperties}
        >
          {selected && <span className="tl-thread__date">{fmtBound(pEnd, timing.hasTime)}</span>}
        </span>
      )}
      {timing.isRange && (
        <span
          className={`tl-eventbar tl-eventbar--${isDuration ? 'duration' : 'uncertain'}${selected ? ' tl-eventbar--sel' : ''}${
            drag ? ' tl-eventbar--drag' : ''
          }${canEdit ? ' tl-eventbar--editable' : ''}`}
          // §3 v1.8.5 : couleur de l'élément propagée par variables CSS — trait plein
          // (durée), hachures colorées + fond teinté (fourchette), et embouts assortis.
          style={
            {
              width: barW,
              '--evt': color,
              '--evt-soft': withAlpha(color, 0.16),
              '--evt-line': withAlpha(color, 0.5)
            } as CSSProperties
          }
          title={canEdit ? t('timeline.barMove', { key: modKeyLabel }) : eventTooltip(timing)}
          onClick={clickSelect}
          onPointerDown={beginDrag('move', null)}
          onDoubleClick={addMarkAt}
          {...dragProps}
        >
          <span className="tl-eventbar__body" />
          <span
            className={`tl-eventcap tl-eventcap--l${canEdit ? ' tl-eventcap--grip' : ''}`}
            onPointerDown={canEdit ? beginDrag('l', null) : undefined}
            {...(canEdit ? dragProps : {})}
          />
          <span
            className={`tl-eventcap tl-eventcap--r${canEdit ? ' tl-eventcap--grip' : ''}`}
            onPointerDown={canEdit ? beginDrag('r', null) : undefined}
            {...(canEdit ? dragProps : {})}
          />
          {timing.marks.map((mark) => {
            const mc = mark.color ? colorHex(mark.color) : color
            return (
              <span
                key={mark.id}
                className={`tl-mark${selectedMarkId === mark.id ? ' tl-mark--sel' : ''}`}
                style={{ left: (markAt(mark) - pStart) * pxPerMs }}
                title={mark.label || fmtBound(mark.at, timing.hasTime)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  onSelectMark(mark.id)
                }}
                onPointerDown={canEdit ? beginDrag('mark', mark.id) : undefined}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (canEdit) onRemoveMark(mark.id)
                }}
                {...(canEdit ? dragProps : {})}
              >
                <span className="tl-mark__dot" style={{ background: mc }} />
                {mark.label && <span className="tl-mark__lbl">{mark.label}</span>}
              </span>
            )
          })}
        </span>
      )}
      {/* La carte (bloc étiqueté) : clic = sélection ; Ctrl+glisser = déplacer la date. */}
      <button
        className={`tl-item tl-item--event${selected ? ' tl-item--selected' : ''}`}
        onClick={clickSelect}
        onPointerDown={beginDrag('move', null)}
        title={canEdit ? `${label}\n${t('timeline.barMoveExact', { key: modKeyLabel })}` : `${label}\n${eventTooltip(timing)}`}
        {...dragProps}
      >
        <TimelineCardBody
          icon={<EventItemIcon entityType={event.entityType} kind={event.kind} customTypeMap={customTypeMap} />}
          color={color}
          date={
            timing.isRange
              ? `${cardDateFmt.format(new Date(pStart))} → ${cardDateFmt.format(new Date(pEnd))}`
              : cardDateFmt.format(new Date(pStart))
          }
          label={label}
          sub={sub}
          status={event.status}
        />
      </button>
    </div>
  )
}

/**
 * §2 v1.8.4 : mini-éditeur d'un repère (titre, couleur, tags), affiché à droite comme
 * le détail d'un élément. Le titre s'écrit au blur (une op) ; couleur/tags sont directs.
 */
function MarkEditor({
  mark,
  hasTime,
  canEdit,
  onChange,
  onDelete,
  onClose
}: {
  mark: EventMark
  hasTime: boolean
  canEdit: boolean
  onChange: (patch: Partial<EventMark>) => void
  onDelete: () => void
  onClose: () => void
}): JSX.Element {
  const [labelDraft, setLabelDraft] = useState(mark.label ?? '')
  useEffect(() => setLabelDraft(mark.label ?? ''), [mark.id, mark.label])

  return (
    <div className="tl-detail tl-detail--mark" role="dialog" aria-label={mark.label || t('timeline.markTitle')}>
      <div className="tl-detail__head">
        <span className="tl-detail__ico" style={{ color: mark.color ? colorHex(mark.color) : 'var(--accent)' }}>
          <Diamond size={14} />
        </span>
        <span className="tl-detail__title" title={mark.label || t('timeline.markTitle')}>
          {mark.label || t('timeline.markTitle')}
        </span>
        <button
          className="cm-btn cm-btn--ghost cm-btn--icon"
          onClick={onClose}
          title={t('timeline.detailClose')}
          aria-label={t('timeline.detailClose')}
        >
          <X size={14} />
        </button>
      </div>

      <div className="tl-detail__editor tl-mark-edit">
        <div className="tl-detail__row">
          <span className="tl-detail__key">{t('timeline.markAt')}</span>
          <span className="tl-detail__val">{fmtBound(mark.at, hasTime)}</span>
        </div>

        <label className="cm-label">{t('timeline.markTitleField')}</label>
        <input
          className="cm-input"
          value={labelDraft}
          disabled={!canEdit}
          placeholder={t('timeline.markTitlePlaceholder')}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => {
            if (labelDraft !== (mark.label ?? '')) onChange({ label: labelDraft })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />

        <label className="cm-label">{t('details.color')}</label>
        <ColorField value={mark.color ?? ''} onChange={(color) => onChange({ color })} />

        <label className="cm-label">{t('details.tags')}</label>
        <TagInput tags={mark.tags ?? []} onChange={(tags) => onChange({ tags })} />

        {canEdit && (
          <div className="bd-side__danger">
            <button className="cm-btn cm-btn--danger" onClick={onDelete}>
              <Trash2 size={14} />
              {t('timeline.markDelete')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * §5 v1.8.3 : navigateur de zoom, façon Premiere Pro. La piste représente toute la
 * plage temporelle ; la poignée (thumb) représente la portion VISIBLE. L'élargir (tirer
 * un bord vers l'extérieur) dézoome ; la rétrécir (tirer un bord vers l'intérieur)
 * zoome ; glisser le milieu fait défiler. Bord droit vers la droite = élargir = dézoom ;
 * bord droit vers la gauche = rétrécir = zoom (et symétriquement pour le bord gauche).
 */
interface ZoomBarProps {
  minDate: number
  maxDate: number
  pxPerMs: number
  scrollLeft: number
  viewportW: number
  panPad: number
  onZoomTo: (startMs: number, endMs: number, anchor: 'left' | 'right') => void
  onPanTo: (startMs: number) => void
}

function ZoomBar({
  minDate,
  maxDate,
  pxPerMs,
  scrollLeft,
  viewportW,
  panPad,
  onZoomTo,
  onPanTo
}: ZoomBarProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  // Ancres capturées au DÉBUT d'un glisser : bornes visibles figées + domaine temporel
  // du navigateur figé (sinon le mappage px→temps « glisserait » sous le pointeur, la
  // borne visible modifiant le domaine à chaque image).
  const grab = useRef<{
    mode: 'left' | 'right' | 'body'
    startMs: number
    endMs: number
    grabMs: number
    navMin: number
    span: number
  } | null>(null)

  // Fenêtre temporelle actuellement visible, dérivée du défilement.
  const visStartMs = minDate + (scrollLeft - panPad) / pxPerMs
  const visEndMs = minDate + (scrollLeft - panPad + viewportW) / pxPerMs
  // Étendue du navigateur : contenu élargi à la fenêtre visible pour que le thumb tienne
  // toujours entièrement dans la piste (marges de pan comprises).
  const navMin = Math.min(minDate, visStartMs)
  const navMaxRaw = Math.max(maxDate, visEndMs)
  const navMax = navMaxRaw > navMin ? navMaxRaw : navMin + DAY_MS
  const span = navMax - navMin
  const leftPct = clamp01((visStartMs - navMin) / span) * 100
  const rightPct = clamp01((visEndMs - navMin) / span) * 100
  const widthPct = Math.max(rightPct - leftPct, 1.5)

  const msFrom = (clientX: number, base: number, width: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return base
    return base + clamp01((clientX - rect.left) / rect.width) * width
  }

  const begin =
    (mode: 'left' | 'right' | 'body') =>
    (e: ReactPointerEvent): void => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* capture indisponible */
      }
      grab.current = {
        mode,
        startMs: visStartMs,
        endMs: visEndMs,
        grabMs: msFrom(e.clientX, navMin, span),
        navMin,
        span
      }
    }
  const move = (e: ReactPointerEvent): void => {
    const g = grab.current
    if (!g) return
    const ms = msFrom(e.clientX, g.navMin, g.span)
    const minWin = (viewportW / MAX_PX_PER_DAY) * DAY_MS
    if (g.mode === 'right') onZoomTo(g.startMs, Math.max(ms, g.startMs + minWin), 'right')
    else if (g.mode === 'left') onZoomTo(Math.min(ms, g.endMs - minWin), g.endMs, 'left')
    else onPanTo(g.startMs + (ms - g.grabMs))
  }
  const end = (e: ReactPointerEvent): void => {
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* déjà relâché */
    }
    grab.current = null
  }

  return (
    <div className="tl-zoombar" aria-label={t('timeline.zoomBar')} title={t('timeline.zoomBarHint')}>
      <div className="tl-zoombar__track" ref={trackRef}>
        <div
          className="tl-zoombar__thumb"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          onPointerDown={begin('body')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <span
            className="tl-zoombar__handle tl-zoombar__handle--l"
            onPointerDown={begin('left')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          <span className="tl-zoombar__grip" />
          <span
            className="tl-zoombar__handle tl-zoombar__handle--r"
            onPointerDown={begin('right')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        </div>
      </div>
    </div>
  )
}

/** Borne une fraction à [0, 1]. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
