/**
 * Couche réseau P2P (v1.3, §1) : configuration ICE (STUN), machine d'états de
 * connexion et diagnostic temps réel.
 *
 * Pourquoi ce module : les échecs de signalisation étaient silencieux (serveurs
 * publics morts → aucun pair découvert → l'app affichait « Hors ligne » sans
 * explication). Ici, chaque étape (signalisation, découverte, WebRTC) est
 * observée séparément et remontée à l'UI en français.
 */
import type { WebrtcProvider } from 'y-webrtc'
import type { Awareness } from 'y-protocols/awareness'

/**
 * Serveurs STUN publics fiables (Google + Cloudflare), configurés explicitement
 * plutôt que de dépendre des valeurs par défaut de simple-peer. Le STUN ne voit
 * passer aucune donnée : il sert uniquement à découvrir l'adresse publique du
 * poste pour établir la connexion directe.
 *
 * §réseau v1.7.1 : cette liste n'est plus figée — c'est la valeur PAR DÉFAUT du
 * mode « standard ». Le mode « 100 % local » (Paramètres → Réseau &
 * confidentialité) la remplace par les serveurs internes saisis, ou par RIEN
 * (sur un même réseau, les adresses locales suffisent à la connexion directe).
 * La liste effective est calculée par `effectiveNetworkConfig` (store/settings).
 *
 * Limite documentée (README) : sans serveur TURN, un réseau très restrictif
 * (NAT symétrique, pare-feu d'entreprise) peut empêcher le P2P. Ce cas est
 * détecté et affiché (pairs découverts mais connexion WebRTC impossible).
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' }
]

/** Options passées à simple-peer par y-webrtc (`peerOpts`) pour une liste ICE
 * donnée (§réseau v1.7.1 : la liste dépend du mode réseau des Paramètres). */
export function buildPeerOpts(iceServers: RTCIceServer[]): {
  config: { iceServers: RTCIceServer[] }
} {
  return { config: { iceServers } }
}

// ——— Machine d'états de connexion (§1.5) ———

/**
 * États affichés à l'utilisateur :
 *  - `connecting`   : « Connexion au réseau… » (signalisation en cours) ;
 *  - `waiting`      : « En ligne — en attente de participants » ;
 *  - `connected`    : « Connecté — N participant(s) » (pair(s) joignable(s)) ;
 *  - `unreachable`  : « Réseau inaccessible — mode local » (signalisation morte) ;
 *  - `local`        : ouverture volontairement hors connexion (pas de provider).
 */
export type ConnectionStatus = 'connecting' | 'waiting' | 'connected' | 'unreachable' | 'local'

/** Délai avant de déclarer la signalisation injoignable (§1.6 : ~10 s). */
export const SIGNALING_GRACE_MS = 10_000

/** Au-delà de ce délai, une négociation WebRTC qui n'aboutit pas est « échouée ». */
const NEGOTIATION_STUCK_MS = 20_000

/** État d'un serveur de signalisation, pour le panneau de diagnostic. */
export interface SignalingServerStatus {
  url: string
  state: 'connecting' | 'connected' | 'failed'
  /** Nombre de tentatives de reconnexion infructueuses consécutives. */
  retries: number
}

/** État d'une connexion vers un pair découvert. */
export interface PeerStatus {
  /** Identifiant de pair y-webrtc (aléatoire par session, non identifiant). */
  peerId: string
  state: 'negotiating' | 'connected' | 'failed'
  /** `webrtc` = autre poste ; `local` = autre fenêtre du même poste. */
  transport: 'webrtc' | 'local'
}

/** Photographie complète de l'état réseau, pour l'indicateur et le diagnostic. */
export interface ConnectionDiagnostics {
  status: ConnectionStatus
  /** Pairs réellement joignables (WebRTC connecté + fenêtres locales). */
  peerCount: number
  /** Participants (soi inclus) vus par l'awareness. */
  participantCount: number
  signaling: SignalingServerStatus[]
  peers: PeerStatus[]
  /** Dernière erreur détaillée (WebRTC ou signalisation), ou null. */
  lastError: string | null
  /** true si des pairs sont découverts mais qu'aucune connexion WebRTC n'aboutit
   * (symptôme typique d'un réseau restrictif nécessitant un relais TURN). */
  webrtcBlocked: boolean
}

/** Accès typé aux internes de y-webrtc utilisés par le diagnostic.
 * (Champs vérifiés dans y-webrtc 10.3.0 / lib0 : `signalingConns[].connected`,
 * `room.webrtcConns`, `room.bcConns`, événements `peers` et `connect`/`disconnect`.) */
interface SignalingConnInternal {
  url: string
  connected: boolean
  connecting: boolean
  unsuccessfulReconnects: number
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
}

