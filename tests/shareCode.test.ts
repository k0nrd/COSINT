/**
 * Tests des codes de partage (§4) : format, unicité, normalisation de la
 * saisie utilisateur et dérivation HKDF room/clé.
 *
 * Node ≥ 20 expose crypto.getRandomValues / crypto.subtle en global :
 * ces tests s'exécutent sans DOM ni réseau.
 */
import { describe, expect, it } from 'vitest'
import {
  CODE_ALPHABET,
  deriveEncryptionKey,
  deriveRoomId,
  generateShareCode,
  normalizeShareCode
} from '@/lib/shareCode'

/** Format canonique : alphabet sans 0/O ni 1/I, groupé par 4. */
const CODE_FORMAT = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/

const CODE_A = 'ABCD-EFGH-JKMN'
const CODE_B = 'WXYZ-2345-6789'

describe('generateShareCode', () => {
  it('produit le format XXXX-XXXX-XXXX sans caractère ambigu (200 générations)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShareCode()
      expect(code).toMatch(CODE_FORMAT)
      expect(code).not.toMatch(/[0O1I]/)
    }
  })

  it("n'utilise que l'alphabet documenté", () => {
    const raw = generateShareCode().replace(/-/g, '')
    for (const char of raw) {
      expect(CODE_ALPHABET).toContain(char)
    }
  })

  it('ne produit aucun doublon sur 1000 générations', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 1000; i++) codes.add(generateShareCode())
    expect(codes.size).toBe(1000)
  })
})

describe('normalizeShareCode', () => {
  it('accepte les minuscules et retourne la forme canonique', () => {
    expect(normalizeShareCode('abcd-efgh-jkmn')).toBe('ABCD-EFGH-JKMN')
  })

  it('tolère les espaces et tirets surnuméraires', () => {
    expect(normalizeShareCode('  ab cd -- efgh   jkmn ')).toBe('ABCD-EFGH-JKMN')
    expect(normalizeShareCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN')
    expect(normalizeShareCode('AB-CD-EF-GH-JK-MN')).toBe('ABCD-EFGH-JKMN')
  })

  it('normalise le « l » minuscule en L (seul I/1 sont ambigus, pas L)', () => {
    expect(normalizeShareCode('abcd-efgh-jklm')).toBe('ABCD-EFGH-JKLM')
  })

  it('rejette les longueurs invalides', () => {
    expect(normalizeShareCode('ABCD-EFGH')).toBeNull()
    expect(normalizeShareCode('ABCD-EFGH-JKM')).toBeNull()
    expect(normalizeShareCode('ABCD-EFGH-JKMN-PQRS')).toBeNull()
  })

  it('rejette les caractères ambigus 0, O, 1, I', () => {
    expect(normalizeShareCode('0BCD-EFGH-JKMN')).toBeNull()
    expect(normalizeShareCode('OBCD-EFGH-JKMN')).toBeNull()
    expect(normalizeShareCode('ABCD-EFGH-JKM1')).toBeNull()
    expect(normalizeShareCode('ABCD-EFGH-JKMI')).toBeNull()
    // Le « i » minuscule est remonté en I, donc rejeté lui aussi.
    expect(normalizeShareCode('abcd-efgh-jkmi')).toBeNull()
  })

  it('rejette la chaîne vide', () => {
    expect(normalizeShareCode('')).toBeNull()
  })
})

describe('deriveRoomId / deriveEncryptionKey', () => {
  it('est déterministe : deux appels donnent le même résultat', async () => {
    expect(await deriveRoomId(CODE_A)).toBe(await deriveRoomId(CODE_A))
    expect(await deriveEncryptionKey(CODE_A)).toBe(await deriveEncryptionKey(CODE_A))
  })

  it('les formes non canoniques dérivent comme la forme canonique', async () => {
    const room = await deriveRoomId(CODE_A)
    const key = await deriveEncryptionKey(CODE_A)
    const variants = ['abcd-efgh-jkmn', ' ABCD EFGH JKMN ', 'abcdefghjkmn', 'AB-CD-EF-GH-JK-MN']
    for (const variant of variants) {
      expect(await deriveRoomId(variant)).toBe(room)
      expect(await deriveEncryptionKey(variant)).toBe(key)
    }
  })

  it('préfixe le roomId par « cosint- »', async () => {
    expect(await deriveRoomId(CODE_A)).toMatch(/^cosint-/)
  })

  it('roomId et clé diffèrent pour un même code', async () => {
    const room = await deriveRoomId(CODE_A)
    const key = await deriveEncryptionKey(CODE_A)
    expect(key).not.toBe(room)
    expect(key).not.toBe(room.replace(/^cosint-/, ''))
  })

  it('des codes différents donnent des rooms et des clés différentes', async () => {
    expect(await deriveRoomId(CODE_A)).not.toBe(await deriveRoomId(CODE_B))
    expect(await deriveEncryptionKey(CODE_A)).not.toBe(await deriveEncryptionKey(CODE_B))
  })

  it("séparation room/clé : la clé ne contient pas le roomId, ni l'inverse", async () => {
    const room = await deriveRoomId(CODE_A)
    const key = await deriveEncryptionKey(CODE_A)
    // Connaître la partie publique (room) ne doit rien révéler de la clé.
    expect(key.includes(room)).toBe(false)
    expect(key.includes(room.replace(/^cosint-/, ''))).toBe(false)
    expect(room.includes(key)).toBe(false)
  })

  it('rejette un code invalide', async () => {
    await expect(deriveRoomId('0000')).rejects.toThrow(/invalide/)
    await expect(deriveEncryptionKey('pas un code')).rejects.toThrow(/invalide/)
  })
})
