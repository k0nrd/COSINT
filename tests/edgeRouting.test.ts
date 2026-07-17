/**
 * Tests du routage manuel des liens (§1 v1.6) : sérialisation des points de passage
 * et des ancrages (aller-retour .trace + Y.Map), migration d'un fichier v3 (liens
 * sans routage) et construction du tracé.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { BoardEdgeData, BoardNodeData } from '@/types'
import {
  TRACE_FORMAT,
  TRACE_VERSION,
  parseTrace,
  serializeTrace,
  type TraceFile
} from '@/lib/serialization'
import { edgeToYMap, yMapToEdge } from '@/sync/model'
import { buildEdgePath } from '@/lib/edgeRouting'
import { Position } from '@xyflow/react'

function node(id: string): BoardNodeData {
  return {
    id,
    kind: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 120,
    content: '',
    title: '',
    color: '#8a94a6',
    tags: [],
    fields: [],
    createdBy: 'a',
    createdAt: 1,
    updatedBy: 'a',
    updatedAt: 1
  }
}

const routedEdge: BoardEdgeData = {
  id: 'e1',
  source: 'n1',
  target: 'n2',
  label: '',
  relationType: '',
  style: 'solid',
  direction: 'single',
  width: 'normal',
  pathType: 'bezier',
  color: '#8a94a6',
  waypoints: [
    { x: 120, y: 40 },
    { x: 260, y: 200 }
  ],
  sourceAnchor: 'r',
  targetAnchor: 'l',
  createdBy: 'a',
  createdAt: 1,
  updatedBy: 'a',
  updatedAt: 1
}

describe('routage des liens — sérialisation Y.Map (§1 v1.6)', () => {
  it('conserve waypoints et ancrages à l’aller-retour Y.Map', () => {
    const doc = new Y.Doc()
    doc.getMap('edges').set('e1', edgeToYMap(routedEdge))
    const back = yMapToEdge('e1', doc.getMap('edges').get('e1') as Y.Map<unknown>)
    expect(back.waypoints).toEqual(routedEdge.waypoints)
    expect(back.sourceAnchor).toBe('r')
    expect(back.targetAnchor).toBe('l')
  })

  it('un lien sans routage ne porte ni waypoints ni ancrages', () => {
    const doc = new Y.Doc()
    const plain = { ...routedEdge, waypoints: undefined, sourceAnchor: undefined, targetAnchor: undefined }
    doc.getMap('edges').set('e2', edgeToYMap(plain))
    const back = yMapToEdge('e2', doc.getMap('edges').get('e2') as Y.Map<unknown>)
    expect(back.waypoints).toBeUndefined()
    expect(back.sourceAnchor).toBeUndefined()
    expect(back.targetAnchor).toBeUndefined()
  })

  it('ignore les waypoints malformés (coordonnées non finies)', () => {
    const doc = new Y.Doc()
    const map = new Y.Map<unknown>()
    map.set('source', 'n1')
    map.set('target', 'n2')
    map.set('waypoints', [{ x: 1, y: 2 }, { x: 'bad', y: 3 }, { x: 4 }])
    doc.getMap('edges').set('e3', map)
    const back = yMapToEdge('e3', doc.getMap('edges').get('e3') as Y.Map<unknown>)
    expect(back.waypoints).toEqual([{ x: 1, y: 2 }])
  })
})

describe('routage des liens — sérialisation .trace (§1 v1.6)', () => {
  const trace: TraceFile = {
    format: TRACE_FORMAT,
    version: TRACE_VERSION,
    exportedAt: 0,
    meta: {
      title: 'r',
      createdAt: 0,
      createdBy: 'a',
      accessMode: 'open',
      accessLog: [],
      adminId: '',
      participantLimit: 5,
      shareRevocation: ''
    },
    nodes: [node('n1'), node('n2')],
    edges: [routedEdge],
    comments: []
  }

  it('aller-retour serialize → parse à l’identique (version courante)', () => {
    const parsed = parseTrace(serializeTrace(trace))
    expect(parsed.version).toBe(TRACE_VERSION)
    expect(parsed.edges[0].waypoints).toEqual(routedEdge.waypoints)
    expect(parsed.edges[0].sourceAnchor).toBe('r')
    expect(parsed.edges[0].targetAnchor).toBe('l')
  })

  it('migration v3 → v4 : un lien v3 (sans routage) reçoit un tracé par défaut (aucun waypoint)', () => {
    const v3 = JSON.stringify({
      format: TRACE_FORMAT,
      version: 3,
      exportedAt: 0,
      meta: { title: 'v3', createdAt: 0, createdBy: 'a', accessMode: 'open' },
      nodes: [node('n1'), node('n2')],
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          label: '',
          relationType: '',
          style: 'solid',
          direction: 'single',
          width: 'normal',
          pathType: 'bezier',
          color: '#8a94a6',
          createdBy: 'a',
          createdAt: 1,
          updatedBy: 'a',
          updatedAt: 1
        }
      ],
      comments: []
    })
    const parsed = parseTrace(v3)
    expect(parsed.version).toBe(TRACE_VERSION)
    expect(parsed.edges).toHaveLength(1)
    expect(parsed.edges[0].waypoints).toBeUndefined()
    expect(parsed.edges[0].sourceAnchor).toBeUndefined()
  })
})

describe('buildEdgePath — construction du tracé (§1 v1.6)', () => {
  const geo = {
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left
  }

  it('sans waypoint : renvoie un chemin et un point de libellé', () => {
    const result = buildEdgePath({ ...geo, pathType: 'bezier' })
    expect(result.path).toMatch(/^M/)
    expect(Number.isFinite(result.labelX)).toBe(true)
    expect(Number.isFinite(result.labelY)).toBe(true)
  })

  it('droite avec waypoints : polyligne passant par chaque point', () => {
    const result = buildEdgePath({
      ...geo,
      pathType: 'straight',
      waypoints: [{ x: 40, y: 10 }, { x: 70, y: 90 }]
    })
    expect(result.path).toContain('L 40,10')
    expect(result.path).toContain('L 70,90')
  })

  it('coudé avec waypoints : segments orthogonaux (coudes)', () => {
    const result = buildEdgePath({
      ...geo,
      pathType: 'step',
      waypoints: [{ x: 50, y: 20 }]
    })
    // Coude horizontal-puis-vertical vers le waypoint (x du point, y précédent).
    expect(result.path).toContain('L 50,0')
    expect(result.path).toContain('L 50,20')
  })
})
