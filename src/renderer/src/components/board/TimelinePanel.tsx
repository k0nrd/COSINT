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
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { toPng } from 'html-to-image'
import {
  Clock,
  Code2,
  Crosshair,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  List,
  Minus,
  Plus,
  Square,
  StickyNote,
  X,
  type LucideIcon
} from 'lucide-react'
import type { BoardNodeData, ElementStatus, NodeKind } from '@/types'
import { t, formatDateTime, type MessageKey } from '@/i18n'
import {
  taxonomyCategory,
  taxonomyType,
  TAXONOMY_CATEGORIES,
  type CategoryId
} from '@/lib/taxonomy'
import { resolveType, type CustomTypeMap } from '@/lib/entityTypes'
import { visibleNodeFields } from '@/lib/entities'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { StatusBadge } from '@/components/board/StatusBadge'
import { useBoardContext } from '@/flow/BoardContext'
import { stringifyCsv } from '@/lib/csv'
import {
  assignLanes,
  chooseTickStepDays,
  DAY_MS,
  eventTimingOf,
  toEventItems,
  toTimelineItems,
  type EventSortKey,
  type EventTiming,
  type TimelineItem
} from '@/lib/timeline'
import { useToasts } from '@/store/toasts'
import './timeline.css'

const CARD_W = 158
const GAP = 8
const LANE_H = 34
const AXIS_H = 46
const TOP_PAD = 58
const BOTTOM_PAD = 24
const MIN_PX_PER_DAY = 0.02
const MAX_PX_PER_DAY = 800

/** Icônes des types de nœud « non entité ». */
const KIND_ICONS: Record<Exclude<NodeKind, 'entity'>, LucideIcon> = {
  text: StickyNote,
  link: LinkIcon,
  image: ImageIcon,
  timestamped: Clock,
  group: Square,
  source: FileText,
  code: Code2
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const fullFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnlyFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })

/** Formate une borne d'événement (jour, ou jour + heure selon `hasTime`). */
function fmtBound(ms: number, hasTime: boolean): string {
  return hasTime ? fullFmt.format(new Date(ms)) : dateOnlyFmt.format(new Date(ms))
}

type Tab = 'added' | 'events'
type EventView = 'frise' | 'list'

interface TimelinePanelProps {
  nodes: BoardNodeData[]
  boardTitle: string
  onLocate: (nodeId: string) => void
  onClose: () => void
}

