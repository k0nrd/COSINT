/**
 * Cycle de vie d'un tableau ouvert : document Yjs + persistance locale (y-indexeddb)
 * + connexion P2P (y-webrtc, chiffrée par la clé dérivée du code de partage).
 */
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { Awareness } from 'y-protocols/awareness'
import {
  deriveEncryptionKey,
  deriveRoomId,
  generateHandshakeKeyPair,
  normalizeShareCode,
  type HandshakeKeyPair
} from '@/lib/shareCode'
import {
  MAX_PARTICIPANT_LIMIT,
  type AvatarType,
  type PresenceAvatar,
  type PresenceState,
  type PresenceUser,
  type UserStatus
} from '@/types'
import { getCommentsMap, getEdgesMap, getMetaMap, getNodesMap, readMeta } from './model'
import {
  ICE_SERVERS,
  buildPeerOpts,
  observeDiagnostics,
  retestProvider,
  type ConnectionDiagnostics
} from './network'
import { installPeerFraming } from './peerFraming'
import { logSync } from '@/store/syncLog'

export interface BoardHandle {
  doc: Y.Doc
  /** Identifiant de STOCKAGE local stable (§5 v1.4), découplé du code. */
  boardId: string
  /** Salon P2P dérivé du code (vide si le tableau est solo). */
  roomId: string
  /** Code canonique `XXXX-XXXX-XXXX`, ou null si le tableau est solo (§5). */
  shareCode: string | null
  /** Origine des transactions locales — seule origine suivie par l'undo (§5). */
  localOrigin: object
  undo: Y.UndoManager
  /** null si la persistance locale est désactivée (tests d'intégration). */
  persistence: IndexeddbPersistence | null
  provider: WebrtcProvider | null
  awareness: Awareness | null
  /**
   * Paire de clés éphémère de session (§1b v1.5), publiée dans l'awareness pour
   * permettre à l'admin de sceller le NOUVEAU secret aux participants connectés
   * lors d'une rotation de code (migration transparente). null si tableau solo.
   */
  rekey: HandshakeKeyPair | null
  /** Résolue quand l'état local (IndexedDB) est chargé. */
  whenLoaded: Promise<void>
  destroy: () => void
}

export interface OpenBoardOptions {
  /** Identifiant de stockage local stable (`cosint-<boardId>`). */
  boardId: string
  /** Code de partage, ou null/absent = tableau SOLO (aucune connexion P2P, §5). */
  shareCode?: string | null
  /** URLs des serveurs de signalisation à utiliser (déjà porteuses du jeton d'accès
   * `?token=` le cas échéant — la tokenisation est faite en amont, §1 v1.8.7). */
  signalingUrls: string[]
  /** Serveurs ICE (STUN/TURN) à utiliser (§réseau v1.7.1). Absent = STUN publics
   * par défaut ; liste vide = aucun (mode 100 % local sur un même réseau). */
  iceServers?: RTCIceServer[]
  /** false = force l'ouverture locale même avec un code (aucune connexion). */
  connect?: boolean
  /**
   * Secret de session = mot de passe du salon de document (§6). Fourni par les
   * membres. Absent = tableau v1 : on retombe sur la clé dérivée du code (mode
   * « ouvert » historique).
   */
  sessionSecret?: string
  /** false = pas de persistance IndexedDB (réservé aux tests, hors navigateur). */
  persist?: boolean
}

/**
 * Ouvre (ou crée) un tableau. Le STOCKAGE local est keyé par `boardId` (stable,
 * §5) ; la connexion P2P n'est ouverte QUE si un code de partage est fourni ET
 * `connect !== false` — sinon le tableau est solo (aucune signalisation, §5).
 */
