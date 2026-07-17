/**
 * Fragmentation applicative du transport WebRTC (§1a v1.5).
 *
 * PROBLÈME (diagnostic v1.5 / DECISIONS n°98) : quand un pair rejoint un tableau
 * déjà rempli, y-webrtc lui envoie l'état initial complet (`syncStep2`) en UN
 * SEUL message DataChannel. Dès que le tableau contient une image (chunks de la
 * Y.Map `files`) ou beaucoup de contenu, ce message dépasse la taille maximale
 * d'un message SCTP négocié (~256 Ko côté Chromium). `simple-peer.send()` lève
 * alors une exception que y-webrtc AVALE silencieusement (`try {…} catch {}`,
 * y-webrtc.js:148) : le nouvel arrivant ne reçoit JAMAIS l'état initial et son
 * canvas reste vide, alors que la présence (petits messages) fonctionne.
 *
 * SOLUTION : on intercepte, pour chaque connexion WebRTC (`WebrtcConn.peer`),
 * l'ENVOI et la RÉCEPTION de messages. Tout message plus grand qu'un seuil sûr
 * est découpé en trames bornées `[MAGIC, msgId, index, total, …payload]` ;
 * le récepteur les réassemble avant de les remettre au handler d'origine de
 * y-webrtc. Les petits messages (la quasi-totalité : éditions incrémentales,
 * awareness) passent INCHANGÉS — d'où une compatibilité descendante totale : un
 * pair non patché ne reçoit jamais de trame fragmentée pour un petit message, et
 * les gros messages ne lui parvenaient de toute façon jamais (c'était le bug).
 *
 * Pourquoi ce niveau d'interception (et pas un fork de y-webrtc) : on retire le
 * handler `data` d'origine de y-webrtc et on le ré-enveloppe — aucune
 * modification de node_modules, robuste aux mises à jour du paquet.
 */
import type { WebrtcProvider } from 'y-webrtc'

/**
 * Premier octet marquant une trame fragmentée. Un message y-webrtc normal commence
 * TOUJOURS par le varUint de son type (0, 1, 3 ou 4 → un seul octet 0x00–0x04) :
 * 0xFB (251) est donc sans ambiguïté et ne peut jamais préfixer un vrai message.
 */
const FRAG_MAGIC = 0xfb

/** Taille de l'en-tête d'une trame : magic(1) + msgId(4) + index(2) + total(2). */
const HEADER_SIZE = 9

/**
 * Charge utile maximale par trame (octets). 48 Ko : identique au CHUNK_SIZE des
 * fichiers (§1.4), valeur EMPIRIQUEMENT sûre sous la limite DataChannel après
 * l'overhead de chiffrement — un message de cette taille passe déjà en production.
 */
const FRAME_PAYLOAD = 48 * 1024

/**
 * Seuil de fragmentation : au-delà, on découpe. En-dessous, envoi tel quel (aucun
 * surcoût, compatibilité descendante). Marge sous FRAME_PAYLOAD pour l'en-tête.
 */
const FRAGMENT_THRESHOLD = FRAME_PAYLOAD

/** Au-delà de ce délai sans nouvelle trame, un message partiel est abandonné
 * (le pair émetteur est probablement parti) — évite une fuite mémoire. */
const REASSEMBLY_TIMEOUT_MS = 30_000

/** Marqueur posé sur un peer déjà instrumenté (évite un double patch). */
const PATCHED = Symbol('cosint-framing-patched')

/** Diagnostic optionnel : notifié quand un gros message est fragmenté/réassemblé. */
export interface FramingHooks {
  onFragmentSend?: (bytes: number, frames: number) => void
  onReassembled?: (bytes: number, frames: number) => void
}

/** Convertit une donnée reçue (Uint8Array / ArrayBuffer / Buffer) en Uint8Array. */
function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  // Buffer (Node) est un Uint8Array ; tout autre objet indexable est copié.
  return new Uint8Array(data as ArrayBufferLike)
}