export function TimelinePanel({ nodes, boardTitle, onLocate, onClose }: TimelinePanelProps): JSX.Element {
  const pushToast = useToasts((state) => state.push)
  const { customTypeMap } = useBoardContext()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // §3 v1.8.1 : à l'ouverture, on montre d'abord la frise des ÉVÉNEMENTS (quand les
  // faits se sont déroulés), puis celle des ajouts — les onglets sont ordonnés ainsi.
  const [tab, setTab] = useState<Tab>('events')
  const [eventSort, setEventSort] = useState<EventSortKey>('start')
  const [eventView, setEventView] = useState<EventView>('frise')
  // §1 v1.8.1 : élément dont le détail est affiché SUR la frise (un clic n'emmène
  // plus directement au tableau ; le détail propose ensuite « Voir sur le tableau »).
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  // ——— Zoom (px par jour) ———
  const [pxPerDay, setPxPerDay] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (pxPerDay === null && scrollRef.current) {
      const width = scrollRef.current.clientWidth - 2 * GAP - CARD_W
      setPxPerDay(Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, width / spanDays)))
    }
  }, [pxPerDay, spanDays])
  // Réinitialise l'ajustement au changement d'onglet/vue (span différent).
  useLayoutEffect(() => setPxPerDay(null), [tab, eventView])
  // Le détail affiché se referme si l'on change d'onglet/vue (l'élément peut ne pas
  // figurer dans l'autre frise).
  useEffect(() => setSelectedId(null), [tab, eventView])

  // ——— §1 v1.8.1 : déplacement au glisser (les deux frises se parcourent) ———
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  const onPanPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    // On ne démarre PAS un déplacement depuis un élément interactif (carte, bouton,
    // ligne de liste, champ, panneau de détail) : clic et sélection y restent normaux.
    if ((event.target as HTMLElement).closest('.tl-item, .tl-list, .tl-detail, button, a, input, select')) {
      return
    }
    const el = scrollRef.current
    if (!el) return
    panRef.current = { x: event.clientX, y: event.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
    el.setPointerCapture(event.pointerId)
    el.classList.add('tl-scroll--panning')
  }
  const onPanPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = panRef.current
    const el = scrollRef.current
    if (!pan || !el) return
    el.scrollLeft = pan.scrollLeft - (event.clientX - pan.x)
    el.scrollTop = pan.scrollTop - (event.clientY - pan.y)
  }
  const onPanPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const el = scrollRef.current
    if (panRef.current && el) {
      try {
        el.releasePointerCapture(event.pointerId)
      } catch {
        /* pointeur déjà relâché */
      }
      el.classList.remove('tl-scroll--panning')
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
  const contentHeight = TOP_PAD + AXIS_H + laneCount * LANE_H + BOTTOM_PAD

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

  const exportPng = async (): Promise<void> => {
    if (!contentRef.current || !hasContent) {
      pushToast(t('export.emptyBoard'), 'info')
      return
    }
    try {
      const bg =
        getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#0b0d11'
      const dataUrl = await toPng(contentRef.current, {
        backgroundColor: bg,
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
    <div className="tl-panel">
      <div className="tl-header">
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
        {showFrise && (
          <>
            <button className="cm-btn cm-btn--ghost cm-btn--icon" onClick={() => zoom(1 / 1.4)} title={t('toolbar.zoomOut')}>
              <Minus size={15} />
            </button>
            <button className="cm-btn cm-btn--ghost cm-btn--icon" onClick={() => zoom(1.4)} title={t('toolbar.zoomIn')}>
              <Plus size={15} />
            </button>
          </>
        )}
        <button className="cm-btn cm-btn--ghost" onClick={() => void exportPng()}>{t('timeline.exportPng')}</button>
        <button className="cm-btn cm-btn--ghost" onClick={() => void exportCsv()}>{t('timeline.exportCsv')}</button>
        <button className="cm-btn cm-btn--ghost cm-btn--icon" onClick={onClose} title={t('timeline.backCanvas')} aria-label={t('timeline.backCanvas')}>
          <X size={16} />
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
        <label className="tl-date">
          {t('timeline.from')}
          <input type="date" className="csv-select" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="tl-date">
          {t('timeline.to')}
          <input type="date" className="csv-select" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
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

      {/* §1/§3 v1.8.1 : bandeau descriptif de la frise courante (interface enrichie,
          notamment pour les Ajouts) + rappel du déplacement au glisser. */}
      <div className={`tl-desc tl-desc--${tab}`}>
        <span className="tl-desc__what">
          {tab === 'added' ? t('timeline.tabAddedDesc') : t('timeline.tabEventsDesc')}
        </span>
        {showFrise && <span className="tl-desc__hint">{t('timeline.panHint')}</span>}
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
                      onClick={() => setSelectedId(event.id)}
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
          onPointerDown={onPanPointerDown}
          onPointerMove={onPanPointerMove}
          onPointerUp={onPanPointerEnd}
          onPointerCancel={onPanPointerEnd}
        >
          {!hasContent ? (
            <div className="tl-empty">{tab === 'added' ? t('timeline.empty') : t('timeline.emptyEvents')}</div>
          ) : (
            <div className="tl-content" ref={contentRef} style={{ width: contentWidth, height: contentHeight }}>
              <div className="tl-axis" style={{ top: TOP_PAD }} />
              {ticks.map((tick, i) => (
                <div key={i} className="tl-tick" style={{ left: tick.x }}>
                  <div className="tl-tick__line" style={{ top: TOP_PAD, height: contentHeight - TOP_PAD - 4 }} />
                  <div className="tl-tick__label" style={{ top: TOP_PAD - 20 }}>{tick.label}</div>
                </div>
              ))}
              {tab === 'added'
                ? items.map((item, i) => {
                    const x = (item.date - minDate) * pxPerMs
                    const top = TOP_PAD + AXIS_H + lanes[i] * LANE_H
                    const label = item.label || typeLabelOf(item)
                    const color = item.kind === 'entity' && item.entityType ? resolveType(item.entityType, customTypeMap).color : 'var(--accent)'
                    return (
                      <button
                        key={item.id}
                        className={`tl-item${selectedId === item.id ? ' tl-item--selected' : ''}`}
                        style={{ left: x, top, borderLeftColor: color }}
                        onClick={() => setSelectedId(item.id)}
                        title={`${label}\n${typeLabelOf(item)} · ${item.author}\n${fullFmt.format(new Date(item.date))}${item.isEventDate ? ` (${t('timeline.eventDate')})` : ''}`}
                      >
                        <span className="tl-item__ico"><EventItemIcon entityType={item.entityType} kind={item.kind} customTypeMap={customTypeMap} /></span>
                        <span className="tl-item__label">{label}</span>
                        {item.status && item.status !== 'none' && (
                          <span className="tl-item__badge"><StatusBadge status={item.status} size={13} /></span>
                        )}
                      </button>
                    )
                  })
                : eventItems.map((event, i) => {
                    const x = (event.timing.start - minDate) * pxPerMs
                    const top = TOP_PAD + AXIS_H + lanes[i] * LANE_H
                    const barW = Math.max(0, (event.timing.end - event.timing.start) * pxPerMs)
                    const label = event.label || (nodeById.get(event.id) ? typeLabelOfNode(nodeById.get(event.id)!) : '')
                    const color = event.entityType ? resolveType(event.entityType, customTypeMap).color : 'var(--accent)'
                    return (
                      <div key={event.id} className="tl-eventrow" style={{ left: x, top }}>
                        {/* Barre hachurée « au plus tôt → au plus tard » (fenêtre d'incertitude). */}
                        {event.timing.isRange && (
                          <span className="tl-eventbar" style={{ width: barW, background: `repeating-linear-gradient(90deg, ${color}, ${color} 5px, transparent 5px, transparent 10px)` }} title={eventTooltip(event.timing)} />
                        )}
                        {/* Point à la date exacte, s'il y en a une (position relative dans la fenêtre). */}
                        {event.timing.exact !== undefined && (
                          <span className="tl-eventdot" style={{ left: (event.timing.exact - event.timing.start) * pxPerMs, background: color }} title={fmtBound(event.timing.exact, event.timing.hasTime)} />
                        )}
                        <button
                          className={`tl-item tl-item--event${selectedId === event.id ? ' tl-item--selected' : ''}`}
                          style={{ borderLeftColor: color }}
                          onClick={() => setSelectedId(event.id)}
                          title={`${label}\n${eventTooltip(event.timing)}`}
                        >
                          <span className="tl-item__ico"><EventItemIcon entityType={event.entityType} kind={event.kind} customTypeMap={customTypeMap} /></span>
                          <span className="tl-item__label">{label}</span>
                          {event.status && event.status !== 'none' && (
                            <span className="tl-item__badge"><StatusBadge status={event.status} size={13} /></span>
                          )}
                        </button>
                      </div>
                    )
                  })}
            </div>
          )}
        </div>
      )}

      {/* §1 v1.8.1 : détail de l'élément cliqué — affiché SUR la frise. Le bouton
          « Voir sur le tableau » est le SEUL à emmener au canvas (plus de navigation
          au simple clic). */}
      {selectedNode && (
        <TimelineDetail
          node={selectedNode}
          customTypeMap={customTypeMap}
          typeLabel={typeLabelOfNode(selectedNode)}
          onLocate={() => onLocate(selectedNode.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

/**
 * Détail d'un élément affiché sur la frise (§1 v1.8.1) : type, statut, auteur,
 * datation (ajout + événement) et informations renseignées. « Voir sur le tableau »
 * est la seule action qui bascule vers le canvas.
 */
function TimelineDetail({
  node,
  customTypeMap,
  typeLabel,
  onLocate,
  onClose
}: {
  node: BoardNodeData
  customTypeMap: CustomTypeMap
  typeLabel: string
  onLocate: () => void
  onClose: () => void
}): JSX.Element {
  const label =
    node.title.trim() || node.fields.find((field) => field.value.trim() !== '')?.value || typeLabel
  const timing = eventTimingOf(node)
  const fields = visibleNodeFields(node.fields).slice(0, 8)

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

      <div className="tl-detail__meta">
        <div className="tl-detail__row">
          <span className="tl-detail__key">{t('entity.type')}</span>
          <span className="tl-detail__val">{typeLabel}</span>
        </div>
        <div className="tl-detail__row">
          <span className="tl-detail__key">{t('timeline.detailAuthor')}</span>
          <span className="tl-detail__val">{node.createdBy}</span>
        </div>
        <div className="tl-detail__row">
          <span className="tl-detail__key">{t('timeline.detailAddedAt')}</span>
          <span className="tl-detail__val">{formatDateTime(node.createdAt)}</span>
        </div>
        {timing && (
          <div className="tl-detail__row">
            <span className="tl-detail__key">
              {timing.isRange ? t('timeline.detailWindow') : t('timeline.detailEventAt')}
            </span>
            <span className="tl-detail__val">{eventTooltip(timing)}</span>
          </div>
        )}
      </div>

      {fields.length > 0 && (
        <div className="tl-detail__fields">
          <span className="tl-detail__key">{t('timeline.detailInfo')}</span>
          {fields.map((field) => (
            <div key={field.id} className="tl-detail__field">
              <span className="tl-detail__flabel" title={field.label}>{field.label}</span>
              <span className="tl-detail__fval" title={field.value}>{field.value}</span>
            </div>
          ))}
        </div>
      )}

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
  return parts.join(' · ') || t('timeline.unknownDate')
}