export async function openBoard(options: OpenBoardOptions): Promise<BoardHandle> {
  const doc = new Y.Doc()
  const localOrigin: object = { source: 'cosint-local' }

  const undo = new Y.UndoManager(
    [getNodesMap(doc), getEdgesMap(doc), getCommentsMap(doc), getMetaMap(doc)],
    {
      trackedOrigins: new Set([localOrigin]),
      captureTimeout: 500
    }
  )

  const persistence =
    options.persist === false ? null : new IndexeddbPersistence(storageName(options.boardId), doc)
  const whenLoaded = persistence
    ? persistence.whenSynced.then(() => undefined)
    : Promise.resolve()

  // Partage effectif : un code présent + connexion non forcée à false.
  const shareCode =
    options.connect !== false && options.shareCode ? normalizeShareCode(options.shareCode) : null
  let roomId = ''
  let provider: WebrtcProvider | null = null
  let disposeFraming: (() => void) | null = null
  if (shareCode) {
    roomId = await deriveRoomId(shareCode)
    // Salon de document chiffré par le secret de session, ou à défaut par la clé
    // dérivée du code (compatibilité v1).
    const password = options.sessionSecret ?? (await deriveEncryptionKey(shareCode))
    provider = new WebrtcProvider(roomId, doc, {
      signaling: options.signalingUrls,
      password,
      // Marge au-dessus de la limite max (10) pour que la détection de
      // sur-occupation (§6) puisse s'exécuter avant la déconnexion.
      maxConns: MAX_PARTICIPANT_LIMIT + 3,
      filterBcConns: true,
      peerOpts: buildPeerOpts(options.iceServers ?? ICE_SERVERS)
    })
    // §1a v1.5 : fragmentation applicative du transport — sans elle, l'état initial
    // (syncStep2) d'un tableau contenant des images dépasse la taille max d'un
    // message WebRTC et est perdu silencieusement, laissant l'arrivant sur un
    // canvas vide. Voir sync/peerFraming.ts.
    disposeFraming = installPeerFraming(provider, {
      onReassembled: (bytes) =>
        logSync('info', `État reçu par morceaux (${Math.round(bytes / 1024)} Ko réassemblés).`),
      onFragmentSend: (bytes) =>
        logSync('info', `État envoyé par morceaux (${Math.round(bytes / 1024)} Ko) à un arrivant.`)
    })
  }

  // Clé éphémère de session (§1b) : uniquement pour un tableau connecté.
  const rekey = provider ? await generateHandshakeKeyPair() : null

  return {
    doc,
    boardId: options.boardId,
    roomId,
    shareCode,
    localOrigin,
    undo,
    persistence,
    provider,
    awareness: provider ? provider.awareness : null,
    rekey,
    whenLoaded,
    destroy: () => {
      undo.destroy()
      disposeFraming?.()
      // disconnect() AVANT destroy() : y-webrtc 10.3.0 ne retire le provider du
      // registre global des connexions de signalisation que dans disconnect().
      provider?.disconnect()
      provider?.destroy()
      persistence?.destroy()
      doc.destroy()
    }
  }
}

/** Nom de la base IndexedDB d'un tableau (keyé par boardId, §5). */
export function storageName(boardId: string): string {
  return `cosint-${boardId}`
}

