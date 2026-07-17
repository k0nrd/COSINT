/**
 * Salon d'attente et handshake d'accès (§6).
 *
 * Mécanisme (documenté dans le README) :
 *  - Le salon de document est chiffré par un « secret de session » aléatoire,
 *    NON dérivable du code, détenu localement par les membres.
 *  - Un nouveau demandeur ne rejoint d'abord qu'un salon d'attente (« lobby »),
 *    dérivé du code (donc joignable par tout détenteur du code) mais SANS aucune
 *    donnée du document. Il y publie sa demande + une clé publique éphémère.
 *  - Un membre en ligne applique la politique du tableau (ouvert → acceptation
 *    automatique ; sur approbation → décision humaine ; privé → refus) et, en cas
 *    d'acceptation, lui transmet le secret de session CHIFFRÉ à sa clé éphémère.
 *  - Le demandeur déchiffre le secret, puis rejoint le salon de document.
 *
 * Ainsi, sans membre en ligne pour l'admettre, un demandeur n'obtient jamais le
 * secret — le code seul ne suffit pas à déchiffrer les données (amélioration
 * OPSEC par rapport à la v1).
 */
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import type { AccessMode, PresenceUser } from '@/types'
import { sanitizeAvatar } from '@/sync/BoardDoc'
import { APP_VERSION, isOlderVersion } from '@/lib/version'
import { ICE_SERVERS, SIGNALING_GRACE_MS, buildPeerOpts } from '@/sync/network'
import {
  deriveLobbyKey,
  deriveLobbyRoomId,
  generateHandshakeKeyPair,
  openSecret,
  sealSecret,
  type SealedSecret
} from '@/lib/shareCode'

/**
 * Au-delà de ce délai sans republication OBSERVÉE, une demande est périmée.
 * Le TTL est mesuré sur l'horloge LOCALE du membre (date de dernière évolution
 * du champ `at`), jamais en comparant `at` (horloge du demandeur) à l'horloge
 * du membre : deux postes désynchronisés de 15 s rendaient sinon toute demande
 * invisible (même piège que DECISIONS.md n°24).
 */
const REQUEST_TTL_MS = 15000

/** Période de republication de la demande (relance automatique, §1.6). */
const REPUBLISH_MS = 4000

/** Demande d'accès publiée par un demandeur dans le lobby. */
interface LobbyRequest {
  pseudo: string
  color: string
  avatarType: string
  avatarValue: string
  role: string
  /** Version applicative du demandeur (contrôle de compatibilité v1.4). */
  version: string
  publicKey: string
  at: number
}

/** Réponse d'un membre à une demande. */
interface LobbyGrant {
  sealed?: SealedSecret
  refused?: boolean
  /**
   * Motif de refus, pour un message clair :
   *  - `'outdated'` : version applicative antérieure ;
   *  - `'full'`     : limite de participants atteinte (§1e v1.5).
   */
  reason?: 'outdated' | 'full'
  by: string
  at: number
}

function getRequests(doc: Y.Doc): Y.Map<LobbyRequest> {
  return doc.getMap<LobbyRequest>('requests')
}

function getGrants(doc: Y.Doc): Y.Map<LobbyGrant> {
  return doc.getMap<LobbyGrant>('grants')
}

async function openLobbyProvider(
  code: string,
  signalingUrls: string[],
  asMember: boolean,
  iceServers?: RTCIceServer[]
): Promise<{ doc: Y.Doc; provider: WebrtcProvider }> {
  const roomId = await deriveLobbyRoomId(code)
  const password = await deriveLobbyKey(code)
  const doc = new Y.Doc()
  const provider = new WebrtcProvider(roomId, doc, {
    signaling: signalingUrls,
    password,
    maxConns: 30,
    filterBcConns: false,
    // ICE explicite (§1.3) : mêmes serveurs que le salon de document — y compris
    // en mode 100 % local (liste interne, éventuellement vide) — §réseau v1.7.1.
    peerOpts: buildPeerOpts(iceServers ?? ICE_SERVERS)
  })
  // L'awareness du lobby ne diffuse QUE la qualité de membre (pour détecter la
  // présence d'un approbateur) — aucune identité, le lobby étant joignable par
  // tout détenteur du code.
  provider.awareness.setLocalState({ member: asMember })
  return { doc, provider }
}

