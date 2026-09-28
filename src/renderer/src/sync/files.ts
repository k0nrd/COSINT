/**
 * Protocole de transfert de fichiers en chunks (§1 v1.4).
 *
 * Pourquoi : insérer une grosse valeur base64 d'un coup dans le document Yjs
 * produit un unique message de synchro de plusieurs centaines de Ko qui dépasse
 * la taille maximale des messages DataChannel WebRTC (~256 Ko) → la connexion
 * WebRTC tombe (c'était LE bug « ajouter une image casse la session »).
 *
 * Correction : les images sont découpées en chunks (≤ 48 Ko de base64) stockés
 * dans une Y.Map dédiée `files`, ÉCRITS EN TRANSACTIONS SÉPARÉES — chaque chunk
 * produit ainsi une mise à jour Yjs distincte et bornée, donc un message WebRTC
 * bien en-dessous de la limite. Les nœuds image ne référencent plus qu'un HASH
 * de contenu ; la présence (avatar) idem. L'image elle-même n'est transférée
 * qu'une fois (adressage par contenu → déduplication) et réassemblée + mise en
 * cache localement chez chaque pair.
 *
 * Robustesse (§1.4) : un fichier incomplet ou corrompu n'interrompt JAMAIS la
 * session — le nœud image affiche un état de chargement puis, le cas échéant, un
 * état d'erreur avec bouton « Réessayer » ; tout le reste continue de fonctionner.
 *
 * Ce module garde ses fonctions de découpage/réassemblage PURES (sans DOM), pour
 * être testables sous Node (voir tests/files.test.ts).
 */
import * as Y from 'yjs'
import type { PresenceAvatar } from '@/types'
import type { BoardHandle } from './BoardDoc'
import { getFilesMap, getNodesMap } from './model'
import { isInlineImageRef, replaceEntityImageRef, sanitizeEntityImages } from '@/lib/entityImages'

/**
 * Taille maximale d'un chunk, en CARACTÈRES de base64 (≈ octets du message).
 * 48 Ko laisse une marge confortable sous la limite DataChannel (~256 Ko) après
 * l'overhead Yjs + chiffrement AES-GCM y-webrtc. La spec autorise ≤ 64 Ko ; on
 * reste conservateur.
 */
export const CHUNK_SIZE = 48 * 1024

/** Préfixe des clés de métadonnées dans la Y.Map `files`. */
const META_PREFIX = 'm:'
/** Préfixe des clés de chunk : `c:<hash>:<index>`. */
const CHUNK_PREFIX = 'c:'

/** Origine des transactions d'écriture de fichiers : DISTINCTE de l'origine
 * locale suivie par l'undo (les transferts d'image ne sont pas annulables) et
 * reconnaissable à la réception (le filtrage par rôle du §6 exempte les fichiers,
 * qui sont adressés par contenu donc auto-vérifiables). */
export const FILE_ORIGIN: object = { source: 'cosint-file' }

/** Métadonnées d'un fichier stocké. */
export interface FileMeta {
  /** Type MIME (ex. `image/webp`). */
  mime: string
  /** Nombre de chunks attendus. */
  chunkCount: number
  /** Longueur de la charge base64 (caractères) — contrôle d'intégrité léger. */
  size: number
  /** Dimensions en pixels (images). */
  width?: number
  height?: number
}

/** État de résolution d'un fichier référencé par hash. */
export type FileStatus =
  | { status: 'complete'; dataUrl: string; meta: FileMeta }
  | { status: 'loading'; received: number; total: number }
  | { status: 'missing' }
  | { status: 'error'; reason: string }

// ——— Fonctions pures (testables sous Node) ———

/** Extrait le type MIME et la charge base64 d'une data-URL. Null si non conforme. */
export function parseDataUrl(dataUrl: string): { mime: string; payload: string } | null {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const mime = match[1]
  const payload = match[2]
  if (mime === '' || payload === '') return null
  return { mime, payload }
}

