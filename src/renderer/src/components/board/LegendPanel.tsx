/**
 * Légende repliable (§3) : rappel des catégories d'entités, des couleurs et des
 * styles de liens réellement utilisés sur le tableau.
 */
import { useMemo } from 'react'
import { X } from 'lucide-react'
import type { BoardEdgeData, BoardNodeData } from '@/types'
import { colorHex } from '@/lib/colors'
import { taxonomyCategory, taxonomyType, type CategoryId } from '@/lib/taxonomy'
import { t, type MessageKey } from '@/i18n'
import './legend.css'

interface LegendPanelProps {
  nodes: BoardNodeData[]
  edges: BoardEdgeData[]
  onClose: () => void
}

const STYLE_LABEL: Record<BoardEdgeData['style'], MessageKey> = {
  solid: 'details.styleSolid',
  dashed: 'details.styleDashed',
  dotted: 'style.dotted'
}

export function LegendPanel({ nodes, edges, onClose }: LegendPanelProps): JSX.Element {
  // Catégories d'entités présentes.
  const categories = useMemo(() => {
    const counts = new Map<CategoryId, number>()
    for (const node of nodes) {
      if (node.kind !== 'entity' || !node.entityType) continue
      const category = taxonomyType(node.entityType)?.category
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [nodes])

  // Couleurs utilisées (nœuds + liens).
  const colors = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) counts.set(node.color, (counts.get(node.color) ?? 0) + 1)
    for (const edge of edges) counts.set(edge.color, (counts.get(edge.color) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [nodes, edges])

  // Styles de liens présents.
  const styles = useMemo(() => {
    const set = new Set<BoardEdgeData['style']>()
    for (const edge of edges) set.add(edge.style)
    return [...set]
  }, [edges])

  const empty = categories.length === 0 && colors.length === 0 && styles.length === 0

  return (
    <div className="bd-legend">
      <div className="bd-legend__head">
        <span className="bd-legend__title">{t('legend.title')}</span>
        <button
          className="cm-btn cm-btn--ghost cm-btn--icon cm-btn--sm"
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>

      <div className="bd-legend__body">
        {empty && <p className="cm-hint">{t('legend.empty')}</p>}

        {categories.length > 0 && (
          <section>
            <div className="bd-legend__section">{t('legend.categories')}</div>
            {categories.map(([category, count]) => (
              <div key={category} className="bd-legend__row">
                <span
                  className="bd-legend__dot"
                  style={{ background: taxonomyCategory(category)?.color }}
                />
                <span className="bd-legend__label">{t(taxonomyCategory(category)!.nameKey)}</span>
                <span className="bd-legend__count">{count}</span>
              </div>
            ))}
          </section>
        )}

        {colors.length > 0 && (
          <section>
            <div className="bd-legend__section">{t('legend.colors')}</div>
            {colors.map(([color, count]) => (
              <div key={color} className="bd-legend__row">
                <span className="bd-legend__swatch" style={{ background: colorHex(color) }} />
                <span className="bd-legend__label cm-mono">{colorHex(color)}</span>
                <span className="bd-legend__count">{count}</span>
              </div>
            ))}
          </section>
        )}

        {styles.length > 0 && (
          <section>
            <div className="bd-legend__section">{t('legend.linkStyles')}</div>
            {styles.map((style) => (
              <div key={style} className="bd-legend__row">
                <span className={`bd-legend__line bd-legend__line--${style}`} />
                <span className="bd-legend__label">{t(STYLE_LABEL[style])}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
