/**
 * Liens cliquables des champs d'entité (§3 v1.4).
 *
 * - Résolution d'URL réutilisant le mécanisme SÉCURISÉ du §4 v1.3
 *   (`normalizeExternalUrl` : préfixe https://, schémas http/https uniquement).
 * - Plateformes de réseaux sociaux : construction de l'URL de profil à partir
 *   d'un simple identifiant (`@pseudo`), et détection de la plateforme d'une URL
 *   déjà complète pour afficher son icône. Liste extensible.
 *
 * La valeur STOCKÉE d'un champ « social » reste une URL http(s) normale : le
 * champ est donc portable (export/import) et rendu comme n'importe quel lien.
 */
import { normalizeExternalUrl } from '@shared/url'

/** Catégorie d'une plateforme (§2 v1.5) : pilote le groupement dans le sélecteur. */
export type PlatformCategory = 'social' | 'account' | 'custom'

export interface Platform {
  id: string
  label: string
  /** Nom d'icône lucide (résolu par EntityIcon), repli si inconnu. */
  icon: string
  /** Catégorie (réseaux sociaux, comptes/fournisseurs, personnalisé). */
  category: PlatformCategory
  /**
   * Gabarit d'URL avec le motif `{id}` remplacé par l'identifiant nettoyé.
   * Vide = pas d'URL de profil publique (fournisseurs de compte, e-mail…) : la
   * valeur stockée reste alors l'identifiant brut.
   */
  template: string
  /** Hôtes reconnus (sans www.) pour détecter la plateforme d'une URL. */
  hosts: string[]
}

/** Fabrique d'une définition de plateforme (§2 : liste extensible en un point). */
function P(
  id: string,
  label: string,
  icon: string,
  category: PlatformCategory,
  template: string,
  hosts: string[] = []
): Platform {
  return { id, label, icon, category, template, hosts }
}

/**
 * Catalogue des plateformes (§2 v1.5). Liste UNIQUE et extensible : ajouter une
 * ligne ici suffit à la proposer dans le sélecteur (cherchable) et à construire
 * l'URL depuis un identifiant. Les ids historiques (twitter, instagram…) sont
 * conservés pour la compatibilité des données existantes.
 */
