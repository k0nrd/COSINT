/**
 * Nœud note texte : markdown affiché (HTML échappé à la source par
 * lib/markdown.ts), édition plein cadre au double-clic.
 */
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { t } from '@/i18n'
import { renderMarkdown } from '@/lib/markdown'
import { useBoardContext } from '@/flow/BoardContext'
import { AutoTextarea } from '@/components/common/AutoTextarea'
import type { CosintNodeProps } from '@/flow/flowTypes'
import { NodeShell } from './NodeShell'

/** Corps markdown éditable — partagé avec TimestampedNode. */
export function MarkdownBody({ nodeId, content }: { nodeId: string; content: string }): JSX.Element {
  const { updateNodeData } = useBoardContext()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Échap annule : le blur éventuel qui suit la fermeture ne doit pas committer.
  const cancelledRef = useRef(false)
  const html = useMemo(() => renderMarkdown(content), [content])

  const commit = (): void => {
    setEditing(false)
    if (draft !== content) updateNodeData(nodeId, { content: draft })
  }

  // Commit-on-unmount : si le nœud est démonté pendant l'édition (ex. un pair le
  // sort du viewport, `onlyRenderVisibleElements`), le brouillon n'est pas perdu.
  const state = useRef({ editing, draft, content, updateNodeData })
  state.current = { editing, draft, content, updateNodeData }
  useEffect(
    () => () => {
      const s = state.current
      if (s.editing && !cancelledRef.current && s.draft !== s.content) {
        try {
          s.updateNodeData(nodeId, { content: s.draft })
        } catch {
          /* document en cours de destruction : rien à faire */
        }
      }
    },
    [nodeId]
  )

  if (editing) {
    return (
      // §4 v1.6 : l'éditeur grandit avec le contenu (le nœud est auto-hauteur) —
      // aucun texte masqué pendant la saisie, scroll interne au-delà de la limite.
      <AutoTextarea
        className="nodrag nowheel nd-editor"
        maxHeight={600}
        minHeight={72}
        value={draft}
        placeholder={t('node.markdownPlaceholder')}
        autoFocus
        onFocus={(event) => {
          const end = event.target.value.length
          event.target.setSelectionRange(end, end)
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!cancelledRef.current) commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.ctrlKey) {
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
    setDraft(content)
    setEditing(true)
  }

  return content.trim() === '' ? (
    <div className="nd-md" onDoubleClick={startEdit}>
      <span className="nd-placeholder">{t('node.editHint')}</span>
    </div>
  ) : (
    <div className="nd-md" onDoubleClick={startEdit} dangerouslySetInnerHTML={{ __html: html }} />
  )
}

export const TextNode = memo(function TextNode({ id, data, selected }: CosintNodeProps): JSX.Element {
  return (
    <NodeShell id={id} board={data.board} selected={selected}>
      <MarkdownBody nodeId={id} content={data.board.content} />
    </NodeShell>
  )
})