// ——— Côté demandeur ———

export type AccessResult =
  | { status: 'approved'; secret: string }
  | { status: 'refused'; reason?: 'outdated' | 'full' }

/**
 * Phase du handshake, affichée au demandeur (§1.6) — chaque cause d'attente a
 * son message : « réseau injoignable » n'est PAS « aucun membre en ligne ».
 *  - `connecting`     : connexion aux serveurs de signalisation en cours ;
 *  - `searching`      : signalisation OK, recherche d'un membre (délai de grâce) ;
 *  - `member-present` : un membre est en ligne, demande visible chez lui ;
 *  - `no-member`      : signalisation OK mais aucun membre après ~10 s
 *                       (la demande RESTE active : un membre qui arrive la voit) ;
 *  - `unreachable`    : aucun serveur de signalisation joignable après ~10 s
 *                       (les reconnexions automatiques continuent en arrière-plan).
 */
export type LobbyClientPhase =
  | 'connecting'
  | 'searching'
  | 'member-present'
  | 'no-member'
  | 'unreachable'

export interface LobbyClientHandle {
  destroy: () => void
}

export interface RequestAccessOptions {
  code: string
  signalingUrls: string[]
  /** Serveurs ICE à utiliser (§réseau v1.7.1). Absent = STUN publics par défaut. */
  iceServers?: RTCIceServer[]
  identity: PresenceUser
  /** Notifie chaque changement de phase du handshake (voir LobbyClientPhase). */
  onPhase: (phase: LobbyClientPhase) => void
  /** Résultat final du handshake (approuvé + secret, ou refusé). */
  onResult: (result: AccessResult) => void
}

/** Accès minimal aux connexions de signalisation du provider (lib0). */
interface SignalingConnLike {
  connected: boolean
}

/**
 * Demande l'accès à un tableau via le lobby. La demande reste publiée (avec
 * republication périodique et reconnexion automatique de la signalisation)
 * tant que l'appelant ne détruit pas le handle ; l'UI reflète la phase en cours.
 */
