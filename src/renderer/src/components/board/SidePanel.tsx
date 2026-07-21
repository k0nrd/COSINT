/**
 * Panneau latéral droit v1.1 : fiches entité et source (champs structurés),
 * notes convertibles, connexions enrichies (relation, direction), plus le fil
 * de commentaires (nœuds uniquement). Nœud prioritaire sur connexion.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Link as LinkIcon,
  Plus,
  Route,
  Trash2,
  X
} from 'lucide-react'
import type {
  BoardEdgeData,
  BoardNodeData,
  EdgeAnchor,
  EdgeDirection,
  EdgeStyle,
  EntityField,
  FieldKind,
  NodeKind
} from '@/types'
import { useBoardContext } from '@/flow/BoardContext'
import { useNodeComments } from '@/sync/hooks'
import {
  addEntityField,
  addFieldValue,
  convertNoteToEntity,
  removeEntityField,
  reorderFields,
  setEventTiming,
  toggleFieldShown,
  updateEntityFieldLabel,
  updateEntityFieldValue
} from '@/sync/boardOps'
import { visibleNodeFields } from '@/lib/entities'
import { datationMode, type DatationMode } from '@/lib/timeline'
import {
  buildSocialUrl,
  DEFAULT_PLATFORM,
  detectPlatform,
  handleFromUrl,
  looksLikeUrl,
  resolveFieldLink
} from '@/lib/links'
import { AutoTextarea } from '@/components/common/AutoTextarea'
import { PlatformPicker, useAllPlatforms, usePlatformResolver } from '@/components/board/PlatformPicker'
import { CatalogPicker } from '@/components/board/CatalogPicker'
import { isCatalogKind } from '@/lib/catalogs'
import type { ValueMatch } from '@/lib/matching'
import { CREDIBILITY_SCALE, RELIABILITY_SCALE, SOURCE_RELATION, SOURCE_TYPES } from '@/lib/entities'
import { TAXONOMY_TYPES, taxonomyCategory, typeIcon } from '@/lib/taxonomy'
import { resolveType } from '@/lib/entityTypes'
import { RELATION_TYPES, relationLabelKey } from '@/lib/relations'
import { ColorField } from '@/components/common/ColorPicker'
import { TagInput } from '@/components/common/TagInput'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { entityTypeLabelKey } from '@/components/nodes/EntityNode'
import { useToasts } from '@/store/toasts'
import { t, formatDateTime, type MessageKey } from '@/i18n'
import './details.css'

interface SidePanelProps {
  node: BoardNodeData | null
  edge: BoardEdgeData | null
  onClose: () => void
}

const KIND_LABEL: Record<NodeKind, MessageKey> = {
  text: 'nodeType.text',
  link: 'nodeType.link',
  image: 'nodeType.image',
  timestamped: 'nodeType.timestamped',
  group: 'nodeType.group',
  entity: 'nodeType.entity',
  source: 'nodeType.source',
  code: 'nodeType.code'
}

const FIELD_KINDS: FieldKind[] = [
  'text',
  'longtext',
  'url',
  'email',
  'phone',
  'date',
  'social',
  // §2 v1.8.1 : natures « catalogue » (liste riche + « Autre »).
  'bank',
  'crypto',
  'brand',
  'operator',
  'country',
  'card',
  'hash_algo'
]

const FIELD_KIND_LABEL: Record<FieldKind, MessageKey> = {
  text: 'fieldKind.text',
  longtext: 'fieldKind.longtext',
  url: 'fieldKind.url',
  email: 'fieldKind.email',
  phone: 'fieldKind.phone',
  date: 'fieldKind.date',
  social: 'fieldKind.social',
  bank: 'fieldKind.bank',
  crypto: 'fieldKind.crypto',
  brand: 'fieldKind.brand',
  operator: 'fieldKind.operator',
  country: 'fieldKind.country',
  card: 'fieldKind.card',
  hash_algo: 'fieldKind.hash_algo'
}

const DIRECTIONS: Array<{ value: EdgeDirection; labelKey: MessageKey }> = [
  { value: 'none', labelKey: 'direction.none' },
  { value: 'single', labelKey: 'direction.single' },
  { value: 'double', labelKey: 'direction.double' }
]

/** Valeur sentinelle du select de relation pour « lien personnalisé ». */
const CUSTOM_RELATION = '__custom__'

