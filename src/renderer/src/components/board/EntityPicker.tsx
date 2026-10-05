/**
 * Sélecteur d'entité (§2, enrichi §6bis v1.4) : recherche, tri par catégorie
 * (défaut) ou alphabétique, section « Récents » (derniers types utilisés) et
 * « Favoris » épinglables (étoile). Les préférences sont stockées localement par
 * utilisateur.
 */
import { useMemo, useRef, useState } from 'react'
import { ArrowDownAZ, LayoutGrid, Pencil, Plus, Search, Star } from 'lucide-react'
import { Modal } from '@/components/common/Modal'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { entityTypeLabelKey } from '@/components/nodes/EntityNode'
import {
  TAXONOMY_CATEGORIES,
  taxonomyCategory,
  taxonomyType,
  typesOfCategory,
  type CategoryId,
  type TaxonomyType
} from '@/lib/taxonomy'
import { CUSTOM_CATEGORY_COLOR } from '@/lib/entityTypes'
import { withAlpha } from '@/lib/colors'
import { useSettings } from '@/store/settings'
import { useBoardContext } from '@/flow/BoardContext'
import type { CustomEntityType } from '@/types'
import { CustomTypeDialog } from '@/components/board/CustomTypeDialog'
import { t } from '@/i18n'
import './entityPicker.css'

interface EntityPickerProps {
  onPick: (typeId: string) => void
  onClose: () => void
}

/**
 * Sentinelle renvoyée par le sélecteur quand l'utilisateur choisit la catégorie
 * « Code » (§5 v1.6) : BoardView la reconnaît pour créer un nœud « code » (et non
 * une entité). Ce n'est PAS un type de taxonomie.
 */
export const CODE_BLOCK_PICK = '__code_block__'

/** Couleur d'accent de la catégorie « Code » (cohérente thème sombre/clair). */
const CODE_CATEGORY_COLOR = '#8fb86a'

/** Minuscule + suppression des diacritiques, pour une recherche tolérante. */
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Vue affichée dans le volet de droite : tout, un groupe transversal ou une catégorie. */
type PickerView = 'all' | 'favorites' | 'recent' | 'custom' | 'code' | CategoryId

function typeLabel(type: TaxonomyType): string {
  return t(entityTypeLabelKey(type.id))
}