export async function requestAccess(options: RequestAccessOptions): Promise<LobbyClientHandle> {
  const keyPair = await generateHandshakeKeyPair()
  const { doc, provider } = await openLobbyProvider(
    options.code,
    options.signalingUrls,
    false,
    options.iceServers
  )
  // Identifiant de demande UNIQUE par tentative (et non l'id stable du profil) :
  // une demande précédente refusée/scellée à une ancienne clé ne bloque donc pas
  // les nouvelles demandes (les anciens grants deviennent orphelins).
  const requestId = crypto.randomUUID()
  let finished = false

  const requests = getRequests(doc)
  const grants = getGrants(doc)

  // L'avatar image n'est JAMAIS diffusé via le lobby (§1) : ce serait une grosse
  // data-URL republiée toutes les 4 s dans un salon transient sans structure
  // `files`. On retombe sur les initiales pour la pop-up d'approbation.
  const requestAvatar =
    options.identity.avatar.type === 'image'
      ? { type: 'initials', value: '' }
      : { type: options.identity.avatar.type, value: options.identity.avatar.value }

  const publishRequest = (): void => {
    if (finished) return
    requests.set(requestId, {
      pseudo: options.identity.name.slice(0, 64),
      color: options.identity.color,
      avatarType: requestAvatar.type,
      avatarValue: requestAvatar.value,
      role: options.identity.role.slice(0, 64),
      version: APP_VERSION,
      publicKey: keyPair.publicKey,
      at: Date.now()
    })
  }

  // ——— Machine d'états de la salle d'attente (§1.6) ———
  const startedAt = Date.now()
  /** Instant où la signalisation a répondu pour la première fois (0 = jamais). */
  let signalingUpAt = 0
  let lastPhase: LobbyClientPhase | null = null

  const memberPresent = (): boolean => {
    let present = false
    provider.awareness.getStates().forEach((state, clientId) => {
      if (clientId === provider.awareness.clientID) return
      if ((state as { member?: boolean }).member === true) present = true
    })
    return present
  }

  const computePhase = (): LobbyClientPhase => {
    const now = Date.now()
    // Un membre visible vaut preuve de réseau, quel que soit l'état signalisation
    // (cas des fenêtres locales découvertes par BroadcastChannel).
    if (memberPresent()) return 'member-present'
    const signalingUp = (provider.signalingConns as SignalingConnLike[]).some(
      (conn) => conn.connected
    )
    if (signalingUp) {
      if (signalingUpAt === 0) signalingUpAt = now
      // Grâce de ~10 s à partir de la signalisation établie : le temps que les
      // membres en ligne se découvrent et diffusent leur présence.
      return now - signalingUpAt < SIGNALING_GRACE_MS ? 'searching' : 'no-member'
    }
    // La signalisation est retombée : on réarme la grâce pour qu'une éventuelle
    // reconnexion (Wi-Fi rétabli) accorde une nouvelle fenêtre « searching »
    // au lieu d'afficher immédiatement « no-member » avant la redécouverte.
    signalingUpAt = 0
    return now - startedAt < SIGNALING_GRACE_MS ? 'connecting' : 'unreachable'
  }

  const notifyPhase = (): void => {
    if (finished) return
    const phase = computePhase()
    if (phase !== lastPhase) {
      lastPhase = phase
      options.onPhase(phase)
    }
  }

  const cleanup = (): void => {
    clearInterval(republish)
    clearInterval(phaseTimer)
    grants.unobserve(onGrant)
    provider.awareness.off('change', onPresence)
    // Retire sa demande avant de partir (les autres appliquent aussi un TTL).
    try {
      requests.delete(requestId)
    } catch {
      /* doc peut être en cours de destruction */
    }
    provider.disconnect()
    provider.destroy()
    doc.destroy()
  }

  const finish = (result: AccessResult): void => {
    if (finished) return
    finished = true
    cleanup()
    options.onResult(result)
  }

  const onGrant = async (): Promise<void> => {
    const grant = grants.get(requestId)
    if (!grant || finished) return
    if (grant.refused) {
      const reason =
        grant.reason === 'outdated' ? 'outdated' : grant.reason === 'full' ? 'full' : undefined
      finish({ status: 'refused', reason })
      return
    }
    if (grant.sealed) {
      try {
        const secret = await openSecret(grant.sealed, keyPair.privateKey)
        finish({ status: 'approved', secret })
      } catch {
        // Grant illisible (émetteur non fiable) : on ignore et on continue d'attendre.
      }
    }
  }

  const onPresence = (): void => notifyPhase()

  grants.observe(onGrant)
  provider.awareness.on('change', onPresence)
  // Republication périodique (relance automatique : un membre qui arrive après
  // coup voit une demande fraîche ; la signalisation, elle, se reconnecte seule
  // avec backoff — lib0/websocket).
  const republish = setInterval(publishRequest, REPUBLISH_MS)
  // Horloge de phase : fait évoluer connecting → searching → no-member même
  // sans aucun événement réseau.
  const phaseTimer = setInterval(notifyPhase, 1000)
  publishRequest()
  notifyPhase()
  void onGrant()

  return {
    destroy: () => {
      if (!finished) {
        finished = true
        cleanup()
      } else {
        // Déjà terminé (grant reçu) : cleanup a déjà tout libéré. Rien à faire.
      }
    }
  }
}

// ——— Côté membre (serveur d'approbation) ———

