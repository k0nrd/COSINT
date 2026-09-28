/**
 * §R2 v1.9 (aperçu bureautique) — corps de visionneuse : vue de lecture du document
 * (titres, paragraphes, tableaux à en-tête collant, cartes « Diapositive n », onglets
 * de feuilles), avis de troncature et erreurs lisibles (protégé, endommagé, trop lourd).
 * Seul du TEXTE extrait est rendu, en éléments React (jamais de HTML du document).
 */
import { useEffect, useState } from 'react'
import { Download, FileWarning, LoaderCircle } from 'lucide-react'
import { t, type MessageKey } from '@/i18n'
import { officeFormatLabel, type OfficeBlock } from '@/lib/officePreview'
import { officeFailureText, officeMeta, useOfficePreview } from '@/components/nodes/preview/officeSource'
import type { ViewerBodyProps } from '@/components/nodes/preview/types'
import '@/components/nodes/preview/officePreview.css'

/** Lettres de colonne (0 → A, 26 → AA). */
function columnLetters(index: number): string {
  let s = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Tableau ; `sheet` : en-tête collant de lettres de colonne (A, B, C…) comme un tableur. */
function SheetTable({ rows, sheet = false }: { rows: string[][]; sheet?: boolean }): JSX.Element {
  if (!rows.length) return <div className="ofp-view-empty">{t('file.office.emptySheet')}</div>
  const [head, ...rest] = sheet ? [rows[0].map((_, j) => columnLetters(j)), ...rows] : rows
  return (
    <div className="ofp-view-tablewrap">
      <table className="ofp-view-table">
        <thead>
          <tr>
            {head.map((c, j) => (
              <th key={j}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rest.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Block({ block }: { block: OfficeBlock }): JSX.Element {
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(6, block.level + 1)
      const Tag = `h${level}` as 'h2'
      return <Tag className={`ofp-view-h ofp-view-h${level}`}>{block.text}</Tag>
    }
    case 'paragraph':
      return <p className="ofp-view-p">{block.text}</p>
    case 'table':
      return (
        <section className="ofp-view-tableblock">
          {block.name && <h3 className="ofp-view-tablename">{block.name}</h3>}
          <SheetTable rows={block.rows} />
        </section>
      )
    case 'slide':
      return (
        <section className="ofp-view-slide">
          <span className="ofp-view-slide-num">{t('file.office.slide', { n: block.index })}</span>
          {block.title && <h3 className="ofp-view-slide-title">{block.title}</h3>}
          {block.texts.map((s, i) => (
            <p key={i} className="ofp-view-slide-text">
              {s}
            </p>
          ))}
        </section>
      )
  }
}

function warningText(w: string): string {
  return w.startsWith('file.office.') ? t(w as MessageKey) : w
}

export function OfficeViewerBody(props: ViewerBodyProps): JSX.Element {
  const { zoom, onZoomResolved, onMeta, onSave, fallback } = props
  const state = useOfficePreview(props)
  const [sheet, setSheet] = useState(0)
  const value = zoom === 'fit' ? 1 : zoom
  useEffect(() => onZoomResolved(value), [value, onZoomResolved])

  const preview = state.status === 'ready' ? state.preview : null
  useEffect(() => {
    onMeta(preview ? officeMeta(preview) || null : null)
  }, [preview, onMeta])
  useEffect(() => () => onMeta(null), [onMeta])

  if (state.status === 'loading') {
    return (
      <div className="bd-fileviewer__status">
        <LoaderCircle size={22} className="nd-file-spin" />
        <span>{t('file.office.loading')}</span>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="bd-fileviewer__status">
        <FileWarning size={22} />
        <span>{officeFailureText(state.failure)}</span>
        <span className="bd-fileviewer__muted">{t('file.previewSaveHint')}</span>
        <button type="button" className="cm-btn cm-btn--sm" onClick={onSave}>
          <Download size={13} />
          {t('file.save')}
        </button>
      </div>
    )
  }

  const p = state.preview
  if (!p.blocks.length) {
    if (!p.thumbnail) return <>{fallback}</>
    return (
      <div className="bd-fileviewer__scroll">
        <div className="bd-fileviewer__notice">{t('file.office.thumbnailOnly')}</div>
        <div className="ofp-view-thumbwrap">
          <img className="ofp-view-thumb" src={p.thumbnail} alt={t('file.office.thumbnailAlt')} draggable={false} />
        </div>
      </div>
    )
  }

  const sheets = p.blocks.every((b) => b.kind === 'table' && b.name !== undefined) ? p.blocks : null
  const current = sheets ? sheets[Math.min(sheet, sheets.length - 1)] : null
  const label = officeFormatLabel(p.format)
  return (
    <div className="bd-fileviewer__scroll ofp-view-scroll">
      {p.warnings.map((w) => (
        <div key={w} className="bd-fileviewer__notice">
          {warningText(w)}
        </div>
      ))}
      {sheets && sheets.length > 1 && (
        <div className="ofp-view-tabs" role="tablist" aria-label={t('file.office.sheets')}>
          {sheets.map((b, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={b === current}
              className={`ofp-view-tab${b === current ? ' is-active' : ''}`}
              onClick={() => setSheet(i)}
            >
              {b.kind === 'table' ? b.name : ''}
            </button>
          ))}
        </div>
      )}
      <article className={`ofp-view-page${sheets ? ' ofp-view-page--sheet' : ''}`} style={{ fontSize: `${14 * value}px` }}>
        {label && <span className="ofp-badge ofp-badge--view">{label}</span>}
        {p.title && !sheets && <h1 className="ofp-view-title">{p.title}</h1>}
        {current && current.kind === 'table' ? (
          <SheetTable rows={current.rows} sheet />
        ) : (
          p.blocks.map((b, i) => <Block key={i} block={b} />)
        )}
      </article>
    </div>
  )
}