/** Découpe une charge base64 en chunks de ≤ CHUNK_SIZE caractères. */
export function splitPayload(payload: string): string[] {
  const chunks: string[] = []
  for (let offset = 0; offset < payload.length; offset += CHUNK_SIZE) {
    chunks.push(payload.slice(offset, offset + CHUNK_SIZE))
  }
  // Une charge vide donnerait 0 chunk : on garantit au moins un chunk vide pour
  // que chunkCount reste cohérent (jamais utilisé en pratique, payload non vide).
  return chunks.length > 0 ? chunks : ['']
}

/** Réassemble des chunks (dans l'ordre) en une charge base64. */
export function joinChunks(chunks: string[]): string {
  return chunks.join('')
}

/**
 * Hash de contenu (SHA-256 → base64url tronqué à 22 caractères ≈ 132 bits).
 * Sert d'identifiant stable ET de clé de déduplication : deux imports de la
 * même image produisent le même hash, donc réutilisent les mêmes chunks.
 * WebCrypto est disponible aussi bien dans le renderer que sous Node (tests).
 */
export async function hashPayload(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const raw = new Uint8Array(digest)
  let binary = ''
  for (const byte of raw) binary += String.fromCharCode(byte)
  const b64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return b64url.slice(0, 22)
}

// ——— Accès défensif à la Y.Map `files` ———

function metaKey(hash: string): string {
  return `${META_PREFIX}${hash}`
}

function chunkKey(hash: string, index: number): string {
  return `${CHUNK_PREFIX}${hash}:${index}`
}

/** Lit et valide les métadonnées d'un fichier ; null si absentes ou malformées. */
export function readFileMeta(doc: Y.Doc, hash: string): FileMeta | null {
  const raw = getFilesMap(doc).get(metaKey(hash))
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  // §5 v1.9 : tout type MIME non vide est accepté (images ET fichiers importés —
  // .pdf, .txt…). Avant v1.9 seules les images étaient stockées ; le stockage en
  // chunks est identique quel que soit le type (adressage par contenu).
  if (typeof record.mime !== 'string' || record.mime === '') return null
  if (typeof record.chunkCount !== 'number' || !Number.isInteger(record.chunkCount)) return null
  if (record.chunkCount < 1 || record.chunkCount > 4096) return null
  const meta: FileMeta = {
    mime: record.mime,
    chunkCount: record.chunkCount,
    size: typeof record.size === 'number' ? record.size : 0
  }
  if (typeof record.width === 'number' && Number.isFinite(record.width)) meta.width = record.width
  if (typeof record.height === 'number' && Number.isFinite(record.height)) meta.height = record.height
  return meta
}

/**
 * État courant d'un fichier référencé par hash (lecture synchrone, pour le rendu).
 * L'intégrité fine (base64 valide) est déléguée au décodage <img> côté rendu :
 * un chunk corrompu produit une image cassée → état d'erreur, jamais un crash.
 */
export function readFileStatus(doc: Y.Doc, hash: string): FileStatus {
  const meta = readFileMeta(doc, hash)
  if (!meta) return { status: 'missing' }
  const files = getFilesMap(doc)
  const chunks: string[] = []
  let received = 0
  for (let i = 0; i < meta.chunkCount; i++) {
    const value = files.get(chunkKey(hash, i))
    if (typeof value === 'string') {
      chunks[i] = value
      received++
    } else {
      chunks[i] = ''
    }
  }
  if (received < meta.chunkCount) {
    return { status: 'loading', received, total: meta.chunkCount }
  }
  const payload = joinChunks(chunks)
  // Contrôle de taille : une divergence signale des chunks corrompus/tronqués.
  if (meta.size > 0 && payload.length !== meta.size) {
    return { status: 'error', reason: 'size-mismatch' }
  }
  return { status: 'complete', dataUrl: `data:${meta.mime};base64,${payload}`, meta }
}

