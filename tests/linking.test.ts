/**
 * §1 (v1.2) — liaison des nœuds : critères d'acceptation au niveau des données.
 * Crée une chaîne de 3 nœuds, les relie avec des liens aux propriétés variées,
 * modifie/inverse/supprime, et vérifie la persistance (export → import).
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { BoardHandle } from '@/sync/BoardDoc'
import {
  createEdge,
  createNode,
  deleteEdges,
  reverseEdge,
  setEdgeRouting,
  updateEdge,
  applyEdgePreset
} from '@/sync/boardOps'
import { readAllEdges } from '@/sync/model'
import { exportBoardData, importTraceIntoDoc, parseTrace, serializeTrace } from '@/lib/serialization'
import { sanitizeLinkPresets, type LinkPresetDef } from '@/lib/linkPresets'

/** Handle minimal suffisant pour les opérations (pas de réseau, pas d'undo réel). */
function makeHandle(): BoardHandle {
  return { doc: new Y.Doc(), localOrigin: {} } as unknown as BoardHandle
}

function textNode(handle: BoardHandle, x: number): string {
  return createNode(handle, { kind: 'text', x, y: 0, content: `n@${x}` }, 'alice')
}

describe('§1 — liaison des nœuds (données + persistance)', () => {
  it('relie 3 nœuds en chaîne avec des liens de propriétés variées', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 200)
    const n3 = textNode(handle, 400)

    // Lien plein fléché n1 → n2.
    const e1 = createEdge(handle, { source: n1, target: n2 }, 'alice')
    // Lien pointillé sans flèche n2 → n3, coloré, avec label et tracé coudé.
    const e2 = createEdge(handle, { source: n2, target: n3 }, 'alice')
    expect(e1).toBeTruthy()
    expect(e2).toBeTruthy()
    updateEdge(
      handle,
      e2!,
      { style: 'dotted', direction: 'none', color: '#22c55e', label: 'communique avec', width: 'thick', pathType: 'step' },
      'alice'
    )

    const edges = readAllEdges(handle.doc)
    expect(edges).toHaveLength(2)
    const edge2 = edges.find((edge) => edge.id === e2)!
    expect(edge2.style).toBe('dotted')
    expect(edge2.direction).toBe('none')
    expect(edge2.color).toBe('#22c55e')
    expect(edge2.label).toBe('communique avec')
    expect(edge2.width).toBe('thick')
    expect(edge2.pathType).toBe('step')
  })

  it('§7 v1.9 — applique un préréglage de lien au style résolu d’un lien', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 200)
    const e = createEdge(handle, { source: n1, target: n2 }, 'alice')!
    // Préréglage enregistré par la PREMIÈRE 1.9.0 (format hérité, migré au chargement).
    const [preset] = sanitizeLinkPresets([
      { id: 'p2', label: 'Source secondaire', color: '#ef4444', width: 'thin', style: 'dashed' }
    ])
    expect(applyEdgePreset(handle, [e], preset, 'alice')).toBe(1)
    const edge = readAllEdges(handle.doc).find((candidate) => candidate.id === e)!
    expect(edge.color).toBe('#ef4444')
    expect(edge.width).toBe('thin')
    expect(edge.style).toBe('dashed')
    // Le reste est inchangé (le nom du préréglage n'est PAS devenu le libellé du lien).
    expect(edge.label).toBe('')
    expect(edge.direction).toBe('single')
  })

  it('§7 v1.9 — préréglage complet sur plusieurs liens : seuls les réglages définis sont écrits, et tout survit à l’export .trace', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 200)
    const n3 = textNode(handle, 400)
    const e1 = createEdge(handle, { source: n1, target: n2 }, 'alice')!
    const e2 = createEdge(handle, { source: n2, target: n3 }, 'alice')!
    // Routage manuel + statut préexistants sur e2 : les points de passage (géométrie)
    // ne font jamais partie d'un préréglage et doivent survivre.
    setEdgeRouting(handle, e2, { waypoints: [{ x: 300, y: 80 }], sourceAnchor: 'b', targetAnchor: 't' }, 'alice')
    updateEdge(handle, e2, { label: 'garder', width: 'thick' }, 'alice')
    const preset: LinkPresetDef = {
      id: 'full',
      name: 'Source principale',
      props: {
        relationType: 'Hébergé par', // « Autre » : texte libre
        color: '#22c55e',
        style: 'dotted',
        direction: 'double',
        pathType: 'step',
        status: 'confirmed',
        sourceAnchor: 'r',
        targetAnchor: 'auto'
      }
    }
    expect(applyEdgePreset(handle, [e1, e2, 'absent'], preset, 'bob')).toBe(2)
    for (const edge of readAllEdges(handle.doc)) {
      expect(edge.relationType).toBe('Hébergé par')
      expect(edge.color).toBe('#22c55e')
      expect(edge.style).toBe('dotted')
      expect(edge.direction).toBe('double')
      expect(edge.pathType).toBe('step')
      expect(edge.status).toBe('confirmed')
      expect(edge.sourceAnchor).toBe('r')
      expect(edge.targetAnchor).toBeUndefined()
      expect(edge.updatedBy).toBe('bob')
    }
    const after2 = readAllEdges(handle.doc).find((edge) => edge.id === e2)!
    expect(after2.label).toBe('garder') // libellé non défini → inchangé
    expect(after2.width).toBe('thick') // épaisseur non définie → inchangée
    expect(after2.waypoints).toEqual([{ x: 300, y: 80 }])

    // Statut « aucun » : retire le badge.
    applyEdgePreset(handle, [e1], { status: 'none' }, 'bob')
    expect(readAllEdges(handle.doc).find((edge) => edge.id === e1)!.status).toBeUndefined()

    // Export → import .trace : les valeurs appliquées sont de simples champs de lien.
    const trace = parseTrace(serializeTrace(exportBoardData(handle.doc)))
    const copy = makeHandle()
    importTraceIntoDoc(trace, copy.doc)
    const imported = readAllEdges(copy.doc).find((edge) => edge.id === e2)!
    expect(imported.relationType).toBe('Hébergé par')
    expect(imported.status).toBe('confirmed')
    expect(imported.sourceAnchor).toBe('r')
    expect(imported.targetAnchor).toBeUndefined()
    expect(imported.pathType).toBe('step')
  })

  it('§7 v1.9 — un préréglage vide n’écrit rien', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 200)
    const e = createEdge(handle, { source: n1, target: n2 }, 'alice')!
    const before = readAllEdges(handle.doc)[0]
    expect(applyEdgePreset(handle, [e], { id: 'x', name: 'Vide', props: {} }, 'bob')).toBe(0)
    expect(readAllEdges(handle.doc)[0]).toEqual(before)
  })

  it('inverse le sens d’un lien', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 100)
    const e = createEdge(handle, { source: n1, target: n2 }, 'alice')!
    reverseEdge(handle, e, 'bob')
    const edge = readAllEdges(handle.doc).find((candidate) => candidate.id === e)!
    expect(edge.source).toBe(n2)
    expect(edge.target).toBe(n1)
    expect(edge.updatedBy).toBe('bob')
  })

  it('supprime un lien', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 100)
    const e = createEdge(handle, { source: n1, target: n2 }, 'alice')!
    deleteEdges(handle, [e])
    expect(readAllEdges(handle.doc)).toHaveLength(0)
  })

  // §1 v1.7.1 — mode « Dessiner le tracé » : le routage complet (points de
  // passage + côtés d'ancrage) s'applique en une seule opération et se retire
  // de même (retour au tracé automatique).
  it('applique puis efface un routage complet (waypoints + ancres) en une opération', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 300)
    const e = createEdge(handle, { source: n1, target: n2 }, 'alice')!

    setEdgeRouting(
      handle,
      e,
      {
        waypoints: [
          { x: 120, y: -40 },
          { x: 220, y: 60 }
        ],
        sourceAnchor: 't',
        targetAnchor: 'r'
      },
      'alice'
    )
    let edge = readAllEdges(handle.doc)[0]
    expect(edge.waypoints).toEqual([
      { x: 120, y: -40 },
      { x: 220, y: 60 }
    ])
    expect(edge.sourceAnchor).toBe('t')
    expect(edge.targetAnchor).toBe('r')

    // Ancres « auto » (null) et liste vide : les clés disparaissent du document.
    setEdgeRouting(handle, e, { waypoints: [], sourceAnchor: null, targetAnchor: null }, 'bob')
    edge = readAllEdges(handle.doc)[0]
    expect(edge.waypoints ?? []).toEqual([])
    expect(edge.sourceAnchor).toBeUndefined()
    expect(edge.targetAnchor).toBeUndefined()
    expect(edge.updatedBy).toBe('bob')
  })

  it('un tracé dessiné survit à l’inversion du lien (routage retourné)', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 300)
    const e = createEdge(handle, { source: n1, target: n2 }, 'alice')!
    setEdgeRouting(
      handle,
      e,
      { waypoints: [{ x: 100, y: 0 }, { x: 200, y: 0 }], sourceAnchor: 'b', targetAnchor: 'l' },
      'alice'
    )
    reverseEdge(handle, e, 'alice')
    const edge = readAllEdges(handle.doc)[0]
    expect(edge.source).toBe(n2)
    expect(edge.target).toBe(n1)
    expect(edge.sourceAnchor).toBe('l')
    expect(edge.targetAnchor).toBe('b')
    expect(edge.waypoints).toEqual([
      { x: 200, y: 0 },
      { x: 100, y: 0 }
    ])
  })

  it('conserve les liens et leurs propriétés après fermeture/réouverture (export → import)', () => {
    const handle = makeHandle()
    const n1 = textNode(handle, 0)
    const n2 = textNode(handle, 200)
    const e = createEdge(handle, { source: n1, target: n2 }, 'alice')!
    updateEdge(handle, e, { style: 'dashed', direction: 'double', color: '#3b82f6', width: 'thin' }, 'alice')

    // « Fermeture / réouverture » = export .trace puis import dans un doc vierge.
    const json = serializeTrace(exportBoardData(handle.doc))
    const reopened = new Y.Doc()
    importTraceIntoDoc(parseTrace(json), reopened)

    const edges = readAllEdges(reopened)
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe(n1)
    expect(edges[0].target).toBe(n2)
    expect(edges[0].style).toBe('dashed')
    expect(edges[0].direction).toBe('double')
    expect(edges[0].color).toBe('#3b82f6')
    expect(edges[0].width).toBe('thin')
  })
})
