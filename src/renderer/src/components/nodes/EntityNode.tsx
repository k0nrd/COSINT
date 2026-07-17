/**
 * Nœud fiche entité (§3) : icône du gabarit + titre éditable, aperçu des
 * 3 premiers champs renseignés, badge du type. Le détail complet des champs
 * s'édite dans le panneau Détails.
 */
import { memo, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { MessageKey } from '@/i18n'
import { resolveType } from '@/lib/entityTypes'
import { visibleNodeFields } from '@/lib/entities'
import { colorHex, withAlpha } from '@/lib/colors'
import { useBoardContext } from '@/flow/BoardContext'
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
  const { customTypeMap } = useBoardContext()
  const typeId = board.entityType ?? 'generic_other'
  // §2 v1.8 : résolution unifiée (taxonomie + types personnalisés du tableau).
  const resolved = resolveType(typeId, customTypeMap)
  const categoryName = resolved.categoryLabel
  const hex = colorHex(board.color || resolved.color)
  // Aperçu personnalisable (§6bis) : champs choisis par l'utilisateur (œil +
  // réordonnancement), ou à défaut les 2 premiers champs renseignés.
  const preview = visibleNodeFields(board.fields)

  return (
    <NodeShell id={id} board={board} selected={selected} className="nd-entity">
      <div className="nd-entity-head">
        <span className="nd-entity-ico" style={{ background: withAlpha(hex, 0.16), color: hex }}>
          <EntityIcon icon={resolved.icon} size={13} />
        </span>
        <div className="nd-entity-head-text">
          {categoryName !== '' && <span className="nd-entity-cat">{categoryName}</span>}
          <InlineTitle nodeId={id} value={board.title} fallback={resolved.label} />
        </div>
      </div>
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
      <div className="nd-entity-foot">
        <span className="nd-entity-badge">{resolved.label}</span>
      </div>
    </NodeShell>
  )
})
