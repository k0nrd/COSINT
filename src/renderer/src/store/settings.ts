/**
 * Paramètres locaux (profil, thème, signalisation, historique de couleurs) —
 * persistés dans localStorage. Pas de compte : tout vit sur ce poste (§4/§7).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '@/types'
import type { CustomPlatformDef } from '@/lib/links'
import { LOCALES, type Locale } from '@/i18n'
import { ICE_SERVERS } from '@/sync/network'

/**
 * Serveurs de signalisation par défaut (v1.3, §1) — liste établie par TEST
 * EMPIRIQUE (voir DECISIONS.md et README) : les anciens serveurs de la doc
 * y-webrtc (`signaling.yjs.dev`, `y-webrtc-eu.fly.dev`, Heroku) sont MORTS
 * (DNS inexistant, timeout ou 404), ce qui rendait toute connexion impossible.
 * Les URLs ci-dessous ont répondu au protocole y-webrtc (ping → pong) le
 * 2026-07-05. y-webrtc les utilise EN PARALLÈLE : il suffit qu'une seule
 * réponde. Elles ne voient passer que des identifiants dérivés (non
 * réversibles) et des messages chiffrés AES-GCM.
 *
 * `y-webrtc.fly.dev` : seul serveur public répondant au ping y-webrtc (3/3
 * passes, ~500 ms). `y-webrtc-eu.fly.dev` : défaut du paquet y-webrtc,
 * actuellement muet (issue yjs/y-webrtc#73) — conservé en secours au cas où il
 * serait ravivé ; le diagnostic l'affiche honnêtement en échec. Pour un usage
 * professionnel, auto-hébergez le serveur du dossier `server/` (guide README).
 */
export const DEFAULT_SIGNALING_URLS = ['wss://y-webrtc.fly.dev', 'wss://y-webrtc-eu.fly.dev']

/** Nombre de couleurs personnalisées récentes conservées (§5). */
const COLOR_HISTORY_MAX = 10

export type Theme = 'dark' | 'light'

/**
 * Mode réseau (§réseau v1.7.1) :
 *  - `standard` : mise en relation via les serveurs publics par défaut
 *    (signalisation y-webrtc + STUN Google/Cloudflare/Twilio), remplaçables par
 *    des adresses personnalisées. Convient au grand public.
 *  - `local`    : AUCUN service public n'est jamais contacté. Seules les adresses
 *    internes saisies par l'utilisateur sont utilisées ; sans adresse valide, les
 *    tableaux partagés restent HORS LIGNE (jamais de repli silencieux vers les
 *    serveurs publics). La vérification de mise à jour (GitHub) est coupée.
 *    Conçu pour les déploiements en réseau fermé (organisation, gendarmerie…).
 */
export type NetworkMode = 'standard' | 'local'

/** Mode de tri du sélecteur d'entités (§6bis). */
export type EntitySort = 'category' | 'alpha'

/** Nombre de types récents conservés dans le sélecteur d'entités (§6bis). */
const RECENT_TYPES_MAX = 8

/**
 * Plateforme personnalisée (§2 v1.5) définie par l'utilisateur et mémorisée
 * localement pour réutilisation : nom, gabarit d'URL optionnel (motif `{id}`) et
 * icône lucide optionnelle. Alias du type pur `CustomPlatformDef` (lib/links).
 */
export type CustomPlatform = CustomPlatformDef