export interface PendingRequest {
  requestId: string
  pseudo: string
  color: string
  avatarType: string
  avatarValue: string
  role: string
  at: number
}

export interface LobbyServerHandle {
  destroy: () => void
  approve: (requestId: string) => void
  refuse: (requestId: string) => void
}

export interface LobbyServerOptions {
  code: string
  signalingUrls: string[]
  /** Serveurs ICE à utiliser (§réseau v1.7.1). Absent = STUN publics par défaut. */
  iceServers?: RTCIceServer[]
  /** Secret de session à transmettre aux demandeurs approuvés. */
  sessionSecret: string
  identity: PresenceUser
  /** Lecture du mode d'accès courant (depuis le meta du document). */
  getAccessMode: () => AccessMode
  /**
   * true quand la politique du tableau est RÉELLEMENT connue localement (meta du
   * document synchronisé). Un membre fraîchement admis a d'abord un document vide
   * (IndexedDB vide, meta pas encore reçu des pairs) : readMeta retomberait alors
   * sur « ouvert » et auto-admettrait tout demandeur en attente sans décision
   * humaine, contournant les modes « approbation » et « privé ». Tant que ceci
   * est faux, le serveur ne scelle ni ne refuse : il attend (le demandeur reste
   * en salle d'attente, sa demande étant republiée). Fail-safe : sans données du
   * tableau, on n'a pas l'autorité pour décider.
   */
  isPolicyReady: () => boolean
  /**
   * true si le tableau a atteint sa limite de participants (§1e v1.5) : dans ce
   * cas AUCUN nouveau demandeur n'est admis (refus explicite « tableau complet »),
   * même en mode « ouvert ». Empêche de dépasser la limite dès l'approbation ;
   * la vérification à la connexion effective (watchParticipantLimit) couvre les
   * approbations quasi simultanées par plusieurs membres.
   */
  isFull: () => boolean
  /** Notifie la liste des demandes en attente d'une décision humaine (§6). */
  onPendingChange: (pending: PendingRequest[]) => void
}

/**
 * Démarre le service d'approbation d'un membre : écoute les demandes du lobby
 * et applique la politique du tableau. Les demandes en mode « approbation » sont
 * remontées à l'UI via `onPendingChange`.
 */
