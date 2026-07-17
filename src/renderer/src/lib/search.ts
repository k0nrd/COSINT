/**
 * Recherche plein texte (§3 v1.7) : normalisation et fabrication de correspondances
 * insensibles aux accents et (par défaut) à la casse, avec option « mot entier ».
 *
 * Le pliage (`fold`) est aussi réutilisé par l'import CSV (§1) pour rapprocher un
 * en-tête de colonne d'un mot-clé d'heuristique sans se soucier des accents/majuscules.
 */

/** Diacritiques Unicode combinants (à retirer après décomposition NFD). */
const DIACRITICS = /[̀-ͯ]/g

/**
 * Plie une chaîne pour comparaison : décomposition NFD, suppression des accents,
 * puis minuscules. « Élément » → « element ». Idempotent et sûr sur chaîne vide.
 */
export function fold(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '').toLowerCase()
}

/** Retire seulement les accents (garde la casse) — pour une recherche sensible à la
 *  casse mais toujours insensible aux accents (comportement par défaut du projet). */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS, '')
}

/** Échappe les métacaractères d'une expression régulière. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface SearchTextOptions {
  /** true = distinction majuscules/minuscules (off par défaut). */
  caseSensitive?: boolean
  /** true = ne correspond qu'à un mot entier (bornes de mot). */
  wholeWord?: boolean
}

/** Normalise une chaîne selon les options (accents toujours retirés). */
function normalize(value: string, caseSensitive: boolean): string {
  return caseSensitive ? stripAccents(value) : fold(value)
}

/**
 * Fabrique un prédicat de correspondance pour un terme de recherche. Retourne
 * `null` si le terme (une fois trimé) est vide — l'appelant considère alors qu'il
 * n'y a aucune recherche active. Le prédicat reçoit un texte brut (le pliage est
 * appliqué à l'intérieur), ce qui permet de le réutiliser sur plusieurs haystacks.
 */
export function makeMatcher(
  rawNeedle: string,
  options: SearchTextOptions = {}
): ((haystack: string) => boolean) | null {
  const caseSensitive = options.caseSensitive === true
  const needle = normalize(rawNeedle.trim(), caseSensitive)
  if (needle === '') return null
  if (options.wholeWord) {
    // Bornes de mot Unicode : le terme doit être délimité par un non-alphanumérique
    // (ou un bord de chaîne). Le drapeau `u` active les classes \p{L}/\p{N}.
    const boundary = `(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`
    let regex: RegExp
    try {
      regex = new RegExp(boundary, 'u')
    } catch {
      // Repli si les lookbehind/propriétés Unicode ne sont pas supportés.
      regex = new RegExp(`\\b${escapeRegExp(needle)}\\b`)
    }
    return (haystack: string) => regex.test(normalize(haystack, caseSensitive))
  }
  return (haystack: string) => normalize(haystack, caseSensitive).includes(needle)
}
