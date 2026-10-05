/**
 * Nœud fiche entité (§3) : icône du gabarit, étiquette « Catégorie · Type » + titre
 * éditable, aperçu des premiers champs renseignés. Le détail complet des champs
 * s'édite dans le panneau Détails.
 */
import {
  memo,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { Image as ImageIcon, ImagePlus } from 'lucide-react'
import { t, type MessageKey } from '@/i18n'
import { resolveType } from '@/lib/entityTypes'
import { resolveNodeIcon, visibleNodeFields } from '@/lib/entities'
import { colorHex, withAlpha } from '@/lib/colors'
import { useBoardContext } from '@/flow/BoardContext'
import { entityCover, extraImageCount } from '@/lib/entityImages'
import { useEntityImageSrc } from '@/components/board/EntityGallery'
import { dragCarriesImages } from '@/flow/entityImageActions'
import { useEntityLightbox } from '@/store/entityLightbox'
import type { CosintNodeProps } from '@/flow/flowTypes'
import type { EntityField } from '@/types'
import { NodeShell } from './NodeShell'
import { EntityIcon } from './entityIcons'
import './entity.css'

/** Clé i18n du libellé d'un type de taxonomie (tous les types ont une clé). */
export function entityTypeLabelKey(typeId: string): MessageKey {
  return `entityType.${typeId}` as MessageKey
}

/** Valeurs techniques affichées en monospace. */
function isMonoField(field: EntityField): boolean {
  return field.kind === 'url' || field.kind === 'email' || field.kind === 'phone'
}

/**
 * Titre éditable au double-clic (brouillon local, commit blur/Entrée, Échap
 * annule). Partagé avec SourceNode.
 */
export function InlineTitle({
  nodeId,
  value,
  fallback
}: {
  nodeId: string
  value: string
  /** Texte estompé affiché quand le titre est vide (ex. nom du type). */
  fallback: string
}): JSX.Element {
  const { updateNodeData } = useBoardContext()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Échap annule : le blur qui suit ne doit pas committer.
  const cancelledRef = useRef(false)

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) updateNodeData(nodeId, { title: next })
  }

  // Commit-on-unmount : préserve le brouillon si le nœud est démonté pendant
  // l'édition (ex. un pair le sort du viewport, `onlyRenderVisibleElements`).
  const state = useRef({ editing, draft, value, updateNodeData })
  state.current = { editing, draft, value, updateNodeData }
  useEffect(
    () => () => {
      const s = state.current
      const next = s.draft.trim()
      if (s.editing && !cancelledRef.current && next !== s.value) {
        try {
          s.updateNodeData(nodeId, { title: next })
        } catch {
          /* document en cours de destruction */
        }
      }
    },
    [nodeId]
  )

  if (editing) {
    return (
      <input
        className="nodrag nd-inline-input nd-entity-title-input"
        value={draft}
        placeholder={fallback}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!cancelledRef.current) commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            event.stopPropagation()
            cancelledRef.current = true
            setEditing(false)
          }
        }}
      />
    )
  }

  const startEdit = (event: ReactMouseEvent): void => {
    // Ne pas laisser le double-clic remonter au canvas (menu d'ajout).
    event.stopPropagation()
    cancelledRef.current = false
    setDraft(value)
    setEditing(true)
  }

  return (
    <span
      className={value ? 'nd-entity-title' : 'nd-entity-title nd-entity-title--empty'}
      title={value || fallback}
      onDoubleClick={startEdit}
    >
      {value || fallback}
    </span>
  )
}

