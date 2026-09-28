/**
 * Tests du modèle CRDT v1.1 (§3, §4) : aller-retour des nœuds entité/source et
 * des connexions enrichies à travers un Y.Doc en mémoire (aucun réseau), et
 * assainissement des champs de fiche (sanitizeField).
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { BoardEdgeData, BoardNodeData } from '@/types'
import {
  edgeToYMap,
  getEdgesMap,
  getNodesMap,
  nodeToYMap,
  sanitizeField,
  yMapToEdge,
  yMapToNode
} from '@/sync/model'
import { resolveNodeIcon } from '@/lib/entities'

/** Écrit un nœud dans un Y.Doc neuf puis le relit (aller-retour CRDT). */
function nodeRoundTrip(node: BoardNodeData): BoardNodeData {
  const doc = new Y.Doc()
  doc.transact(() => {
    getNodesMap(doc).set(node.id, nodeToYMap(node))
  })
  const stored = getNodesMap(doc).get(node.id)
  if (!stored) throw new Error('nœud absent du document')
  return yMapToNode(node.id, stored)
}

/** Idem pour une connexion. */
function edgeRoundTrip(edge: BoardEdgeData): BoardEdgeData {
  const doc = new Y.Doc()
  doc.transact(() => {
    getEdgesMap(doc).set(edge.id, edgeToYMap(edge))
  })
  const stored = getEdgesMap(doc).get(edge.id)
  if (!stored) throw new Error('connexion absente du document')
  return yMapToEdge(edge.id, stored)
}

const ENTITY: BoardNodeData = {
  id: 'ent1',
  kind: 'entity',
  entityType: 'person',
  x: 12,
  y: 34,
  width: 280,
  height: 220,
  content: '',
  title: 'John Doe',
  color: '#3b82f6',
  tags: ['cible', 'prioritaire'],
  fields: [
    { id: 'f1', label: 'Alias', kind: 'text', value: 'JD', updatedBy: 'alice', updatedAt: 10 },
    { id: 'f2', label: 'Email', kind: 'email', value: 'jd@exemple.org', updatedBy: 'bob', updatedAt: 20 },
    { id: 'f3', label: 'Notes', kind: 'longtext', value: 'Vu sur le forum', updatedBy: 'alice', updatedAt: 30 }
  ],
  createdBy: 'alice',
  createdAt: 1_000,
  updatedBy: 'bob',
  updatedAt: 2_000
}

const SOURCE: BoardNodeData = {
  id: 'src1',
  kind: 'source',
  sourceType: 'website',
  reliability: 'B',
  credibility: '2',
  x: 200,
  y: 60,
  width: 280,
  height: 180,
  content: 'https://exemple.org/rapport',
  title: 'Rapport annuel',
  color: '#10b981',
  tags: [],
  fields: [
    {
      id: 'f4',
      label: 'Description',
      kind: 'longtext',
      value: 'Rapport public 2025',
      updatedBy: 'alice',
      updatedAt: 40
    }
  ],
  createdBy: 'alice',
  createdAt: 3_000,
  updatedBy: 'alice',
  updatedAt: 4_000
}

describe('nœud entité — aller-retour Y.Doc', () => {
  it('préserve entityType, fields et couleur', () => {
    const roundTripped = nodeRoundTrip(ENTITY)
    expect(roundTripped).toEqual(ENTITY)
    expect(roundTripped.entityType).toBe('person')
    expect(roundTripped.fields).toEqual(ENTITY.fields)
    expect(roundTripped.color).toBe('#3b82f6')
  })

  it('préserve la fiche après synchronisation entre deux documents', () => {
    // Simule la fusion P2P : le document A est encodé puis appliqué à B.
    const docA = new Y.Doc()
    docA.transact(() => {
      getNodesMap(docA).set(ENTITY.id, nodeToYMap(ENTITY))
    })
    const docB = new Y.Doc()
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))
    const stored = getNodesMap(docB).get(ENTITY.id)
    expect(stored).toBeDefined()
    expect(yMapToNode(ENTITY.id, stored as Y.Map<unknown>)).toEqual(ENTITY)
  })
})

describe('nœud source — aller-retour Y.Doc', () => {
  it('préserve sourceType, reliability, credibility et fields', () => {
    const roundTripped = nodeRoundTrip(SOURCE)
    expect(roundTripped).toEqual(SOURCE)
    expect(roundTripped.sourceType).toBe('website')
    expect(roundTripped.reliability).toBe('B')
    expect(roundTripped.credibility).toBe('2')
    expect(roundTripped.fields).toEqual(SOURCE.fields)
  })

  it('applique les valeurs par défaut si les cotations sont absentes', () => {
    const bare = nodeRoundTrip({ ...SOURCE, sourceType: undefined, reliability: undefined, credibility: undefined })
    expect(bare.sourceType).toBe('other')
    expect(bare.reliability).toBe('')
    expect(bare.credibility).toBe('')
  })
})

