/**
 * Champs à valeurs multiples, préférences d'affichage (§6bis) et style visuel
 * (§4) — sérialisation et logique d'affichage (livrable §7.4).
 */
import { describe, expect, it } from 'vitest'
import type { BoardNodeData } from '@/types'
import { visibleNodeFields } from '@/lib/entities'
import { parseTrace, serializeTrace, TRACE_FORMAT, TRACE_VERSION, type TraceFile } from '@/lib/serialization'

function field(id: string, label: string, value: string, shown?: boolean): BoardNodeData['fields'][number] {
  return { id, label, kind: 'phone', value, updatedBy: 'a', updatedAt: 1, ...(shown === undefined ? {} : { shown }) }
}

describe('affichage des champs sur le nœud (§6bis)', () => {
  it('par défaut : TOUS les champs non vides (aucune limite)', () => {
    const fields = [field('1', 'Tel', ''), field('2', 'Tel', '06'), field('3', 'Tel', '07'), field('4', 'Tel', '08')]
    const visible = visibleNodeFields(fields)
    expect(visible.map((f) => f.id)).toEqual(['2', '3', '4'])
  })

  it('choix explicite : seuls les champs shown === true, dans l’ordre', () => {
    const fields = [field('1', 'Tel', '06', false), field('2', 'Tel', '07', true), field('3', 'Tel', '08', true)]
    const visible = visibleNodeFields(fields)
    expect(visible.map((f) => f.id)).toEqual(['2', '3'])
  })
})

describe('sérialisation (§7.4)', () => {
  it('préserve des valeurs multiples de même libellé, les flags d’affichage et le style', () => {
    const node: BoardNodeData = {
      id: 'ent1',
      kind: 'entity',
      entityType: 'person',
      x: 0,
      y: 0,
      width: 260,
      height: 190,
      content: '',
      title: 'Cible',
      color: '#3b82f6',
      tags: [],
      fields: [
        field('p1', 'Téléphone', '0600000001', true),
        field('p2', 'Téléphone', '0600000002', true),
        field('p3', 'Téléphone', '0600000003', false)
      ],
      style: {
        borderStyle: 'dashed',
        borderWidth: 'thick',
        fillColor: '#112233',
        fillOpacity: 0.5,
        textSize: 'large'
      },
      createdBy: 'a',
      createdAt: 1,
      updatedBy: 'a',
      updatedAt: 1
    }
    const trace: TraceFile = {
      format: TRACE_FORMAT,
      version: TRACE_VERSION,
      exportedAt: 0,
      meta: {
        title: '',
        createdAt: 0,
        createdBy: '',
        accessMode: 'open' as const,
        accessLog: [],
        adminId: '',
        participantLimit: 5,
        shareRevocation: ''
      },
      nodes: [node],
      edges: [],
      comments: []
    }
    const parsed = parseTrace(serializeTrace(trace))
    const parsedNode = parsed.nodes.find((n) => n.id === 'ent1')!
    // Les trois valeurs de téléphone sont conservées, dans l'ordre.
    expect(parsedNode.fields.map((f) => f.value)).toEqual(['0600000001', '0600000002', '0600000003'])
    // Les préférences d'affichage (shown) sont conservées.
    expect(parsedNode.fields.map((f) => f.shown)).toEqual([true, true, false])
    // Le style visuel est conservé.
    expect(parsedNode.style).toEqual(node.style)
  })
})