interface SettingsState {
  profile: UserProfile | null
  theme: Theme
  /** Langue de l'interface (§4 v1.8.6) : français, anglais ou polonais. */
  language: Locale
  /** Mode réseau (§réseau v1.7.1) : standard (serveurs publics) ou 100 % local. */
  networkMode: NetworkMode
  /** Un ou plusieurs serveurs (séparés par virgules/espaces). Vide = défauts. */
  customSignalingUrl: string
  /** Serveurs STUN/TURN personnalisés, un par ligne (§réseau v1.7.1). Vide = les
   * STUN publics par défaut en mode standard, AUCUN en mode 100 % local. */
  customIceServers: string
  /** Vérification de mise à jour au démarrage (GitHub Releases), en mode standard. */
  autoUpdateCheck: boolean
  /** §5 v1.8.6 : en mode 100 % local, autoriser malgré tout la vérification de mise à
   * jour (contacte GitHub Releases). Sans effet en mode standard. */
  localUpdateCheck: boolean
  /** Dernières couleurs personnalisées utilisées (§5), plus récentes en tête. */
  colorHistory: string[]
  /** §6bis : derniers types d'entité utilisés (plus récents en tête). */
  recentEntityTypes: string[]
  /** §6bis : types d'entité épinglés en favoris. */
  favoriteEntityTypes: string[]
  /** §6bis : tri du sélecteur d'entités (par catégorie par défaut). */
  entitySort: EntitySort
  /** §2 v1.5 : plateformes personnalisées mémorisées pour réutilisation. */
  customPlatforms: CustomPlatform[]
  setProfile: (profile: UserProfile) => void
  setTheme: (theme: Theme) => void
  setLanguage: (language: Locale) => void
  setNetworkMode: (mode: NetworkMode) => void
  setCustomSignalingUrl: (url: string) => void
  setCustomIceServers: (servers: string) => void
  setAutoUpdateCheck: (enabled: boolean) => void
  setLocalUpdateCheck: (enabled: boolean) => void
  pushColor: (hex: string) => void
  pushRecentEntityType: (id: string) => void
  toggleFavoriteEntityType: (id: string) => void
  setEntitySort: (sort: EntitySort) => void
  addCustomPlatform: (platform: CustomPlatform) => void
  removeCustomPlatform: (id: string) => void
}

/**
 * §4 v1.8.6 : langue par défaut au TOUT PREMIER lancement (aucun réglage persisté) —
 * déduite de la langue du système. On tombe sur le français si la langue n'est pas prise
 * en charge. Une fois choisie/enregistrée, la préférence prime (voir `migrate`).
 */
function detectLocale(): Locale {
  const nav =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language.slice(0, 2).toLowerCase()
      : 'fr'
  return nav === 'en' ? 'en' : nav === 'pl' ? 'pl' : 'fr'
}

