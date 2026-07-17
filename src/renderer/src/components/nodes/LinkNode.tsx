/**
 * Nœud lien : titre + URL, ouverture uniquement dans le navigateur externe (§8).
 * Titre et URL s'éditent inline au double-clic.
 */
import { memo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { ExternalLink, Globe } from 'lucide-react'
import { normalizeExternalUrl } from '@shared/url'
import { t } from '@/i18n'
import { useBoardContext } from '@/flow/BoardContext'
import type { CosintNodeProps } from '@/flow/flowTypes'
import { NodeShell } from './NodeShell'

type EditableField = 'title' | 'url'

export const LinkNode = memo(function LinkNode({ id, data, selected }: CosintNodeProps): JSX.Element {
  const board = data.board
  const { updateNodeData, openExternal } = useBoardContext()
  const [editing, setEditing] = useState<EditableField | null>(null)
  const [draft, setDraft] = useState('')
  // Échap annule : le blur qui suit ne doit pas committer.
  const cancelledRef = useRef(false)

  // §4 (v1.3) : même règle de validation que l'ouverture externe côté main —
  // le schéma est optionnel (« google.com » devient https://google.com).
  const valid = normalizeExternalUrl(board.content) !== null
  const displayTitle = board.title || board.content

  const startEdit = (field: EditableField) => {
    return (event: ReactMouseEvent): void => {
      event.stopPropagation()
      cancelledRef.current = false
      setDraft(field === 'title' ? board.title : board.content)
      setEditing(field)
    }
  }

  const commit = (): void => {
    if (editing === 'title') updateNodeData(id, { title: draft.trim() })
    else if (editing === 'url') updateNodeData(id, { content: draft.trim() })
    setEditing(null)
  }

  const renderInput = (field: EditableField): JSX.Element => (
    <input
      className="nodrag nd-inline-input"
      value={draft}
      placeholder={field === 'title' ? t('node.linkTitlePlaceholder') : t('node.linkUrlPlaceholder')}
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
          setEditing(null)
        }
      }}
    />
  )

  return (
    <NodeShell id={id} board={board} selected={selected} className="nd-link">
      <div className="nd-link-head">
        <Globe size={16} className="nd-link-ico" />
        {editing === 'title' ? (
          renderInput('title')
        ) : (
          <span
            className={displayTitle ? 'nd-link-title' : 'nd-link-title nd-link-title--empty'}
            title={displayTitle}
            onDoubleClick={startEdit('title')}
          >
            {displayTitle || t('node.linkTitlePlaceholder')}
          </span>
        )}
      </div>
      {editing === 'url' ? (
        renderInput('url')
      ) : valid ? (
        <span className="nd-link-url" title={board.content} onDoubleClick={startEdit('url')}>
          {board.content}
        </span>
      ) : (
        <span className="nd-link-url nd-link-url--invalid" onDoubleClick={startEdit('url')}>
          {t('node.linkInvalid')}
        </span>
      )}
      <button
        type="button"
        className="cm-btn nodrag nd-link-open"
        disabled={!valid}
        onClick={() => openExternal(board.content)}
      >
        <ExternalLink size={13} />
        {t('node.linkOpen')}
      </button>
    </NodeShell>
  )
})