describe('connexion enrichie — aller-retour Y.Doc', () => {
  const EDGE: BoardEdgeData = {
    id: 'e1',
    source: 'ent1',
    target: 'src1',
    label: 'travaille pour',
    relationType: 'worksFor',
    style: 'dashed',
    direction: 'single',
    width: 'thick',
    pathType: 'step',
    color: '#ef4444',
    createdBy: 'alice',
    createdAt: 5_000,
    updatedBy: 'bob',
    updatedAt: 6_000
  }

  it('préserve relationType, direction, style et couleur', () => {
    const roundTripped = edgeRoundTrip(EDGE)
    expect(roundTripped).toEqual(EDGE)
    expect(roundTripped.relationType).toBe('worksFor')
    expect(roundTripped.direction).toBe('single')
    expect(roundTripped.style).toBe('dashed')
    expect(roundTripped.width).toBe('thick')
    expect(roundTripped.pathType).toBe('step')
    expect(roundTripped.color).toBe('#ef4444')
  })

  it('préserve les trois directions possibles', () => {
    for (const direction of ['none', 'single', 'double'] as const) {
      expect(edgeRoundTrip({ ...EDGE, direction }).direction).toBe(direction)
    }
  })

  it('normalise une couleur nommée v1 en hex à la relecture', () => {
    expect(edgeRoundTrip({ ...EDGE, color: 'red' }).color).toBe('#ef4444')
  })
})

describe('sanitizeField', () => {
  it('rejette un champ sans id', () => {
    expect(sanitizeField({ label: 'Alias', kind: 'text', value: 'JD' })).toBeNull()
    expect(sanitizeField({ id: '', label: 'Alias', kind: 'text', value: 'JD' })).toBeNull()
  })

  it('rejette les valeurs qui ne sont pas des objets', () => {
    expect(sanitizeField(null)).toBeNull()
    expect(sanitizeField('f1')).toBeNull()
    expect(sanitizeField(42)).toBeNull()
  })

  it("tolère un champ sans updatedBy (auteur remplacé par « ? »)", () => {
    const field = sanitizeField({ id: 'f1', label: 'Alias', kind: 'text', value: 'JD', updatedAt: 5 })
    expect(field).toEqual({
      id: 'f1',
      label: 'Alias',
      kind: 'text',
      value: 'JD',
      updatedBy: '?',
      updatedAt: 5
    })
  })

  it('retombe sur le kind « text » pour un kind inconnu', () => {
    const field = sanitizeField({ id: 'f1', label: 'Alias', kind: 'video', value: 'JD' })
    expect(field?.kind).toBe('text')
  })
})

describe('§6/§2 v1.9 — icône propre + image d’entité (aller-retour Y.Doc)', () => {
  it('préserve l’icône propre et la galerie d’images d’une entité (§2 v1.9)', () => {
    const node: BoardNodeData = {
      ...ENTITY,
      icon: 'Rocket',
      images: [
        { hash: 'PoRza6Rsulj7TTCtxfKK1a', width: 408, height: 232 },
        { hash: 'QqRza6Rsulj7TTCtxfKK1b' }
      ]
    }
    const round = nodeRoundTrip(node)
    expect(round.icon).toBe('Rocket')
    expect(round.images).toEqual([
      { hash: 'PoRza6Rsulj7TTCtxfKK1a', width: 408, height: 232 },
      { hash: 'QqRza6Rsulj7TTCtxfKK1b' }
    ])
    expect(round).toEqual(node)
  })

  it('rejette un nom d’icône invalide à la relecture', () => {
    expect(nodeRoundTrip({ ...ENTITY, icon: 'has space' }).icon).toBeUndefined()
    expect(nodeRoundTrip({ ...ENTITY, icon: '../x' }).icon).toBeUndefined()
  })

  it('resolveNodeIcon — l’override valide prime, sinon l’icône du type', () => {
    expect(resolveNodeIcon('Rocket', 'User')).toBe('Rocket')
    expect(resolveNodeIcon(undefined, 'User')).toBe('User')
    expect(resolveNodeIcon('', 'User')).toBe('User')
    expect(resolveNodeIcon('has space', 'User')).toBe('User')
    expect(resolveNodeIcon('x'.repeat(41), 'User')).toBe('User')
  })

  it('préserve un retour à la ligne dans une valeur de champ (§7 — pas de perte au round-trip)', () => {
    const multi: BoardNodeData = {
      ...ENTITY,
      fields: [
        { id: 'p', label: 'Téléphones', kind: 'phone', value: '0102030405\n0607080910', updatedBy: 'a', updatedAt: 1 }
      ]
    }
    expect(nodeRoundTrip(multi).fields[0].value).toBe('0102030405\n0607080910')
  })
})

describe('§5 v1.9 — nœud fichier (aller-retour Y.Doc)', () => {
  it('préserve kind « file », le hash (content) et le nom (title)', () => {
    const file: BoardNodeData = {
      id: 'file1',
      kind: 'file',
      x: 5,
      y: 5,
      width: 260,
      height: 96,
      content: 'AbCdEf0123456789xyz012',
      title: 'rapport.pdf',
      color: '#3b82f6',
      tags: [],
      fields: [],
      createdBy: 'alice',
      createdAt: 100,
      updatedBy: 'alice',
      updatedAt: 100
    }
    const round = nodeRoundTrip(file)
    expect(round.kind).toBe('file')
    expect(round.content).toBe('AbCdEf0123456789xyz012')
    expect(round.title).toBe('rapport.pdf')
    expect(round).toEqual(file)
  })
})
