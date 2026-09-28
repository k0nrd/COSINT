/**
 * §R2 v1.9 (aperçu bureautique) — aperçu d'un document dans le nœud fichier :
 * miniature intégrée si elle existe, sinon un court extrait (titres/paragraphes,
 * début de tableau 8×6, 1re diapositive), plus un badge de format. Uniquement du
 * TEXTE rendu en éléments React (jamais de HTML du document).
 */
import { useEffect, useMemo } from 'react'
import { LoaderCircle } from 'lucide-react'
import { t } from '@/i18n'
import { officeFormatLabel, type OfficeBlock, type OfficePreview } from '@/lib/officePreview'
import { officeFailureText, officeMeta, useOfficePreview } from './officeSource'
import type { NodePreviewProps } from './types'
import './officePreview.css'

/** Bornes de l'extrait affiché dans le nœud. */
const NODE_EXCERPT = { blocks: 10, rows: 8, cols: 6, slideTexts: 4, chars: 240 } as const

function clip(s: string, max: number = NODE_EXCERPT.chars): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function Excerpt({ blocks }: { blocks: OfficeBlock[] }): JSX.Element {
  const first = blocks[0]
  if (first.kind === 'table') {
    const rows = first.rows.slice(0, NODE_EXCERPT.rows).map((r) => r.slice(0, NODE_EXCERPT.cols))
    return (
      <div className="ofp-node-sheet">
        {first.name && <div className="ofp-node-sheet-name">{clip(first.name, 60)}</div>}
        <table className="ofp-node-table">
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{clip(cell, 40)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (first.kind === 'slide') {
    return (
      <div className="ofp-node-slide">
        <span className="ofp-node-slide-num">{t('file.office.slide', { n: first.index })}</span>
        {first.title && <strong className="ofp-node-slide-title">{clip(first.title, 120)}</strong>}
        {first.texts.slice(0, NODE_EXCERPT.slideTexts).map((s, i) => (
          <span key={i} className="ofp-node-slide-text">
            {clip(s, 120)}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="ofp-node-doc">
      {blocks.slice(0, NODE_EXCERPT.blocks).map((b, i) =>
        b.kind === 'heading' ? (
          <strong key={i} className="ofp-node-h">
            {clip(b.text, 120)}
          </strong>
        ) : b.kind === 'paragraph' ? (
          <p key={i}>{clip(b.text)}</p>
        ) : b.kind === 'table' ? (
          <p key={i} className="ofp-node-row">
            {clip(b.rows.slice(0, 3).map((r) => r.join(' · ')).join(' / '))}
          </p>
        ) : null
      )}
    </div>
  )
}

function Body({ preview, fallback }: { preview: OfficePreview; fallback: NodePreviewProps['fallback'] }): JSX.Element {
  if (preview.thumbnail) return <img className="nd-file-thumb nd-file-thumb--page" src={preview.thumbnail} alt="" draggable={false} />
  if (!preview.blocks.length) return <>{fallback}</>
  return <Excerpt blocks={preview.blocks} />
}

export function OfficeNodePreview(props: NodePreviewProps): JSX.Element | null {
  const { compact, fallback, onInfo } = props
  const state = useOfficePreview(props)
  const preview = state.status === 'ready' ? state.preview : null
  const info = useMemo(() => (preview ? { meta: officeMeta(preview) || undefined, thumbnail: preview.thumbnail } : null), [preview])

  useEffect(() => {
    onInfo(info)
  }, [info, onInfo])
  useEffect(() => () => onInfo(null), [onInfo])

  if (compact) return null
  const label = officeFormatLabel(preview?.format ?? props.ext)
  return (
    <div className="ofp-node">
      {state.status === 'loading' ? (
        <div className="ofp-node-status">
          <LoaderCircle size={16} className="nd-file-spin" />
          <span>{t('file.office.loading')}</span>
        </div>
      ) : state.status === 'error' ? (
        <>
          {fallback}
          <div className="ofp-node-error">{officeFailureText(state.failure)}</div>
        </>
      ) : (
        <Body preview={state.preview} fallback={fallback} />
      )}
      {label && <span className="ofp-badge">{label}</span>}
    </div>
  )
}
