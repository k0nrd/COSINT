/**
 * Résolution UNIFIÉE d'un type d'entité (§2 v1.8) : taxonomie intégrée + types
 * personnalisés définis dans le tableau. Les composants d'affichage passent par
 * ces fonctions plutôt que par `taxonomy.ts` directement, pour qu'un type
 * personnalisé (préfixe `custom:`) soit résolu comme un type de premier rang
 * (libellé, icône, couleur, gabarit de champs).
 *
 * Sans dépendance React : la liste des types personnalisés est fournie par
 * l'appelant (via le contexte du tableau, alimenté par le document Yjs).
 */
import type { CustomEntityType, CustomTypeField } from '@/types'
import { taxonomyType, taxonomyCategory, typeColor, typeIcon } from '@/lib/taxonomy'
import { entityFieldTemplate } from '@/lib/entities'
import { entityTypeLabelKey } from '@/components/nodes/EntityNode'
import { t } from '@/i18n'

/** Couleur d'accent par défaut de la catégorie « Personnalisés » (§2 v1.8). */
export const CUSTOM_CATEGORY_COLOR = '#8b5cf6'

/** true si l'id désigne un type personnalisé (préfixe réservé). */
export function isCustomTypeId(id: string): boolean {
  return id.startsWith('custom:')
}

export type CustomTypeMap = ReadonlyMap<string, CustomEntityType>

/** Construit une table id → type personnalisé (pratique côté composants). */
export function customTypeMap(types: readonly CustomEntityType[]): Map<string, CustomEntityType> {
  return new Map(types.map((type) => [type.id, type]))
}

/**
 * Description résolue d'un type d'entité (intégré ou personnalisé), prête à
 * afficher. `custom` = le type personnalisé sous-jacent (ou undefined pour un type
 * de taxonomie ou un id personnalisé inconnu dans ce tableau).
 */
export interface ResolvedType {
  id: string
  label: string
  icon: string
  color: string
  /** Libellé de catégorie (« Personnalisés » pour un type custom). */
  categoryLabel: string
  isCustom: boolean
  custom?: CustomEntityType
}

export function resolveType(id: string, customTypes?: CustomTypeMap): ResolvedType {
  if (isCustomTypeId(id)) {
    const custom = customTypes?.get(id)
    if (custom) {
      return {
        id,
        label: custom.name,
        icon: custom.icon,
        color: custom.color,
        categoryLabel: t('category.custom'),
        isCustom: true,
        custom
      }
    }
    // Type personnalisé référencé mais inconnu ici (ex. copié-collé d'un autre
    // tableau, ou définition pas encore synchronisée) : repli neutre lisible.
    return {
      id,
      label: t('customType.unknown'),
      icon: 'Circle',
      color: CUSTOM_CATEGORY_COLOR,
      categoryLabel: t('category.custom'),
      isCustom: true
    }
  }
  const tax = taxonomyType(id)
  const category = tax ? taxonomyCategory(tax.category) : undefined
  return {
    id,
    label: t(entityTypeLabelKey(id)),
    icon: typeIcon(id),
    color: typeColor(id),
    categoryLabel: category ? t(category.nameKey) : '',
    isCustom: false
  }
}

/** Libellé d'un type (raccourci). */
export function resolveTypeLabel(id: string, customTypes?: CustomTypeMap): string {
  return resolveType(id, customTypes).label
}

/** Couleur d'un type (raccourci). */
export function resolveTypeColor(id: string, customTypes?: CustomTypeMap): string {
  return resolveType(id, customTypes).color
}

/** Nom d'icône d'un type (raccourci). */
export function resolveTypeIcon(id: string, customTypes?: CustomTypeMap): string {
  return resolveType(id, customTypes).icon
}

/**
 * Gabarit de champs (label + kind) d'un type, pour pré-remplir une nouvelle
 * entité : gabarit personnalisé si le type est custom, sinon gabarit de taxonomie.
 * Les libellés d'un type de taxonomie sont des clés i18n → traduits ici ; ceux d'un
 * type personnalisé sont déjà des libellés libres.
 */
export function resolveFieldTemplate(
  id: string,
  customTypes?: CustomTypeMap
): CustomTypeField[] {
  if (isCustomTypeId(id)) {
    const custom = customTypes?.get(id)
    return custom ? custom.fields.map((field) => ({ ...field })) : []
  }
  return entityFieldTemplate(id).map((template) => ({ label: t(template.labelKey), kind: template.kind }))
}
