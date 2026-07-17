/**
 * Panneau flottant « Sources » (§4) : liste toutes les sources du tableau avec
 * leur fiabilité et le nombre d'éléments rattachés ; un clic centre la vue sur
 * la source. Tri local par date ou par fiabilité.
 */
import { useMemo, useState } from 'react'
import { BookMarked, Crosshair, X } from 'lucide-react'
import type { BoardNodeData } from '@/types'
import { RELIABILITY_SCALE } from '@/lib/entities'
import { t } from '@/i18n'
import './details.css'

interface SourcesPanelProps {
  sources: BoardNodeData[]
  /** Nombre d'éléments reliés à chaque source (id de source → compte). */
  attachedCounts: Record<string, number>
  onLocate: (nodeId: string) => void
  onClose: () => void
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
    <aside className="bd-sources" aria-label={t('sources.title')}>
      <div className="bd-sources-head">
        <BookMarked size={14} />
        <h3 className="bd-sources-title">{t('sources.title')}</h3>
        <button
          className="cm-btn cm-btn--ghost cm-btn--icon"
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>

      <div className="bd-sources-sort">
        <button
          className={`bd-sources-sort__chip${sort === 'date' ? ' bd-sources-sort__chip--active' : ''}`}
          onClick={() => setSort('date')}
        >
          {t('sources.sortDate')}
        </button>
        <button
          className={`bd-sources-sort__chip${sort === 'reliability' ? ' bd-sources-sort__chip--active' : ''}`}
          onClick={() => setSort('reliability')}
        >
          {t('sources.sortReliability')}
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
              onLocate={onLocate}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function SourceItem({
  source,
  count,
  onLocate
}: {
  source: BoardNodeData
  count: number
  onLocate: (nodeId: string) => void
}): JSX.Element {
  const entry = RELIABILITY_SCALE.find((scale) => scale.code === source.reliability)

  return (
    <button
      className="bd-sources-item"
      onClick={() => onLocate(source.id)}
      title={t('sources.locate')}
    >
      <span
        className={`bd-sources-badge bd-sources-badge--${reliabilityTone(source.reliability ?? '')}`}
        title={entry ? t(entry.labelKey) : t('common.none')}
      >
        {source.reliability || '—'}
      </span>
      <span className="bd-sources-item__main">
        <span className="bd-sources-item__title">{source.title || t('nodeType.source')}</span>
        <span className="bd-sources-item__meta">{t('sources.attached', { count })}</span>
      </span>
      <Crosshair size={13} className="bd-sources-item__locate" />
    </button>
  )
}