/** true si le fichier est déjà entièrement présent dans le document. */
export function hasCompleteFile(doc: Y.Doc, hash: string): boolean {
  return readFileStatus(doc, hash).status === 'complete'
}

// ——— Écriture d'un fichier (chunks en transactions séparées) ———

/**
 * Enregistre une data-URL dans la Y.Map `files` sous forme de chunks et retourne
 * son hash de contenu. Idempotent : si le fichier est déjà présent, ne réécrit
 * rien. CHAQUE chunk est écrit dans SA PROPRE transaction (origine `FILE_ORIGIN`)
 * afin que chaque mise à jour Yjs — donc chaque message WebRTC — reste bornée et
 * ne fasse jamais tomber la connexion. L'écriture est légèrement étalée dans le
 * temps pour préserver la réactivité de l'UI et laisser les autres éditions
 * s'intercaler (§1.6 : « une modif arrive pendant un transfert »).
 *
 * Retourne le hash, ou null si la data-URL est invalide.
 */
export async function registerFile(
  handle: BoardHandle,
  dataUrl: string,
  dims?: { width: number; height: number }
): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return null
  const hash = await hashPayload(parsed.payload)
  const files = getFilesMap(handle.doc)
  // Déjà présent et complet (déduplication) : rien à faire.
  if (hasCompleteFile(handle.doc, hash)) return hash

  const chunks = splitPayload(parsed.payload)
  const meta: FileMeta = {
    mime: parsed.mime,
    chunkCount: chunks.length,
    size: parsed.payload.length,
    ...(dims ? { width: dims.width, height: dims.height } : {})
  }
  // Métadonnées d'abord (petit objet) : le récepteur sait alors quoi attendre.
  handle.doc.transact(() => {
    files.set(metaKey(hash), meta)
  }, FILE_ORIGIN)

  // Puis les chunks, un par transaction, par petits lots espacés.
  const BATCH = 4
  for (let i = 0; i < chunks.length; i++) {
    const index = i
    handle.doc.transact(() => {
      // Réécrit un chunk absent OU corrompu (contenu différent) — le hash étant
      // vérifié, la source fait autorité. Idempotent si le chunk est déjà correct.
      if (files.get(chunkKey(hash, index)) !== chunks[index]) {
        files.set(chunkKey(hash, index), chunks[index])
      }
    }, FILE_ORIGIN)
    if ((i + 1) % BATCH === 0) {
      // Laisse la boucle d'événements respirer (rendu, autres transactions).
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  return hash
}

/**
 * Réécrit les chunks manquants d'un fichier à partir d'une data-URL source
 * détenue localement (bouton « Réessayer » quand l'émetteur d'origine est parti
 * mais que le pair possède la source, ou reprise d'un transfert interrompu).
 * Sans effet si le hash ne correspond pas à la source fournie.
 */
export async function resumeFile(handle: BoardHandle, hash: string, dataUrl: string): Promise<boolean> {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return false
  const computed = await hashPayload(parsed.payload)
  if (computed !== hash) return false
  await registerFile(handle, dataUrl, undefined)
  return true
}

// ——— Avatars référencés par hash (§1) ———

/** true si la valeur est une référence par hash (et non une data-URL héritée). */
export function isFileHash(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value) && !value.startsWith('data:')
}

/** §5 v1.9 : estime la taille binaire (octets) d'une charge base64 de `len`
 * caractères (≈ 3/4 des caractères). Pure, pour l'affichage de la taille d'un fichier. */
export function base64ByteLength(len: number): number {
  return Math.max(0, Math.floor((len * 3) / 4))
}

/**
 * Résout un avatar diffusé par un pair : une référence par hash devient la
 * data-URL réassemblée si le fichier est complet ; sinon on retombe sur les
 * initiales (le temps que les chunks arrivent). Une data-URL héritée passe telle
 * quelle. Ne provoque JAMAIS de requête réseau (§8).
 */
