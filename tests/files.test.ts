/**
 * Tests du protocole de transfert de fichiers en chunks (§1 v1.4, livrable §7.4).
 * Couvre : découpage/réassemblage, hash déterministe, statut complet/en cours,
 * chunk MANQUANT (transfert incomplet), reprise, et migration des images inline.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { BoardHandle } from '@/sync/BoardDoc'
import {
  base64ByteLength,
  CHUNK_SIZE,
  hashPayload,
  joinChunks,
  migrateInlineImages,
  parseDataUrl,
  readFileStatus,
  registerFile,
  resumeFile,
  splitPayload
} from '@/sync/files'
import { getFilesMap, getNodesMap } from '@/sync/model'
import { createNode } from '@/sync/boardOps'

/** Fabrique un handle minimal (registerFile/migration n'utilisent que `doc`). */
function makeHandle(): BoardHandle {
  const doc = new Y.Doc()
  return { doc, localOrigin: { source: 'test' } } as unknown as BoardHandle
}

/** Data-URL de test avec une charge base64 de longueur donnée (caractères 'A'). */
function fakeImage(payloadLength: number, mime = 'image/webp'): string {
  return `data:${mime};base64,${'A'.repeat(payloadLength)}`
}

describe('découpage / réassemblage', () => {
  it('découpe une charge en chunks ≤ CHUNK_SIZE et réassemble à l’identique', () => {
    const payload = 'X'.repeat(CHUNK_SIZE * 2 + 123)
    const chunks = splitPayload(payload)
    expect(chunks.length).toBe(3)
    expect(chunks.every((chunk) => chunk.length <= CHUNK_SIZE)).toBe(true)
    expect(joinChunks(chunks)).toBe(payload)
  })

  it('parseDataUrl extrait le MIME et la charge, rejette le non conforme', () => {
    expect(parseDataUrl('data:image/webp;base64,AAAA')).toEqual({ mime: 'image/webp', payload: 'AAAA' })
    expect(parseDataUrl('https://exemple.org/a.png')).toBeNull()
    expect(parseDataUrl('data:image/webp;base64,')).toBeNull()
  })

  it('hashPayload est déterministe et diffère selon le contenu', async () => {
    const a = await hashPayload('AAAA')
    const b = await hashPayload('AAAA')
    const c = await hashPayload('AAAB')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
})

describe('registerFile → readFileStatus', () => {
  it('enregistre une image en chunks puis la lit complète', async () => {
    const handle = makeHandle()
    const dataUrl = fakeImage(CHUNK_SIZE * 3 + 50)
    const hash = await registerFile(handle, dataUrl, { width: 800, height: 600 })
    expect(hash).not.toBeNull()

    const status = readFileStatus(handle.doc, hash!)
    expect(status.status).toBe('complete')
    if (status.status === 'complete') {
      expect(status.dataUrl).toBe(dataUrl)
      expect(status.meta.width).toBe(800)
      expect(status.meta.chunkCount).toBe(4)
    }
  })

  it('déduplique : réenregistrer la même image ne réécrit pas les chunks', async () => {
    const handle = makeHandle()
    const dataUrl = fakeImage(CHUNK_SIZE + 10)
    const hash1 = await registerFile(handle, dataUrl)
    const keysAfterFirst = [...getFilesMap(handle.doc).keys()].length
    const hash2 = await registerFile(handle, dataUrl)
    expect(hash2).toBe(hash1)
    expect([...getFilesMap(handle.doc).keys()].length).toBe(keysAfterFirst)
  })

  it('un chunk MANQUANT donne le statut « en cours » (jamais une erreur fatale)', async () => {
    const handle = makeHandle()
    const dataUrl = fakeImage(CHUNK_SIZE * 3)
    const hash = await registerFile(handle, dataUrl)
    // Simule un transfert interrompu : on retire le dernier chunk.
    const files = getFilesMap(handle.doc)
    const lastKey = `c:${hash}:2`
    expect(files.has(lastKey)).toBe(true)
    files.delete(lastKey)

    const status = readFileStatus(handle.doc, hash!)
    expect(status.status).toBe('loading')
    if (status.status === 'loading') {
      expect(status.received).toBe(2)
      expect(status.total).toBe(3)
    }
  })

  it('un hash inconnu donne « missing », jamais une exception', () => {
    const handle = makeHandle()
    expect(readFileStatus(handle.doc, 'inconnu0000000000000000').status).toBe('missing')
  })

  it('resumeFile réécrit le chunk manquant à partir de la source', async () => {
    const handle = makeHandle()
    const dataUrl = fakeImage(CHUNK_SIZE * 2)
    const hash = await registerFile(handle, dataUrl)
    getFilesMap(handle.doc).delete(`c:${hash}:1`)
    expect(readFileStatus(handle.doc, hash!).status).toBe('loading')

    const ok = await resumeFile(handle, hash!, dataUrl)
    expect(ok).toBe(true)
    expect(readFileStatus(handle.doc, hash!).status).toBe('complete')

    // Une source qui ne correspond pas au hash est refusée.
    expect(await resumeFile(handle, hash!, fakeImage(999))).toBe(false)
  })
})

describe('migration des images base64 inline (§1.5)', () => {
  it('convertit un nœud image inline en référence par hash + fichier chunké', async () => {
    const handle = makeHandle()
    const dataUrl = fakeImage(CHUNK_SIZE + 500)
    const id = createNode(
      handle,
      { kind: 'image', x: 0, y: 0, content: dataUrl },
      'testeur'
    )
    await migrateInlineImages(handle)

    const map = getNodesMap(handle.doc).get(id)!
    const content = map.get('content') as string
    expect(content.startsWith('data:')).toBe(false)
    expect(readFileStatus_(handle, content)).toBe('complete')

    // Idempotent : une seconde migration ne change rien.
    await migrateInlineImages(handle)
    expect(map.get('content')).toBe(content)
  })
})

function readFileStatus_(handle: BoardHandle, hash: string): string {
  return readFileStatus(handle.doc, hash).status
}

describe('§5 v1.9 — stockage de fichiers non-image', () => {
  it('enregistre et relit un fichier .pdf (type MIME non-image)', async () => {
    const handle = makeHandle()
    const dataUrl = fakeImage(CHUNK_SIZE + 20, 'application/pdf')
    const hash = await registerFile(handle, dataUrl)
    expect(hash).not.toBeNull()
    const status = readFileStatus(handle.doc, hash!)
    expect(status.status).toBe('complete')
    if (status.status === 'complete') {
      expect(status.meta.mime).toBe('application/pdf')
      expect(status.dataUrl).toBe(dataUrl)
    }
  })

  it('base64ByteLength ≈ 3/4 de la longueur base64', () => {
    expect(base64ByteLength(0)).toBe(0)
    expect(base64ByteLength(4)).toBe(3)
    expect(base64ByteLength(100)).toBe(75)
  })
})

describe('§2/§5 v1.9 — migration inline (nœud fichier + image d’entité)', () => {
  it('migre le contenu inline d’un nœud fichier vers une référence par hash', async () => {
    const handle = makeHandle()
    const dataUrl = fakeImage(CHUNK_SIZE + 10, 'application/pdf')
    const id = createNode(handle, { kind: 'file', x: 0, y: 0, content: dataUrl, title: 'a.pdf' }, 'testeur')
    await migrateInlineImages(handle)
    const content = getNodesMap(handle.doc).get(id)!.get('content') as string
    expect(content.startsWith('data:')).toBe(false)
    expect(readFileStatus(handle.doc, content).status).toBe('complete')
  })

  it("migre l'image inline attachée à une entité vers une référence par hash", async () => {
    const handle = makeHandle()
    const dataUrl = fakeImage(CHUNK_SIZE + 5)
    const id = createNode(handle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'testeur')
    handle.doc.transact(() => {
      getNodesMap(handle.doc).get(id)!.set('imageHash', dataUrl)
    })
    await migrateInlineImages(handle)
    const imageHash = getNodesMap(handle.doc).get(id)!.get('imageHash') as string
    expect(imageHash.startsWith('data:')).toBe(false)
    expect(readFileStatus(handle.doc, imageHash).status).toBe('complete')
  })
})
