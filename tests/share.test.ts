/**
 * Cycle de vie du partage (§5 v1.4, livrable §7.4) : mode solo par défaut,
 * génération de code, et rotation du secret à la régénération.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { openBoard, type BoardHandle } from '@/sync/BoardDoc'
import { revokeShare } from '@/sync/boardOps'
import { readMeta } from '@/sync/model'
import {
  deriveRoomId,
  generateSessionSecret,
  generateShareCode
} from '@/lib/shareCode'

const handles: BoardHandle[] = []
afterAll(async () => {
  for (const handle of handles) {
    try {
      handle.destroy()
    } catch {
      /* déjà détruit */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 150))
})

describe('mode solo par défaut (§5)', () => {
  it('un tableau sans code n’ouvre AUCUNE connexion', async () => {
    const handle = await openBoard({ boardId: 'solo-1', shareCode: null, signalingUrls: [], persist: false })
    handles.push(handle)
    expect(handle.provider).toBeNull()
    expect(handle.awareness).toBeNull()
    expect(handle.shareCode).toBeNull()
    expect(handle.roomId).toBe('')
  })

  it('générer un code ouvre la connexion (provider présent)', async () => {
    const code = generateShareCode()
    const secret = generateSessionSecret()
    const handle = await openBoard({
      boardId: 'shared-1',
      shareCode: code,
      sessionSecret: secret,
      signalingUrls: [],
      persist: false
    })
    handles.push(handle)
    expect(handle.provider).not.toBeNull()
    expect(handle.shareCode).toBe(code)
    expect(handle.roomId).toBe(await deriveRoomId(code))
  })
})

describe('rotation du secret à la régénération (§5)', () => {
  it('un nouveau code produit une nouvelle room et un nouveau secret', async () => {
    const code1 = generateShareCode()
    const secret1 = generateSessionSecret()
    const code2 = generateShareCode()
    const secret2 = generateSessionSecret()
    expect(code2).not.toBe(code1)
    expect(secret2).not.toBe(secret1)
    // La room change avec le code → les anciens détenteurs du code1 ne sont même
    // pas dans le même salon P2P (ils ne peuvent pas revenir).
    expect(await deriveRoomId(code2)).not.toBe(await deriveRoomId(code1))
  })

  it('revokeShare pose un jeton de révocation distinct dans le meta', async () => {
    const handle = await openBoard({ boardId: 'solo-rev', shareCode: null, signalingUrls: [], persist: false })
    handles.push(handle)
    expect(readMeta(handle.doc).shareRevocation).toBe('')
    revokeShare(handle, 'token-1')
    expect(readMeta(handle.doc).shareRevocation).toBe('token-1')
    revokeShare(handle, 'token-2')
    expect(readMeta(handle.doc).shareRevocation).toBe('token-2')
    // Un participant ayant snapshotté 'token-1' constate le changement → révoqué.
    expect(readMeta(handle.doc).shareRevocation).not.toBe('token-1')
  })
})