export function resolveAvatar(doc: Y.Doc, avatar: PresenceAvatar): PresenceAvatar {
  if (avatar.type !== 'image') return avatar
  if (avatar.value.startsWith('data:image/')) return avatar
  if (!isFileHash(avatar.value)) return { type: 'initials', value: '' }
  const status = readFileStatus(doc, avatar.value)
  if (status.status === 'complete') return { type: 'image', value: status.dataUrl }
  return { type: 'initials', value: '' }
}

// ——— Migration des images base64 inline (§1.5) ———

/**
 * Convertit au vol les nœuds image contenant une data-URL base64 inline
 * (tableaux d'avant la v1.4) vers le nouveau format en chunks : la data-URL est
 * enregistrée dans `files` et le nœud ne référence plus que le hash. Idempotent
 * (les nœuds déjà migrés référencent un hash → ignorés). L'écriture du hash sur
 * le nœud utilise `FILE_ORIGIN` : elle n'est pas annulable et ne réattribue pas
 * l'auteur du nœud.
 */
export async function migrateInlineImages(handle: BoardHandle): Promise<void> {
  const nodes = getNodesMap(handle.doc)
  // (a) contenu inline des nœuds image/fichier (§1 v1.4, §5 v1.9) ;
  // (b) image ATTACHÉE à une entité stockée inline (§2 v1.9).
  const pendingContent: Array<{ id: string; dataUrl: string }> = []
  const pendingImage: Array<{ id: string; dataUrl: string }> = []
  // (c) §2 v1.9 : images inline de la GALERIE d'une entité (liste `images`).
  const pendingGallery: Array<{ id: string; dataUrl: string }> = []
  nodes.forEach((map, id) => {
    if (!(map instanceof Y.Map)) return
    const kind = map.get('kind')
    const content = map.get('content')
    if (
      (kind === 'image' || kind === 'file') &&
      typeof content === 'string' &&
      content.startsWith('data:')
    ) {
      pendingContent.push({ id, dataUrl: content })
    }
    if (kind === 'entity') {
      const imageHash = map.get('imageHash')
      if (typeof imageHash === 'string' && imageHash.startsWith('data:')) {
        pendingImage.push({ id, dataUrl: imageHash })
      }
      // §2 v1.9 (galerie) : entrées inline de la liste `images` (.trace importé).
      for (const image of sanitizeEntityImages(map.get('images'))) {
        if (isInlineImageRef(image.hash)) pendingGallery.push({ id, dataUrl: image.hash })
      }
    }
  })
  for (const { id, dataUrl } of pendingContent) {
    const hash = await registerFile(handle, dataUrl)
    if (!hash) continue
    handle.doc.transact(() => {
      const map = nodes.get(id)
      if (map instanceof Y.Map && map.get('content') === dataUrl) map.set('content', hash)
    }, FILE_ORIGIN)
  }
  for (const { id, dataUrl } of pendingImage) {
    const hash = await registerFile(handle, dataUrl)
    if (!hash) continue
    handle.doc.transact(() => {
      const map = nodes.get(id)
      if (map instanceof Y.Map && map.get('imageHash') === dataUrl) map.set('imageHash', hash)
    }, FILE_ORIGIN)
  }
  // §2 v1.9 (galerie) : chaque entrée inline → hash, en place (ordre conservé ; la
  // liste est relue dans la transaction pour ne pas écraser une édition intercalée).
  for (const { id, dataUrl } of pendingGallery) {
    const hash = await registerFile(handle, dataUrl)
    if (!hash) continue
    handle.doc.transact(() => {
      const map = nodes.get(id)
      if (!(map instanceof Y.Map)) return
      const images = sanitizeEntityImages(map.get('images'))
      if (!images.some((image) => image.hash === dataUrl)) return
      map.set('images', replaceEntityImageRef(images, dataUrl, hash))
    }, FILE_ORIGIN)
  }
}
