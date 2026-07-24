/** Barre d'outils verticale flottante : ajout de nœuds, undo/redo, zoom, recherche, filtres, légende. */
import {
  BookOpen,
  CalendarClock,
  Clock,
  Code2,
  Contact,
  FileText,
  Files,
  Filter,
  Image,
  Link,
  Maximize,
  Redo2,
  Search,
  Square,
  StickyNote,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from 'lucide-react'
import type { NodeKind } from '@/types'
import { t, type MessageKey } from '@/i18n'

interface ToolbarProps {
  onAddNode: (kind: NodeKind) => void
  /** Ouvre le sélecteur d'entité par catégories (§2). */
  onOpenEntityPicker: () => void
  /** false = visiteur (lecture seule, §6) : les outils d'édition sont masqués. */
  canEdit: boolean
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
  onToggleSearch: () => void
  onToggleFilter: () => void
  onToggleSources: () => void
  onToggleLegend: () => void
  /** §4 v1.7 : bascule Canvas ↔ Chronologie. */
  onToggleTimeline: () => void
  filterActive: boolean
  searchActive: boolean
  sourcesActive: boolean
  legendActive: boolean
  timelineActive: boolean
}

const ADD_BUTTONS: Array<{ kind: NodeKind; icon: LucideIcon; titleKey: MessageKey }> = [
  { kind: 'text', icon: StickyNote, titleKey: 'toolbar.addText' },
  { kind: 'link', icon: Link, titleKey: 'toolbar.addLink' },
  { kind: 'image', icon: Image, titleKey: 'toolbar.addImage' },
  { kind: 'timestamped', icon: Clock, titleKey: 'toolbar.addTimestamped' },
  { kind: 'group', icon: Square, titleKey: 'toolbar.addGroup' },
  { kind: 'code', icon: Code2, titleKey: 'toolbar.addCode' }
]

export function Toolbar({
  onAddNode,
  onOpenEntityPicker,
  canEdit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onZoomIn,
  onZoomOut,
  onFitView,
  onToggleSearch,
  onToggleFilter,
  onToggleSources,
  onToggleLegend,
  onToggleTimeline,
  filterActive,
  searchActive,
  sourcesActive,
  legendActive,
  timelineActive
}: ToolbarProps): JSX.Element {
  return (
    <div className="bd-toolbar" role="toolbar">
      {/* Outils d'édition — masqués proprement pour un visiteur (§6). */}
      {canEdit && (
        <>
          {ADD_BUTTONS.map(({ kind, icon: Icon, titleKey }) => (
            <button
              key={kind}
              className="bd-toolbar__btn"
              onClick={() => onAddNode(kind)}
              title={t(titleKey)}
              aria-label={t(titleKey)}
            >
              <Icon size={17} />
            </button>
          ))}

          {/* Fiche entité : ouvre le sélecteur par catégories (§2). */}
          <button
            className="bd-toolbar__btn"
            onClick={onOpenEntityPicker}
            title={t('toolbar.addEntity')}
            aria-label={t('toolbar.addEntity')}
            data-tut="add-entity"
          >
            <Contact size={17} />
          </button>

          {/* Source (§4). */}
          <button
            className="bd-toolbar__btn"
            onClick={() => onAddNode('source')}
            title={t('toolbar.addSource')}
            aria-label={t('toolbar.addSource')}
            data-tut="add-source"
          >
            <FileText size={17} />
          </button>

          <div className="bd-toolbar__sep" />

          <button
            className="bd-toolbar__btn"
            onClick={onUndo}
            disabled={!canUndo}
            title={t('toolbar.undo')}
            aria-label={t('toolbar.undo')}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="bd-toolbar__btn"
            onClick={onRedo}
            disabled={!canRedo}
            title={t('toolbar.redo')}
            aria-label={t('toolbar.redo')}
          >
            <Redo2 size={17} />
          </button>

          <div className="bd-toolbar__sep" />
        </>
      )}

      <button
        className="bd-toolbar__btn"
        onClick={onZoomIn}
        title={t('toolbar.zoomIn')}
        aria-label={t('toolbar.zoomIn')}
      >
        <ZoomIn size={17} />
      </button>
      <button
        className="bd-toolbar__btn"
        onClick={onZoomOut}
        title={t('toolbar.zoomOut')}
        aria-label={t('toolbar.zoomOut')}
      >
        <ZoomOut size={17} />
      </button>
      <button
        className="bd-toolbar__btn"
        onClick={onFitView}
        title={t('toolbar.fitView')}
        aria-label={t('toolbar.fitView')}
      >
        <Maximize size={17} />
      </button>

      <div className="bd-toolbar__sep" />

      <button
        className={`bd-toolbar__btn${searchActive ? ' bd-toolbar__btn--active' : ''}`}
        onClick={onToggleSearch}
        title={t('toolbar.search')}
        aria-label={t('toolbar.search')}
        aria-pressed={searchActive}
        data-tut="search"
      >
        <Search size={17} />
      </button>
      <button
        className={`bd-toolbar__btn${filterActive ? ' bd-toolbar__btn--active' : ''}`}
        onClick={onToggleFilter}
        title={t('toolbar.filter')}
        aria-label={t('toolbar.filter')}
        aria-pressed={filterActive}
      >
        <Filter size={17} />
      </button>
      <button
        className={`bd-toolbar__btn${sourcesActive ? ' bd-toolbar__btn--active' : ''}`}
        onClick={onToggleSources}
        title={t('sources.title')}
        aria-label={t('sources.title')}
        aria-pressed={sourcesActive}
      >
        <Files size={17} />
      </button>
      <button
        className={`bd-toolbar__btn${legendActive ? ' bd-toolbar__btn--active' : ''}`}
        onClick={onToggleLegend}
        title={t('toolbar.legend')}
        aria-label={t('toolbar.legend')}
        aria-pressed={legendActive}
      >
        <BookOpen size={17} />
      </button>

      <div className="bd-toolbar__sep" />

      {/* §4 v1.7 : bascule vers la Chronologie (frise). */}
      <button
        className={`bd-toolbar__btn${timelineActive ? ' bd-toolbar__btn--active' : ''}`}
        onClick={onToggleTimeline}
        title={t('toolbar.timeline')}
        aria-label={t('toolbar.timeline')}
        aria-pressed={timelineActive}
        data-tut="timeline"
      >
        <CalendarClock size={17} />
      </button>
    </div>
  )
}