/** Supprime la copie locale d'un tableau (registre « Supprimer de ce poste »). */
export function deleteBoardStorage(boardId: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(storageName(boardId))
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

// ——— Présence (Yjs Awareness) ———

/** Couleur d'utilisateur valide : #rrggbb. Défensif contre un pair modifié. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
const AVATAR_TYPES: AvatarType[] = ['initials', 'emoji', 'image']
const USER_STATUSES: UserStatus[] = ['available', 'busy', 'away']
/** Taille max d'un avatar image transmis via l'awareness (data-URL). */
const MAX_AVATAR_LENGTH = 300_000

export function setLocalPresence(handle: BoardHandle, user: PresenceUser): void {
  if (!handle.awareness) return
  const current = (handle.awareness.getLocalState() ?? {}) as Partial<PresenceState>
  // On PRÉSERVE les champs d'awareness supplémentaires (notamment `rekey`, §1b) :
  // setLocalState REMPLACE tout l'état local, donc reconstruire {user,cursor,
  // selection} sans étaler `current` effacerait la clé publique de rotation.
  const state = {
    ...current,
    user,
    cursor: current.cursor ?? null,
    selection: current.selection ?? []
  }
  handle.awareness.setLocalState(state)
}

/** Assainit l'avatar reçu d'un pair avant tout rendu (§8). Exporté pour être
 * réutilisé par le salon d'attente (les demandes de lobby ne sont pas fiables). */
export function sanitizeAvatar(raw: unknown): PresenceAvatar {
  const fallback: PresenceAvatar = { type: 'initials', value: '' }
  if (typeof raw !== 'object' || raw === null) return fallback
  const record = raw as Record<string, unknown>
  const type = (AVATAR_TYPES as string[]).includes(record.type as string)
    ? (record.type as AvatarType)
    : 'initials'
  let value = typeof record.value === 'string' ? record.value : ''
  if (type === 'image') {
    // Deux formes acceptées (§1 v1.4) :
    //  - référence par HASH (base64url court) → l'image vit dans la Y.Map `files`,
    //    jamais dans l'awareness ; elle est résolue en data-URL au rendu ;
    //  - data-URL image locale héritée (avatars d'avant la migration hash).
    // Toute autre valeur (URL réseau, schéma exotique) retombe sur les initiales.
    const isHashRef = /^[A-Za-z0-9_-]{16,64}$/.test(value)
    const isLegacyDataUrl = value.startsWith('data:image/') && value.length <= MAX_AVATAR_LENGTH
    if (!isHashRef && !isLegacyDataUrl) return fallback
  } else if (type === 'emoji') {
    value = value.slice(0, 8)
  } else {
    value = ''
  }
  return { type, value }
}

export function setLocalCursor(handle: BoardHandle, cursor: { x: number; y: number } | null): void {
  handle.awareness?.setLocalStateField('cursor', cursor)
}

export function setLocalSelection(handle: BoardHandle, nodeIds: string[]): void {
  handle.awareness?.setLocalStateField('selection', nodeIds)
}

/**
 * Lit les états de présence des AUTRES participants (curseurs, sélections).
 * Assainit les champs venus des pairs (nom, couleur) : ils sont injectés dans
 * du CSS/SVG côté rendu, donc jamais pris tels quels sans validation (§8).
 * Ne mute pas l'objet d'awareness : on construit une copie sûre.
 */
export function readOthersPresence(
  handle: BoardHandle
): Array<PresenceState & { clientId: number }> {
  if (!handle.awareness) return []
  const result: Array<PresenceState & { clientId: number }> = []
  handle.awareness.getStates().forEach((raw, clientId) => {
    if (clientId === handle.awareness!.clientID) return
    const state = raw as Partial<PresenceState>
    if (!state.user || typeof state.user.name !== 'string') return
    const color = typeof state.user.color === 'string' && HEX_COLOR_RE.test(state.user.color)
      ? state.user.color
      : '#8a94a6'
    const status = (USER_STATUSES as string[]).includes(state.user.status as string)
      ? (state.user.status as UserStatus)
      : 'available'
    result.push({
      clientId,
      user: {
        id: String(state.user.id ?? ''),
        name: state.user.name.slice(0, 64),
        color,
        avatar: sanitizeAvatar(state.user.avatar),
        role: typeof state.user.role === 'string' ? state.user.role.slice(0, 64) : '',
        status
      },
      cursor:
        state.cursor && typeof state.cursor.x === 'number' && typeof state.cursor.y === 'number'
          ? { x: state.cursor.x, y: state.cursor.y }
          : null,
      selection: Array.isArray(state.selection)
        ? state.selection.filter((id): id is string => typeof id === 'string')
        : []
    })
  })
  return result.sort((a, b) => a.clientId - b.clientId)
}

/**
 * Limite v1 : 5 participants (§4), appliquée « au mieux » (voir DECISIONS.md n°9).
 *
 * Conception robuste aux horloges désynchronisées entre postes : un client
 * n'utilise JAMAIS l'horodatage d'un autre poste. On applique une règle locale
 * simple — « si, peu après mon arrivée, le tableau est sur-occupé, c'est MOI le
 * surnuméraire, je me retire ». Seuls les clients qui ouvrent le tableau
 * exécutent ce contrôle, et seulement pendant une courte fenêtre d'arrivée
 * (le temps que le maillage WebRTC se peuple) ; un participant déjà établi ne
 * s'auto-évince donc jamais après coup. Retourne une fonction de désabonnement.
 */
export function watchParticipantLimit(handle: BoardHandle, onFull: () => void): () => void {
  const awareness = handle.awareness
  if (!awareness) return () => undefined

  let done = false
  const check = (): void => {
    if (done) return
    // Limite réglable par l'admin (§6), lue dans le meta du document.
    const limit = readMeta(handle.doc).participantLimit
    // Sur-occupation observée pendant ma fenêtre d'arrivée → je me retire.
    if (awareness.getStates().size > limit) {
      done = true
      cleanup()
      handle.provider?.disconnect()
      onFull()
    }
  }

  // Fenêtre d'arrivée : au-delà, on considère l'adhésion établie et on cesse
  // de surveiller (évite qu'une arrivée tardive ne fasse partir un membre stable).
  const windowTimer = window.setTimeout(() => {
    done = true
    cleanup()
  }, 8000)

  const cleanup = (): void => {
    awareness.off('change', check)
    window.clearTimeout(windowTimer)
  }

  awareness.on('change', check)
  check()
  return cleanup
}

// ——— État de connexion (§5, refondu en v1.3 §1) ———

/** Diagnostic d'un tableau ouvert sans connexion (mode purement local). */
export function localOnlyDiagnostics(): ConnectionDiagnostics {
  return {
    status: 'local',
    peerCount: 0,
    participantCount: 1,
    signaling: [],
    peers: [],
    lastError: null,
    webrtcBlocked: false
  }
}

/**
 * Observe l'état réseau détaillé du tableau (serveurs de signalisation, pairs,
 * erreurs) — voir sync/network.ts pour la machine d'états. L'indicateur et le
 * panneau de diagnostic consomment la MÊME photographie : ils ne peuvent pas
 * se contredire.
 */
export function observeBoardConnection(
  handle: BoardHandle,
  callback: (diagnostics: ConnectionDiagnostics) => void
): () => void {
  if (!handle.provider || !handle.awareness) {
    callback(localOnlyDiagnostics())
    return () => undefined
  }
  return observeDiagnostics(handle.provider, handle.awareness, callback)
}

/** Relance signalisation + découverte (bouton « Retester la connexion »). */
export function retestBoardConnection(handle: BoardHandle): void {
  if (handle.provider && handle.awareness) retestProvider(handle.provider, handle.awareness)
}
