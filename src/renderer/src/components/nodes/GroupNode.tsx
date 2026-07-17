/**
 * Nœud groupe / zone : simple région colorée avec libellé, sans NodeShell ni
 * poignées de connexion (une zone ne se connecte pas).
 */
import { memo, useRef, useState } from 'react'
import { NodeResizer } from '@xyflow/react'
import { t } from '@/i18n'
import { colorHex, withAlpha } from '@/lib/colors'
import { useBoardContext } from '@/flow/BoardContext'
import type { CosintNodeProps } from '@/flow/flowTypes'
import './nodes.css'

export const GroupNode = memo(function GroupNode({ id, data, selected }: CosintNodeProps): JSX.Element {
  const board = data.board
  const { updateNodeData, canEdit } = useBoardContext()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Échap annule : le blur qui suit ne doit pas committer.
  const cancelledRef = useRef(false)
  const hex = colorHex(board.color)

  const commit = (): void => {
    setEditing(false)
    const title = draft.trim()
    if (title !== board.title) updateNodeData(id, { title })
  }

  return (
    <div
      className="nd-group"
      style={{ background: withAlpha(hex, 0.13), borderColor: withAlpha(hex, 0.5) }}
    >
      <NodeResizer
        isVisible={selected && canEdit}
        minWidth={160}
        minHeight={120}
        onResizeEnd={(_event, params) =>
          updateNodeData(id, {
            x: params.x,
            y: params.y,
            width: params.width,
            height: params.height
          })
        }
      />
      {editing ? (
        <input
          className="nodrag nd-inline-input nd-group-input"
          value={draft}
          placeholder={t('node.groupLabelPlaceholder')}
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
      ) : (
        <div
          className={board.title ? 'nd-group-label' : 'nd-group-label nd-group-label--empty'}
          onDoubleClick={(event) => {
            event.stopPropagation()
            cancelledRef.current = false
            setDraft(board.title)
            setEditing(true)
          }}
        >
          {board.title || t('node.groupLabelPlaceholder')}
        </div>
      )}
    </div>
  )
})
