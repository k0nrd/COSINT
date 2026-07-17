/**
 * Fragmentation applicative du transport WebRTC (§1a v1.5).
 *
 * Vérifie le correctif de fond du bug « un arrivant voit un canvas vide » : un
 * message d'état initial plus grand que la limite d'un message DataChannel est
 * découpé en trames bornées puis réassemblé à l'identique côté récepteur — les
 * petits messages passant, eux, INCHANGÉS (compatibilité descendante).
 */
import { describe, expect, it } from 'vitest'
import { Reassembler, fragmentMessage } from '@/sync/peerFraming'

/** Octet de tête d'une trame fragmentée (doit être ignoré des vrais messages Yjs). */
const FRAG_MAGIC = 0xfb

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  // Motif déterministe (pas de Math.random) : suffisant pour l'égalité binaire.
  for (let i = 0; i < length; i++) bytes[i] = (i * 31 + 7) & 0xff
  return bytes
}

describe('fragmentation du transport (§1a)', () => {
  it('renvoie un petit message tel quel (une seule trame, sans en-tête)', () => {
    const message = randomBytes(1000)
    const frames = fragmentMessage(message, 1)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toBe(message) // même référence, aucun surcoût
    expect(frames[0][0]).not.toBe(FRAG_MAGIC)
  })

  it('découpe un gros message en plusieurs trames marquées', () => {
    // 200 Ko : bien au-dessus du seuil de 48 Ko → plusieurs trames.
    const message = randomBytes(200 * 1024)
    const frames = fragmentMessage(message, 42)
    expect(frames.length).toBeGreaterThan(1)
    for (const frame of frames) expect(frame[0]).toBe(FRAG_MAGIC)
  })

  it('réassemble un gros message à l’identique (round-trip)', () => {
    const message = randomBytes(300 * 1024 + 123)
    const frames = fragmentMessage(message, 7)
    const reassembler = new Reassembler(() => 0)
    let result: Uint8Array | null = null
    for (const frame of frames) {
      const out = reassembler.push(frame)
      if (out) result = out
    }
    expect(result).not.toBeNull()
    expect(result!.length).toBe(message.length)
    expect(Array.from(result!)).toEqual(Array.from(message))
  })

  it('réassemble même si les trames arrivent dans le désordre', () => {
    const message = randomBytes(150 * 1024)
    const frames = fragmentMessage(message, 9)
    const reassembler = new Reassembler(() => 0)
    let result: Uint8Array | null = null
    for (const frame of [...frames].reverse()) {
      const out = reassembler.push(frame)
      if (out) result = out
    }
    expect(result).not.toBeNull()
    expect(Array.from(result!)).toEqual(Array.from(message))
  })

  it('transmet un message normal (non fragmenté) tel quel', () => {
    // Un message Yjs commence par un petit type (0..4) : jamais 0xFB.
    const yjsLike = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    const reassembler = new Reassembler(() => 0)
    const out = reassembler.push(yjsLike)
    expect(out).not.toBeNull()
    expect(Array.from(out!)).toEqual([0x00, 0x01, 0x02, 0x03])
  })

  it('n’émet rien tant que toutes les trames d’un message ne sont pas là', () => {
    const message = randomBytes(120 * 1024)
    const frames = fragmentMessage(message, 3)
    expect(frames.length).toBeGreaterThan(1)
    const reassembler = new Reassembler(() => 0)
    // Toutes sauf la dernière : aucun message complet.
    for (const frame of frames.slice(0, -1)) {
      expect(reassembler.push(frame)).toBeNull()
    }
    // La dernière déclenche l'émission.
    expect(reassembler.push(frames[frames.length - 1])).not.toBeNull()
  })
})