export function EntityPicker({ onPick, onClose }: EntityPickerProps): JSX.Element {
  const [query, setQuery] = useState('')
  const entitySort = useSettings((state) => state.entitySort)
  const setEntitySort = useSettings((state) => state.setEntitySort)
  const favorites = useSettings((state) => state.favoriteEntityTypes)
  const recents = useSettings((state) => state.recentEntityTypes)
  const toggleFavorite = useSettings((state) => state.toggleFavoriteEntityType)
  const pushRecent = useSettings((state) => state.pushRecentEntityType)
  // §2 v1.8 : types personnalisés du tableau + dialogue de création/édition.
  const { customTypes, canEdit } = useBoardContext()
  const [customDialog, setCustomDialog] = useState<{ editing: CustomEntityType | null } | null>(null)

  // Refonte UI : sélecteur en deux volets — catégories à gauche, types à droite.
  const [view, setView] = useState<PickerView>('all')
  const listRef = useRef<HTMLDivElement>(null)

  const needle = fold(query.trim())

  const pick = (type: TaxonomyType): void => {
    pushRecent(type.id)
    onPick(type.id)
    onClose()
  }

  // Catégorie « Code » (§5 v1.6) : une carte « Bloc de code ». Ne crée pas une
  // entité mais un nœud « code » (BoardView reconnaît la sentinelle CODE_BLOCK_PICK).
  const codeMatchesSearch =
    needle === '' ||
    fold(t('nodeType.code')).includes(needle) ||
    fold(t('category.code')).includes(needle) ||
    'code'.includes(needle)
  const CodeSection = (): JSX.Element => (
    <section className="ep-category">
      <div className="ep-category__head">
        <span className="ep-category__dot" style={{ background: CODE_CATEGORY_COLOR }} />
        {t('category.code')}
      </div>
      <div className="ep-types">
        <div className="ep-type-wrap">
          <button
            className="ep-type"
            onClick={() => {
              onPick(CODE_BLOCK_PICK)
              onClose()
            }}
          >
            <span
              className="ep-type__ico"
              style={{ background: withAlpha(CODE_CATEGORY_COLOR, 0.16), color: CODE_CATEGORY_COLOR }}
            >
              <EntityIcon icon="Code2" size={14} />
            </span>
            {t('nodeType.code')}
          </button>
        </div>
      </div>
    </section>
  )

  // Section des types personnalisés (§2 v1.8) : boutons + création/édition.
  const filteredCustom =
    needle === ''
      ? customTypes
      : customTypes.filter((type) => fold(type.name).includes(needle))
  const CustomSection = (): JSX.Element | null => {
    if (customTypes.length === 0 && !canEdit) return null
    if (needle !== '' && filteredCustom.length === 0) return null
    return (
      <section className="ep-category">
        <div className="ep-category__head">
          <span className="ep-category__dot" style={{ background: CUSTOM_CATEGORY_COLOR }} />
          {t('customType.section')}
        </div>
        <div className="ep-types">
          {filteredCustom.map((type) => (
            <div key={type.id} className="ep-type-wrap">
              <button
                className="ep-type"
                onClick={() => {
                  onPick(type.id)
                  onClose()
                }}
              >
                <span
                  className="ep-type__ico"
                  style={{ background: withAlpha(type.color, 0.16), color: type.color }}
                >
                  <EntityIcon icon={type.icon} size={14} />
                </span>
                {type.name}
              </button>
              {canEdit && (
                <button
                  className="ep-star"
                  onClick={(event) => {
                    event.stopPropagation()
                    setCustomDialog({ editing: type })
                  }}
                  title={t('customType.edit')}
                  aria-label={t('customType.edit')}
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
          ))}
          {canEdit && needle === '' && (
            <div className="ep-type-wrap">
              <button
                className="ep-type ep-type--create"
                onClick={() => setCustomDialog({ editing: null })}
              >
                <span className="ep-type__ico ep-type__ico--create">
                  <Plus size={14} />
                </span>
                {t('customType.new')}
              </button>
            </div>
          )}
        </div>
      </section>
    )
  }

  const TypeButton = ({ type }: { type: TaxonomyType }): JSX.Element => {
    const category = taxonomyCategory(type.category)
    const color = category?.color ?? '#7f9bf5'
    const isFavorite = favorites.includes(type.id)
    return (
      <div className="ep-type-wrap">
        <button
          className="ep-type"
          onClick={() => pick(type)}
        >
          <span
            className="ep-type__ico"
            style={{ background: withAlpha(color, 0.16), color }}
          >
            <EntityIcon icon={type.icon} size={14} />
          </span>
          {typeLabel(type)}
        </button>
        <button
          className={`ep-star${isFavorite ? ' ep-star--on' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            toggleFavorite(type.id)
          }}
          title={isFavorite ? t('entityPicker.unpin') : t('entityPicker.pin')}
          aria-label={isFavorite ? t('entityPicker.unpin') : t('entityPicker.pin')}
          aria-pressed={isFavorite}
        >
          <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>
    )
  }

  // ——— Recherche : catégories filtrées (comportement §2) ———
  const searchGroups = useMemo(() => {
    if (needle === '') return null
    return TAXONOMY_CATEGORIES.map((category) => ({
      category,
      types: typesOfCategory(category.id).filter((type) => {
        const label = fold(typeLabel(type))
        return label.includes(needle) || type.id.includes(needle)
      })
    })).filter((group) => group.types.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle])

  const favoriteTypes = favorites
    .map((id) => taxonomyType(id))
    .filter((type): type is TaxonomyType => type !== undefined)
  const recentTypes = recents
    .map((id) => taxonomyType(id))
    .filter((type): type is TaxonomyType => type !== undefined)

  const alphaTypes = useMemo(
    () =>
      [...TAXONOMY_CATEGORIES.flatMap((category) => typesOfCategory(category.id))].sort((a, b) =>
        typeLabel(a).localeCompare(typeLabel(b), 'fr')
      ),
    []
  )

  // Volet de gauche : groupes transversaux puis catégories, avec leur nombre de types.
  const showCustomRail = customTypes.length > 0 || canEdit
  const railItems: Array<{ id: PickerView; label: string; color?: string; count: number; star?: boolean }> = [
    { id: 'all', label: t('entityPicker.all'), count: alphaTypes.length },
    ...(favoriteTypes.length > 0
      ? [{ id: 'favorites' as const, label: t('entityPicker.favorites'), count: favoriteTypes.length, star: true }]
      : []),
    ...(recentTypes.length > 0
      ? [{ id: 'recent' as const, label: t('entityPicker.recent'), count: recentTypes.length }]
      : []),
    ...TAXONOMY_CATEGORIES.map((category) => ({
      id: category.id as PickerView,
      label: t(category.nameKey),
      color: category.color,
      count: typesOfCategory(category.id).length
    })),
    { id: 'code', label: t('category.code'), color: CODE_CATEGORY_COLOR, count: 1 },
    ...(showCustomRail
      ? [{ id: 'custom' as const, label: t('customType.section'), color: CUSTOM_CATEGORY_COLOR, count: customTypes.length }]
      : [])
  ]
  // Une vue qui n'existe plus (dernier favori retiré…) retombe sur « tous les types ».
  const activeView: PickerView = railItems.some((item) => item.id === view) ? view : 'all'
  const activeCategory = TAXONOMY_CATEGORIES.find((category) => category.id === activeView)

  const CategorySection = ({ id }: { id: CategoryId }): JSX.Element | null => {
    const category = taxonomyCategory(id)
    if (!category) return null
    return (
      <section className="ep-category">
        <div className="ep-category__head">
          <span className="ep-category__dot" style={{ background: category.color }} />
          {t(category.nameKey)}
        </div>
        <div className="ep-types">
          {typesOfCategory(id).map((type) => (
            <TypeButton key={type.id} type={type} />
          ))}
        </div>
      </section>
    )
  }
  const FavoritesSection = (): JSX.Element | null =>
    favoriteTypes.length === 0 ? null : (
      <section className="ep-category">
        <div className="ep-category__head">
          <Star size={12} /> {t('entityPicker.favorites')}
        </div>
        <div className="ep-types">
          {favoriteTypes.map((type) => (
            <TypeButton key={`fav-${type.id}`} type={type} />
          ))}
        </div>
      </section>
    )
  const RecentSection = (): JSX.Element | null =>
    recentTypes.length === 0 ? null : (
      <section className="ep-category">
        <div className="ep-category__head">{t('entityPicker.recent')}</div>
        <div className="ep-types">
          {recentTypes.map((type) => (
            <TypeButton key={`rec-${type.id}`} type={type} />
          ))}
        </div>
      </section>
    )

  return (
    <Modal title={t('entityPicker.title')} onClose={onClose} width={720}>
      <div className="ep-topbar">
        <div className="ep-search">
          <Search size={15} />
          <input
            className="ep-search__input"
            value={query}
            autoFocus
            placeholder={t('entityPicker.search')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Entrée : choisit le premier type affiché (recherche au clavier).
              if (event.key !== 'Enter') return
              const first = listRef.current?.querySelector<HTMLButtonElement>('.ep-type:not(.ep-type--create)')
              if (first) {
                event.preventDefault()
                first.click()
              }
            }}
          />
        </div>
        <div className="ep-sort" role="group">
          <button
            className={`ep-sort__btn${entitySort === 'category' ? ' ep-sort__btn--active' : ''}`}
            onClick={() => setEntitySort('category')}
            title={t('entityPicker.sortCategory')}
            aria-pressed={entitySort === 'category'}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            className={`ep-sort__btn${entitySort === 'alpha' ? ' ep-sort__btn--active' : ''}`}
            onClick={() => setEntitySort('alpha')}
            title={t('entityPicker.sortAlpha')}
            aria-pressed={entitySort === 'alpha'}
          >
            <ArrowDownAZ size={15} />
          </button>
        </div>
      </div>

      <div className="ep-panes">
        <nav className="ep-rail" aria-label={t('entityPicker.categories')}>
          {railItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ep-rail__item${!searchGroups && activeView === item.id ? ' ep-rail__item--active' : ''}`}
              aria-current={!searchGroups && activeView === item.id ? 'true' : undefined}
              onClick={() => {
                setQuery('')
                setView(item.id)
              }}
            >
              {item.star ? (
                <Star size={10} className="ep-rail__star" />
              ) : (
                <span
                  className="ep-rail__dot"
                  style={{ background: item.color ?? 'var(--text-mute)' }}
                />
              )}
              <span className="ep-rail__label">{item.label}</span>
              <span className="ep-rail__count">{item.count}</span>
            </button>
          ))}
        </nav>

        <div className="ep-scroll" ref={listRef}>
          {searchGroups ? (
            searchGroups.length === 0 && !codeMatchesSearch && filteredCustom.length === 0 ? (
              <p className="cm-hint">{t('entityPicker.noResult')}</p>
            ) : (
              <>
                {searchGroups.map(({ category, types }) => (
                  <section key={category.id} className="ep-category">
                    <div className="ep-category__head">
                      <span className="ep-category__dot" style={{ background: category.color }} />
                      {t(category.nameKey)}
                    </div>
                    <div className="ep-types">
                      {types.map((type) => (
                        <TypeButton key={type.id} type={type} />
                      ))}
                    </div>
                  </section>
                ))}
                {codeMatchesSearch && <CodeSection />}
                <CustomSection />
              </>
            )
          ) : activeView === 'favorites' ? (
            <FavoritesSection />
          ) : activeView === 'recent' ? (
            <RecentSection />
          ) : activeView === 'custom' ? (
            <CustomSection />
          ) : activeView === 'code' ? (
            <CodeSection />
          ) : activeCategory ? (
            <CategorySection id={activeCategory.id} />
          ) : (
            <>
              <FavoritesSection />
              <RecentSection />
              {entitySort === 'alpha' ? (
                <section className="ep-category">
                  <div className="ep-types">
                    {alphaTypes.map((type) => (
                      <TypeButton key={type.id} type={type} />
                    ))}
                  </div>
                </section>
              ) : (
                TAXONOMY_CATEGORIES.map((category) => (
                  <CategorySection key={category.id} id={category.id} />
                ))
              )}
              <CodeSection />
              <CustomSection />
            </>
          )}
        </div>
      </div>

      <div className="ep-foot">
        <span className="ep-foot__hint">
          <kbd>{t('entityPicker.keyEnter')}</kbd> {t('entityPicker.hintEnter')}
        </span>
        <span className="ep-foot__hint">
          <kbd>{t('entityPicker.keyEsc')}</kbd> {t('entityPicker.hintEsc')}
        </span>
        {canEdit && (
          <button
            type="button"
            className="cm-btn cm-btn--ghost ep-foot__create"
            onClick={() => setCustomDialog({ editing: null })}
          >
            <Plus size={13} />
            {t('customType.new')}
          </button>
        )}
      </div>

      {/* §2 v1.8 : création/édition d'un type personnalisé. Créer un type crée
          aussitôt une entité de ce type (geste « je crée MON entité »). */}
      {customDialog && (
        <CustomTypeDialog
          editing={customDialog.editing}
          onSaved={(typeId) => {
            // À la CRÉATION seulement : on pose directement une entité du nouveau
            // type. À l'édition, on reste dans le sélecteur.
            if (!customDialog.editing) {
              onPick(typeId)
              onClose()
            }
          }}
          onClose={() => setCustomDialog(null)}
        />
      )}
    </Modal>
  )
}