/**
 * Découpe un message en trames bornées (fonction PURE, testable). Un message
 * plus petit que le seuil est renvoyé tel quel (une seule trame « passthrough »).
 * Sinon, N trames `[MAGIC, msgId, index, total, …payload]`.
 */
export function fragmentMessage(bytes: Uint8Array, msgId: number): Uint8Array[] {
  if (bytes.length <= FRAGMENT_THRESHOLD) return [bytes]
  const total = Math.ceil(bytes.length / FRAME_PAYLOAD)
  const frames: Uint8Array[] = []
  for (let index = 0; index < total; index++) {
    const start = index * FRAME_PAYLOAD
    const chunk = bytes.subarray(start, start + FRAME_PAYLOAD)
    const frame = new Uint8Array(HEADER_SIZE + chunk.length)
    const view = new DataView(frame.buffer)
    frame[0] = FRAG_MAGIC
    view.setUint32(1, msgId)
    view.setUint16(5, index)
    view.setUint16(7, total)
    frame.set(chunk, HEADER_SIZE)
    frames.push(frame)
  }
  return frames
}

/**
 * Réassembleur de trames (testable). `push` renvoie le message complet quand la
 * dernière trame d'un message arrive, un message non fragmenté tel quel, ou null
 * tant qu'il manque des trames.
 */
export class Reassembler {
  private pending = new Map<number, Pending>()
  constructor(private now: () => number = () => Date.now()) {}

  push(raw: Uint8Array): Uint8Array | null {
    const bytes = toBytes(raw)
    if (bytes.length === 0 || bytes[0] !== FRAG_MAGIC) return bytes // message normal
    if (bytes.length < HEADER_SIZE) return null // trame tronquée
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const msgId = view.getUint32(1)
    const index = view.getUint16(5)
    const total = view.getUint16(7)
    if (total === 0 || index >= total) return null
    const current = this.now()
    for (const [id, entry] of this.pending) {
      if (current - entry.startedAt > REASSEMBLY_TIMEOUT_MS) this.pending.delete(id)
    }
    let entry = this.pending.get(msgId)
    if (!entry) {
      entry = { frames: new Array(total), total, received: 0, bytes: 0, startedAt: current }
      this.pending.set(msgId, entry)
    }
    if (entry.frames[index] !== undefined) return null // trame dupliquée
    const payload = bytes.subarray(HEADER_SIZE)
    entry.frames[index] = payload
    entry.received++
    entry.bytes += payload.length
    if (entry.received < entry.total) return null
    this.pending.delete(msgId)
    const message = new Uint8Array(entry.bytes)
    let offset = 0
    for (const frame of entry.frames) {
      if (!frame) return null
      message.set(frame, offset)
      offset += frame.length
    }
    return message
  }
}

/**
 * Seuil de « haute eau » du tampon d'envoi DataChannel (octets). Chromium/libwebrtc
 * borne le tampon à ~16 Mio : au-delà, `send()` lève. On draine sous 8 Mio pour
 * garder une marge, en attendant que le tampon se vide (§1a, backpressure).
 */
const SEND_HIGH_WATER = 8 * 1024 * 1024

/** Accès minimal typé au peer simple-peer instrumenté. */
interface FramedPeer {
  send: (data: Uint8Array) => void
  on: (event: string, handler: (data: unknown) => void) => void
  listeners: (event: string) => Array<(data: unknown) => void>
  removeAllListeners: (event: string) => void
  /** RTCDataChannel sous-jacent (exposé par simple-peer) — pour la backpressure. */
  _channel?: { bufferedAmount: number } | null
  /** true une fois le peer détruit (simple-peer) : on cesse alors de draîner. */
  destroyed?: boolean
  [PATCHED]?: boolean
}

interface WebrtcConnLike {
  peer: FramedPeer
}

interface RoomLike {
  webrtcConns: Map<string, WebrtcConnLike>
}

interface ProviderInternal {
  room: RoomLike | null
}

/** État de réassemblage d'un message fragmenté (par msgId). */
interface Pending {
  frames: Array<Uint8Array | undefined>
  total: number
  received: number
  bytes: number
  startedAt: number
}

