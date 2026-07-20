/**
 * Tests de la sérialisation .trace (§7, §9.5) : aller-retour complet via des
 * Y.Doc en mémoire, rejet des fichiers invalides (messages français) et
 * assainissement des éléments corrompus à l'import.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { BoardComment, BoardEdgeData, BoardMeta, BoardNodeData } from '@/types'
import { colorHex, DEFAULT_NODE_COLOR } from '@/lib/colors'
import {
  TRACE_FORMAT,
  TRACE_VERSION,
  exportBoardData,
  importTraceIntoDoc,
  parseTrace,
  serializeTrace,
  type TraceFile
} from '@/lib/serialization'
import {
  edgeToYMap,
  getCommentsMap,
  getEdgesMap,
  getNodesMap,
  nodeToYMap,
  writeMeta,
  yMapToNode
} from '@/sync/model'

/** Data-URL d'un PNG 1×1 (image factice). */
const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const META: BoardMeta = {
  title: 'Enquête X',
  createdAt: 42,
  createdBy: 'alice',
  accessMode: 'open',
  accessLog: [],
  adminId: 'user-alice',
  participantLimit: 5,
  shareRevocation: ''
}

function makeNode(overrides: Partial<BoardNodeData> & { id: string }): BoardNodeData {
  return {
    kind: 'text',
    x: 10,
    y: 20,
    width: 260,
    height: 150,
    content: '',
    title: '',
    color: 'gray',
    tags: [],
    fields: [],
    createdBy: 'alice',
    createdAt: 1_000,
    updatedBy: 'bob',
    updatedAt: 2_000,
    ...overrides
  }
}

function makeEdge(
  overrides: Partial<BoardEdgeData> & { id: string; source: string; target: string }
): BoardEdgeData {
  return {
    label: '',
    relationType: '',
    style: 'solid',
    direction: 'none',
    width: 'normal',
    pathType: 'bezier',
    color: 'gray',
    createdBy: 'alice',
    createdAt: 1_500,
    updatedBy: 'alice',
    updatedAt: 1_500,
    ...overrides
  }
}

/** Construit un document représentatif : 5 nœuds (tous les types), 2 connexions, 2 commentaires. */
function buildSampleDoc(): Y.Doc {
  const doc = new Y.Doc()
  doc.transact(() => {
    const nodes = getNodesMap(doc)
    const edges = getEdgesMap(doc)
    const comments = getCommentsMap(doc)
    const allNodes: BoardNodeData[] = [
      makeNode({ id: 'n1', kind: 'text', content: '# Piste A', color: 'red', tags: ['osint', 'alpha'] }),
      makeNode({ id: 'n2', kind: 'link', content: 'https://exemple.org', title: 'Site suspect', color: 'blue' }),
      makeNode({ id: 'n3', kind: 'image', content: DATA_URL, color: 'green', width: 320, height: 240 }),
      makeNode({ id: 'n4', kind: 'timestamped', content: 'Vu à 14 h 05', color: 'purple', tags: ['terrain'] }),
      makeNode({ id: 'n5', kind: 'group', title: 'Cellule B', color: 'yellow', width: 420, height: 300 })
    ]
    for (const node of allNodes) nodes.set(node.id, nodeToYMap(node))
    const allEdges: BoardEdgeData[] = [
      makeEdge({ id: 'e1', source: 'n1', target: 'n2', label: 'pointe vers', style: 'dashed', color: 'orange' }),
      makeEdge({ id: 'e2', source: 'n2', target: 'n3', label: 'capture de', style: 'solid', color: 'cyan' })
    ]
    for (const edge of allEdges) edges.set(edge.id, edgeToYMap(edge))
    const allComments: BoardComment[] = [
      { id: 'c1', nodeId: 'n1', author: 'bob', text: 'À vérifier auprès de la source', createdAt: 3_000 },
      { id: 'c2', nodeId: 'n3', author: 'alice', text: 'Capturé sur le forum', createdAt: 4_000 }
    ]
    for (const comment of allComments) comments.set(comment.id, comment)
    writeMeta(doc, META)
  })
  return doc
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id))
}

