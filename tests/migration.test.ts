/**
 * Tests de migration .trace v1 → v1.1 (§7) : un fichier version 1 (couleurs
 * nommées, connexions sans relation/direction, meta sans mode d'accès) est
 * migré au vol par parseTrace ; les fichiers version 2 (entités, sources)
 * survivent à un aller-retour serialize/parse à l'identique.
 */
import { describe, expect, it } from 'vitest'
import type { BoardEdgeData, BoardNodeData } from '@/types'
import { normalizeEntityType } from '@/lib/taxonomy'
import {
  TRACE_FORMAT,
  TRACE_VERSION,
  parseTrace,
  serializeTrace,
  type TraceFile
} from '@/lib/serialization'

describe('normalizeEntityType — migration v1.1 → v1.2 des types', () => {
  it('mappe les anciens types v1.1 vers les ids de taxonomie v1.2', () => {
    expect(normalizeEntityType('domain')).toBe('domain_name')
    expect(normalizeEntityType('phone')).toBe('phone_number')
    expect(normalizeEntityType('email')).toBe('email_address')
    expect(normalizeEntityType('social')).toBe('account_profile')
    expect(normalizeEntityType('vehicle')).toBe('ground_vehicle')
    expect(normalizeEntityType('person')).toBe('person')
  })

  it('accepte les ids v1.2 déjà valides et retombe sur generic_other sinon', () => {
    expect(normalizeEntityType('wallet')).toBe('wallet')
    expect(normalizeEntityType('type_inexistant')).toBe('generic_other')
    expect(normalizeEntityType(42)).toBe('generic_other')
  })

  it('ne renvoie jamais un membre du prototype d’Object (anti-pollution)', () => {
    for (const key of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(normalizeEntityType(key)).toBe('generic_other')
    }
  })
})
import { colorHex, DEFAULT_NODE_COLOR } from '@/lib/colors'

/** Data-URL d'un PNG 1×1 (image factice). */
const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** Nœud au format v1 : pas de `fields`, couleur nommée. */
function v1Node(
  id: string,
  kind: string,
  color: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    kind,
    x: 10,
    y: 20,
    width: 260,
    height: 150,
    content: '',
    title: '',
    color,
    tags: [],
    createdBy: 'alice',
    createdAt: 1_000,
    updatedBy: 'bob',
    updatedAt: 2_000,
    ...extra
  }
}

/** Connexion au format v1 : ni relationType, ni direction. */
function v1Edge(id: string, source: string, target: string, color: string): Record<string, unknown> {
  return {
    id,
    source,
    target,
    label: 'lié à',
    style: 'dashed',
    color,
    createdBy: 'alice',
    createdAt: 1_500,
    updatedBy: 'alice',
    updatedAt: 1_500
  }
}

/** JSON d'un fichier .trace version 1 complet (meta sans accessMode). */
function buildV1Json(): string {
  return JSON.stringify({
    format: 'cosint-trace',
    version: 1,
    exportedAt: 9_000,
    meta: { title: 'Enquête v1', createdAt: 42, createdBy: 'alice' },
    nodes: [
      v1Node('n1', 'text', 'gray', { content: '# Piste A' }),
      v1Node('n2', 'link', 'red', { content: 'https://exemple.org', title: 'Site suspect' }),
      v1Node('n3', 'image', 'blue', { content: DATA_URL, width: 320, height: 240 }),
      v1Node('n4', 'group', 'blue', { title: 'Cellule B', width: 420, height: 300 })
    ],
    edges: [v1Edge('e1', 'n1', 'n2', 'red'), v1Edge('e2', 'n2', 'n3', 'gray')],
    comments: []
  })
}

