/**
 * §1 v1.8.9 — retrouver son serveur de signalisation quand son adresse a changé.
 *
 * LE PROBLÈME RÉEL. Un serveur interne en DHCP change d'adresse, souvent toutes les
 * 24 h. Jusqu'ici, chaque matin, il fallait relever la nouvelle adresse, refaire un
 * profil `.cosint-org` et le réimporter sur chaque poste. Inexploitable.
 *
 * LE MÉCANISME. Le serveur publie sur `GET /cosint` une EMPREINTE dérivée de son
 * jeton (SHA-256 préfixé d'un domaine, tronquée). Le poste dérive la MÊME empreinte
 * depuis le jeton qu'il détient, puis :
 *   1. vérifie l'adresse enregistrée (une requête) — dans le cas courant, c'est fini ;
 *   2. si elle ne répond plus, balaie ses sous-réseaux privés (côté processus
 *      principal : la CSP interdit tout HTTP au renderer) ;
 *   3. n'accepte QUE le serveur dont l'empreinte correspond, et réécrit l'adresse.
 *
 * CE QUI GARANTIT QU'ON NE SE TROMPE PAS DE SERVEUR. L'empreinte prouve la
 * connaissance du jeton sans le révéler. Le jeton, lui, n'est transmis qu'APRÈS
 * cette vérification, à la connexion réelle. Un serveur pirate posé sur le même
 * réseau ne peut donc ni se faire passer pour le bon, ni se faire livrer le jeton.
 *
 * SANS JETON, l'empreinte est une constante : n'importe quel serveur COSINT ouvert
 * du réseau correspond. C'est assumé — un serveur sans jeton n'authentifie rien —
 * mais la découverte automatique reste alors une commodité, pas une garantie.
 */

/** Port par défaut quand l'URL n'en précise pas (ws:// → 80, wss:// → 443). */
function defaultPort(protocol: string): number {
  return protocol === 'wss:' ? 443 : 80
}

/** Hôte + port extraits d'une URL de signalisation, ou null si elle est inexploitable. */
export function parseSignalingTarget(url: string): { host: string; port: number } | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return null
    if (parsed.hostname === '') return null
    const port = parsed.port === '' ? defaultPort(parsed.protocol) : Number(parsed.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    // Les crochets d'une adresse IPv6 littérale ne servent qu'à l'URL.
    return { host: parsed.hostname.replace(/^\[|\]$/g, ''), port }
  } catch {
    return null
  }
}

/** Remplace l'hôte d'une URL de signalisation en conservant schéma, port et chemin. */
export function withHost(url: string, host: string): string {
  try {
    const parsed = new URL(url)
    parsed.hostname = host
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

/**
 * Empreinte d'identité du serveur, dérivée du jeton — MÊME calcul que
 * `server/signaling.js` (`sha256("cosint-discovery-v1:" + token)`, 32 caractères hex).
 * Non réversible : elle circule en clair sur le réseau local sans exposer le jeton.
 */
export async function discoveryId(token: string): Promise<string> {
  const data = new TextEncoder().encode(`cosint-discovery-v1:${token}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/** Issue d'une tentative de localisation du serveur. */
export type LocateOutcome =
  /** L'adresse enregistrée répond, et c'est bien le bon serveur. */
  | { status: 'reachable' }
  /** Le serveur a été retrouvé ailleurs : `url` est l'adresse à enregistrer. */
  | { status: 'moved'; url: string }
  /** Introuvable : hors du réseau, serveur éteint, ou version antérieure à la 1.8.9. */
  | { status: 'not-found' }
  /** Rien à faire (pas d'adresse configurée, ou pont preload absent). */
  | { status: 'skipped' }

/**
 * Vérifie l'adresse enregistrée puis, si besoin, retrouve le serveur sur le réseau.
 *
 * `urls` est la liste configurée : si l'UNE d'elles répond correctement, rien ne
 * bouge. Le balayage n'a lieu qu'en dernier recours, et il ne porte que sur le port
 * déjà configuré par l'utilisateur.
 */
export async function locateServer(urls: string[], token: string): Promise<LocateOutcome> {
  if (typeof window === 'undefined' || typeof window.cosint === 'undefined') {
    return { status: 'skipped' }
  }
  const targets = urls.map((url) => ({ url, target: parseSignalingTarget(url) }))
  const usable = targets.filter(
    (entry): entry is { url: string; target: { host: string; port: number } } => entry.target !== null
  )
  if (usable.length === 0) return { status: 'skipped' }

  const expectedId = await discoveryId(token)

  // 1. L'adresse connue répond-elle encore ? (cas courant, une seule requête)
  for (const { target } of usable) {
    if (await window.cosint.checkServer(target.host, target.port, expectedId)) {
      return { status: 'reachable' }
    }
  }

  // 2. Sinon, balayage du réseau local sur le port configuré.
  const found = await window.cosint.discoverServer(usable[0].target.port, expectedId)
  if (!found) return { status: 'not-found' }
  return { status: 'moved', url: withHost(usable[0].url, found.host) }
}