/** Forme comparable : sans exportedAt, listes triées (l'ordre des Y.Map n'est pas garanti). */
function comparable(trace: TraceFile): Record<string, unknown> {
  return {
    format: trace.format,
    version: trace.version,
    meta: trace.meta,
    nodes: sortById(trace.nodes),
    edges: sortById(trace.edges),
    comments: sortById(trace.comments)
  }
}

/** Fabrique le JSON d'un .trace valide dont on contrôle nodes/edges/comments. */
function traceJson(partial: { nodes?: unknown[]; edges?: unknown[]; comments?: unknown[] }): string {
  return JSON.stringify({
    format: TRACE_FORMAT,
    version: TRACE_VERSION,
    exportedAt: 5_000,
    meta: META,
    nodes: partial.nodes ?? [],
    edges: partial.edges ?? [],
    comments: partial.comments ?? []
  })
}

describe('aller-retour export → .trace → import', () => {
  it('restitue un tableau identique (hors exportedAt)', () => {
    const source = buildSampleDoc()
    const exported = exportBoardData(source, 111)
    const json = serializeTrace(exported)
    const parsed = parseTrace(json)

    const target = new Y.Doc()
    importTraceIntoDoc(parsed, target, 'test-import')
    const reExported = exportBoardData(target, 222)

    expect(comparable(reExported)).toEqual(comparable(exported))
    expect(reExported.nodes).toHaveLength(5)
    expect(reExported.edges).toHaveLength(2)
    expect(reExported.comments).toHaveLength(2)
    expect(reExported.meta).toEqual(META)
  })

  it('conserve exportedAt à travers serialize/parse', () => {
    const parsed = parseTrace(serializeTrace(exportBoardData(buildSampleDoc(), 111)))
    expect(parsed.exportedAt).toBe(111)
  })

  it("préserve les data-URL d'images à l'identique", () => {
    const parsed = parseTrace(serializeTrace(exportBoardData(buildSampleDoc())))
    const target = new Y.Doc()
    importTraceIntoDoc(parsed, target)
    const image = exportBoardData(target).nodes.find((node) => node.kind === 'image')
    expect(image?.content).toBe(DATA_URL)
  })

  it('conserve les badges de statut des nœuds ET des liens (§3 v1.5)', () => {
    const doc = new Y.Doc()
    doc.transact(() => {
      const nodes = getNodesMap(doc)
      const edges = getEdgesMap(doc)
      nodes.set('n1', nodeToYMap(makeNode({ id: 'n1', status: 'confirmed' })))
      nodes.set('n2', nodeToYMap(makeNode({ id: 'n2', status: 'false_positive' })))
      nodes.set('n3', nodeToYMap(makeNode({ id: 'n3' }))) // sans badge
      edges.set(
        'e1',
        edgeToYMap(makeEdge({ id: 'e1', source: 'n1', target: 'n2', status: 'question' }))
      )
      writeMeta(doc, META)
    })

    const parsed = parseTrace(serializeTrace(exportBoardData(doc)))
    const target = new Y.Doc()
    importTraceIntoDoc(parsed, target)
    const result = exportBoardData(target)

    expect(result.nodes.find((node) => node.id === 'n1')?.status).toBe('confirmed')
    expect(result.nodes.find((node) => node.id === 'n2')?.status).toBe('false_positive')
    // Un nœud sans badge ne porte pas de champ `status` (absent = 'none').
    expect(result.nodes.find((node) => node.id === 'n3')?.status).toBeUndefined()
    expect(result.edges.find((edge) => edge.id === 'e1')?.status).toBe('question')
  })

  it('ignore un statut inconnu (repli sur aucun badge)', () => {
    const json = traceJson({
      nodes: [{ ...makeNode({ id: 'n1' }), status: 'inventé' }]
    })
    const parsed = parseTrace(json)
    expect(parsed.nodes[0].status).toBeUndefined()
  })
})