export const EntityNode = memo(function EntityNode({ id, data, selected }: CosintNodeProps): JSX.Element {
  const board = data.board
  const { customTypeMap, handle, canEdit } = useBoardContext()
  const typeId = board.entityType ?? 'generic_other'
  // §2 v1.8 : résolution unifiée (taxonomie + types personnalisés du tableau).
  const resolved = resolveType(typeId, customTypeMap)
  // §6 v1.9 : l'icône propre au nœud prime sur celle du type.
  const iconName = resolveNodeIcon(board.icon, resolved.icon)
  const categoryName = resolved.categoryLabel
  const hex = colorHex(board.color || resolved.color)
  // Aperçu personnalisable (§6bis) : champs choisis par l'utilisateur (œil +
  // réordonnancement), ou à défaut les 2 premiers champs renseignés.
  const preview = visibleNodeFields(board.fields)

  // §2 v1.9 (galerie) : la PREMIÈRE image de la galerie sert de couverture (badge
  // « +N » s'il y en a d'autres). Hash de fichier (chunks P2P) OU, avant migration,
  // data-URL inline affichée directement.
  const cover = entityCover(board.images)
  const extra = extraImageCount(board.images)
  // Même résolution que la galerie : transfert en erreur ou hash non-image → message
  // d'échec (jamais « réception… » indéfiniment).
  const { src: coverSrc, failed: coverFailed } = useEntityImageSrc(handle, cover ? cover.hash : null)
  const openLightbox = useEntityLightbox((state) => state.open)
  // Clic SANS glisser sur la couverture → visionneuse (un déplacement du nœud saisi
  // par l'image n'ouvre rien ; Ctrl/Maj restent la multi-sélection).
  const pressAt = useRef<{ x: number; y: number } | null>(null)
  const openFromClick = (event: ReactMouseEvent, index: number): void => {
    const start = pressAt.current
    pressAt.current = null
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.metaKey) return
    // Pas d'appui reçu (ex. mode « Dessiner le tracé », qui capte l'appui en amont) ou
    // appui suivi d'un glisser : ce n'est pas un clic d'ouverture.
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return
    event.stopPropagation()
    openLightbox(id, index)
  }
  // Survol d'un glisser de fichiers image : le nœud s'illumine (« déposer pour
  // attacher ») ; le DÉPÔT lui-même est traité par BoardView (repérage du nœud sous
  // le point de dépôt), qui attache alors les images au lieu de créer des nœuds.
  const [dropActive, setDropActive] = useState(false)
  const dragDepth = useRef(0)
  const onDragEnter = (event: DragEvent): void => {
    if (!canEdit || !dragCarriesImages(event.dataTransfer)) return
    dragDepth.current++
    setDropActive(true)
  }
  const onDragLeave = (): void => {
    if (dragDepth.current === 0) return
    dragDepth.current--
    if (dragDepth.current === 0) setDropActive(false)
  }
  const endDrag = (): void => {
    dragDepth.current = 0
    setDropActive(false)
  }

  return (
    // Enveloppe sans boîte (`display: contents`) : ne capte que les évènements de
    // glisser-déposer qui remontent du nœud, sans toucher à sa mise en page.
    <div className="nd-entity-dnd" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDrop={endDrag}>
      <NodeShell id={id} board={board} selected={selected} className="nd-entity">
        <div className="nd-entity-head">
          <span className="nd-entity-ico" style={{ background: withAlpha(hex, 0.16), color: hex }}>
            <EntityIcon icon={iconName} size={13} />
          </span>
          <div className="nd-entity-head-text">
            {/* Refonte UI : « Catégorie · Type » en étiquette (le badge de pied est
                retiré). Titre vide → le type sert déjà de titre estompé : on n'affiche
                alors que la catégorie, sans redite. */}
            {(categoryName !== '' || board.title !== '') && (
              <span className="nd-entity-cat">
                {board.title === ''
                  ? categoryName
                  : categoryName !== ''
                    ? `${categoryName} · ${resolved.label}`
                    : resolved.label}
              </span>
            )}
            <InlineTitle nodeId={id} value={board.title} fallback={resolved.label} />
          </div>
        </div>
        {cover && (
          <div
            className="nd-entity-image"
            title={t('entity.imageOpen')}
            onPointerDown={(event) => {
              pressAt.current = { x: event.clientX, y: event.clientY }
            }}
            onClick={(event) => openFromClick(event, 0)}
          >
            {coverSrc ? (
              <img className="nd-entity-image__img" src={coverSrc} alt="" draggable={false} />
            ) : (
              <div
                className={`nd-entity-image__ph${coverFailed ? ' nd-entity-image__ph--failed' : ''}`}
              >
                <ImageIcon size={16} />
                <span>{coverFailed ? t('image.transferError') : t('image.receiving')}</span>
              </div>
            )}
            {extra > 0 && (
              <span
                className="nd-entity-image__more"
                title={t('entity.imageMore', { count: extra })}
                onClick={(event) => openFromClick(event, 1)}
              >
                +{extra}
              </span>
            )}
          </div>
        )}
        {preview.length > 0 && (
          <div className="nd-entity-fields">
            {preview.map((field) => (
              <div key={field.id} className="nd-entity-field">
                <span className="nd-entity-field-label" title={field.label}>
                  {field.label}
                </span>
                <span
                  className={
                    isMonoField(field) ? 'nd-entity-field-value cm-mono' : 'nd-entity-field-value'
                  }
                  title={field.value}
                >
                  {field.value}
                </span>
              </div>
            ))}
          </div>
        )}
        {dropActive && (
          <div className="nd-entity-dropover" aria-hidden>
            <ImagePlus size={18} />
            <span>{t('entity.imagesDropHere')}</span>
          </div>
        )}
      </NodeShell>
    </div>
  )
})