export const PLATFORMS: Platform[] = [
  // ——— Réseaux sociaux ———
  P('twitter', 'X / Twitter', 'Twitter', 'social', 'https://x.com/{id}', ['x.com', 'twitter.com']),
  P('instagram', 'Instagram', 'Instagram', 'social', 'https://instagram.com/{id}', ['instagram.com']),
  P('facebook', 'Facebook', 'Facebook', 'social', 'https://facebook.com/{id}', ['facebook.com', 'fb.com']),
  P('linkedin', 'LinkedIn', 'Linkedin', 'social', 'https://www.linkedin.com/in/{id}', ['linkedin.com']),
  P('tiktok', 'TikTok', 'Music2', 'social', 'https://www.tiktok.com/@{id}', ['tiktok.com']),
  P('snapchat', 'Snapchat', 'Ghost', 'social', 'https://www.snapchat.com/add/{id}', ['snapchat.com']),
  P('whatsapp', 'WhatsApp', 'Phone', 'social', 'https://wa.me/{id}', ['wa.me', 'whatsapp.com']),
  P('telegram', 'Telegram', 'Send', 'social', 'https://t.me/{id}', ['t.me', 'telegram.me']),
  P('signal', 'Signal', 'MessageSquare', 'social', '', ['signal.me']),
  P('youtube', 'YouTube', 'Youtube', 'social', 'https://www.youtube.com/@{id}', ['youtube.com', 'youtu.be']),
  P('reddit', 'Reddit', 'MessageCircle', 'social', 'https://www.reddit.com/user/{id}', ['reddit.com']),
  P('pinterest', 'Pinterest', 'Image', 'social', 'https://www.pinterest.com/{id}', ['pinterest.com', 'pinterest.fr']),
  P('threads', 'Threads', 'AtSign', 'social', 'https://www.threads.net/@{id}', ['threads.net']),
  P('mastodon', 'Mastodon', 'MessageSquare', 'social', '', ['mastodon.social', 'mastodon.online']),
  P('bluesky', 'Bluesky', 'Cloud', 'social', 'https://bsky.app/profile/{id}', ['bsky.app']),
  P('tumblr', 'Tumblr', 'Type', 'social', 'https://{id}.tumblr.com', ['tumblr.com']),
  P('vk', 'VK', 'MessageCircle', 'social', 'https://vk.com/{id}', ['vk.com']),
  P('discord', 'Discord', 'MessageCircle', 'social', 'https://discord.com/users/{id}', ['discord.com', 'discord.gg']),
  P('twitch', 'Twitch', 'Twitch', 'social', 'https://www.twitch.tv/{id}', ['twitch.tv']),
  P('github', 'GitHub', 'Github', 'social', 'https://github.com/{id}', ['github.com']),
  P('gitlab', 'GitLab', 'GitBranch', 'social', 'https://gitlab.com/{id}', ['gitlab.com']),

  // ——— Comptes / fournisseurs (hors réseaux sociaux) ———
  P('google', 'Google', 'Chrome', 'account', '', ['google.com']),
  P('microsoft', 'Microsoft', 'SquareStack', 'account', '', ['microsoft.com', 'live.com']),
  P('apple', 'Apple', 'Command', 'account', '', ['apple.com']),
  P('amazon', 'Amazon', 'ShoppingCart', 'account', '', ['amazon.com', 'amazon.fr']),
  P('free', 'Free', 'Wifi', 'account', '', ['free.fr']),
  P('orange', 'Orange', 'Wifi', 'account', '', ['orange.fr']),
  P('sfr', 'SFR', 'Wifi', 'account', '', ['sfr.fr']),
  P('bouygues', 'Bouygues', 'Wifi', 'account', '', ['bouyguestelecom.fr']),
  P('proton', 'Proton', 'ShieldCheck', 'account', '', ['proton.me', 'protonmail.com']),
  P('yahoo', 'Yahoo', 'Mail', 'account', '', ['yahoo.com', 'yahoo.fr']),
  P('outlook', 'Outlook / Hotmail', 'Mail', 'account', '', ['outlook.com', 'hotmail.com', 'hotmail.fr']),
  P('icloud', 'iCloud', 'Cloud', 'account', '', ['icloud.com']),
  P('dropbox', 'Dropbox', 'Box', 'account', '', ['dropbox.com']),
  P('paypal', 'PayPal', 'CreditCard', 'account', 'https://www.paypal.me/{id}', ['paypal.me', 'paypal.com']),
  P('steam', 'Steam', 'Gamepad2', 'account', 'https://steamcommunity.com/id/{id}', ['steamcommunity.com']),
  P('spotify', 'Spotify', 'Music', 'account', 'https://open.spotify.com/user/{id}', ['open.spotify.com', 'spotify.com']),
  P('netflix', 'Netflix', 'Clapperboard', 'account', '', ['netflix.com'])
]

export const DEFAULT_PLATFORM = PLATFORMS[0]

const PLATFORM_BY_ID = new Map(PLATFORMS.map((platform) => [platform.id, platform]))

/** Construit l'URL d'un profil depuis un identifiant, selon le gabarit `{id}`. */
export function buildFromTemplate(platform: Platform, handle: string): string {
  if (platform.template === '') return handle
  return platform.template.replace('{id}', handle)
}

/** Forme minimale d'une plateforme personnalisée (§2 v1.5), stockée dans les
 * paramètres locaux. Défini ici (module pur) pour éviter d'importer un composant. */
export interface CustomPlatformDef {
  id: string
  label: string
  template: string
  icon: string
}

/** Extrait l'hôte (sans www.) d'un gabarit d'URL, pour la détection. '' si aucun. */
function hostFromTemplate(template: string): string {
  if (template === '') return ''
  try {
    // Remplace {id} par un jeton neutre pour obtenir une URL parsable.
    const host = new URL(template.replace('{id}', 'x')).hostname.toLowerCase().replace(/^www\./, '')
    // Un gabarit de sous-domaine (`https://{id}.tumblr.com`) contient le jeton dans
    // l'hôte : on ne peut pas le détecter de façon fiable → on l'ignore.
    return host.includes('x.') && template.includes('{id}.') ? '' : host
  } catch {
    return ''
  }
}

/**
 * Convertit une plateforme personnalisée en Platform utilisable (§2 v1.5). L'hôte
 * est dérivé du gabarit pour que la plateforme soit DÉTECTABLE depuis une URL déjà
 * stockée (sinon elle retomberait sur la plateforme par défaut au rechargement).
 */