describe('parseTrace — migration v1 → v1.1', () => {
  it('remonte la version du fichier à la version courante (7)', () => {
    const parsed = parseTrace(buildV1Json())
    expect(parsed.format).toBe(TRACE_FORMAT)
    expect(parsed.version).toBe(7)
    expect(parsed.version).toBe(TRACE_VERSION)
  })

  it('migre les couleurs nommées vers leur hex', () => {
    const parsed = parseTrace(buildV1Json())
    const byId = new Map(parsed.nodes.map((node) => [node.id, node]))
    expect(byId.get('n1')?.color).toBe('#8a94a6') // gray
    expect(byId.get('n2')?.color).toBe('#ef4444') // red
    expect(byId.get('n3')?.color).toBe('#3b82f6') // blue
    expect(byId.get('n4')?.color).toBe('#3b82f6')
    expect(parsed.edges.find((edge) => edge.id === 'e1')?.color).toBe('#ef4444')
    expect(parsed.edges.find((edge) => edge.id === 'e2')?.color).toBe('#8a94a6')
  })

  it('complète chaque connexion : relationType vide et direction none', () => {
    const parsed = parseTrace(buildV1Json())
    expect(parsed.edges).toHaveLength(2)
    for (const edge of parsed.edges) {
      expect(edge.relationType).toBe('')
      expect(edge.direction).toBe('none')
    }
    // Les champs v1 restent intacts.
    expect(parsed.edges.find((edge) => edge.id === 'e1')?.label).toBe('lié à')
    expect(parsed.edges.find((edge) => edge.id === 'e1')?.style).toBe('dashed')
  })

  it('donne à chaque nœud un tableau fields vide', () => {
    const parsed = parseTrace(buildV1Json())
    expect(parsed.nodes).toHaveLength(4)
    for (const node of parsed.nodes) {
      expect(node.fields).toEqual([])
    }
  })

  it('meta : mode d’accès « open » par défaut et journal vide', () => {
    const parsed = parseTrace(buildV1Json())
    expect(parsed.meta.accessMode).toBe('open')
    expect(parsed.meta.accessLog).toEqual([])
    // Les métadonnées v1 sont conservées.
    expect(parsed.meta.title).toBe('Enquête v1')
    expect(parsed.meta.createdAt).toBe(42)
    expect(parsed.meta.createdBy).toBe('alice')
  })
})

describe('parseTrace — version 2 (entités et sources)', () => {
  const entity: BoardNodeData = {
    id: 'ent1',
    kind: 'entity',
    entityType: 'person',
    x: 0,
    y: 0,
    width: 280,
    height: 220,
    content: '',
    title: 'John Doe',
    color: '#3b82f6',
    tags: ['cible'],
    fields: [
      { id: 'f1', label: 'Alias', kind: 'text', value: 'JD', updatedBy: 'alice', updatedAt: 10 },
      {
        id: 'f2',
        label: 'Profil',
        kind: 'url',
        value: 'https://exemple.org/jd',
        updatedBy: 'bob',
        updatedAt: 20
      }
    ],
    createdBy: 'alice',
    createdAt: 1,
    updatedBy: 'bob',
    updatedAt: 2
  }

  const source: BoardNodeData = {
    id: 'src1',
    kind: 'source',
    sourceType: 'website',
    reliability: 'B',
    credibility: '2',
    x: 100,
    y: 100,
    width: 280,
    height: 180,
    content: 'https://exemple.org/rapport',
    title: 'Rapport annuel',
    color: '#10b981',
    tags: [],
    fields: [
      {
        id: 'f3',
        label: 'Description',
        kind: 'longtext',
        value: 'Rapport public 2025',
        updatedBy: 'alice',
        updatedAt: 30
      }
    ],
    createdBy: 'alice',
    createdAt: 3,
    updatedBy: 'alice',
    updatedAt: 4
  }

  const edge: BoardEdgeData = {
    id: 'e1',
    source: 'ent1',
    target: 'src1',
    label: 'source',
    relationType: 'source',
    style: 'dashed',
    direction: 'single',
    width: 'normal',
    pathType: 'bezier',
    color: '#10b981',
    createdBy: 'alice',
    createdAt: 5,
    updatedBy: 'alice',
    updatedAt: 5
  }

  const trace: TraceFile = {
    format: TRACE_FORMAT,
    version: TRACE_VERSION,
    exportedAt: 5_000,
    meta: {
      title: 'Enquête v1.1',
      createdAt: 42,
      createdBy: 'alice',
      accessMode: 'approval',
      accessLog: [{ mode: 'approval', by: 'alice', at: 43 }],
      adminId: 'user-alice',
      participantLimit: 5,
      shareRevocation: ''
    },
    nodes: [entity, source],
    edges: [edge],
    comments: []
  }

  it('aller-retour serialize → parse : entité et source préservées à l’identique', () => {
    const parsed = parseTrace(serializeTrace(trace))
    expect(parsed).toEqual(trace)
  })

  it('conserve les champs structurés, le sous-type et les cotations', () => {
    const parsed = parseTrace(serializeTrace(trace))
    const parsedEntity = parsed.nodes.find((node) => node.id === 'ent1')
    const parsedSource = parsed.nodes.find((node) => node.id === 'src1')
    expect(parsedEntity?.entityType).toBe('person')
    expect(parsedEntity?.fields).toEqual(entity.fields)
    expect(parsedSource?.sourceType).toBe('website')
    expect(parsedSource?.reliability).toBe('B')
    expect(parsedSource?.credibility).toBe('2')
    expect(parsed.edges[0].relationType).toBe('source')
    expect(parsed.edges[0].direction).toBe('single')
  })
})

