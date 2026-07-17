/**
 * Sélecteur d'entité (§2, enrichi §6bis v1.4) : recherche, tri par catégorie
 * (défaut) ou alphabétique, section « Récents » (derniers types utilisés) et
 * « Favoris » épinglables (étoile). Les préférences sont stockées localement par
 * utilisateur.
 */
import { useMemo, useState } from 'react'
import { ArrowDownAZ, LayoutGrid, Pencil, Plus, Search, Star } from 'lucide-react'
import { Modal } from '@/components/common/Modal'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { entityTypeLabelKey } from '@/components/nodes/EntityNode'
import {
  TAXONOMY_CATEGORIES,
  taxonomyCategory,
  taxonomyType,
  typesOfCategory,
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
const CODE_CATEGORY_COLOR = '#22d3ee'

/** Minuscule + suppression des diacritiques, pour une recherche tolérante. */
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

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
            style={{ borderColor: withAlpha(CODE_CATEGORY_COLOR, 0.35) }}
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
                style={{ borderColor: withAlpha(type.color, 0.35) }}
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
    const color = category?.color ?? '#3b82f6'
    const isFavorite = favorites.includes(type.id)
    return (
      <div className="ep-type-wrap">
        <button
          className="ep-type"
          style={{ borderColor: withAlpha(color, 0.35) }}
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

  return (
    <Modal title={t('entityPicker.title')} onClose={onClose} width={640}>
      <div className="ep-topbar">
        <div className="ep-search">
          <Search size={15} />
          <input
            className="ep-search__input"
            value={query}
            autoFocus
            placeholder={t('entityPicker.search')}
            onChange={(event) => setQuery(event.target.value)}
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

      <div className="ep-scroll">
        {searchGroups ? (
          searchGroups.length === 0 && !codeMatchesSearch && filteredCustom.length === 0 ? (
            <p className="cm-hint">{t('entityPicker.noResult')}</p>
          ) : (
            <>
              <CustomSection />
              {codeMatchesSearch && <CodeSection />}
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
            </>
          )
        ) : (
          <>
            <CustomSection />
            <CodeSection />
            {favoriteTypes.length > 0 && (
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
            )}
            {recentTypes.length > 0 && (
              <section className="ep-category">
                <div className="ep-category__head">{t('entityPicker.recent')}</div>
                <div className="ep-types">
                  {recentTypes.map((type) => (
                    <TypeButton key={`rec-${type.id}`} type={type} />
                  ))}
                </div>
              </section>
            )}
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
                <section key={category.id} className="ep-category">
                  <div className="ep-category__head">
                    <span className="ep-category__dot" style={{ background: category.color }} />
                    {t(category.nameKey)}
                  </div>
                  <div className="ep-types">
                    {typesOfCategory(category.id).map((type) => (
                      <TypeButton key={type.id} type={type} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
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