export function customToPlatform(custom: CustomPlatformDef): Platform {
  const host = hostFromTemplate(custom.template)
  return {
    id: custom.id,
    label: custom.label,
    icon: custom.icon || 'Globe',
    category: 'custom',
    template: custom.template,
    hosts: host ? [host] : []
  }
}

/**
 * Détecte la plateforme d'une URL parmi une liste DONNÉE (intégrées + personnalisées).
 * Variante de `platformForUrl` qui prend en compte les plateformes personnalisées.
 */
export function detectPlatform(url: string, platforms: Platform[]): Platform | undefined {
  const normalized = normalizeExternalUrl(url)
  if (!normalized) return undefined
  let host: string
  try {
    host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return undefined
  }
  return platforms.find((platform) => platform.hosts.includes(host))
}

export function platformById(id: string): Platform | undefined {
  return PLATFORM_BY_ID.get(id)
}

/** Nettoie un identifiant : retire un @ initial, espaces et une éventuelle URL. */
export function cleanHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '')
}

/** Détecte la plateforme d'une URL d'après son hôte (sans le préfixe www.). */
export function platformForUrl(url: string): Platform | undefined {
  const normalized = normalizeExternalUrl(url)
  if (!normalized) return undefined
  let host: string
  try {
    host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return undefined
  }
  return PLATFORMS.find((platform) => platform.hosts.includes(host))
}

/** Extrait l'identifiant d'une URL de profil (dernier segment non vide). */
export function handleFromUrl(url: string): string {
  const normalized = normalizeExternalUrl(url)
  if (!normalized) return ''
  try {
    const path = new URL(normalized).pathname.replace(/\/+$/, '')
    const segment = path.split('/').filter(Boolean).pop() ?? ''
    return cleanHandle(segment)
  } catch {
    return ''
  }
}

/**
 * Construit l'URL (ou l'identifiant) d'un champ « social » à partir d'une saisie.
 * Un `@pseudo` devient l'URL de la plateforme choisie (gabarit `{id}`) ; une URL
 * complète est normalisée telle quelle ; une plateforme SANS URL de profil
 * (fournisseur, e-mail…) conserve l'identifiant brut. Retourne '' pour une saisie
 * vide. `resolve` permet de fournir les plateformes personnalisées (§2 v1.5).
 */
export function buildSocialUrl(
  platformId: string,
  input: string,
  resolve: (id: string) => Platform | undefined = platformById
): string {
  const trimmed = input.trim()
  if (trimmed === '') return ''
  const platform = resolve(platformId) ?? DEFAULT_PLATFORM
  // Distinguer une URL déjà complète d'un simple identifiant : est une URL si elle
  // a un schéma explicite, un chemin (« / »), OU un hôte de plateforme connu.
  // Un `@pseudo` ou un identifiant à points (« john.doe ») n'est PAS une URL et
  // est construit selon la plateforme choisie.
  const asUrl = normalizeExternalUrl(trimmed)
  const isUrl =
    asUrl !== null &&
    (/^https?:\/\//i.test(trimmed) || trimmed.includes('/') || platformForUrl(trimmed) !== undefined)
  // Une plateforme à gabarit vide n'a pas d'URL : on garde l'identifiant tel quel,
  // SAUF si l'utilisateur a explicitement collé une URL complète (schéma http).
  if (platform.template === '' && !/^https?:\/\//i.test(trimmed)) return trimmed
  if (isUrl && asUrl) return asUrl
  return buildFromTemplate(platform, cleanHandle(trimmed))
}

/**
 * Résout un lien cliquable pour une valeur de champ (§3) : une URL valide (avec
 * ou sans schéma) devient un href ouvrable ; sinon `null`. `looksLikeUrl` gère
 * le cas « champ personnalisé dont la valeur ressemble à une URL ».
 */
export function resolveFieldLink(value: string): { url: string; platform?: Platform } | null {
  const url = normalizeExternalUrl(value)
  if (!url) return null
  return { url, platform: platformForUrl(url) }
}

/** Un texte a-t-il l'allure d'une URL (schéma explicite ou hôte avec TLD alpha) ? */
export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '' || /\s/.test(trimmed)) return false
  if (/^https?:\/\//i.test(trimmed)) return normalizeExternalUrl(trimmed) !== null
  // Hôte plausible : le DERNIER segment (TLD) doit être alphabétique — sinon un
  // numéro de téléphone à points (« 06.12.34.56.78 ») passerait pour une URL.
  return (
    /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(trimmed) &&
    normalizeExternalUrl(trimmed) !== null
  )
}
