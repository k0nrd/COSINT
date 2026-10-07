/**
 * Panneau flottant « Sources » (§4) : liste toutes les sources du tableau avec
 * leur fiabilité et le nombre d'éléments rattachés ; un clic centre la vue sur
 * la source. Tri local par date ou par fiabilité.
 */
import { useMemo, useState } from 'react'
import { Crosshair, Download, X } from 'lucide-react'
import type { BoardNodeData } from '@/types'
import { RELIABILITY_SCALE } from '@/lib/entities'
import { formatDateTime, t, type MessageKey } from '@/i18n'
import './details.css'

interface SourcesPanelProps {
  sources: BoardNodeData[]
  /** Nombre d'éléments reliés à chaque source (id de source → compte). */
  attachedCounts: Record<string, number>
  onLocate: (nodeId: string) => void
  /** Source actuellement sélectionnée sur le tableau (mise en évidence), le cas échéant. */
  selectedId?: string | null
  /** Export « Rapport des sources (Markdown) » — même action que le menu Exporter. */
  onExportReport?: () => void
  onClose: () => void
}

/** Libellé court de la pastille de fiabilité, par nuance. */
const TONE_LABEL: Record<string, MessageKey> = {
  good: 'sources.toneGood',
  mid: 'sources.toneMid',
  bad: 'sources.toneBad',
  unknown: 'sources.toneUnknown'
}

type SortKey = 'date' | 'reliability'

/** Nuance visuelle du badge de fiabilité (A/B fiables … E non fiable). */
function reliabilityTone(code: string): string {
  if (code === 'A' || code === 'B') return 'good'
  if (code === 'C' || code === 'D') return 'mid'
  if (code === 'E') return 'bad'
  return 'unknown'
}

export function SourcesPanel({
  sources,
  attachedCounts,
  onLocate,
  selectedId,
  onExportReport,
  onClose
}: SourcesPanelProps): JSX.Element {
  const [sort, setSort] = useState<SortKey>('date')

  const sorted = useMemo(() => {
    const list = [...sources]
    if (sort === 'reliability') {
      // A (fiable) en premier ; fiabilité non renseignée en dernier.
      list.sort((a, b) => {
        const ra = a.reliability || 'ZZ'
        const rb = b.reliability || 'ZZ'
        if (ra !== rb) return ra < rb ? -1 : 1
        return b.createdAt - a.createdAt
      })
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt)
    }
    return list
  }, [sources, sort])

  return (
    <aside className="bd-sources bd-dock" aria-label={t('sources.title')}>
      <div className="bd-sources-head">
        <h3 className="bd-sources-title">{t('sources.title')}</h3>
        <span className="bd-sources-count">{sources.length}</span>
        <button
          className="cm-btn cm-btn--ghost cm-btn--icon"
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>

      <div className="bd-sources-sort" role="group">
        <button
          className={`bd-sources-sort__chip${sort === 'date' ? ' bd-sources-sort__chip--active' : ''}`}
          onClick={() => setSort('date')}
          title={t('sources.sortDate')}
          aria-pressed={sort === 'date'}
        >
          {t('sources.byDate')}
        </button>
        <button
          className={`bd-sources-sort__chip${sort === 'reliability' ? ' bd-sources-sort__chip--active' : ''}`}
          onClick={() => setSort('reliability')}
          title={t('sources.sortReliability')}
          aria-pressed={sort === 'reliability'}
        >
          {t('sources.byReliability')}
        </button>
      </div>

      <div className="bd-sources-list">
        {sorted.length === 0 ? (
          <p className="bd-sources-empty">{t('sources.empty')}</p>
        ) : (
          sorted.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              count={attachedCounts[source.id] ?? 0}
              selected={selectedId === source.id}
              onLocate={onLocate}
            />
          ))
        )}
      </div>

      {onExportReport && (
        <div className="bd-sources-foot">
          <button className="cm-btn bd-sources-report" onClick={onExportReport} disabled={sources.length === 0}>
            <Download size={14} />
            {t('export.report')}
          </button>
        </div>
      )}
    </aside>
  )
}

function SourceItem({
  source,
  count,
  selected,
  onLocate
}: {
  source: BoardNodeData
  count: number
  selected: boolean
  onLocate: (nodeId: string) => void
}): JSX.Element {
  const entry = RELIABILITY_SCALE.find((scale) => scale.code === source.reliability)
  const tone = reliabilityTone(source.reliability ?? '')
  const url = source.content.trim()

  return (
    <button
      className={`bd-sources-item${selected ? ' bd-sources-item--selected' : ''}`}
      onClick={() => onLocate(source.id)}
      title={t('sources.locate')}
    >
      <span className="bd-sources-item__top">
        <span className="bd-sources-item__title">{source.title || t('nodeType.source')}</span>
        <Crosshair size={13} className="bd-sources-item__locate" />
      </span>
      {url !== '' && <span className="bd-sources-item__url">{url}</span>}
      <span className="bd-sources-item__meta">
        <span className="bd-sources-item__date">{formatDateTime(source.createdAt)}</span>
        <span
          className={`bd-sources-badge bd-sources-badge--${tone}`}
          title={entry ? t(entry.labelKey) : t('common.none')}
        >
          <span className="bd-sources-badge__dot" aria-hidden="true" />
          {source.reliability ? `${source.reliability} · ` : ''}
          {t(TONE_LABEL[tone])}
        </span>
        <span className="bd-sources-item__count">{t('sources.attachedShort', { count })}</span>
      </span>
    </button>
  )
}