export function SidePanel({ node, edge, onClose }: SidePanelProps): JSX.Element | null {
  const [tab, setTab] = useState<'details' | 'comments'>('details')

  if (!node && !edge) return null

  // Les commentaires n'existent que sur les nœuds : repli sur « Détails » sinon.
  const effectiveTab = node && tab === 'comments' ? 'comments' : 'details'

  return (
    <aside className="bd-side" aria-label={t('details.title')}>
      <div className="bd-side__tabs" role="tablist">
        <button
          className={`bd-side__tab${effectiveTab === 'details' ? ' bd-side__tab--active' : ''}`}
          role="tab"
          aria-selected={effectiveTab === 'details'}
          onClick={() => setTab('details')}
        >
          {t('details.title')}
        </button>
        {node && (
          <button
            className={`bd-side__tab${effectiveTab === 'comments' ? ' bd-side__tab--active' : ''}`}
            role="tab"
            aria-selected={effectiveTab === 'comments'}
            onClick={() => setTab('comments')}
          >
            {t('comments.title')}
          </button>
        )}
        <span className="bd-side__close">
          <button
            className="cm-btn cm-btn--ghost cm-btn--icon"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={15} />
          </button>
        </span>
      </div>

      {effectiveTab === 'comments' && node ? (
        <CommentsTab node={node} />
      ) : node ? (
        <NodeDetails key={node.id} node={node} />
      ) : edge ? (
        <EdgeDetails key={edge.id} edge={edge} />
      ) : null}
    </aside>
  )
}

/** Bloc de traçabilité commun nœuds/connexions (§3). */
function TraceBlock({
  item
}: {
  item: { createdBy: string; createdAt: number; updatedBy: string; updatedAt: number }
}): JSX.Element {
  return (
    <div className="bd-side__trace">
      <div className="bd-detail-row">
        <span className="bd-detail-key">{t('details.createdBy')}</span>
        <span className="bd-detail-val">{item.createdBy}</span>
      </div>
      <div className="bd-detail-row">
        <span className="bd-detail-key">{t('details.createdAt')}</span>
        <span className="bd-detail-val">{formatDateTime(item.createdAt)}</span>
      </div>
      <div className="bd-detail-row">
        <span className="bd-detail-key">{t('details.updatedBy')}</span>
        <span className="bd-detail-val">{item.updatedBy}</span>
      </div>
      <div className="bd-detail-row">
        <span className="bd-detail-key">{t('details.updatedAt')}</span>
        <span className="bd-detail-val">{formatDateTime(item.updatedAt)}</span>
      </div>
    </div>
  )
}

/** Champ texte à validation différée : n'écrit dans le CRDT qu'au blur/Entrée. */
function CommitInput({
  value,
  placeholder,
  className = 'cm-input',
  onCommit
}: {
  value: string
  placeholder?: string
  className?: string
  onCommit: (value: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
      }}
    />
  )
}

/** Variante multi-lignes (champs « texte long ») : écrit au blur. */
function CommitTextarea({
  value,
  onCommit
}: {
  value: string
  onCommit: (value: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <AutoTextarea
      className="cm-textarea bd-field__value"
      maxHeight={320}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(event) => {
        // §6bis : Entrée = nouvelle ligne (défaut) ; Échap valide et sort.
        if (event.key === 'Escape') {
          event.stopPropagation()
          ;(event.target as HTMLTextAreaElement).blur()
        }
      }}
    />
  )
}

// ——— Détails d'un nœud ———

export function NodeDetails({ node }: { node: BoardNodeData }): JSX.Element {
  const { updateNodeData, deleteNodes, customTypeMap } = useBoardContext()
  const entityTypeId = node.kind === 'entity' ? (node.entityType ?? 'generic_other') : null
  const resolvedType = entityTypeId ? resolveType(entityTypeId, customTypeMap) : null

  return (
    <div className="bd-side__body">
      <div className="bd-details-head">
        <div className="bd-detail-row">
          <span className="bd-detail-key">{t('details.type')}</span>
          <span className="bd-detail-val">{t(KIND_LABEL[node.kind])}</span>
        </div>
        {resolvedType && (
          <div className="bd-detail-row">
            <span className="bd-detail-key">{t('entity.type')}</span>
            <span className="bd-detail-val bd-details-entitytype">
              <EntityIcon icon={resolvedType.icon} size={13} />
              {/* §6 : « Catégorie · Type » avec un séparateur propre (types personnalisés inclus §2 v1.8). */}
              {resolvedType.categoryLabel
                ? `${resolvedType.categoryLabel} · ${resolvedType.label}`
                : resolvedType.label}
            </span>
          </div>
        )}
      </div>

      {node.kind === 'link' && <LinkSection node={node} />}
      {node.kind === 'entity' && <EntitySection node={node} />}
      {node.kind === 'source' && <SourceSection node={node} />}
      {node.kind === 'text' && <ConvertSection node={node} />}

      <label className="cm-label">{t('details.color')}</label>
      <ColorField value={node.color} onChange={(color) => updateNodeData(node.id, { color })} />

      <label className="cm-label">{t('details.tags')}</label>
      <TagInput tags={node.tags} onChange={(tags) => updateNodeData(node.id, { tags })} />

      {/* §4 v1.7 + §1 v1.8 : datation de l'événement (date exacte ou fenêtre au plus
          tôt / au plus tard), distincte de la date de saisie, pour la frise. */}
      <EventTimingField node={node} />

      <TraceBlock item={node} />

      <div className="bd-side__danger">
        <button className="cm-btn cm-btn--danger" onClick={() => deleteNodes([node.id])}>
          <Trash2 size={14} />
          {t('details.delete')}
        </button>
      </div>
    </div>
  )
}

