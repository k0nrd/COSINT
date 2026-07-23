/**
 * §1 v1.8.7 — personnalisation « marque blanche » du mode 100 % local.
 *
 * Deux objets purs, tous deux VALIDÉS/ASSAINIS depuis une source non sûre (fichier
 * choisi par l'utilisateur, ou message d'un serveur configuré par l'organisation) :
 *
 *  - `OrgProfile`  : configuration importable/exportable (URL du serveur de
 *                    signalisation + jeton d'accès + nom d'organisation). C'est le
 *                    fichier `.cosint-org` que l'organisation distribue à ses postes ;
 *                    il n'est JAMAIS dans le dépôt (données propres à un déploiement).
 *  - `OrgBranding` : la marque affichée sur l'écran principal (logo, nom, sous-titre,
 *                    accent), SERVIE par le serveur de signalisation lui-même. Le logo
 *                    est une data-URI d'image (rendu via <img>, sûr et autorisé par la
 *                    CSP `img-src data:`). Tout est borné en taille et en type.
 *
 * Rien ici ne touche au réseau ni au stockage : ce sont des transformations pures,
 * pour pouvoir les tester et les réutiliser côté serveur comme client.
 */

/** Marque d'organisation affichée sur l'accueil (co-marquage « COSINT · Organisation »). */
export interface OrgBranding {
  /** Nom de l'organisation (obligatoire — sans lui, aucune marque n'est affichée). */
  name: string
  /** Sous-titre / accroche optionnel. */
  subtitle?: string
  /** Couleur d'accent optionnelle (#RRGGBB) appliquée à l'accueil uniquement. */
  accent?: string
  /** Logo optionnel, en data-URI d'image (png/jpeg/gif/webp/svg). */
  logo?: string
}

/** Profil d'organisation importable/exportable (fichier `.cosint-org`). */
export interface OrgProfile {
  /** URL du serveur de signalisation interne (ws:// ou wss://). */
  signalingUrl: string
  /** Jeton d'accès pré-partagé (optionnel). */
  token?: string
  /** Nom d'organisation indicatif (le nom affiché vient normalement du serveur). */
  organization?: string
}

const MAX_NAME = 60
const MAX_SUBTITLE = 140
const MAX_TOKEN = 512
const MAX_URL = 300
/** Logo : ~300 Kio d'image (la data-URI base64 pèse ~4/3 de l'image). */
const MAX_LOGO_CHARS = 420_000

const HEX_RE = /^#[0-9a-fA-F]{6}$/
/** Types d'image autorisés pour un logo en data-URI (rendu via <img>). */
const LOGO_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i

/** Chaîne non vide, taillée et bornée ; sinon `undefined`. */
function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > max) return undefined
  return trimmed
}

/** Valide une URL de signalisation interne (ws:// ou wss://) — mêmes règles que les Paramètres. */
export function isSignalingUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:'
  } catch {
    return false
  }
}

/**
 * Assainit une marque reçue du serveur : nom OBLIGATOIRE, sous-titre/accent/logo
 * optionnels et bornés. Toute valeur invalide est simplement écartée (jamais
 * d'erreur) ; un objet sans nom exploitable renvoie `null` (rien à afficher).
 */
export function sanitizeBranding(raw: unknown): OrgBranding | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = boundedString(r.name, MAX_NAME)
  if (!name) return null
  const branding: OrgBranding = { name }
  const subtitle = boundedString(r.subtitle, MAX_SUBTITLE)
  if (subtitle) branding.subtitle = subtitle
  if (typeof r.accent === 'string' && HEX_RE.test(r.accent.trim())) branding.accent = r.accent.trim()
  if (typeof r.logo === 'string') {
    const logo = r.logo.trim()
    if (LOGO_RE.test(logo) && logo.length <= MAX_LOGO_CHARS) branding.logo = logo
  }
  return branding
}

/** Marqueur de format du fichier `.cosint-org` (version 1). */
const ORG_PROFILE_TAG = 'cosintOrgProfile'

/**
 * Analyse un fichier `.cosint-org` (JSON). Renvoie `null` si le marqueur de format
 * est absent/faux ou si l'URL de signalisation n'est pas une ws(s):// valide.
 */
export function parseOrgProfile(json: string): OrgProfile | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d[ORG_PROFILE_TAG] !== 1) return null
  const signalingUrl = boundedString(d.signalingUrl, MAX_URL)
  if (!signalingUrl || !isSignalingUrl(signalingUrl)) return null
  const profile: OrgProfile = { signalingUrl }
  const token = boundedString(d.token, MAX_TOKEN)
  if (token) profile.token = token
  const organization = boundedString(d.organization, MAX_NAME)
  if (organization) profile.organization = organization
  return profile
}

/** Sérialise un profil d'organisation en JSON `.cosint-org` (indenté, lisible). */
export function serializeOrgProfile(profile: OrgProfile): string {
  const out: Record<string, unknown> = {
    [ORG_PROFILE_TAG]: 1,
    signalingUrl: profile.signalingUrl
  }
  if (profile.token) out.token = profile.token
  if (profile.organization) out.organization = profile.organization
  return `${JSON.stringify(out, null, 2)}\n`
}