/** Complète un profil (éventuellement issu de la v1) avec les champs v1.1. */
export function normalizeProfile(profile: Partial<UserProfile> | null): UserProfile | null {
  if (!profile || typeof profile.pseudo !== 'string') return null
  return {
    userId: profile.userId ?? crypto.randomUUID(),
    pseudo: profile.pseudo,
    colorHex: profile.colorHex ?? '#3b82f6',
    avatarType: profile.avatarType ?? 'initials',
    avatarValue: profile.avatarValue ?? '',
    role: profile.role ?? '',
    status: profile.status ?? 'available'
  }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      profile: null,
      theme: 'dark',
      language: detectLocale(),
      networkMode: 'standard',
      customSignalingUrl: '',
      customIceServers: '',
      autoUpdateCheck: true,
      localUpdateCheck: false,
      colorHistory: [],
      recentEntityTypes: [],
      favoriteEntityTypes: [],
      entitySort: 'category',
      customPlatforms: [],
      setProfile: (profile) => set({ profile: normalizeProfile(profile) }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setNetworkMode: (networkMode) => set({ networkMode }),
      setCustomSignalingUrl: (customSignalingUrl) => set({ customSignalingUrl }),
      setCustomIceServers: (customIceServers) => set({ customIceServers }),
      setAutoUpdateCheck: (autoUpdateCheck) => set({ autoUpdateCheck }),
      setLocalUpdateCheck: (localUpdateCheck) => set({ localUpdateCheck }),
      pushColor: (hex) =>
        set((state) => ({
          colorHistory: [hex, ...state.colorHistory.filter((c) => c !== hex)].slice(
            0,
            COLOR_HISTORY_MAX
          )
        })),
      pushRecentEntityType: (id) =>
        set((state) => ({
          recentEntityTypes: [id, ...state.recentEntityTypes.filter((t) => t !== id)].slice(
            0,
            RECENT_TYPES_MAX
          )
        })),
      toggleFavoriteEntityType: (id) =>
        set((state) => ({
          favoriteEntityTypes: state.favoriteEntityTypes.includes(id)
            ? state.favoriteEntityTypes.filter((t) => t !== id)
            : [...state.favoriteEntityTypes, id]
        })),
      setEntitySort: (entitySort) => set({ entitySort }),
      addCustomPlatform: (platform) =>
        set((state) => ({
          // Remplace une plateforme personnalisée de même id (édition), sinon ajoute.
          customPlatforms: [
            platform,
            ...state.customPlatforms.filter((p) => p.id !== platform.id)
          ]
        })),
      removeCustomPlatform: (id) =>
        set((state) => ({
          customPlatforms: state.customPlatforms.filter((p) => p.id !== id)
        }))
    }),
    {
      name: 'cosint:settings',
      version: 6,
      // Migration des profils v1 (sans avatar/rôle/statut) + prefs §6bis + §2 v1.5
      // + réglages réseau v1.7.1 (mode, ICE, mise à jour) + langue & mise à jour locale v1.8.6.
      migrate: (persisted) => {
        const state = persisted as Partial<SettingsState>
        return {
          ...state,
          profile: normalizeProfile(state.profile ?? null),
          language: LOCALES.includes(state.language as Locale) ? (state.language as Locale) : 'fr',
          networkMode: state.networkMode === 'local' ? 'local' : 'standard',
          customIceServers: typeof state.customIceServers === 'string' ? state.customIceServers : '',
          autoUpdateCheck: state.autoUpdateCheck !== false,
          localUpdateCheck: state.localUpdateCheck === true,
          colorHistory: Array.isArray(state.colorHistory) ? state.colorHistory : [],
          recentEntityTypes: Array.isArray(state.recentEntityTypes) ? state.recentEntityTypes : [],
          favoriteEntityTypes: Array.isArray(state.favoriteEntityTypes)
            ? state.favoriteEntityTypes
            : [],
          entitySort: state.entitySort === 'alpha' ? 'alpha' : 'category',
          customPlatforms: Array.isArray(state.customPlatforms) ? state.customPlatforms : []
        } as SettingsState
      }
    }
  )
)

/** Valide une URL de signalisation personnalisée (ws:// ou wss://). */
export function isValidSignalingUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:'
  } catch {
    return false
  }
}

/** Découpe la saisie « serveurs personnalisés » (virgules, espaces, retours). */
export function parseSignalingUrls(input: string): string[] {
  return input
    .split(/[\s,;]+/)
    .map((url) => url.trim())
    .filter((url) => url !== '')
}

/**
 * Liste effective des serveurs de signalisation : les serveurs personnalisés
 * VALIDES remplacent les défauts (choix OPSEC : permettre de ne contacter
 * aucun service public). Plusieurs URLs sont acceptées, utilisées en parallèle.
 *
 * ⚠ Sémantique du mode STANDARD uniquement — préférer `effectiveNetworkConfig`,
 * qui applique aussi la règle « jamais de repli public » du mode 100 % local.
 */
export function effectiveSignalingUrls(customSignalingUrl: string): string[] {
  const custom = parseSignalingUrls(customSignalingUrl).filter(isValidSignalingUrl)
  if (custom.length > 0) return custom
  return DEFAULT_SIGNALING_URLS
}

// ——— Serveurs STUN/TURN personnalisés (§réseau v1.7.1) ———

export interface IceParseResult {
  servers: RTCIceServer[]
  /** Lignes rejetées (telles que saisies), pour un message d'erreur précis. */
  invalid: string[]
}

/**
 * Analyse la saisie « serveurs STUN/TURN » (une entrée par ligne).
 * Formats acceptés :
 *  - `stun:hôte[:port]`
 *  - `turn:hôte[:port] utilisateur motdepasse` (séparateurs : espaces ou « | ») ;
 *    idem `turns:` (TLS). Les identifiants sont OBLIGATOIRES pour turn/turns :
 *    Chromium rejette un serveur TURN sans username/credential — mieux vaut une
 *    ligne refusée à la saisie qu'une erreur silencieuse à la connexion.
 * Les lignes vides sont ignorées ; toute autre forme est rapportée dans
 * `invalid` (rien n'est « deviné » : la configuration réseau doit être exacte).
 */