/** Formate un epoch ms en `YYYY-MM-DD` LOCAL (cohérent avec l'écriture à minuit local
 *  ci-dessous) — `toISOString` (UTC) décalerait d'un jour en fuseau positif. */
function toDateInputValue(ms: number): string {
  const d = new Date(ms)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Formate un epoch ms en `YYYY-MM-DDTHH:mm` LOCAL (saisie datetime-local). */
function toDateTimeInputValue(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${toDateInputValue(ms)}T${hh}:${mm}`
}

/** Convertit une saisie date/datetime-local en epoch ms LOCAL, ou null si vide. */
function parseEventInput(value: string, hasTime: boolean): number | null {
  if (value === '') return null
  const ms = hasTime ? new Date(value).getTime() : new Date(`${value}T00:00:00`).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Éditeur de datation d'événement (§4 v1.7 + §1 v1.8) : le FAIT observé, distinct de
 * la date de saisie ; prioritaire sur la frise. Deux façons de dater :
 *  - une DATE EXACTE (instant connu), ou
 *  - une FENÊTRE « au plus tôt » / « au plus tard » quand l'instant est incertain.
 * Case « Préciser l'heure » = bascule jour ↔ jour + heure. Tout vide = la frise
 * « Ajouts » retombe sur la date de création ; la frise « Événements » n'affiche que
 * les éléments réellement datés. Écrit via `setEventTiming` (op dédiée : supprime
 * proprement les clés).
 */
function EventTimingField({ node }: { node: BoardNodeData }): JSX.Element {
  const { handle, author, canEdit } = useBoardContext()
  const hasTime = node.eventHasTime === true
  const fmt = hasTime ? toDateTimeInputValue : toDateInputValue
  const inputType = hasTime ? 'datetime-local' : 'date'
  const hasAny =
    node.eventDate !== undefined ||
    node.eventEarliest !== undefined ||
    node.eventLatest !== undefined ||
    node.eventFrom !== undefined ||
    node.eventTo !== undefined
  const badRange =
    node.eventEarliest !== undefined &&
    node.eventLatest !== undefined &&
    node.eventEarliest > node.eventLatest
  const badDuration =
    node.eventFrom !== undefined && node.eventTo !== undefined && node.eventFrom > node.eventTo

  // §1 v1.8.3 : TROIS natures de datation, mutuellement exclusives —
  //  · Date précise : un instant unique et connu (eventDate) ;
  //  · Fourchette   : instant incertain, quelque part entre au plus tôt / au plus tard ;
  //  · Durée        : le fait s'étend réellement « de » … « à » …
  // « Date précise » et « fourchette de temps » ne peuvent JAMAIS coexister (exigence
  // v1.8.3). Le mode s'initialise depuis les données et se resynchronise au nœud.
  const [mode, setMode] = useState<DatationMode>(() => datationMode(node))
  useEffect(() => {
    setMode(datationMode(node))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  const setPart = (part: 'exact' | 'earliest' | 'latest' | 'from' | 'to', raw: string): void => {
    setEventTiming(handle, node.id, { [part]: parseEventInput(raw, hasTime) }, author)
  }

  // Bascule de mode : on efface les champs des AUTRES natures (une seule op annulable)
  // pour ne jamais mélanger date précise, fourchette et durée sur un même nœud. Les
  // repères ne survivent qu'à une plage → effacés au passage en « date précise ».
  const switchMode = (next: DatationMode): void => {
    if (next === mode) return
    setMode(next)
    if (!canEdit) return
    if (next === 'exact')
      setEventTiming(handle, node.id, { earliest: null, latest: null, from: null, to: null, marks: null }, author)
    else if (next === 'window')
      setEventTiming(handle, node.id, { exact: null, from: null, to: null }, author)
    else setEventTiming(handle, node.id, { exact: null, earliest: null, latest: null }, author)
  }

  const modeHint =
    mode === 'exact' ? t('event.exactModeHint') : mode === 'window' ? t('event.windowHint') : t('event.durationHint')

  return (
    <>
      <label className="cm-label" title={t('timeline.eventDateHint')}>
        {t('event.section')}
      </label>
      <div className="bd-event">
        <div className="bd-event__modes" role="group" aria-label={t('event.section')}>
          <button
            type="button"
            className={`bd-event__mode${mode === 'exact' ? ' bd-event__mode--on' : ''}`}
            onClick={() => switchMode('exact')}
            disabled={!canEdit}
          >
            {t('event.modeExact')}
          </button>
          <button
            type="button"
            className={`bd-event__mode${mode === 'window' ? ' bd-event__mode--on' : ''}`}
            onClick={() => switchMode('window')}
            disabled={!canEdit}
          >
            {t('event.modeWindow')}
          </button>
          <button
            type="button"
            className={`bd-event__mode${mode === 'duration' ? ' bd-event__mode--on' : ''}`}
            onClick={() => switchMode('duration')}
            disabled={!canEdit}
          >
            {t('event.modeDuration')}
          </button>
        </div>

        {mode === 'exact' ? (
          <div className="bd-event__row">
            <span className="bd-event__lbl" title={t('event.exactHint')}>{t('event.exact')}</span>
            <input
              type={inputType}
              className="cm-input"
              value={node.eventDate !== undefined ? fmt(node.eventDate) : ''}
              disabled={!canEdit}
              onChange={(e) => setPart('exact', e.target.value)}
            />
          </div>
        ) : mode === 'window' ? (
          <>
            <div className="bd-event__row">
              <span className="bd-event__lbl">{t('event.earliest')}</span>
              <input
                type={inputType}
                className="cm-input"
                value={node.eventEarliest !== undefined ? fmt(node.eventEarliest) : ''}
                disabled={!canEdit}
                onChange={(e) => setPart('earliest', e.target.value)}
              />
            </div>
            <div className="bd-event__row">
              <span className="bd-event__lbl">{t('event.latest')}</span>
              <input
                type={inputType}
                className="cm-input"
                value={node.eventLatest !== undefined ? fmt(node.eventLatest) : ''}
                disabled={!canEdit}
                onChange={(e) => setPart('latest', e.target.value)}
              />
            </div>
            {badRange && <p className="bd-event__err">{t('event.badRange')}</p>}
          </>
        ) : (
          <>
            <div className="bd-event__row">
              <span className="bd-event__lbl" title={t('event.fromHint')}>{t('event.from')}</span>
              <input
                type={inputType}
                className="cm-input"
                value={node.eventFrom !== undefined ? fmt(node.eventFrom) : ''}
                disabled={!canEdit}
                onChange={(e) => setPart('from', e.target.value)}
              />
            </div>
            <div className="bd-event__row">
              <span className="bd-event__lbl">{t('event.to')}</span>
              <input
                type={inputType}
                className="cm-input"
                value={node.eventTo !== undefined ? fmt(node.eventTo) : ''}
                disabled={!canEdit}
                onChange={(e) => setPart('to', e.target.value)}
              />
            </div>
            {badDuration && <p className="bd-event__err">{t('event.badDuration')}</p>}
          </>
        )}

        <div className="bd-event__foot">
          <label className="bd-event__time">
            <input
              type="checkbox"
              checked={hasTime}
              disabled={!canEdit}
              onChange={(e) => setEventTiming(handle, node.id, { hasTime: e.target.checked }, author)}
            />
            {t('event.withTime')}
          </label>
          {hasAny && canEdit && (
            <button
              className="cm-btn cm-btn--ghost cm-btn--sm"
              onClick={() =>
                setEventTiming(
                  handle,
                  node.id,
                  { exact: null, earliest: null, latest: null, from: null, to: null, hasTime: false },
                  author
                )
              }
            >
              <X size={13} />
              {t('event.clear')}
            </button>
          )}
        </div>
        <p className="cm-hint">{modeHint}</p>
      </div>
    </>
  )
}

/** Ligne URL : saisie monospace + bouton d'ouverture dans le navigateur. */
function UrlRow({
  value,
  onCommit
}: {
  value: string
  onCommit: (value: string) => void
}): JSX.Element {
  const { openExternal } = useBoardContext()
  return (
    <div className="bd-details-urlrow">
      <CommitInput
        className="cm-input cm-mono"
        value={value}
        placeholder={t('node.linkUrlPlaceholder')}
        onCommit={onCommit}
      />
      <button
        className="cm-btn cm-btn--ghost cm-btn--icon"
        disabled={value.trim() === ''}
        onClick={() => openExternal(value)}
        title={t('node.linkOpen')}
        aria-label={t('node.linkOpen')}
      >
        <ExternalLink size={14} />
      </button>
    </div>
  )
}

function LinkSection({ node }: { node: BoardNodeData }): JSX.Element {
  const { updateNodeData } = useBoardContext()
  return (
    <>
      <label className="cm-label">{t('details.url')}</label>
      <UrlRow value={node.content} onCommit={(content) => updateNodeData(node.id, { content })} />
      <label className="cm-label">{t('details.linkTitle')}</label>
      <CommitInput
        value={node.title}
        placeholder={t('node.linkTitlePlaceholder')}
        onCommit={(title) => updateNodeData(node.id, { title })}
      />
    </>
  )
}

function EntitySection({ node }: { node: BoardNodeData }): JSX.Element {
  const { updateNodeData } = useBoardContext()
  return (
    <>
      <label className="cm-label">{t('entity.title')}</label>
      <CommitInput
        value={node.title}
        placeholder={t('field.name')}
        onCommit={(title) => updateNodeData(node.id, { title })}
      />
      <FieldList node={node} />
    </>
  )
}

function SourceSection({ node }: { node: BoardNodeData }): JSX.Element {
  const { updateNodeData } = useBoardContext()
  // Sécurise un type de source inconnu (donnée distante) sur « autre ».
  const sourceType = SOURCE_TYPES.find((typeId) => typeId === node.sourceType) ?? 'other'

  return (
    <>
      <label className="cm-label">{t('entity.title')}</label>
      <CommitInput
        value={node.title}
        placeholder={t('field.name')}
        onCommit={(title) => updateNodeData(node.id, { title })}
      />

      <label className="cm-label">{t('details.url')}</label>
      <UrlRow value={node.content} onCommit={(content) => updateNodeData(node.id, { content })} />

      <label className="cm-label">{t('source.type')}</label>
      <select
        className="cm-select"
        value={sourceType}
        onChange={(event) => updateNodeData(node.id, { sourceType: event.target.value })}
      >
        {SOURCE_TYPES.map((typeId) => (
          <option key={typeId} value={typeId}>
            {t(`sourceType.${typeId}`)}
          </option>
        ))}
      </select>

      <label className="cm-label">{t('source.reliability')}</label>
      <select
        className="cm-select"
        value={node.reliability ?? ''}
        onChange={(event) => updateNodeData(node.id, { reliability: event.target.value })}
      >
        <option value="">{t('common.none')}</option>
        {RELIABILITY_SCALE.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {t(entry.labelKey)}
          </option>
        ))}
      </select>

      <label className="cm-label">{t('source.credibility')}</label>
      <select
        className="cm-select"
        value={node.credibility ?? ''}
        onChange={(event) => updateNodeData(node.id, { credibility: event.target.value })}
      >
        <option value="">{t('common.none')}</option>
        {CREDIBILITY_SCALE.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {t(entry.labelKey)}
          </option>
        ))}
      </select>

      <FieldList node={node} />
    </>
  )
}

/** Note texte : conversion en fiche entité pré-remplie (§3). */
function ConvertSection({ node }: { node: BoardNodeData }): JSX.Element {
  const { handle, author } = useBoardContext()
  const [open, setOpen] = useState(false)

  return (
    <div className="bd-details-convert">
      <button className="cm-btn cm-btn--sm" onClick={() => setOpen((value) => !value)}>
        {t('entity.convert')}
      </button>
      {open && (
        <>
          <p className="bd-details-convert__hint">{t('entity.convertChoose')}</p>
          <div className="bd-details-convert__grid">
            {TAXONOMY_TYPES.map((type) => (
              <button
                key={type.id}
                className="bd-details-convert__choice"
                title={t(taxonomyCategory(type.category)?.nameKey ?? 'category.generic')}
                onClick={() => convertNoteToEntity(handle, node.id, type.id, author)}
              >
                <EntityIcon icon={typeIcon(type.id)} size={14} />
                <span>{t(entityTypeLabelKey(type.id))}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ——— Champs de fiche (entités et sources, §3/§4/§6bis) ———

function FieldList({ node }: { node: BoardNodeData }): JSX.Element {
  const { handle, author } = useBoardContext()
  // Ensemble des champs actuellement affichés sur le nœud (pour l'état de l'œil).
  const shownIds = new Set(visibleNodeFields(node.fields).map((field) => field.id))
  // Glisser-déposer : index de la ligne survolée pendant un drag (réordonnancement).
  const dragId = useRef<string | null>(null)

  const onDrop = (targetId: string): void => {
    const from = dragId.current
    dragId.current = null
    if (!from || from === targetId) return
    const ids = node.fields.map((field) => field.id)
    const fromIndex = ids.indexOf(from)
    const toIndex = ids.indexOf(targetId)
    if (fromIndex === -1 || toIndex === -1) return
    ids.splice(fromIndex, 1)
    ids.splice(toIndex, 0, from)
    reorderFields(handle, node.id, ids, author)
  }

  return (
    <div className="bd-field-list">
      {node.fields.map((field) => (
        <FieldRow
          key={field.id}
          nodeId={node.id}
          field={field}
          shown={shownIds.has(field.id)}
          onDragStartField={() => (dragId.current = field.id)}
          onDragEndField={() => (dragId.current = null)}
          onDropField={() => onDrop(field.id)}
        />
      ))}
      <AddFieldForm nodeId={node.id} />
    </div>
  )
}

/** Ligne d'un champ « social » : sélecteur de plateforme + identifiant (@pseudo). */
function SocialInput({
  value,
  onCommit
}: {
  value: string
  onCommit: (value: string) => void
}): JSX.Element {
  const resolve = usePlatformResolver()
  const allPlatforms = useAllPlatforms()
  const detected = detectPlatform(value, allPlatforms)
  const [platformId, setPlatformId] = useState(detected?.id ?? DEFAULT_PLATFORM.id)
  const [handleDraft, setHandleDraft] = useState(value ? handleFromUrl(value) || value : '')
  // Anti-corruption (§2, revue) : ne JAMAIS réécrire la valeur sur un simple
  // blur si l'utilisateur n'a rien saisi — la plateforme d'une valeur qui n'expose
  // pas d'hôte (fournisseur, e-mail, identifiant brut) n'est pas récupérable et
  // retomberait à tort sur la plateforme par défaut, corrompant le champ.
  const dirty = useRef(false)
  useEffect(() => {
    const p = detectPlatform(value, allPlatforms)
    if (p) setPlatformId(p.id)
    setHandleDraft(value ? handleFromUrl(value) || value : '')
    dirty.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (pid: string, handle: string): void => {
    const next = buildSocialUrl(pid, handle, resolve)
    if (next !== value) onCommit(next)
  }

  return (
    <div className="bd-field-social">
      {/* §2 : sélecteur de plateforme cherchable (réseaux sociaux + comptes +
          plateformes personnalisées). */}
      <PlatformPicker
        value={platformId}
        onChange={(pid) => {
          // Changer la plateforme est une action EXPLICITE → on committe.
          setPlatformId(pid)
          dirty.current = true
          commit(pid, handleDraft)
        }}
      />
      <input
        className="cm-input cm-mono bd-field-social__handle"
        value={handleDraft}
        placeholder={t('social.handlePlaceholder')}
        spellCheck={false}
        onChange={(event) => {
          dirty.current = true
          setHandleDraft(event.target.value)
        }}
        onBlur={() => {
          if (dirty.current) commit(platformId, handleDraft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        }}
      />
    </div>
  )
}

function FieldRow({
  nodeId,
  field,
  shown,
  onDragStartField,
  onDragEndField,
  onDropField
}: {
  nodeId: string
  field: EntityField
  shown: boolean
  onDragStartField: () => void
  onDragEndField: () => void
  onDropField: () => void
}): JSX.Element {
  const { handle, author, canEdit, openExternal, findValueMatches, createRelation } = useBoardContext()
  const pushToast = useToasts((state) => state.push)
  const hasValue = field.value.trim() !== ''
  const mono = field.kind === 'url' || field.kind === 'email' || field.kind === 'phone'
  // §3 : lien cliquable pour un champ url/social, ou un champ texte dont la valeur
  // ressemble à une URL (jamais pour email/téléphone/date — qui gardent la copie).
  const isTextKind = field.kind === 'text' || field.kind === 'longtext'
  const link =
    field.kind === 'url' || field.kind === 'social' || (isTextKind && looksLikeUrl(field.value))
      ? resolveFieldLink(field.value)
      : null

  // §3 v1.8.1 : suggestion DISCRÈTE de liaison quand l'information saisie figure déjà
  // ailleurs sur le tableau. Calculée à la validation (uniquement pour un éditeur).
  const [suggest, setSuggest] = useState<ValueMatch[] | null>(null)
  const commitValue = (value: string): void => {
    updateEntityFieldValue(handle, nodeId, field.id, value, author)
    const matches = canEdit ? findValueMatches(value, nodeId) : []
    setSuggest(matches.length > 0 ? matches.slice(0, 5) : null)
  }

  const copyValue = (text: string): void => {
    void window.cosint.copyText(text).then((copied) => {
      if (copied) pushToast(t('entity.copyDone'), 'success')
      else pushToast(t('error.clipboard'), 'error')
    })
  }

  return (
    <div
      className="bd-field"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropField}
    >
      <div className="bd-field__head">
        {/* Seule la poignée est « draggable » : la sélection de texte dans les
            champs (label/valeur) reste possible (§6bis). */}
        <span
          className="bd-field__grip"
          title={t('field.reorder')}
          draggable
          onDragStart={onDragStartField}
          onDragEnd={onDragEndField}
        >
          <GripVertical size={13} />
        </span>
        <CommitInput
          className="bd-field__labelinput"
          value={field.label}
          placeholder={t('entity.fieldLabel')}
          onCommit={(label) => updateEntityFieldLabel(handle, nodeId, field.id, label, author)}
        />
        <div className="bd-field__actions">
          {/* Œil : afficher/masquer ce champ sur le nœud (§6bis). */}
          <button
            className={`bd-field__action${shown ? ' bd-field__action--on' : ''}`}
            onClick={() => toggleFieldShown(handle, nodeId, field.id, author)}
            title={shown ? t('field.hideOnNode') : t('field.showOnNode')}
            aria-label={shown ? t('field.hideOnNode') : t('field.showOnNode')}
            aria-pressed={shown}
          >
            {shown ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          {/* Ajouter une valeur (champ frère de même libellé) (§6bis). */}
          <button
            className="bd-field__action"
            onClick={() => addFieldValue(handle, nodeId, field.id, author)}
            title={t('field.addValue')}
            aria-label={t('field.addValue')}
          >
            <Plus size={13} />
          </button>
          {(field.kind === 'email' || field.kind === 'phone') && (
            <button
              className="bd-field__action"
              disabled={!hasValue}
              onClick={() => copyValue(field.value)}
              title={t('common.copy')}
              aria-label={t('common.copy')}
            >
              <Copy size={13} />
            </button>
          )}
          <button
            className="bd-field__action bd-field__action--danger"
            onClick={() => removeEntityField(handle, nodeId, field.id, author)}
            title={t('field.removeValue')}
            aria-label={t('field.removeValue')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {field.kind === 'social' ? (
        <SocialInput value={field.value} onCommit={commitValue} />
      ) : isCatalogKind(field.kind) ? (
        <CatalogPicker kind={field.kind} value={field.value} onChange={commitValue} />
      ) : field.kind === 'longtext' ? (
        <CommitTextarea value={field.value} onCommit={commitValue} />
      ) : field.kind === 'date' ? (
        <input
          type="date"
          className="cm-input bd-field__value"
          value={field.value}
          onChange={(event) => commitValue(event.target.value)}
        />
      ) : (
        <CommitInput
          className={`cm-input bd-field__value${mono ? ' cm-mono' : ''}`}
          value={field.value}
          onCommit={commitValue}
        />
      )}

      {/* §3 : lien cliquable (ouverture externe + clic droit « Copier le lien »). */}
      {link && (
        <button
          type="button"
          className="bd-field__link"
          onClick={() => openExternal(link.url)}
          onContextMenu={(event) => {
            event.preventDefault()
            copyValue(link.url)
          }}
          title={t('field.openLink')}
        >
          {link.platform && (
            <EntityIcon icon={link.platform.icon} size={12} />
          )}
          <span className="bd-field__link-text cm-mono">{link.url}</span>
          <ExternalLink size={11} className="bd-field__link-ext" />
        </button>
      )}

      {/* §3 v1.8.1 : suggestion discrète de liaison (information déjà présente ailleurs). */}
      {suggest && suggest.length > 0 && (
        <div className="bd-field-suggest">
          <span className="bd-field-suggest__text">
            <LinkIcon size={12} />
            {suggest.length === 1
              ? t('link.suggestOne', { name: suggest[0].label })
              : t('link.suggestMany', { count: suggest.length })}
          </span>
          <div className="bd-field-suggest__actions">
            {suggest.map((match) => (
              <button
                key={match.nodeId}
                type="button"
                className="bd-field-suggest__link"
                onClick={() => {
                  createRelation(nodeId, match.nodeId, field.value.trim())
                  setSuggest(null)
                }}
              >
                {suggest.length === 1 ? t('link.connect') : `${t('link.connect')} · ${match.label}`}
              </button>
            ))}
            <button
              type="button"
              className="bd-field-suggest__dismiss"
              onClick={() => setSuggest(null)}
            >
              {t('link.dismiss')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Ajout d'un champ personnalisé : libellé + type, puis addEntityField. */
function AddFieldForm({ nodeId }: { nodeId: string }): JSX.Element {
  const { handle, author } = useBoardContext()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<FieldKind>('text')

  const submit = (): void => {
    const trimmed = label.trim()
    if (trimmed === '') return
    addEntityField(handle, nodeId, trimmed, kind, author)
    setLabel('')
    setKind('text')
    setOpen(false)
  }

  if (!open) {
    return (
      <button className="cm-btn cm-btn--sm bd-field-add" onClick={() => setOpen(true)}>
        <Plus size={13} />
        {t('entity.addField')}
      </button>
    )
  }

  return (
    <div className="bd-field-form">
      <input
        className="cm-input"
        value={label}
        placeholder={t('entity.fieldLabel')}
        autoFocus
        onChange={(event) => setLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
      />
      <select
        className="cm-select"
        value={kind}
        aria-label={t('entity.fieldKind')}
        onChange={(event) => setKind(event.target.value as FieldKind)}
      >
        {FIELD_KINDS.map((fieldKind) => (
          <option key={fieldKind} value={fieldKind}>
            {t(FIELD_KIND_LABEL[fieldKind])}
          </option>
        ))}
      </select>
      <div className="bd-field-form__actions">
        <button className="cm-btn cm-btn--sm" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
        <button
          className="cm-btn cm-btn--primary cm-btn--sm"
          onClick={submit}
          disabled={label.trim() === ''}
        >
          {t('common.add')}
        </button>
      </div>
    </div>
  )
}

// ——— Détails d'une connexion (§2) ———

/** Options d'ancrage d'une extrémité de lien (§1 v1.6). '' = automatique. */
const ANCHOR_OPTIONS: Array<{ value: '' | EdgeAnchor; labelKey: Parameters<typeof t>[0] }> = [
  { value: '', labelKey: 'edge.anchorAuto' },
  { value: 't', labelKey: 'edge.anchorTop' },
  { value: 'b', labelKey: 'edge.anchorBottom' },
  { value: 'l', labelKey: 'edge.anchorLeft' },
  { value: 'r', labelKey: 'edge.anchorRight' }
]

function EdgeDetails({ edge }: { edge: BoardEdgeData }): JSX.Element {
  const { updateEdgeData, deleteEdges, setEdgeAnchor, resetEdgeRouting } = useBoardContext()
  // Les liens automatiques vers une source stockent la clé i18n : on la ramène à l'id « source ».
  const relationId = edge.relationType === SOURCE_RELATION ? 'source' : edge.relationType
  const isCustomValue = relationId !== '' && relationLabelKey(relationId) === null
  const [customMode, setCustomMode] = useState(isCustomValue)
  const showCustom = customMode || isCustomValue

  return (
    <div className="bd-side__body">
      <TraceBlock item={edge} />

      <label className="cm-label">{t('relation.choose')}</label>
      <select
        className="cm-select"
        value={showCustom ? CUSTOM_RELATION : relationId}
        onChange={(event) => {
          const value = event.target.value
          if (value === CUSTOM_RELATION) {
            setCustomMode(true)
            return
          }
          setCustomMode(false)
          updateEdgeData(edge.id, { relationType: value })
        }}
      >
        <option value="">{t('relation.none')}</option>
        {RELATION_TYPES.map((relation) => (
          <option key={relation.id} value={relation.id}>
            {t(relation.labelKey)}
          </option>
        ))}
        <option value={CUSTOM_RELATION}>{t('relation.custom')}</option>
      </select>
      {showCustom && (
        <CommitInput
          className="cm-input bd-details-customrelation"
          value={isCustomValue ? relationId : ''}
          placeholder={t('details.labelPlaceholder')}
          onCommit={(value) => updateEdgeData(edge.id, { relationType: value.trim() })}
        />
      )}

      <label className="cm-label">{t('details.label')}</label>
      <CommitInput
        value={edge.label}
        placeholder={t('details.labelPlaceholder')}
        onCommit={(label) => updateEdgeData(edge.id, { label })}
      />

      <label className="cm-label">{t('edge.direction')}</label>
      <select
        className="cm-select"
        value={edge.direction}
        onChange={(event) =>
          updateEdgeData(edge.id, { direction: event.target.value as EdgeDirection })
        }
      >
        {DIRECTIONS.map((direction) => (
          <option key={direction.value} value={direction.value}>
            {t(direction.labelKey)}
          </option>
        ))}
      </select>

      <label className="cm-label">{t('details.edgeStyle')}</label>
      <select
        className="cm-select"
        value={edge.style}
        onChange={(event) => updateEdgeData(edge.id, { style: event.target.value as EdgeStyle })}
      >
        <option value="solid">{t('details.styleSolid')}</option>
        <option value="dashed">{t('details.styleDashed')}</option>
      </select>

      <label className="cm-label">{t('details.color')}</label>
      <ColorField value={edge.color} onChange={(color) => updateEdgeData(edge.id, { color })} />

      {/* Routage manuel (§1 v1.6) : côté d'ancrage des extrémités + réinitialisation.
          Les points de passage s'ajoutent/déplacent directement sur le lien (double-
          clic pour ajouter, glisser pour déplacer, clic droit pour supprimer). */}
      <label className="cm-label">{t('edge.routing')}</label>
      <div className="bd-edge-anchors">
        <select
          className="cm-select"
          aria-label={t('edge.anchorSource')}
          value={edge.sourceAnchor ?? ''}
          onChange={(event) =>
            setEdgeAnchor(edge.id, 'source', (event.target.value || null) as EdgeAnchor | null)
          }
        >
          {ANCHOR_OPTIONS.map((option) => (
            <option key={`s${option.value}`} value={option.value}>
              {t('edge.anchorSource')} · {t(option.labelKey)}
            </option>
          ))}
        </select>
        <select
          className="cm-select"
          aria-label={t('edge.anchorTarget')}
          value={edge.targetAnchor ?? ''}
          onChange={(event) =>
            setEdgeAnchor(edge.id, 'target', (event.target.value || null) as EdgeAnchor | null)
          }
        >
          {ANCHOR_OPTIONS.map((option) => (
            <option key={`t${option.value}`} value={option.value}>
              {t('edge.anchorTarget')} · {t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <button className="cm-btn cm-btn--sm bd-edge-resetrouting" onClick={() => resetEdgeRouting(edge.id)}>
        <Route size={14} />
        {t('edge.resetRouting')}
      </button>

      <div className="bd-side__danger">
        <button className="cm-btn cm-btn--danger" onClick={() => deleteEdges([edge.id])}>
          <Trash2 size={14} />
          {t('edge.delete')}
        </button>
      </div>
    </div>
  )
}

// ——— Commentaires ———

function CommentsTab({ node }: { node: BoardNodeData }): JSX.Element {
  const { handle, addComment, deleteComment } = useBoardContext()
  const comments = useNodeComments(handle, node.id)
  const [draft, setDraft] = useState('')

  const send = (): void => {
    const text = draft.trim()
    if (text === '') return
    addComment(node.id, text)
    setDraft('')
  }

  return (
    <div className="bd-comments">
      <div className="bd-comments__list">
        {comments.length === 0 ? (
          <p className="bd-comments__empty">{t('comments.empty')}</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="bd-comment">
              <div className="bd-comment__head">
                <span className="bd-comment__author">{comment.author}</span>
                <span className="bd-comment__date">{formatDateTime(comment.createdAt)}</span>
              </div>
              <div className="bd-comment__text">{comment.text}</div>
              <button
                className="bd-comment__delete"
                onClick={() => deleteComment(comment.id)}
                title={t('comments.delete')}
                aria-label={t('comments.delete')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="bd-comments__composer">
        <AutoTextarea
          className="cm-textarea"
          maxHeight={200}
          value={draft}
          placeholder={t('comments.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              send()
            }
          }}
        />
        <button className="cm-btn cm-btn--primary" onClick={send} disabled={draft.trim() === ''}>
          {t('comments.send')}
        </button>
      </div>
    </div>
  )
}