describe('parseTrace — rejets (messages français)', () => {
  it('rejette un JSON invalide', () => {
    expect(() => parseTrace('{pas du json')).toThrowError('le fichier ne contient pas de JSON valide')
  })

  it("rejette un format qui n'est pas cosint-trace", () => {
    const json = JSON.stringify({ format: 'autre-format', version: 1, nodes: [], edges: [] })
    expect(() => parseTrace(json)).toThrowError('n’est pas un fichier .trace COSINT')
  })

  it('rejette une version non supportée (les versions 1 à 7 restent lisibles)', () => {
    const json = JSON.stringify({ format: TRACE_FORMAT, version: 8, nodes: [], edges: [] })
    expect(() => parseTrace(json)).toThrowError('version de fichier non supportée (8)')
  })
})

describe('eventDate — round-trip Yjs (§4 v1.7)', () => {
  it('nodeToYMap → yMapToNode préserve eventDate, l’omet si absent', () => {
    // La lecture des nombres nécessite une Y.Map INTÉGRÉE à un doc (comportement Yjs) —
    // on passe donc par la map racine « nodes », comme en usage réel.
    const doc = new Y.Doc()
    const nodes = getNodesMap(doc)
    doc.transact(() => {
      nodes.set('n1', nodeToYMap(makeNode({ id: 'n1', eventDate: 1_700_000_000_000 })))
      nodes.set('n2', nodeToYMap(makeNode({ id: 'n2' })))
    })
    expect(yMapToNode('n1', nodes.get('n1')!).eventDate).toBe(1_700_000_000_000)
    expect(yMapToNode('n2', nodes.get('n2')!).eventDate).toBeUndefined()
  })
})

describe('parseTrace — assainissement', () => {
  it('supprime une connexion vers un nœud inexistant', () => {
    const json = traceJson({
      nodes: [makeNode({ id: 'n1' })],
      edges: [makeEdge({ id: 'e1', source: 'n1', target: 'fantome' })]
    })
    const parsed = parseTrace(json)
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.edges).toEqual([])
  })

  it('supprime un commentaire orphelin', () => {
    const json = traceJson({
      nodes: [makeNode({ id: 'n1' })],
      comments: [
        { id: 'c1', nodeId: 'n1', author: 'bob', text: 'gardé', createdAt: 1 },
        { id: 'c2', nodeId: 'fantome', author: 'bob', text: 'orphelin', createdAt: 2 }
      ]
    })
    const parsed = parseTrace(json)
    expect(parsed.comments.map((comment) => comment.id)).toEqual(['c1'])
  })

  it('remplace une couleur inconnue par le gris par défaut (nœud et connexion)', () => {
    const json = traceJson({
      nodes: [
        { ...makeNode({ id: 'n1' }), color: 'magenta' },
        makeNode({ id: 'n2', color: 'blue' })
      ],
      edges: [{ ...makeEdge({ id: 'e1', source: 'n1', target: 'n2' }), color: 'fuchsia' }]
    })
    const parsed = parseTrace(json)
    // v1.1 : les couleurs sont stockées en hex ; les noms v1 connus sont migrés.
    expect(parsed.nodes.find((node) => node.id === 'n1')?.color).toBe(DEFAULT_NODE_COLOR)
    expect(parsed.nodes.find((node) => node.id === 'n2')?.color).toBe(colorHex('blue'))
    expect(parsed.edges[0].color).toBe(DEFAULT_NODE_COLOR)
  })

  it('ignore un nœud de kind inconnu (et les connexions qui le référencent)', () => {
    const json = traceJson({
      nodes: [makeNode({ id: 'n1' }), { ...makeNode({ id: 'nx' }), kind: 'video' }],
      edges: [makeEdge({ id: 'e1', source: 'n1', target: 'nx' })]
    })
    const parsed = parseTrace(json)
    expect(parsed.nodes.map((node) => node.id)).toEqual(['n1'])
    expect(parsed.edges).toEqual([])
  })

  it('filtre les tags non-string', () => {
    const json = traceJson({
      nodes: [{ ...makeNode({ id: 'n1' }), tags: ['ok', 42, null, { a: 1 }, 'aussi'] }]
    })
    const parsed = parseTrace(json)
    expect(parsed.nodes[0].tags).toEqual(['ok', 'aussi'])
  })
})