/**
 * Instrumente un peer simple-peer : fragmentation à l'envoi, réassemblage à la
 * réception. Idempotent (marqueur PATCHED).
 */
function patchPeer(peer: FramedPeer, hooks: FramingHooks, now: () => number): void {
  if (peer[PATCHED]) return
  peer[PATCHED] = true

  // ——— Envoi : fragmenter les gros messages, avec backpressure ———
  // Les trames sont mises en FILE (ordre préservé) et drainées tant que le tampon
  // d'envoi du DataChannel reste sous la haute eau. Sans cela, envoyer d'un coup
  // toutes les trames d'un état initial > 16 Mio ferait lever `send()` en cours de
  // boucle → message partiel définitivement perdu (retour du bug §1a).
  const originalSend = peer.send.bind(peer)
  let nextMsgId = 1
  const queue: Uint8Array[] = []
  let draining = false
  const drain = (): void => {
    if (draining) return
    draining = true
    while (queue.length > 0) {
      if (peer.destroyed) {
        queue.length = 0
        break
      }
      const buffered = peer._channel?.bufferedAmount ?? 0
      if (buffered > SEND_HIGH_WATER) {
        // Tampon plein : on réessaie plus tard (le DataChannel se vide en tâche de fond).
        window.setTimeout(() => {
          draining = false
          drain()
        }, 50)
        return
      }
      try {
        originalSend(queue[0])
        queue.shift()
      } catch {
        // Échec ponctuel (tampon soudainement plein) : réessai différé, SANS
        // retirer la trame de la file → jamais de perte silencieuse.
        window.setTimeout(() => {
          draining = false
          drain()
        }, 50)
        return
      }
    }
    draining = false
  }
  peer.send = (data: Uint8Array): void => {
    const bytes = toBytes(data)
    const frames = fragmentMessage(bytes, nextMsgId++)
    for (const frame of frames) queue.push(frame)
    if (frames.length > 1) hooks.onFragmentSend?.(bytes.length, frames.length)
    drain()
  }

  // ——— Réception : réassembler avant de remettre au handler y-webrtc ———
  // On CAPTURE puis retire le(s) handler(s) `data` d'origine de y-webrtc, et on
  // installe le nôtre qui ne transmet que des messages COMPLETS. À ce stade la
  // connexion n'est pas encore ouverte (patch posé avant l'événement 'connect'),
  // donc aucune donnée n'a encore transité.
  const original = peer.listeners('data')
  if (original.length > 0) {
    peer.removeAllListeners('data')
    const reassembler = new Reassembler(now)
    peer.on('data', (raw: unknown) => {
      const message = reassembler.push(toBytes(raw))
      if (message === null) return
      hooks.onReassembled?.(message.length, 1)
      for (const handler of original) handler.call(peer, message)
    })
  }
}

/**
 * Installe la fragmentation sur toutes les connexions WebRTC d'un provider, et
 * sur celles à venir. On (re)balaye `room.webrtcConns` à chaque changement de
 * pairs ET périodiquement au démarrage (les connexions sont créées en interne par
 * y-webrtc avant l'événement `connect`, laissant le temps de patcher `send`
 * avant tout gros envoi). Retourne la fonction de désinstallation.
 */
export function installPeerFraming(
  provider: WebrtcProvider,
  hooks: FramingHooks = {},
  now: () => number = () => Date.now()
): () => void {
  const scan = (): void => {
    const room = (provider as unknown as ProviderInternal).room
    if (!room) return
    room.webrtcConns.forEach((conn) => {
      if (conn.peer) patchPeer(conn.peer, hooks, now)
    })
  }

  const onPeers = (): void => scan()
  provider.on('peers', onPeers)
  // Balayage initial soutenu (la room et les premières connexions apparaissent
  // de façon asynchrone après la dérivation de la clé du salon).
  scan()
  const interval = setInterval(scan, 1000)

  return () => {
    provider.off('peers', onPeers)
    clearInterval(interval)
  }
}
