/**
 * Types de relation prédéfinis proposés à la création d'un lien (§2).
 * `id` est la valeur stockée dans `edge.relationType` ; le libellé passe par i18n.
 * Une relation vide (`''`) = lien sans type ; « custom » = libellé libre saisi.
 */
import type { MessageKey } from '@/i18n'

export interface RelationType {
  id: string
  labelKey: MessageKey
}

export const RELATION_TYPES: RelationType[] = [
  { id: 'associated', labelKey: 'relation.associated' },
  { id: 'owns', labelKey: 'relation.owns' },
  { id: 'worksFor', labelKey: 'relation.worksFor' },
  { id: 'memberOf', labelKey: 'relation.memberOf' },
  { id: 'communicatesWith', labelKey: 'relation.communicatesWith' },
  { id: 'locatedAt', labelKey: 'relation.locatedAt' },
  { id: 'source', labelKey: 'relation.source' }
]

const LABEL_KEY_BY_ID = new Map(RELATION_TYPES.map((relation) => [relation.id, relation.labelKey]))

/**
 * Clé i18n du libellé d'un type de relation prédéfini, ou `null` si l'id ne
 * correspond à aucun type connu (relation personnalisée : afficher `relationType`
 * tel quel, qui contient alors le texte libre).
 */
export function relationLabelKey(id: string): MessageKey | null {
  return LABEL_KEY_BY_ID.get(id) ?? null
}
