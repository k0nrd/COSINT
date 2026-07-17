/**
 * Tests du handshake d'accès (§6) : dérivations du salon d'attente (lobby),
 * secret de session et échange chiffré (ECDH éphémère → AES-GCM).
 *
 * Node ≥ 20 expose crypto.getRandomValues / crypto.subtle en global :
 * ces tests s'exécutent sans DOM ni réseau.
 */
import { describe, expect, it } from 'vitest'
import {
  deriveEncryptionKey,
  deriveLobbyKey,
  deriveLobbyRoomId,
  deriveRoomId,
  generateHandshakeKeyPair,
  generateSessionSecret,
  openSecret,
  sealSecret
} from '@/lib/shareCode'

const CODE_A = 'ABCD-EFGH-JKMN'
const CODE_B = 'WXYZ-2345-6789'

/** base64url sans padding : lettres, chiffres, - et _ uniquement. */
const BASE64URL = /^[A-Za-z0-9_-]+$/

describe('deriveLobbyRoomId / deriveLobbyKey', () => {
  it('est déterministe : deux appels donnent le même résultat', async () => {
    expect(await deriveLobbyRoomId(CODE_A)).toBe(await deriveLobbyRoomId(CODE_A))
    expect(await deriveLobbyKey(CODE_A)).toBe(await deriveLobbyKey(CODE_A))
  })

  it('préfixe le salon d’attente par « cosint-lobby- »', async () => {
    expect(await deriveLobbyRoomId(CODE_A)).toMatch(/^cosint-lobby-/)
  })

  it('room et clé du lobby diffèrent entre elles pour un même code', async () => {
    const lobbyRoom = await deriveLobbyRoomId(CODE_A)
    const lobbyKey = await deriveLobbyKey(CODE_A)
    expect(lobbyKey).not.toBe(lobbyRoom)
    expect(lobbyKey.includes(lobbyRoom.replace(/^cosint-lobby-/, ''))).toBe(false)
  })

  it('le lobby est distinct du salon de document pour un même code', async () => {
    // On compare les parties dérivées (sans préfixe) : les contextes HKDF
    // room-id / lobby-room / enc-key / lobby-key doivent tous diverger.
    const room = (await deriveRoomId(CODE_A)).replace(/^cosint-/, '')
    const lobbyRoom = (await deriveLobbyRoomId(CODE_A)).replace(/^cosint-lobby-/, '')
    const key = await deriveEncryptionKey(CODE_A)
    const lobbyKey = await deriveLobbyKey(CODE_A)
    expect(lobbyRoom).not.toBe(room)
    expect(lobbyKey).not.toBe(key)
    expect(lobbyKey.includes(room)).toBe(false)
    expect(key.includes(lobbyRoom)).toBe(false)
  })

  it('les formes non canoniques du code dérivent comme la forme canonique', async () => {
    const lobbyRoom = await deriveLobbyRoomId(CODE_A)
    const lobbyKey = await deriveLobbyKey(CODE_A)
    const variants = ['abcd-efgh-jkmn', ' ABCD EFGH JKMN ', 'abcdefghjkmn', 'AB-CD-EF-GH-JK-MN']
    for (const variant of variants) {
      expect(await deriveLobbyRoomId(variant)).toBe(lobbyRoom)
      expect(await deriveLobbyKey(variant)).toBe(lobbyKey)
    }
  })

  it('des codes différents donnent des lobbies différents', async () => {
    expect(await deriveLobbyRoomId(CODE_A)).not.toBe(await deriveLobbyRoomId(CODE_B))
    expect(await deriveLobbyKey(CODE_A)).not.toBe(await deriveLobbyKey(CODE_B))
  })

  it('rejette un code invalide', async () => {
    await expect(deriveLobbyRoomId('0000')).rejects.toThrow(/invalide/)
    await expect(deriveLobbyKey('pas un code')).rejects.toThrow(/invalide/)
  })
})

describe('generateSessionSecret', () => {
  it('produit du base64url sans padding (32 octets → 43 caractères)', () => {
    const secret = generateSessionSecret()
    expect(secret).toMatch(BASE64URL)
    expect(secret).toHaveLength(43)
    expect(secret).not.toContain('=')
  })

  it('ne produit aucun doublon sur 100 tirages', () => {
    const secrets = new Set<string>()
    for (let i = 0; i < 100; i++) secrets.add(generateSessionSecret())
    expect(secrets.size).toBe(100)
  })
})

describe('handshake sealSecret / openSecret', () => {
  it('publie une clé publique éphémère en base64url (point P-256 non compressé)', async () => {
    const pair = await generateHandshakeKeyPair()
    expect(pair.publicKey).toMatch(BASE64URL)
    // 65 octets (format raw non compressé) → 87 caractères base64url.
    expect(pair.publicKey).toHaveLength(87)
  })

  it('round-trip : le demandeur retrouve exactement le secret scellé pour lui', async () => {
    const secret = generateSessionSecret()
    const requester = await generateHandshakeKeyPair()
    const sealed = await sealSecret(secret, requester.publicKey)
    expect(sealed.senderPublicKey).toMatch(BASE64URL)
    expect(sealed.iv).toMatch(BASE64URL)
    expect(sealed.ciphertext).toMatch(BASE64URL)
    // Le chiffré ne doit jamais contenir le secret en clair.
    expect(sealed.ciphertext.includes(secret)).toBe(false)
    await expect(openSecret(sealed, requester.privateKey)).resolves.toBe(secret)
  })

  it('deux scellements du même secret produisent des enveloppes différentes', async () => {
    const secret = generateSessionSecret()
    const requester = await generateHandshakeKeyPair()
    const first = await sealSecret(secret, requester.publicKey)
    const second = await sealSecret(secret, requester.publicKey)
    // Clé éphémère et IV tirés au hasard à chaque scellement.
    expect(second.senderPublicKey).not.toBe(first.senderPublicKey)
    expect(second.ciphertext).not.toBe(first.ciphertext)
    await expect(openSecret(first, requester.privateKey)).resolves.toBe(secret)
    await expect(openSecret(second, requester.privateKey)).resolves.toBe(secret)
  })

  it('ouvrir avec une autre clé privée échoue', async () => {
    const secret = generateSessionSecret()
    const requester = await generateHandshakeKeyPair()
    const intruder = await generateHandshakeKeyPair()
    const sealed = await sealSecret(secret, requester.publicKey)
    await expect(openSecret(sealed, intruder.privateKey)).rejects.toThrowError()
  })

  it('un chiffré altéré est rejeté (authentification AES-GCM)', async () => {
    const secret = generateSessionSecret()
    const requester = await generateHandshakeKeyPair()
    const sealed = await sealSecret(secret, requester.publicKey)
    const flipped = sealed.ciphertext[0] === 'A' ? 'B' : 'A'
    const tampered = { ...sealed, ciphertext: flipped + sealed.ciphertext.slice(1) }
    await expect(openSecret(tampered, requester.privateKey)).rejects.toThrowError()
  })
})
