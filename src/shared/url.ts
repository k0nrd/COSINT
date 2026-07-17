/**
 * Normalisation et validation des URLs ouvrables en externe (v1.3, §4).
 * Module PARTAGÉ entre le processus principal (IPC `app:open-external`,
 * `setWindowOpenHandler`) et le renderer (validation des nœuds Lien) : la
 * même règle s'applique partout, et elle est testée unitairement.
 */

/** Longueur maximale d'une URL ouvrable en externe. */
export const MAX_URL_LENGTH = 2048

/**
 * Un « schéma explicite » est un préfixe `xxx:` NON suivi d'un chiffre : ainsi
 * `javascript:alert(1)` ou `mailto:x@y` sont reconnus comme schémas (et rejetés
 * s'ils ne sont pas http/https), tandis que `exemple.org:8080/x` est reconnu
 * comme hôte:port (le chiffre suit le deux-points) et reçoit le préfixe https.
 */
const EXPLICIT_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:(?![0-9])/

/**
 * Normalise une URL saisie par l'utilisateur pour ouverture dans le navigateur :
 *  - complète `https://` si aucun schéma n'est fourni (`google.com` fonctionne) ;
 *  - n'accepte QUE `http:` et `https:` — `file:`, `javascript:`, `data:`… sont
 *    refusés (retour `null`), jamais ouverts ;
 *  - exige un hôte plausible (un point, `localhost` ou une IP) pour les saisies
 *    sans schéma, afin qu'un mot isolé ne parte pas au navigateur.
 * Retourne l'URL normalisée (href) ou `null` si elle est invalide.
 */
export function normalizeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.length > MAX_URL_LENGTH) return null
  // Aucun caractère de contrôle (une URL collée depuis un PDF peut en contenir).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null

  const hasScheme = EXPLICIT_SCHEME_RE.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.hostname === '') return null
  // Saisie sans schéma : exiger un hôte plausible (point, localhost ou IPv4/IPv6)
  // pour ne pas ouvrir « unmot » comme https://unmot/.
  if (!hasScheme) {
    const host = parsed.hostname
    const plausible =
      host.includes('.') || host === 'localhost' || /^\[?[0-9a-fA-F:]+\]?$/.test(host)
    if (!plausible) return null
  }
  return parsed.href
}
