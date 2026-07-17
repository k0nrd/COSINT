/**
 * Panneau de filtres flottant : par tag, couleur libre (§5), catégorie et type
 * d'entité (§2). Chaque section ne liste que les valeurs réellement présentes.
 */
import { X } from 'lucide-react'
import { t } from '@/i18n'
import { taxonomyCategory, type CategoryId } from '@/lib/taxonomy'
import { STATUS_DEFS } from '@/lib/status'
import type { ElementStatus } from '@/types'
import { entityTypeLabelKey } from '@/components/nodes/EntityNode'

interface FilterBarProps {
  allTags: string[]
  activeTags: string[]
  allColors: string[]
  activeColors: string[]
  allCategories: CategoryId[]
  activeCategories: CategoryId[]
  allEntityTypes: string[]
  activeEntityTypes: string[]
  /** §3 : compteur par statut (nœuds + liens) et statuts filtrés. */
  statusCounts: Record<ElementStatus, number>
  activeStatuses: ElementStatus[]
  onToggleStatus: (status: ElementStatus) => void
  onToggleTag: (tag: string) => void
  onToggleColor: (hex: string) => void
  onToggleCategory: (category: CategoryId) => void
  onToggleEntityType: (typeId: string) => void
  onClear: () => void
  hiddenCount: number
  onClose: () => void
}

export function FilterBar({
  allTags,
  activeTags,
  allColors,
  activeColors,
  allCategories,
  activeCategories,
  allEntityTypes,
  activeEntityTypes,
  statusCounts,
  activeStatuses,
  onToggleStatus,
  onToggleTag,
  onToggleColor,
  onToggleCategory,
  onToggleEntityType,
  onClear,
  hiddenCount,
  onClose
}: FilterBarProps): JSX.Element {
  const filterActive =
    activeTags.length > 0 ||
    activeColors.length > 0 ||
    activeCategories.length > 0 ||
    activeEntityTypes.length > 0 ||
    activeStatuses.length > 0

  return (
    <div className="bd-filter" role="region" aria-label={t('filter.title')}>
      <div className="bd-filter__header">
        <h3 className="bd-filter__title">{t('filter.title')}</h3>
        <button
          className="cm-btn cm-btn--ghost cm-btn--icon"
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X size={15} />
        </button>
      </div>

      <div className="bd-filter__section">{t('filter.byTag')}</div>
      {allTags.length === 0 ? (
        <p className="bd-filter__empty">{t('filter.noTags')}</p>
      ) : (
        <div className="bd-filter__chips">
          {allTags.map((tag) => {
            const active = activeTags.includes(tag)
            return (
              <button
                key={tag}
                className={`bd-filter__chip${active ? ' bd-filter__chip--active' : ''}`}
                onClick={() => onToggleTag(tag)}
                aria-pressed={active}
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}

      {/* Catégories d'entités présentes (§2). */}
      {allCategories.length > 0 && (
        <>
          <div className="bd-filter__section">{t('filter.byCategory')}</div>
          <div className="bd-filter__chips">
            {allCategories.map((category) => {
              const active = activeCategories.includes(category)
              return (
                <button
                  key={category}
                  className={`bd-filter__chip${active ? ' bd-filter__chip--active' : ''}`}
                  onClick={() => onToggleCategory(category)}
                  aria-pressed={active}
                >
                  <span
                    className="bd-filter__cat-dot"
                    style={{ background: taxonomyCategory(category)?.color }}
                  />
                  {t(taxonomyCategory(category)!.nameKey)}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Types d'entité présents (§2). */}
      {allEntityTypes.length > 0 && (
        <>
          <div className="bd-filter__section">{t('filter.byType')}</div>
          <div className="bd-filter__chips">
            {allEntityTypes.map((typeId) => {
              const active = activeEntityTypes.includes(typeId)
              return (
                <button
                  key={typeId}
                  className={`bd-filter__chip${active ? ' bd-filter__chip--active' : ''}`}
                  onClick={() => onToggleEntityType(typeId)}
                  aria-pressed={active}
                >
                  {t(entityTypeLabelKey(typeId))}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Statuts (§3) : afficher seulement les éléments d'un statut donné + compteur. */}
      <div className="bd-filter__section">{t('filter.byStatus')}</div>
      <div className="bd-filter__chips">
        {STATUS_DEFS.map((def) => {
          const active = activeStatuses.includes(def.id)
          const count = statusCounts[def.id] ?? 0
          return (
            <button
              key={def.id}
              className={`bd-filter__chip${active ? ' bd-filter__chip--active' : ''}`}
              onClick={() => onToggleStatus(def.id)}
              aria-pressed={active}
              title={t(def.labelKey)}
            >
              <span
                className="bd-filter__status-dot"
                style={{
                  background: def.id === 'none' ? 'transparent' : def.color,
                  borderColor: def.color
                }}
              >
                {def.glyph}
              </span>
              {t(def.labelKey)}
              <span className="bd-filter__count">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Couleurs libres : uniquement celles réellement présentes sur le tableau. */}
      {allColors.length > 0 && (
        <>
          <div className="bd-filter__section">{t('filter.byColor')}</div>
          <div className="cm-swatches">
            {allColors.map((hex) => {
              const active = activeColors.includes(hex)
              return (
                <button
                  key={hex}
                  className={`cm-swatch${active ? ' cm-swatch--active' : ''}`}
                  style={{ background: hex }}
                  onClick={() => onToggleColor(hex)}
                  title={hex}
                  aria-label={hex}
                  aria-pressed={active}
                />
              )
            })}
          </div>
        </>
      )}

      {filterActive && (
        <div className="bd-filter__footer">
          <span>{t('filter.hiddenCount', { count: hiddenCount })}</span>
          <button className="cm-btn cm-btn--sm" onClick={onClear}>
            {t('filter.clear')}
          </button>
        </div>
      )}
    </div>
  )
}