interface WebrtcConnInternal {
  connected: boolean
  closed: boolean
  peer: { on: (event: string, handler: (...args: unknown[]) => void) => void }
}

interface ProviderInternal {
  signalingConns: SignalingConnInternal[]
  room: {
    webrtcConns: Map<string, WebrtcConnInternal>
    bcConns: Set<string>
  } | null
  /** Horodatage du dernier « Retester » (posé par retestProvider, §1.4) : sert à
   * réarmer la fenêtre de grâce sans accès direct à l'ObserverContext. */
  __cosintRetestAt?: number
}

/** Contexte mutable de l'observation (instrumentation posée une seule fois). */
export interface ObserverContext {
  /** Début de la fenêtre de grâce courante (ouverture ou dernier retest). */
  startedAt: number
  /** Début de négociation par pair (détection des négociations bloquées). */
  negotiationStart: Map<string, number>
  instrumentedPeers: WeakSet<object>
  instrumentedSignaling: WeakSet<object>
  lastError: string | null
}

/** Contexte vierge (exporté pour les tests de `computeDiagnostics`). */
export function createObserverContext(startedAt: number): ObserverContext {
  return {
    startedAt,
    negotiationStart: new Map(),
    instrumentedPeers: new WeakSet(),
    instrumentedSignaling: new WeakSet(),
    lastError: null
  }
}

function signalingState(conn: SignalingConnInternal): SignalingServerStatus['state'] {
  if (conn.connected) return 'connected'
  // lib0 retente indéfiniment (backoff) : « failed » = au moins un échec constaté.
  if (conn.unsuccessfulReconnects > 0) return 'failed'
  return 'connecting'
}

/** Calcule la photographie réseau courante. Pure hormis le contexte fourni. */
export function computeDiagnostics(
  provider: WebrtcProvider,
  awareness: Awareness,
  context: ObserverContext,
  now: number
): ConnectionDiagnostics {
  const internal = provider as unknown as ProviderInternal
  // Dédoublonnage par URL : y-webrtc n'efface pas `signalingConns` avant de le
  // repeupler dans connect(), donc après un « Retester » (disconnect+connect) le
  // tableau contient des doublons dont la PREMIÈRE occurrence est la connexion
  // DÉTRUITE (figée hors-ligne). On garde donc la DERNIÈRE occurrence par URL —
  // la connexion vivante qui se reconnecte — sinon le diagnostic afficherait à
  // jamais l'état mort et le statut resterait « injoignable » après un retest.
  const latestByUrl = new Map<string, SignalingConnInternal>()
  for (const conn of internal.signalingConns) latestByUrl.set(conn.url, conn)
  const signaling: SignalingServerStatus[] = []
  for (const conn of latestByUrl.values()) {
    signaling.push({
      url: conn.url,
      state: signalingState(conn),
      retries: conn.unsuccessfulReconnects
    })
  }

  const peers: PeerStatus[] = []
  let webrtcConnected = 0
  let negotiatingStuck = 0
  const seenPeerIds = new Set<string>()
  const room = internal.room
  if (room) {
    room.webrtcConns.forEach((conn, peerId) => {
      seenPeerIds.add(peerId)
      let state: PeerStatus['state']
      if (conn.connected) {
        state = 'connected'
        webrtcConnected++
        context.negotiationStart.delete(peerId)
      } else {
        const since = context.negotiationStart.get(peerId) ?? now
        if (!context.negotiationStart.has(peerId)) context.negotiationStart.set(peerId, now)
        if (conn.closed || now - since > NEGOTIATION_STUCK_MS) {
          state = 'failed'
          negotiatingStuck++
        } else {
          state = 'negotiating'
        }
      }
      peers.push({ peerId, state, transport: 'webrtc' })
    })
    room.bcConns.forEach((peerId) => {
      seenPeerIds.add(peerId)
      peers.push({ peerId, state: 'connected', transport: 'local' })
    })
  }
  // Purge les entrées de négociation des pairs disparus.
  for (const peerId of context.negotiationStart.keys()) {
    if (!seenPeerIds.has(peerId)) context.negotiationStart.delete(peerId)
  }

  const bcPeers = room ? room.bcConns.size : 0
  const peerCount = webrtcConnected + bcPeers
  const participantCount = awareness.getStates().size
  const signalingUp = signaling.some((server) => server.state === 'connected')
  const browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine
  // La fenêtre de grâce court depuis l'ouverture OU le dernier « Retester »
  // (retestProvider pose __cosintRetestAt) : cliquer « Retester » ré-affiche
  // « Connexion au réseau… » le temps que les nouveaux WebSockets s'établissent.
  const graceStart = Math.max(context.startedAt, internal.__cosintRetestAt ?? 0)
  const inGrace = now - graceStart < SIGNALING_GRACE_MS

  // Si un serveur de signalisation est effectivement connecté, le réseau est
  // joignable par définition : on ne consulte navigator.onLine (parfois faux
  // sous Electron) que pour départager « connexion en cours » et « injoignable »
  // quand AUCUN serveur ne répond encore.
  let status: ConnectionStatus
  if (peerCount > 0) status = 'connected'
  else if (signalingUp) status = 'waiting'
  else if (inGrace && browserOnline && signaling.length > 0) status = 'connecting'
  else status = 'unreachable'

  return {
    status,
    peerCount,
    participantCount,
    signaling,
    peers,
    lastError: context.lastError,
    // Signalisation OK et pairs découverts, mais AUCUNE connexion WebRTC
    // n'aboutit : réseau restrictif probable (TURN nécessaire).
    webrtcBlocked:
      signalingUp && webrtcConnected === 0 && bcPeers === 0 && negotiatingStuck > 0
  }
}

