/**
 * §2 v1.9 (galerie) — images attachées à une entité : logique pure (lib/entityImages),
 * modèle Yjs (validation des données distantes, reprise de l'image unique héritée),
 * opérations annulables (boardOps), export/import `.trace` (inline puis re-découpage
 * en chunks), copier-coller (fragment) et migration.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { BoardHandle } from '@/sync/BoardDoc'
import type { BoardNodeData, EntityImage } from '@/types'
import {
  appendEntityImages,
  applyEntityImageAction,
  clampImageIndex,
  entityCover,
  entityImageFileName,
  entityImageFileRefs,
  extraImageCount,
  inlineEntityImages,
  isDisplayableImage,
  isEntityImageRef,
  MAX_ENTITY_IMAGES,
  MAX_INLINE_IMAGE_CHARS,
  pruneUnavailableImages,
  readEntityImages,
  replaceEntityImageRef,
  sanitizeEntityImages,
  wrapImageIndex,
  resolveEntityImageSrc,
  entityImageProgress,
  lightboxImages,
  lightboxShouldClose
} from '@/lib/entityImages'
import { useEntityLightbox } from '@/store/entityLightbox'
import { getMetaMap, getNodesMap, getRolesMap, nodeToYMap, yMapToNode } from '@/sync/model'
import { installRoleGuard } from '@/sync/roleGuard'
import {
  addEntityImages,
  createNode,
  duplicateNodes,
  editEntityImages,
  makeEntityNode
} from '@/sync/boardOps'
import { hasCompleteFile, migrateInlineImages, readFileStatus, registerFile } from '@/sync/files'
import {
  countUnexportableEntityImages,
  exportBoardData,
  importTraceIntoDoc,
  parseTrace,
  sanitizeNode,
  serializeTrace
} from '@/lib/serialization'
import { buildClip, parseClip, remapClip, serializeClip } from '@/lib/clipboard'

/** Hash de fichier factice valide (22 caractères base64url, comme hashPayload). */
function fakeHash(n: number): string {
  return `H${String(n).padStart(3, '0')}xxxxxxxxxxxxxxxxxx`.slice(0, 22)
}

/** Data-URL image factice (charge base64 de longueur donnée). */
function fakeImage(payloadLength: number, fill = 'A'): string {
  return `data:image/webp;base64,${fill.repeat(payloadLength)}`
}

/** Handle minimal avec UndoManager (comme BoardDoc : origine locale suivie). */
function makeHandle(): BoardHandle {
  const doc = new Y.Doc()
  const localOrigin = { source: 'test' }
  const undo = new Y.UndoManager([getNodesMap(doc)], {
    trackedOrigins: new Set([localOrigin]),
    captureTimeout: 0
  })
  return { doc, localOrigin, undo } as unknown as BoardHandle
}

function entityNode(images?: EntityImage[]): BoardNodeData {
  const node = makeEntityNode({ entityType: 'person', x: 10, y: 20, title: 'Jean Test' }, 'alice')
  return images ? { ...node, images } : node
}

function readNode(handle: BoardHandle, id: string): BoardNodeData {
  return yMapToNode(id, getNodesMap(handle.doc).get(id)!)
}

