import { describe, it, expect } from 'vitest'
import type { BoardEdgeData, BoardNodeData } from '@/types'
import {
  buildClip,
  clipBounds,
  detectPastedText,
  parseClip,
  remapClip,
  serializeClip
} from '@/lib/clipboard'

function makeNode(overrides: Partial<BoardNodeData> = {}): BoardNodeData {
  return {
    id: overrides.id ?? 'n1',
    kind: overrides.kind ?? 'entity',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 260,
    height: overrides.height ?? 190,
    content: overrides.content ?? '',
    title: overrides.title ?? 'Alice',
    color: overrides.color ?? '#3b82f6',
    tags: overrides.tags ?? [],
    entityType: overrides.entityType ?? 'person',
    fields: overrides.fields ?? [
      { id: 'f1', label: 'Email', kind: 'email', value: 'a@ex.com', updatedBy: 'x', updatedAt: 1 }
    ],
    createdBy: 'x',
    createdAt: 1,
    updatedBy: 'x',
    updatedAt: 1,
    ...overrides
  }
}

function makeEdge(overrides: Partial<BoardEdgeData> = {}): BoardEdgeData {
  return {
    id: overrides.id ?? 'e1',
    source: overrides.source ?? 'n1',
    target: overrides.target ?? 'n2',
    label: overrides.label ?? 'ami',
    relationType: overrides.relationType ?? 'associated',
    style: overrides.style ?? 'solid',
    direction: overrides.direction ?? 'single',
    width: overrides.width ?? 'normal',
    pathType: overrides.pathType ?? 'bezier',
    color: overrides.color ?? '#8a94a6',
    createdBy: 'x',
    createdAt: 1,
    updatedBy: 'x',
    updatedAt: 1,
    ...overrides
  }
}

describe('lib/clipboard — sérialisation d’une sélection (§2 v1.7)', () => {
  it('aller-retour buildClip → serializeClip → parseClip conserve nœuds et liens', () => {
    const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2', title: 'Bob' })]
    const edges = [makeEdge({ id: 'e1', source: 'n1', target: 'n2' })]
    const clip = buildClip(nodes, edges, [], 'nonce-1')
    const parsed = parseClip(serializeClip(clip))
    expect(parsed).not.toBeNull()
    expect(parsed!.nodes).toHaveLength(2)
    expect(parsed!.edges).toHaveLength(1)
    expect(parsed!.nonce).toBe('nonce-1')
    expect(parsed!.edges[0].label).toBe('ami')
    expect(parsed!.nodes[0].fields[0].value).toBe('a@ex.com')
  })

  it('écarte un lien dont une extrémité n’est pas dans la sélection', () => {
    const nodes = [makeNode({ id: 'n1' })]
    const edges = [makeEdge({ id: 'e1', source: 'n1', target: 'absent' })]
    const parsed = parseClip(serializeClip(buildClip(nodes, edges, [], 'n')))
    expect(parsed!.nodes).toHaveLength(1)
    expect(parsed!.edges).toHaveLength(0)
  })

  it('retourne null pour un texte non-COSINT', () => {
    expect(parseClip('bonjour')).toBeNull()
    expect(parseClip('{"format":"autre"}')).toBeNull()
    expect(parseClip('{ pas du json')).toBeNull()
  })

  it('remapClip régénère les ids, décale et remappe les liens', () => {
    const nodes = [makeNode({ id: 'n1', x: 100, y: 100 }), makeNode({ id: 'n2', x: 200, y: 100 })]
    const edges = [
      makeEdge({ id: 'e1', source: 'n1', target: 'n2', waypoints: [{ x: 150, y: 150 }] })
    ]
    const clip = buildClip(nodes, edges, [], 'n')
    const remapped = remapClip(clip, { dx: 10, dy: 20 }, 'moi', 999)
    // Nouveaux ids (nœuds ET champs).
    expect(remapped.nodes[0].id).not.toBe('n1')
    expect(remapped.nodes[0].fields[0].id).not.toBe('f1')
    // Décalage appliqué.
    expect(remapped.nodes[0].x).toBe(110)
    expect(remapped.nodes[0].y).toBe(120)
    // Auteur/horodatage à l’auteur local.
    expect(remapped.nodes[0].createdBy).toBe('moi')
    expect(remapped.nodes[0].createdAt).toBe(999)
    // Lien remappé vers les nouveaux ids + waypoint translaté.
    expect(remapped.edges).toHaveLength(1)
    expect(remapped.edges[0].source).toBe(remapped.nodes[0].id)
    expect(remapped.edges[0].target).toBe(remapped.nodes[1].id)
    expect(remapped.edges[0].waypoints).toEqual([{ x: 160, y: 170 }])
  })

  it('clipBounds calcule la boîte englobante', () => {
    const bounds = clipBounds([
      makeNode({ id: 'a', x: 0, y: 0, width: 100, height: 50 }),
      makeNode({ id: 'b', x: 200, y: 100, width: 100, height: 50 })
    ])
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 150 })
  })
})

describe('lib/clipboard — détection du texte collé (§2)', () => {
  it('détecte e-mail, téléphone, URL, texte', () => {
    expect(detectPastedText('contact@example.com').kind).toBe('email')
    expect(detectPastedText('https://example.com/a').kind).toBe('link')
    expect(detectPastedText('www.example.com').kind).toBe('link')
    expect(detectPastedText('+33 6 12 34 56 78').kind).toBe('phone')
    expect(detectPastedText('Une note libre.').kind).toBe('text')
    // Un texte multi-lignes reste une note même s’il contient une URL.
    expect(detectPastedText('ligne 1\nhttps://x.com').kind).toBe('text')
  })

  it('une IPv4 ou une date ISO ne sont pas classées comme téléphone', () => {
    expect(detectPastedText('192.168.1.1').kind).toBe('text')
    expect(detectPastedText('2024-01-15').kind).toBe('text')
    // Un vrai numéro reste détecté.
    expect(detectPastedText('01 23 45 67 89').kind).toBe('phone')
  })
})