export async function startLobbyServer(options: LobbyServerOptions): Promise<LobbyServerHandle> {
  const { doc, provider } = await openLobbyProvider(
    options.code,
    options.signalingUrls,
    true,
    options.iceServers
  )
  const requests = getRequests(doc)
  const grants = getGrants(doc)
  let destroyed = false

  /**
   * Fraîcheur des demandes mesurée sur l'horloge LOCALE : on note l'instant où
   * chaque valeur `at` distincte a été observée. Une demande dont `at` n'évolue
   * plus depuis REQUEST_TTL_MS est périmée (le demandeur republie toutes les
   * REPUBLISH_MS). Aucune comparaison entre horloges de postes différents.
   */
  const freshness = new Map<string, { lastAt: number; seenAt: number }>()

  const isFresh = (requestId: string, at: unknown, now: number): boolean => {
    if (typeof at !== 'number') return false
    const entry = freshness.get(requestId)
    if (!entry || entry.lastAt !== at) {
      freshness.set(requestId, { lastAt: at, seenAt: now })
      return true
    }
    return now - entry.seenAt <= REQUEST_TTL_MS
  }

  const seal = async (requestId: string): Promise<void> => {
    const request = requests.get(requestId)
    if (!request || grants.has(requestId)) return
    try {
      const sealed = await sealSecret(options.sessionSecret, request.publicKey)
      grants.set(requestId, { sealed, by: options.identity.name, at: Date.now() })
    } catch {
      /* clé publique invalide : on ignore la demande */
    }
  }

  const refuseRequest = (requestId: string): void => {
    if (grants.has(requestId)) return
    grants.set(requestId, { refused: true, by: options.identity.name, at: Date.now() })
  }

  /** Refuse une demande dont la version est antérieure à la mienne (v1.4). */
  const refuseOutdated = (requestId: string): void => {
    if (grants.has(requestId)) return
    grants.set(requestId, {
      refused: true,
      reason: 'outdated',
      by: options.identity.name,
      at: Date.now()
    })
  }

  /** Refuse une demande car le tableau a atteint sa limite de participants (§1e). */
  const refuseFull = (requestId: string): void => {
    if (grants.has(requestId)) return
    grants.set(requestId, {
      refused: true,
      reason: 'full',
      by: options.identity.name,
      at: Date.now()
    })
  }

  /** Dernière liste envoyée à l'UI, sérialisée (évite un re-rendu par tick). */
  let lastPendingSerialized = ''
  const emitPending = (pending: PendingRequest[]): void => {
    const serialized = JSON.stringify(pending)
    if (serialized === lastPendingSerialized) return
    lastPendingSerialized = serialized
    options.onPendingChange(pending)
  }

  const evaluate = (): void => {
    if (destroyed) return
    // Politique inconnue (meta du document pas encore synchronisé) : on n'admet
    // NI ne refuse personne — voir isPolicyReady. Le demandeur reste en attente.
    if (!options.isPolicyReady()) {
      emitPending([])
      return
    }
    const mode = options.getAccessMode()
    const now = Date.now()
    const pending: PendingRequest[] = []
    // Purge des entrées de fraîcheur dont la demande a disparu.
    for (const known of freshness.keys()) {
      if (!requests.has(known)) freshness.delete(known)
    }
    requests.forEach((request, requestId) => {
      if (grants.has(requestId)) return
      // Demande périmée (client parti sans se retirer) : ignorée.
      if (!isFresh(requestId, request.at, now)) return
      // Contrôle de compatibilité (v1.4) : une version ANTÉRIEURE à la mienne est
      // refusée d'emblée, quel que soit le mode d'accès — elle ne comprend pas les
      // nouveaux formats (images en chunks, rôles, cycle de partage).
      if (isOlderVersion(request.version, APP_VERSION)) {
        refuseOutdated(requestId)
        return
      }
      // §1e : limite atteinte → refus explicite « tableau complet », tous modes
      // confondus (l'admission ferait dépasser la limite).
      if (options.isFull()) {
        refuseFull(requestId)
        return
      }
      if (mode === 'open') {
        void seal(requestId)
      } else if (mode === 'private') {
        refuseRequest(requestId)
      } else {
        // L'avatar d'un demandeur n'est PAS fiable : on l'assainit avant de le
        // remonter à l'UI membre (rendu en <img src>).
        const avatar = sanitizeAvatar({ type: request.avatarType, value: request.avatarValue })
        pending.push({
          requestId,
          pseudo: typeof request.pseudo === 'string' ? request.pseudo.slice(0, 64) : '',
          color: request.color,
          avatarType: avatar.type,
          avatarValue: avatar.value,
          role: typeof request.role === 'string' ? request.role.slice(0, 64) : '',
          at: request.at
        })
      }
    })
    pending.sort((a, b) => a.at - b.at)
    emitPending(pending)
  }

  requests.observe(evaluate)
  grants.observe(evaluate)
  // Horloge : fait expirer les demandes dont le demandeur a disparu sans se
  // retirer (le TTL seul ne suffit pas, il faut re-évaluer périodiquement).
  const expiry = setInterval(evaluate, 5000)
  evaluate()

  return {
    destroy: () => {
      destroyed = true
      clearInterval(expiry)
      requests.unobserve(evaluate)
      grants.unobserve(evaluate)
      provider.disconnect()
      provider.destroy()
      doc.destroy()
    },
    // §1e : même une approbation MANUELLE est refusée si la limite est atteinte.
    approve: (requestId) => {
      if (options.isFull()) refuseFull(requestId)
      else void seal(requestId)
    },
    refuse: (requestId) => refuseRequest(requestId)
  }
}