export function parseIceServers(input: string): IceParseResult {
  const servers: RTCIceServer[] = []
  const invalid: string[] = []
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') continue
    const parts = line.split(/[\s|]+/).filter((part) => part !== '')
    const url = parts[0]
    const colon = url.indexOf(':')
    const scheme = colon > 0 ? url.slice(0, colon).toLowerCase() : ''
    const host = colon > 0 ? url.slice(colon + 1) : ''
    const hostOk = host !== '' && !host.includes('/') && !host.includes('?')
    if (!hostOk || (scheme !== 'stun' && scheme !== 'turn' && scheme !== 'turns')) {
      invalid.push(line)
    } else if (scheme === 'stun') {
      if (parts.length === 1) servers.push({ urls: url })
      else invalid.push(line)
    } else if (parts.length === 3) {
      servers.push({ urls: url, username: parts[1], credential: parts[2] })
    } else {
      invalid.push(line)
    }
  }
  return { servers, invalid }
}

// ——— Configuration réseau effective (§réseau v1.7.1) ———

/**
 * Photographie EXACTE de ce que l'application contactera. C'est LA source de
 * vérité unique : App.tsx s'en sert pour ouvrir les connexions (signalisation,
 * ICE, politique de mise à jour) et le panneau Paramètres affiche le
 * récapitulatif depuis la MÊME fonction — l'interface ne peut donc pas mentir
 * sur le comportement réseau réel.
 */
export interface EffectiveNetworkConfig {
  mode: NetworkMode
  /** Serveurs de signalisation réellement utilisés (peut être vide en mode local). */
  signalingUrls: string[]
  /** Serveurs ICE (STUN/TURN) réellement utilisés (peut être vide en mode local). */
  iceServers: RTCIceServer[]
  /** true si la vérification de mise à jour (GitHub Releases) est autorisée. */
  updateCheck: boolean
  /** Mode local SANS signalisation valide : les tableaux partagés resteront hors
   * ligne — c'est voulu (échec franc, jamais de repli vers les serveurs publics). */
  localNoSignaling: boolean
  /** true si au moins un service public (par défaut, non saisi) sera contacté. */
  contactsPublicServices: boolean
}

export interface NetworkSettingsInput {
  networkMode: NetworkMode
  customSignalingUrl: string
  customIceServers: string
  autoUpdateCheck: boolean
  /** §5 v1.8.6 : autoriser la mise à jour GitHub MÊME en mode 100 % local (optionnel). */
  localUpdateCheck?: boolean
}

export function effectiveNetworkConfig(settings: NetworkSettingsInput): EffectiveNetworkConfig {
  const customSignaling = parseSignalingUrls(settings.customSignalingUrl).filter(isValidSignalingUrl)
  const customIce = parseIceServers(settings.customIceServers).servers
  if (settings.networkMode === 'local') {
    // GARANTIE du mode 100 % local : seules les adresses saisies sont utilisées pour la
    // mise en relation (jamais les défauts publics). §5 v1.8.6 : la vérification de mise à
    // jour reste COUPÉE par défaut, mais l'utilisateur peut l'activer explicitement
    // (case « garder les mises à jour ») — c'est alors le SEUL service public contacté,
    // et le récapitulatif le signale honnêtement.
    const localUpdate = settings.localUpdateCheck === true
    return {
      mode: 'local',
      signalingUrls: customSignaling,
      iceServers: customIce,
      updateCheck: localUpdate,
      localNoSignaling: customSignaling.length === 0,
      contactsPublicServices: localUpdate
    }
  }
  return {
    mode: 'standard',
    signalingUrls: customSignaling.length > 0 ? customSignaling : DEFAULT_SIGNALING_URLS,
    iceServers: customIce.length > 0 ? customIce : ICE_SERVERS,
    updateCheck: settings.autoUpdateCheck,
    localNoSignaling: false,
    contactsPublicServices:
      customSignaling.length === 0 || customIce.length === 0 || settings.autoUpdateCheck
  }
}
