/**
 * Paramètres locaux (profil, thème, signalisation, historique de couleurs) —
 * persistés dans localStorage. Pas de compte : tout vit sur ce poste (§4/§7).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '@/types'
import type { CustomPlatformDef } from '@/lib/links'
import { sanitizeLinkPresets, upsertLinkPreset, type LinkPresetDef } from '@/lib/linkPresets'
import type { OrgBranding } from '@/lib/orgProfile'
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

/** §3 v1.9 : position de la barre d'outils du tableau (préférence LOCALE, par poste). */
export type ToolbarPosition = 'left' | 'right' | 'top' | 'bottom'

/**
 * Mode réseau (§réseau v1.7.1) :
 *  - `standard` : mise en relation via les serveurs publics par défaut
 *    (signalisation y-webrtc + STUN Google/Cloudflare/Twilio), remplaçables par
 *    des adresses personnalisées. Convient au grand public.
 *  - `local`    : AUCUN service public n'est jamais contacté. Seules les adresses
 *    internes saisies par l'utilisateur sont utilisées ; sans adresse valide, les
 *    tableaux partagés restent HORS LIGNE (jamais de repli silencieux vers les
 *    serveurs publics). La vérification de mise à jour (GitHub) est coupée.
 *    Conçu pour les déploiements en réseau fermé (organisation, administration…).
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
  /** §3 v1.9 : position de la barre d'outils du tableau (par poste, non partagée). */
  toolbarPosition: ToolbarPosition
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
   * jour (contacte GitHub Releases). Sans effet en mode standard.
   * §3 v1.8.8 : ACTIVÉ PAR DÉFAUT — basculer en 100 % local ne doit plus priver
   * silencieusement le poste des correctifs. Le récapitulatif signale honnêtement ce
   * seul contact public, et un refus EXPLICITE de l'utilisateur reste respecté. */
  localUpdateCheck: boolean
  /** §1 v1.8.7 : jeton d'accès pré-partagé du serveur de signalisation interne (mode
   * 100 % local). Vide = serveur ouvert. Ajouté aux connexions (`?token=`). */
  signalingToken: string
  /** §1 v1.8.9 : retrouver seul le serveur interne quand son adresse a changé (DHCP).
   * Actif par défaut : c'est le comportement attendu d'un parc en réseau fermé, et il
   * ne s'applique QU'EN mode 100 % local, sur le seul port déjà configuré. */
  autoDiscoverServer: boolean
  /** §1 v1.8.7 : dernière MARQUE d'organisation servie par le serveur (cache local, pour
   * un affichage immédiat au lancement même si le serveur est momentanément injoignable). */
  orgBranding: OrgBranding | null
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
  /** §7 v1.9 : préréglages de lien nommés (relation, libellé, couleur, épaisseur, style,
   * extrémités, tracé, statut, côtés), mémorisés localement, dans l'ordre choisi. */
  linkPresets: LinkPresetDef[]
  setProfile: (profile: UserProfile) => void
  setTheme: (theme: Theme) => void
  setToolbarPosition: (position: ToolbarPosition) => void
  setLanguage: (language: Locale) => void
  setNetworkMode: (mode: NetworkMode) => void
  setCustomSignalingUrl: (url: string) => void
  setCustomIceServers: (servers: string) => void
  setAutoUpdateCheck: (enabled: boolean) => void
  setLocalUpdateCheck: (enabled: boolean) => void
  setSignalingToken: (token: string) => void
  setAutoDiscoverServer: (enabled: boolean) => void
  setOrgBranding: (branding: OrgBranding | null) => void
  pushColor: (hex: string) => void
  pushRecentEntityType: (id: string) => void
  toggleFavoriteEntityType: (id: string) => void
  setEntitySort: (sort: EntitySort) => void
  addCustomPlatform: (platform: CustomPlatform) => void
  removeCustomPlatform: (id: string) => void
  addLinkPreset: (preset: LinkPresetDef) => void
  removeLinkPreset: (id: string) => void
  /** §7 v1.9 : remplace toute la liste (réordonner, dupliquer…) — re-nettoyée. */
  setLinkPresets: (presets: LinkPresetDef[]) => void
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
      toolbarPosition: 'left',
      language: detectLocale(),
      networkMode: 'standard',
      customSignalingUrl: '',
      customIceServers: '',
      autoUpdateCheck: true,
      localUpdateCheck: true,
      signalingToken: '',
      autoDiscoverServer: true,
      orgBranding: null,
      colorHistory: [],
      recentEntityTypes: [],
      favoriteEntityTypes: [],
      entitySort: 'category',
      customPlatforms: [],
      linkPresets: [],
      setProfile: (profile) => set({ profile: normalizeProfile(profile) }),
      setTheme: (theme) => set({ theme }),
      setToolbarPosition: (toolbarPosition) => set({ toolbarPosition }),
      setLanguage: (language) => set({ language }),
      setNetworkMode: (networkMode) => set({ networkMode }),
      setCustomSignalingUrl: (customSignalingUrl) => set({ customSignalingUrl }),
      setCustomIceServers: (customIceServers) => set({ customIceServers }),
      setAutoUpdateCheck: (autoUpdateCheck) => set({ autoUpdateCheck }),
      setLocalUpdateCheck: (localUpdateCheck) => set({ localUpdateCheck }),
      setSignalingToken: (signalingToken) => set({ signalingToken }),
      setAutoDiscoverServer: (autoDiscoverServer) => set({ autoDiscoverServer }),
      setOrgBranding: (orgBranding) => set({ orgBranding }),
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
        })),
      addLinkPreset: (preset) =>
        set((state) => ({
          // §7 v1.9 : remplace EN PLACE un préréglage de même id (édition — l'ordre
          // choisi par l'utilisateur est conservé), sinon ajoute en fin de liste.
          linkPresets: sanitizeLinkPresets(upsertLinkPreset(state.linkPresets, preset))
        })),
      removeLinkPreset: (id) =>
        set((state) => ({
          linkPresets: state.linkPresets.filter((p) => p.id !== id)
        })),
      setLinkPresets: (presets) => set({ linkPresets: sanitizeLinkPresets(presets) })
    }),
    {
      name: 'cosint:settings',
      version: 9,
      // Migration des profils v1 (sans avatar/rôle/statut) + prefs §6bis + §2 v1.5
      // + réglages réseau v1.7.1 (mode, ICE, mise à jour) + langue & mise à jour locale v1.8.6
      // + jeton d'accès & marque d'organisation v1.8.7 + découverte du serveur v1.8.9.
      migrate: (persisted) => {
        const state = persisted as Partial<SettingsState>
        return {
          ...state,
          profile: normalizeProfile(state.profile ?? null),
          language: LOCALES.includes(state.language as Locale) ? (state.language as Locale) : 'fr',
          networkMode: state.networkMode === 'local' ? 'local' : 'standard',
          customIceServers: typeof state.customIceServers === 'string' ? state.customIceServers : '',
          autoUpdateCheck: state.autoUpdateCheck !== false,
          // §3 v1.8.8 : défaut passé à VRAI. `!== false` conserve le refus EXPLICITE
          // d'un utilisateur qui avait décoché la case ; tous les autres (dont les
          // installations antérieures qui n'ont jamais touché au réglage) gardent
          // les mises à jour actives en 100 % local.
          localUpdateCheck: state.localUpdateCheck !== false,
          signalingToken: typeof state.signalingToken === 'string' ? state.signalingToken : '',
          // §1 v1.8.9 : actif par défaut, y compris pour les installations antérieures
          // (elles n'avaient pas le réglage) ; un refus explicite reste respecté.
          autoDiscoverServer: state.autoDiscoverServer !== false,
          orgBranding:
            state.orgBranding && typeof state.orgBranding === 'object' ? state.orgBranding : null,
          colorHistory: Array.isArray(state.colorHistory) ? state.colorHistory : [],
          recentEntityTypes: Array.isArray(state.recentEntityTypes) ? state.recentEntityTypes : [],
          favoriteEntityTypes: Array.isArray(state.favoriteEntityTypes)
            ? state.favoriteEntityTypes
            : [],
          entitySort: state.entitySort === 'alpha' ? 'alpha' : 'category',
          customPlatforms: Array.isArray(state.customPlatforms) ? state.customPlatforms : [],
          // §3 v1.9 : position de la barre d'outils (défaut « left » ; valeur héritée
          // absente/invalide → gauche). §7 v1.9 : préréglages de lien.
          toolbarPosition:
            state.toolbarPosition === 'right' ||
            state.toolbarPosition === 'top' ||
            state.toolbarPosition === 'bottom'
              ? state.toolbarPosition
              : 'left',
          linkPresets: sanitizeLinkPresets(state.linkPresets)
        } as SettingsState
      },
      // §7 v1.9 : les préréglages de lien sont RE-NETTOYÉS à CHAQUE chargement, pas
      // seulement lors d'une migration : la première 1.9.0 les stockait sous le MÊME
      // numéro de version (format couleur/épaisseur/style à migrer), et un réglage local
      // malformé ne doit jamais atteindre l'interface. Le reste = fusion par défaut.
      merge: (persisted, current) => {
        const state =
          typeof persisted === 'object' && persisted !== null
            ? (persisted as Partial<SettingsState>)
            : {}
        return { ...current, ...state, linkPresets: sanitizeLinkPresets(state.linkPresets) }
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
  /** §1 v1.8.7 : jeton d'accès à ajouter aux connexions (mode local uniquement ;
   * jamais transmis aux serveurs PUBLICS par défaut). Vide = aucun. */
  signalingToken: string
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
  /** §1 v1.8.7 : jeton d'accès au serveur de signalisation interne (mode local). */
  signalingToken?: string
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
      // §1 v1.8.7 : le jeton n'a de sens qu'en mode local (serveur interne).
      signalingToken: (settings.signalingToken ?? '').trim(),
      localNoSignaling: customSignaling.length === 0,
      contactsPublicServices: localUpdate
    }
  }
  return {
    mode: 'standard',
    signalingUrls: customSignaling.length > 0 ? customSignaling : DEFAULT_SIGNALING_URLS,
    iceServers: customIce.length > 0 ? customIce : ICE_SERVERS,
    updateCheck: settings.autoUpdateCheck,
    // Jamais de jeton vers les serveurs PUBLICS par défaut (mode standard).
    signalingToken: '',
    localNoSignaling: false,
    contactsPublicServices:
      customSignaling.length === 0 || customIce.length === 0 || settings.autoUpdateCheck
  }
}
