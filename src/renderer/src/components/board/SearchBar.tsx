/** Barre de recherche flottante — UI pure, la logique de recherche vit dans BoardView. */
import { CaseSensitive, ChevronDown, ChevronUp, Search, WholeWord, X } from 'lucide-react'
import { t } from '@/i18n'
import { taxonomyCategory, type CategoryId } from '@/lib/taxonomy'

interface SearchBarProps {
  query: string
  onQueryChange: (query: string) => void
  current: number
  total: number
  onPrev: () => void
  onNext: () => void
  /** §3 v1.7 : options de recherche. */
  caseSensitive: boolean
  onToggleCaseSensitive: () => void
  wholeWord: boolean
  onToggleWholeWord: () => void
  /** Catégories d'entité présentes sur le tableau (filtre facultatif). */
  categories: CategoryId[]
  category: CategoryId | null
  onCategoryChange: (category: CategoryId | null) => void
  onClose: () => void
}

export function SearchBar({
  query,
  onQueryChange,
  current,
  total,
  onPrev,
  onNext,
  caseSensitive,
  onToggleCaseSensitive,
  wholeWord,
  onToggleWholeWord,
  categories,
  category,
  onCategoryChange,
  onClose
}: SearchBarProps): JSX.Element {
  return (
    <div className="bd-search" role="search">
      <Search size={15} aria-hidden="true" />
      <input
        autoFocus
        value={query}
        placeholder={t('search.placeholder')}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (event.shiftKey) onPrev()
            else onNext()
          } else if (event.key === 'Escape') {
            onClose()
          }
        }}
        aria-label={t('search.placeholder')}
      />
      {query !== '' && (
        <span className="bd-search__count">
          {total > 0 ? t('search.results', { current, total }) : t('search.noResults')}
        </span>
      )}
      {/* Options : sensible à la casse / mot entier (accents toujours ignorés). */}
      <button
        className={`cm-btn cm-btn--ghost cm-btn--icon${caseSensitive ? ' bd-search__opt--on' : ''}`}
        onClick={onToggleCaseSensitive}
        title={t('search.caseSensitive')}
        aria-label={t('search.caseSensitive')}
        aria-pressed={caseSensitive}
      >
        <CaseSensitive size={16} />
      </button>
      <button
        className={`cm-btn cm-btn--ghost cm-btn--icon${wholeWord ? ' bd-search__opt--on' : ''}`}
        onClick={onToggleWholeWord}
        title={t('search.wholeWord')}
        aria-label={t('search.wholeWord')}
        aria-pressed={wholeWord}
      >
        <WholeWord size={16} />
      </button>
      {/* Filtre par catégorie d'entité (présentes sur le tableau seulement). */}
      {categories.length > 0 && (
        <select
          className="bd-search__cat"
          value={category ?? ''}
          onChange={(event) =>
            onCategoryChange(event.target.value === '' ? null : (event.target.value as CategoryId))
          }
          title={t('search.filterCategory')}
          aria-label={t('search.filterCategory')}
        >
          <option value="">{t('search.allCategories')}</option>
          {categories.map((id) => {
            const def = taxonomyCategory(id)
            return (
              <option key={id} value={id}>
                {def ? t(def.nameKey) : id}
              </option>
            )
          })}
        </select>
      )}
      <button
        className="cm-btn cm-btn--ghost cm-btn--icon"
        onClick={onPrev}
        disabled={total === 0}
        title={t('search.prev')}
        aria-label={t('search.prev')}
      >
        <ChevronUp size={15} />
      </button>
      <button
        className="cm-btn cm-btn--ghost cm-btn--icon"
        onClick={onNext}
        disabled={total === 0}
        title={t('search.next')}
        aria-label={t('search.next')}
      >
        <ChevronDown size={15} />
      </button>
      <button
        className="cm-btn cm-btn--ghost cm-btn--icon"
        onClick={onClose}
        title={t('search.close')}
        aria-label={t('search.close')}
      >
        <X size={15} />
      </button>
    </div>
  )
}