describe('parseTrace — migration v1.6 (v4) → v1.7 (v5) : date d’événement', () => {
  function makeNode(overrides: Partial<BoardNodeData> = {}): BoardNodeData {
    return {
      id: 'n1',
      kind: 'entity',
      x: 0,
      y: 0,
      width: 260,
      height: 190,
      content: '',
      title: 'Alice',
      color: '#3b82f6',
      tags: [],
      entityType: 'person',
      fields: [],
      createdBy: 'a',
      createdAt: 1,
      updatedBy: 'a',
      updatedAt: 1,
      ...overrides
    }
  }

  it('un fichier v4 SANS eventDate s’ouvre (version remontée à 5, champ undefined)', () => {
    const v4 = JSON.stringify({
      format: TRACE_FORMAT,
      version: 4,
      exportedAt: 0,
      meta: { title: 'v4', createdAt: 0, createdBy: 'a', accessMode: 'open' },
      nodes: [makeNode()],
      edges: [],
      comments: []
    })
    const parsed = parseTrace(v4)
    expect(parsed.version).toBe(TRACE_VERSION)
    expect(parsed.nodes[0].eventDate).toBeUndefined()
  })

  it('aller-retour : eventDate présent est préservé', () => {
    const trace: TraceFile = {
      format: TRACE_FORMAT,
      version: TRACE_VERSION,
      exportedAt: 0,
      meta: {
        title: 'v5',
        createdAt: 0,
        createdBy: 'a',
        accessMode: 'open',
        accessLog: [],
        adminId: '',
        participantLimit: 5,
        shareRevocation: ''
      },
      nodes: [makeNode({ eventDate: 1_700_000_000_000 })],
      edges: [],
      comments: []
    }
    const parsed = parseTrace(serializeTrace(trace))
    expect(parsed.nodes[0].eventDate).toBe(1_700_000_000_000)
  })

  it('ignore un eventDate non numérique', () => {
    const bad = JSON.stringify({
      format: TRACE_FORMAT,
      version: 5,
      exportedAt: 0,
      meta: { title: 'x', createdAt: 0, createdBy: 'a', accessMode: 'open' },
      nodes: [{ ...makeNode(), eventDate: 'hier' }],
      edges: [],
      comments: []
    })
    expect(parseTrace(bad).nodes[0].eventDate).toBeUndefined()
  })
})

describe('colorHex', () => {
  it('traduit un nom de couleur v1 vers son hex', () => {
    expect(colorHex('gray')).toBe('#8a94a6')
  })

  it('normalise un hex majuscule en minuscules', () => {
    expect(colorHex('#ABCDEF')).toBe('#abcdef')
  })

  it('retombe sur le gris par défaut pour une valeur inconnue', () => {
    expect(colorHex('magenta')).toBe(DEFAULT_NODE_COLOR)
    expect(colorHex('')).toBe(DEFAULT_NODE_COLOR)
  })

  it('étend un hex court #abc en #aabbcc', () => {
    expect(colorHex('#abc')).toBe('#aabbcc')
  })
})
