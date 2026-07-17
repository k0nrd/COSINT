/**
 * Codes de partage (§4).
 *
 * Un code `XXXX-XXXX-XXXX` encode, par dérivation cryptographique :
 *  - l'identifiant de room (partie « publique », visible du serveur de signalisation) ;
 *  - la clé de chiffrement y-webrtc (jamais transmise à la signalisation).
 *
 * Dérivation : HKDF-SHA-256 avec deux contextes (`info`) distincts — connaître la
 * room ne donne aucune information sur la clé, et réciproquement.
 */

/**
 * Alphabet sans ambiguïté : ni 0/O, ni 1/I (« l » minuscule est normalisé en L).
 * 32 symboles = 2⁵ → l'octet aléatoire modulo 32 reste uniforme (256 = 8 × 32).
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** 12 caractères × 5 bits = 60 bits d'entropie. */
export const CODE_LENGTH = 12

const HKDF_SALT = 'COSINT-v1'
const INFO_ROOM = 'room-id'
const INFO_KEY = 'enc-key'
// Contextes v1.1 : salon d'attente (lobby) pour le handshake d'accès (§6).
const INFO_LOBBY_ROOM = 'lobby-room'
const INFO_LOBBY_KEY = 'lobby-key'

/** Génère un nouveau code de partage `XXXX-XXXX-XXXX` (crypto.getRandomValues). */
export function generateShareCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let raw = ''
  for (const byte of bytes) {
    raw += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  }
  return formatShareCode(raw)
}

/** Ajoute les tirets : `ABCD2345WXYZ` → `ABCD-2345-WXYZ`. */
export function formatShareCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

/**
 * Normalise une saisie utilisateur en code canonique `XXXX-XXXX-XXXX`.
 * Tolère les minuscules, espaces et tirets surnuméraires.
 * Retourne `null` si le code est invalide.
 */
export function normalizeShareCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '')
  if (raw.length !== CODE_LENGTH) return null
  for (const char of raw) {
    if (!CODE_ALPHABET.includes(char)) return null
  }
  return formatShareCode(raw)
}

function utf8(text: string): Uint8Array<ArrayBuffer> {
  // Cast nécessaire avec TS ≥ 5.7 : encode() est typée Uint8Array<ArrayBufferLike>
  // alors que WebCrypto attend un BufferSource adossé à un ArrayBuffer.
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes as Uint8Array<ArrayBuffer>
}

/** Dérivation HKDF-SHA-256 (WebCrypto), séparée par contexte. */
async function hkdf(canonicalCode: string, info: string, byteLength: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', utf8(canonicalCode), 'HKDF', false, [
    'deriveBits'
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8(HKDF_SALT), info: utf8(info) },
    keyMaterial,
    byteLength * 8
  )
  return new Uint8Array(bits)
}

function assertCanonical(code: string): string {
  const canonical = normalizeShareCode(code)
  if (!canonical) throw new Error(`Code de partage invalide : ${code}`)
  return canonical
}

/**
 * Identifiant de room (partie publique, utilisée pour la signalisation).
 * Préfixé `cosint-` pour éviter toute collision avec d'autres applications
 * partageant les mêmes serveurs de signalisation publics.
 */
export async function deriveRoomId(code: string): Promise<string> {
  const bytes = await hkdf(assertCanonical(code), INFO_ROOM, 16)
  return `cosint-${toBase64Url(bytes)}`
}

/**
 * Clé de chiffrement (passée comme `password` à y-webrtc, qui chiffre les
 * échanges de signalisation en AES-GCM). Jamais envoyée sur le réseau.
 */
export async function deriveEncryptionKey(code: string): Promise<string> {
  const bytes = await hkdf(assertCanonical(code), INFO_KEY, 32)
  return toBase64Url(bytes)
}

// ——— Salon d'attente / handshake d'accès (§6) ———

/**
 * Identifiant du salon d'attente (lobby), dérivé du code mais DISTINCT du salon
 * de document. Tout détenteur du code peut rejoindre le lobby pour demander
 * l'accès, sans jamais accéder aux données du document.
 */
export async function deriveLobbyRoomId(code: string): Promise<string> {
  const bytes = await hkdf(assertCanonical(code), INFO_LOBBY_ROOM, 16)
  return `cosint-lobby-${toBase64Url(bytes)}`
}

/** Mot de passe (chiffrement) du salon d'attente, dérivé du code. */
export async function deriveLobbyKey(code: string): Promise<string> {
  const bytes = await hkdf(assertCanonical(code), INFO_LOBBY_KEY, 32)
  return toBase64Url(bytes)
}

/**
 * Secret de session : mot de passe du salon de document (§6). Aléatoire, généré
 * à la création du tableau, NON dérivable du code. Détenu localement par les
 * membres, transmis à un demandeur uniquement après approbation (chiffré à sa
 * clé éphémère).
 */
export function generateSessionSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

/** Enveloppe chiffrée d'un secret transmis à un demandeur approuvé. */
export interface SealedSecret {
  /** Clé publique éphémère de l'expéditeur (base64url, format raw). */
  senderPublicKey: string
  iv: string
  ciphertext: string
}

/** Paire de clés éphémère du demandeur (ECDH P-256). */
export interface HandshakeKeyPair {
  publicKey: string
  privateKey: CryptoKey
}

/**
 * Génère la paire de clés éphémère du demandeur. La clé publique est publiée
 * dans le lobby ; la clé privée reste en mémoire (jamais persistée).
 */
export async function generateHandshakeKeyPair(): Promise<HandshakeKeyPair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveKey'
  ])
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey)
  return { publicKey: toBase64Url(new Uint8Array(raw)), privateKey: pair.privateKey }
}

async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    fromBase64Url(publicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
}

async function deriveSharedAesKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Scelle un secret (côté membre approuvant) à destination de la clé publique
 * éphémère d'un demandeur : ECDH éphémère → AES-GCM. Seul le demandeur peut
 * l'ouvrir ; les autres occupants du lobby voient un chiffré illisible.
 */
export async function sealSecret(
  secret: string,
  recipientPublicKey: string
): Promise<SealedSecret> {
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey']
  )
  const recipient = await importPublicKey(recipientPublicKey)
  const aesKey = await deriveSharedAesKey(ephemeral.privateKey, recipient)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    utf8(secret)
  )
  const rawPub = await crypto.subtle.exportKey('raw', ephemeral.publicKey)
  return {
    senderPublicKey: toBase64Url(new Uint8Array(rawPub)),
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext))
  }
}

/** Ouvre un secret scellé (côté demandeur) avec sa clé privée éphémère. */
export async function openSecret(
  sealed: SealedSecret,
  privateKey: CryptoKey
): Promise<string> {
  const sender = await importPublicKey(sealed.senderPublicKey)
  const aesKey = await deriveSharedAesKey(privateKey, sender)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(sealed.iv) },
    aesKey,
    fromBase64Url(sealed.ciphertext)
  )
  return new TextDecoder().decode(plaintext)
}
