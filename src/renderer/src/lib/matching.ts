/**
 * Détection d'information PARTAGÉE entre entités (§3 v1.8.1) — logique pure.
 *
 * Quand on saisit une information sur une fiche (un numéro, un e-mail, un
 * identifiant…), on cherche si la MÊME information figure déjà ailleurs sur le
 * tableau afin de proposer DISCRÈTEMENT de relier les éléments. Rapprochement sur
 * la valeur normalisée ; pour les valeurs numériques (téléphone, IBAN, hash…),
 * rapprochement supplémentaire sur les chiffres seuls (tolère espaces/séparateurs).
 *
 * Sans dépendance React : réutilisable et testable isolément.
 */
import type { BoardNodeData } from '@/types'

/** Normalise une valeur de champ : trim + minuscules + espaces compactés. */
export function normalizeFieldValue(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Chiffres seuls d'une valeur (pour rapprocher des numéros écrits différemment). */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

export interface ValueMatch {
  nodeId: string
  /** Libellé lisible de l'élément correspondant (titre, sinon 1re valeur). */
  label: string
  /** Libellé du champ où la valeur a été retrouvée. */
  fieldLabel: string
}

/** Longueur minimale (après normalisation) — évite le bruit des valeurs triviales. */
export const MIN_MATCH_LEN = 4

/** Nombre minimal de chiffres pour un rapprochement « numérique ». */
const MIN_DIGITS = 6

/** Libellé lisible d'un nœud (titre, sinon première valeur de champ renseignée). */
function nodeLabel(node: BoardNodeData): string {
  return node.title.trim() || node.fields.find((field) => field.value.trim() !== '')?.value || ''
}

/**
 * Cherche les AUTRES nœuds portant la même information `value` dans l'un de leurs
 * champs. Retourne au plus un match par nœud, dans l'ordre du tableau. Une valeur
 * trop courte (< MIN_MATCH_LEN) ne déclenche jamais de suggestion.
 */
export function findValueMatches(
  nodes: BoardNodeData[],
  value: string,
  excludeNodeId: string
): ValueMatch[] {
  const norm = normalizeFieldValue(value)
  if (norm.length < MIN_MATCH_LEN) return []
  const digits = digitsOnly(value)
  // « Numérique » = surtout des chiffres (téléphone, IBAN…), pas un mot avec un chiffre.
  const numeric = digits.length >= MIN_DIGITS && digits.length >= norm.replace(/\s/g, '').length / 2
  const matches: ValueMatch[] = []
  for (const node of nodes) {
    if (node.id === excludeNodeId) continue
    let hitField: string | null = null
    for (const field of node.fields) {
      if (field.value.trim() === '') continue
      const sameText = normalizeFieldValue(field.value) === norm
      const sameNumber = numeric && digitsOnly(field.value) === digits
      if (sameText || sameNumber) {
        hitField = field.label
        break
      }
    }
    if (hitField !== null) {
      matches.push({ nodeId: node.id, label: nodeLabel(node), fieldLabel: hitField })
    }
  }
  return matches
}