describe('lib/entityImages — assainissement et lecture', () => {
  it('accepte hash de fichier et data-URL image, rejette le reste', () => {
    expect(isEntityImageRef(fakeHash(1))).toBe(true)
    expect(isEntityImageRef(fakeImage(8))).toBe(true)
    expect(isEntityImageRef('../../etc/passwd')).toBe(false)
    expect(isEntityImageRef('javascript:alert(1)')).toBe(false)
    expect(isEntityImageRef('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
    expect(isEntityImageRef('court')).toBe(false)
    expect(isEntityImageRef(42)).toBe(false)
    // Data-URL démesurée (donnée distante non fiable) : refusée.
    expect(isEntityImageRef(fakeImage(MAX_INLINE_IMAGE_CHARS + 10))).toBe(false)
  })

  it('ignore les entrées malformées, retire les doublons (premier gagne) et borne à 12', () => {
    const raw = [
      { hash: fakeHash(1), width: 800, height: 600 },
      { hash: fakeHash(1), width: 1, height: 1 },
      'pas un objet',
      null,
      { hash: 'x' },
      { hash: fakeHash(2), width: -5, height: Number.NaN },
      ...Array.from({ length: 20 }, (_, i) => ({ hash: fakeHash(10 + i) }))
    ]
    const images = sanitizeEntityImages(raw)
    expect(images).toHaveLength(MAX_ENTITY_IMAGES)
    expect(images[0]).toEqual({ hash: fakeHash(1), width: 800, height: 600 })
    expect(images[1]).toEqual({ hash: fakeHash(2) })
    expect(new Set(images.map((image) => image.hash)).size).toBe(images.length)
    expect(sanitizeEntityImages('images')).toEqual([])
  })

  it('relit l’image UNIQUE héritée du build de travail comme première image', () => {
    expect(readEntityImages({ imageHash: fakeHash(7), imageWidth: 320, imageHeight: 200 })).toEqual([
      { hash: fakeHash(7), width: 320, height: 200 }
    ])
    // La clé `images` (même vide = galerie vidée explicitement) prime sur l'héritage.
    expect(readEntityImages({ images: [], imageHash: fakeHash(7) })).toEqual([])
    expect(readEntityImages({ images: [{ hash: fakeHash(8) }], imageHash: fakeHash(7) })).toEqual([
      { hash: fakeHash(8) }
    ])
    expect(readEntityImages({ imageHash: 'invalide' })).toEqual([])
  })

  it('couverture, badge « +N », index de visionneuse', () => {
    const images = [{ hash: fakeHash(1) }, { hash: fakeHash(2) }, { hash: fakeHash(3) }]
    expect(entityCover(images)).toEqual({ hash: fakeHash(1) })
    expect(entityCover([])).toBeNull()
    expect(extraImageCount(images)).toBe(2)
    expect(extraImageCount([{ hash: fakeHash(1) }])).toBe(0)
    expect(extraImageCount(undefined)).toBe(0)
    expect(clampImageIndex(9, 3)).toBe(2)
    expect(clampImageIndex(-1, 3)).toBe(0)
    expect(clampImageIndex(1, 0)).toBe(0)
    expect(wrapImageIndex(2, 1, 3)).toBe(0)
    expect(wrapImageIndex(0, -1, 3)).toBe(2)
    expect(wrapImageIndex(0, 1, 0)).toBe(0)
  })

  it('nom de fichier proposé : titre nettoyé + rang, repli si vide', () => {
    expect(entityImageFileName('Jean Test', 0, 'image')).toBe('Jean Test-1.png')
    expect(entityImageFileName('a/b:c*?"<>|d', 2, 'image')).toBe('a b c d-3.png')
    expect(entityImageFileName('   ', 1, 'image')).toBe('image-2.png')
    expect(entityImageFileName('x'.repeat(200), 0, 'image')).toBe(`${'x'.repeat(60)}-1.png`)
  })

  it('fichier résolu : seule une data-URL image est affichable (stockage tout MIME)', () => {
    expect(isDisplayableImage(fakeImage(8))).toBe(true)
    expect(isDisplayableImage('data:image/png;base64,AAAA')).toBe(true)
    // Un pair référence le hash d'un PDF / d'un HTML dans une galerie : jamais affiché.
    expect(isDisplayableImage('data:application/pdf;base64,JVBERi0=')).toBe(false)
    expect(isDisplayableImage('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
    expect(isDisplayableImage(fakeHash(1))).toBe(false)
    expect(isDisplayableImage(null)).toBe(false)
    expect(isDisplayableImage(undefined)).toBe(false)
  })
})

describe('lib/entityImages — édition de la galerie', () => {
  const three = [{ hash: fakeHash(1) }, { hash: fakeHash(2) }, { hash: fakeHash(3) }]

  it('ajout en fin : doublons et dépassement comptés, jamais plus de 12', () => {
    const result = appendEntityImages(three, [{ hash: fakeHash(2) }, { hash: fakeHash(4) }])
    expect(result.images.map((image) => image.hash)).toEqual([fakeHash(1), fakeHash(2), fakeHash(3), fakeHash(4)])
    expect(result).toMatchObject({ added: 1, duplicates: 1, overflow: 0 })

    const full = Array.from({ length: MAX_ENTITY_IMAGES }, (_, i) => ({ hash: fakeHash(i) }))
    const over = appendEntityImages(full, [{ hash: fakeHash(90) }, { hash: fakeHash(91) }])
    expect(over.images).toHaveLength(MAX_ENTITY_IMAGES)
    expect(over).toMatchObject({ added: 0, overflow: 2 })
  })

  it('retirer / déplacer / couverture — sans muter l’entrée', () => {
    const before = three.map((image) => ({ ...image }))
    expect(applyEntityImageAction(three, { type: 'remove', hash: fakeHash(2) }).map((i) => i.hash)).toEqual([
      fakeHash(1),
      fakeHash(3)
    ])
    expect(applyEntityImageAction(three, { type: 'move', hash: fakeHash(1), delta: 1 }).map((i) => i.hash)).toEqual([
      fakeHash(2),
      fakeHash(1),
      fakeHash(3)
    ])
    expect(applyEntityImageAction(three, { type: 'move', hash: fakeHash(3), delta: -1 }).map((i) => i.hash)).toEqual([
      fakeHash(1),
      fakeHash(3),
      fakeHash(2)
    ])
    // Bornes : déplacer la première vers la gauche / la dernière vers la droite = inchangé.
    expect(applyEntityImageAction(three, { type: 'move', hash: fakeHash(1), delta: -1 })).toEqual(three)
    expect(applyEntityImageAction(three, { type: 'move', hash: fakeHash(3), delta: 5 })).toEqual(three)
    expect(applyEntityImageAction(three, { type: 'cover', hash: fakeHash(3) }).map((i) => i.hash)).toEqual([
      fakeHash(3),
      fakeHash(1),
      fakeHash(2)
    ])
    expect(applyEntityImageAction(three, { type: 'remove', hash: fakeHash(99) })).toEqual(three)
    expect(three).toEqual(before)
  })

  it('références de fichiers (copie) : hashes seulement, data-URL inline exclues', () => {
    expect(entityImageFileRefs([{ hash: fakeHash(1) }, { hash: fakeImage(8) }])).toEqual([fakeHash(1)])
    expect(entityImageFileRefs(undefined)).toEqual([])
  })

  it('collage ailleurs : retire les images indisponibles, garde l’inline', () => {
    const images = [{ hash: fakeHash(1) }, { hash: fakeHash(2) }, { hash: fakeImage(8) }]
    const kept = pruneUnavailableImages(images, (hash) => hash === fakeHash(2))
    expect(kept?.map((image) => image.hash)).toEqual([fakeHash(2), fakeImage(8)])
    expect(pruneUnavailableImages([{ hash: fakeHash(1) }], () => false)).toBeUndefined()
    expect(pruneUnavailableImages(undefined, () => true)).toBeUndefined()
  })

  it('export portable (inline) puis remplacement inline → hash à l’import', () => {
    const images = [{ hash: fakeHash(1), width: 10, height: 10 }, { hash: fakeHash(2) }]
    const inlined = inlineEntityImages(images, (hash) => (hash === fakeHash(1) ? fakeImage(8) : null))
    // Image incomplète retirée : jamais de référence pendante dans un fichier autonome.
    expect(inlined).toEqual([{ hash: fakeImage(8), width: 10, height: 10 }])
    expect(replaceEntityImageRef(inlined, fakeImage(8), fakeHash(5))).toEqual([
      { hash: fakeHash(5), width: 10, height: 10 }
    ])
    // Cible déjà présente : l'entrée inline disparaît (pas de doublon).
    expect(
      replaceEntityImageRef([{ hash: fakeHash(5) }, { hash: fakeImage(8) }], fakeImage(8), fakeHash(5))
    ).toEqual([{ hash: fakeHash(5) }])
  })
})

describe('modèle Yjs (sync/model) — galerie d’entité', () => {
  it('aller-retour Y.Map : ordre et dimensions conservés, copie profonde', () => {
    const images = [{ hash: fakeHash(1), width: 640, height: 480 }, { hash: fakeHash(2) }]
    const node = entityNode(images)
    const map = nodeToYMap(node)
    const doc = new Y.Doc()
    getNodesMap(doc).set(node.id, map)
    const round = yMapToNode(node.id, getNodesMap(doc).get(node.id)!)
    expect(round.images).toEqual(images)
    expect(round.images).not.toBe(images)
  })

  it('pas de clé `images` écrite pour une galerie vide ou un nœud non-entité', () => {
    const doc = new Y.Doc()
    const empty = entityNode([])
    getNodesMap(doc).set(empty.id, nodeToYMap(empty))
    expect(getNodesMap(doc).get(empty.id)!.has('images')).toBe(false)
    const text: BoardNodeData = { ...entityNode([{ hash: fakeHash(1) }]), kind: 'text' }
    const map = nodeToYMap(text)
    getNodesMap(doc).set(text.id, map)
    expect(map.has('images')).toBe(false)
    expect(yMapToNode(text.id, map).images).toBeUndefined()
  })

  it('valeur distante hostile assainie (type faux, entrées invalides, liste géante)', () => {
    const doc = new Y.Doc()
    const node = entityNode()
    const map = nodeToYMap(node)
    getNodesMap(doc).set(node.id, map)
    map.set('images', 'pas une liste')
    expect(yMapToNode(node.id, map).images).toBeUndefined()
    map.set('images', [{ hash: '<img onerror>' }, { hash: fakeHash(1), width: 'x' }, 7])
    expect(yMapToNode(node.id, map).images).toEqual([{ hash: fakeHash(1) }])
    map.set('images', Array.from({ length: 500 }, (_, i) => ({ hash: fakeHash(i) })))
    expect(yMapToNode(node.id, map).images).toHaveLength(MAX_ENTITY_IMAGES)
  })

  it('image unique héritée (clés imageHash/imageWidth/imageHeight) → galerie', () => {
    const doc = new Y.Doc()
    const node = entityNode()
    const map = nodeToYMap(node)
    getNodesMap(doc).set(node.id, map)
    map.set('imageHash', fakeHash(3))
    map.set('imageWidth', 300)
    map.set('imageHeight', 150)
    expect(yMapToNode(node.id, map).images).toEqual([{ hash: fakeHash(3), width: 300, height: 150 }])
  })
})

describe('visionneuse — ouverture depuis l’état fermé (§2 v1.9)', () => {
  it('open(X) garde nodeId : le nœud relu pour X a des images → pas d’auto-fermeture', () => {
    const handle = makeHandle()
    const id = createNode(handle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'alice')
    addEntityImages(handle, id, [{ hash: fakeHash(1) }, { hash: fakeHash(2) }], 'alice')
    const store = useEntityLightbox.getState()
    store.close()
    expect(useEntityLightbox.getState().nodeId).toBeNull()
    useEntityLightbox.getState().open(id, 1)
    const { nodeId, index } = useEntityLightbox.getState()
    expect(nodeId).toBe(id)
    expect(index).toBe(1)
    // Premier rendu après open : lecture synchrone du document pour CET id.
    const node = readNode(handle, id)
    expect(lightboxImages(node)).toHaveLength(2)
    expect(lightboxShouldClose(nodeId, node)).toBe(false)
    // Un nœud en retard (null ou autre id) ne ferme pas, un nœud absent pour cet id oui.
    const other = createNode(handle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'alice')
    expect(lightboxShouldClose(nodeId, readNode(handle, other))).toBe(false)
    expect(lightboxShouldClose(null, null)).toBe(false)
    useEntityLightbox.getState().close()
  })

  it('ferme quand l’entité n’a plus d’image ou a disparu', () => {
    const handle = makeHandle()
    const id = createNode(handle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'alice')
    addEntityImages(handle, id, [{ hash: fakeHash(3) }], 'alice')
    expect(lightboxShouldClose(id, readNode(handle, id))).toBe(false)
    editEntityImages(handle, id, { type: 'remove', hash: fakeHash(3) }, 'alice')
    expect(lightboxShouldClose(id, readNode(handle, id))).toBe(true)
    expect(lightboxShouldClose(id, null)).toBe(true)
  })
})

describe('opérations (sync/boardOps) — galerie annulable', () => {
  it('ajoute en une transaction annulable, puis édite (couverture / retrait)', () => {
    const handle = makeHandle()
    const id = createNode(handle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'alice')
    handle.undo.clear()
    const outcome = addEntityImages(handle, id, [{ hash: fakeHash(1) }, { hash: fakeHash(2) }], 'bob')
    expect(outcome).toMatchObject({ added: 2, duplicates: 0, overflow: 0 })
    expect(readNode(handle, id).images?.map((i) => i.hash)).toEqual([fakeHash(1), fakeHash(2)])
    expect(readNode(handle, id).updatedBy).toBe('bob')

    editEntityImages(handle, id, { type: 'cover', hash: fakeHash(2) }, 'bob')
    expect(readNode(handle, id).images?.map((i) => i.hash)).toEqual([fakeHash(2), fakeHash(1)])
    editEntityImages(handle, id, { type: 'remove', hash: fakeHash(2) }, 'bob')
    expect(readNode(handle, id).images?.map((i) => i.hash)).toEqual([fakeHash(1)])

    handle.undo.undo()
    expect(readNode(handle, id).images?.map((i) => i.hash)).toEqual([fakeHash(2), fakeHash(1)])
    handle.undo.undo()
    handle.undo.undo()
    expect(readNode(handle, id).images).toBeUndefined()
  })

  it('vider la galerie retire la clé ; la 1re écriture purge l’image unique héritée', () => {
    const handle = makeHandle()
    const id = createNode(handle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'alice')
    const map = getNodesMap(handle.doc).get(id)!
    map.set('imageHash', fakeHash(7))
    map.set('imageWidth', 100)
    map.set('imageHeight', 50)
    addEntityImages(handle, id, [{ hash: fakeHash(8) }], 'alice')
    expect(map.has('imageHash')).toBe(false)
    expect(map.has('imageWidth')).toBe(false)
    expect(readNode(handle, id).images).toEqual([{ hash: fakeHash(7), width: 100, height: 50 }, { hash: fakeHash(8) }])
    editEntityImages(handle, id, { type: 'remove', hash: fakeHash(7) }, 'alice')
    editEntityImages(handle, id, { type: 'remove', hash: fakeHash(8) }, 'alice')
    expect(map.has('images')).toBe(false)
    expect(readNode(handle, id).images).toBeUndefined()
  })

  it('refuse un nœud non-entité ; un doublon seul n’écrit rien', () => {
    const handle = makeHandle()
    const text = createNode(handle, { kind: 'text', x: 0, y: 0 }, 'alice')
    expect(addEntityImages(handle, text, [{ hash: fakeHash(1) }], 'alice')).toBeNull()
    expect(addEntityImages(handle, 'absent', [{ hash: fakeHash(1) }], 'alice')).toBeNull()
    const id = createNode(handle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'alice')
    addEntityImages(handle, id, [{ hash: fakeHash(1) }], 'alice')
    const before = readNode(handle, id).updatedAt
    const again = addEntityImages(handle, id, [{ hash: fakeHash(1) }], 'bob')
    expect(again).toMatchObject({ added: 0, duplicates: 1 })
    expect(readNode(handle, id).updatedBy).toBe('alice')
    expect(readNode(handle, id).updatedAt).toBe(before)
  })

  it('dupliquer une entité copie sa galerie (mêmes fichiers, liste indépendante)', () => {
    const handle = makeHandle()
    const id = createNode(handle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'alice')
    addEntityImages(handle, id, [{ hash: fakeHash(1) }, { hash: fakeHash(2) }], 'alice')
    const [copy] = duplicateNodes(handle, [id], 'alice')
    expect(readNode(handle, copy).images?.map((i) => i.hash)).toEqual([fakeHash(1), fakeHash(2)])
    editEntityImages(handle, copy, { type: 'remove', hash: fakeHash(1) }, 'alice')
    expect(readNode(handle, id).images).toHaveLength(2)
  })
})

describe('.trace — export portable puis import re-découpé en chunks', () => {
  it('inline chaque image à l’export, retire l’incomplète, re-chunke à l’import (ordre gardé)', async () => {
    const source = makeHandle()
    const first = fakeImage(70_000, 'B')
    const second = fakeImage(1_000, 'C')
    const h1 = (await registerFile(source, first, { width: 800, height: 600 }))!
    const h2 = (await registerFile(source, second))!
    const id = createNode(source, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'alice')
    addEntityImages(
      source,
      id,
      [{ hash: h1, width: 800, height: 600 }, { hash: fakeHash(9) }, { hash: h2 }],
      'alice'
    )

    // §2 v1.9 — l'image jamais reçue est comptée (toast à l'export).
    expect(countUnexportableEntityImages(source.doc)).toBe(1)
    const trace = exportBoardData(source.doc, 1)
    const exported = trace.nodes.find((node) => node.id === id)!
    // Hash sans fichier (jamais reçu) retiré ; les autres deviennent des data-URL.
    expect(exported.images).toEqual([{ hash: first, width: 800, height: 600 }, { hash: second }])

    const parsed = parseTrace(serializeTrace(trace))
    const target = makeHandle()
    importTraceIntoDoc(parsed, target.doc)
    expect(readNode(target, id).images?.map((i) => i.hash)).toEqual([first, second])
    await migrateInlineImages(target)
    const migrated = readNode(target, id).images!
    expect(migrated.map((i) => i.hash)).toEqual([h1, h2])
    expect(migrated[0]).toMatchObject({ width: 800, height: 600 })
    expect(hasCompleteFile(target.doc, h1)).toBe(true)
    const status = readFileStatus(target.doc, h2)
    expect(status.status === 'complete' && status.dataUrl).toBe(second)
  })

  it('un .trace du build de travail (image unique `imageHash`) est relu en galerie', () => {
    const raw = { ...entityNode(), imageHash: fakeImage(16), imageWidth: 20, imageHeight: 10 }
    const node = sanitizeNode(raw)
    expect(node?.images).toEqual([{ hash: fakeImage(16), width: 20, height: 10 }])
  })
})

describe('copier-coller (fragment) — galerie embarquée', () => {
  it('le fragment sérialisé conserve la galerie ; le remappage la copie en profondeur', () => {
    const images = [{ hash: fakeHash(1), width: 64, height: 32 }, { hash: fakeHash(2) }]
    const node = entityNode(images)
    const clip = buildClip([node], [], [{ hash: fakeHash(1), dataUrl: fakeImage(8) }], 'nonce-1')
    const parsed = parseClip(serializeClip(clip))!
    expect(parsed.nodes[0].images).toEqual(images)
    expect(parsed.files).toEqual([{ hash: fakeHash(1), dataUrl: fakeImage(8) }])
    const remapped = remapClip(parsed, { dx: 5, dy: 5 }, 'bob', 99)
    expect(remapped.nodes[0].id).not.toBe(node.id)
    expect(remapped.nodes[0].images).toEqual(images)
    expect(remapped.nodes[0].images).not.toBe(parsed.nodes[0].images)
    expect(remapped.nodes[0].images![0]).not.toBe(parsed.nodes[0].images![0])
  })

  it('un fragment collé hostile ne fait passer aucune référence invalide', () => {
    const hostile = {
      format: 'cosint-clip',
      version: 1,
      nonce: 'x',
      nodes: [{ ...entityNode(), images: [{ hash: 'javascript:alert(1)' }, { hash: fakeHash(3) }] }],
      edges: [],
      files: []
    }
    const parsed = parseClip(JSON.stringify(hostile))!
    expect(parsed.nodes[0].images).toEqual([{ hash: fakeHash(3) }])
  })
})

describe('réplication P2P et rôles — galerie d’entité', () => {
  /** Couple de documents « connectés » (cf. roles.test.ts) : `remote` → `local` avec
   *  l'origine provider (transaction distante filtrée par le garde de rôle). */
  function connectedPair(remoteUserId: string): { local: Y.Doc; remote: Y.Doc; uninstall: () => void } {
    const local = new Y.Doc()
    const remote = new Y.Doc()
    const provider = { tag: 'provider' }
    const awareness = {
      getStates: () => new Map([[remote.clientID, { user: { id: remoteUserId } }]])
    }
    const uninstall = installRoleGuard({ doc: local, provider, awareness } as unknown as BoardHandle)
    remote.on('update', (update: Uint8Array) => Y.applyUpdate(local, update, provider))
    local.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== remote) Y.applyUpdate(remote, update, remote)
    })
    return { local, remote, uninstall }
  }

  it('un ÉDITEUR distant ajoute/réordonne des images : la galerie se réplique', () => {
    const { local, remote, uninstall } = connectedPair('user-editor')
    getMetaMap(local).set('adminId', 'user-admin')
    const localHandle = { doc: local } as unknown as BoardHandle
    const remoteHandle = { doc: remote } as unknown as BoardHandle
    const id = createNode(localHandle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'admin')
    addEntityImages(remoteHandle, id, [{ hash: fakeHash(1) }, { hash: fakeHash(2) }], 'E')
    editEntityImages(remoteHandle, id, { type: 'cover', hash: fakeHash(2) }, 'E')
    expect(yMapToNode(id, getNodesMap(local).get(id)!).images?.map((i) => i.hash)).toEqual([
      fakeHash(2),
      fakeHash(1)
    ])
    uninstall()
  })

  it('un VISITEUR distant ne peut pas modifier la galerie (révoqué à la réception)', () => {
    const { local, remote, uninstall } = connectedPair('user-visitor')
    getMetaMap(local).set('adminId', 'user-admin')
    getRolesMap(local).set('user-visitor', 'visitor')
    const localHandle = { doc: local } as unknown as BoardHandle
    const remoteHandle = { doc: remote } as unknown as BoardHandle
    const id = createNode(localHandle, { kind: 'entity', x: 0, y: 0, entityType: 'person' }, 'admin')
    addEntityImages(localHandle, id, [{ hash: fakeHash(1) }], 'admin')
    addEntityImages(remoteHandle, id, [{ hash: fakeHash(9) }], 'V')
    editEntityImages(remoteHandle, id, { type: 'remove', hash: fakeHash(1) }, 'V')
    expect(yMapToNode(id, getNodesMap(local).get(id)!).images).toEqual([{ hash: fakeHash(1) }])
    uninstall()
  })
})

describe('lib/entityImages — état d’affichage de la couverture (nœud / galerie)', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo='
  const hash = 'a'.repeat(64)

  it('rien à afficher sans image', () => {
    expect(resolveEntityImageSrc(null, { status: 'missing' })).toEqual({ src: null, failed: false })
  })
  it('data-URL inline affichée directement ; inline non-image = échec', () => {
    expect(resolveEntityImageSrc(png, { status: 'missing' })).toEqual({ src: png, failed: false })
    expect(resolveEntityImageSrc('data:text/html;base64,PGI+', { status: 'missing' })).toEqual({
      src: null,
      failed: true
    })
  })
  it('fichier en cours de réception ou absent : ni image ni échec', () => {
    expect(resolveEntityImageSrc(hash, { status: 'loading' })).toEqual({ src: null, failed: false })
    expect(resolveEntityImageSrc(hash, { status: 'missing' })).toEqual({ src: null, failed: false })
  })
  it('fichier complet image → affiché ; complet non-image ou en erreur → échec', () => {
    expect(resolveEntityImageSrc(hash, { status: 'complete', dataUrl: png })).toEqual({ src: png, failed: false })
    expect(
      resolveEntityImageSrc(hash, { status: 'complete', dataUrl: 'data:application/pdf;base64,JVBE' })
    ).toEqual({ src: null, failed: true })
    expect(resolveEntityImageSrc(hash, { status: 'error' })).toEqual({ src: null, failed: true })
  })
})

describe('entityImageProgress (visionneuse : réception en cours)', () => {
  it('pourcentage entier borné pendant la réception', () => {
    expect(entityImageProgress({ status: 'loading', received: 0, total: 4 })).toBe(0)
    expect(entityImageProgress({ status: 'loading', received: 1, total: 3 })).toBe(33)
    expect(entityImageProgress({ status: 'loading', received: 9, total: 4 })).toBe(100)
    expect(entityImageProgress({ status: 'loading', received: -2, total: 4 })).toBe(0)
  })
  it('null hors réception ou compteurs invalides (données de pair)', () => {
    expect(entityImageProgress({ status: 'complete' })).toBeNull()
    expect(entityImageProgress({ status: 'missing' })).toBeNull()
    expect(entityImageProgress({ status: 'error' })).toBeNull()
    expect(entityImageProgress({ status: 'loading', received: 1, total: 0 })).toBeNull()
    expect(entityImageProgress({ status: 'loading', received: NaN, total: 4 })).toBeNull()
    expect(entityImageProgress({ status: 'loading', received: 1, total: Infinity })).toBeNull()
  })
})