/**
 * Observe l'état réseau d'un provider y-webrtc : événements + horloge (1 s).
 * Le callback n'est invoqué que si la photographie a changé.
 * Retourne la fonction de désabonnement.
 */
export function observeDiagnostics(
  provider: WebrtcProvider,
  awareness: Awareness,
  callback: (diagnostics: ConnectionDiagnostics) => void
): () => void {
  const context = createObserverContext(Date.now())

  // Écouteurs posés sur les connexions de signalisation PARTAGÉES (registre
  // global y-webrtc) : ils DOIVENT être retirés au démontage, sinon ouvrir puis
  // fermer plusieurs tableaux accumule des écouteurs sur la connexion partagée.
  const signalingListeners: Array<{
    conn: SignalingConnInternal
    event: string
    handler: (...args: unknown[]) => void
  }> = []

  let lastSerialized = ''
  const emit = (): void => {
    instrument()
    const diagnostics = computeDiagnostics(provider, awareness, context, Date.now())
    const serialized = JSON.stringify(diagnostics)
    if (serialized !== lastSerialized) {
      lastSerialized = serialized
      callback(diagnostics)
    }
  }

  /** Pose les écouteurs d'erreur sur les connexions non encore instrumentées. */
  const instrument = (): void => {
    const internal = provider as unknown as ProviderInternal
    for (const conn of internal.signalingConns) {
      if (context.instrumentedSignaling.has(conn)) continue
      context.instrumentedSignaling.add(conn)
      const onDisconnect = (event: unknown): void => {
        const error = (event as { error?: unknown } | undefined)?.error
        if (error) context.lastError = `Signalisation ${conn.url} : connexion perdue`
        emit()
      }
      const onConnect = (): void => emit()
      conn.on('disconnect', onDisconnect)
      conn.on('connect', onConnect)
      signalingListeners.push({ conn, event: 'disconnect', handler: onDisconnect })
      signalingListeners.push({ conn, event: 'connect', handler: onConnect })
    }
    internal.room?.webrtcConns.forEach((conn) => {
      if (context.instrumentedPeers.has(conn)) return
      context.instrumentedPeers.add(conn)
      // Le peer est détruit avec sa WebrtcConn : son écouteur disparaît avec lui.
      conn.peer.on('error', (error) => {
        context.lastError = `WebRTC : ${String((error as Error)?.message ?? error)}`
        emit()
      })
    })
  }

  const onPeers = (): void => emit()
  const onAwareness = (): void => emit()
  const onOnline = (): void => emit()
  provider.on('peers', onPeers)
  awareness.on('change', onAwareness)
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOnline)
  }
  // Horloge : fait vivre la fenêtre de grâce et la détection de négociation
  // bloquée même sans événement y-webrtc.
  const interval = setInterval(emit, 1000)
  emit()

  return () => {
    clearInterval(interval)
    provider.off('peers', onPeers)
    awareness.off('change', onAwareness)
    for (const { conn, event, handler } of signalingListeners) {
      conn.off(event, handler)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOnline)
    }
  }
}

/**
 * « Retester la connexion » (§1.4) : coupe puis relance la signalisation et la
 * découverte de pairs. y-webrtc retire l'état d'awareness local à la
 * déconnexion : on le capture et on le réapplique après reconnexion, sinon la
 * présence (pseudo, curseur) disparaîtrait chez les pairs.
 */
export function retestProvider(provider: WebrtcProvider, awareness: Awareness): void {
  const localState = awareness.getLocalState()
  provider.disconnect()
  provider.connect()
  if (localState !== null) awareness.setLocalState(localState)
  // Réarme la fenêtre de grâce : le statut repasse par « Connexion au réseau… »
  // (lu par computeDiagnostics) au lieu de rester figé sur l'état précédent.
  ;(provider as unknown as ProviderInternal).__cosintRetestAt = Date.now()
}
