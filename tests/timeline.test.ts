import { describe, it, expect } from 'vitest'
import type { BoardNodeData } from '@/types'
import { assignLanes, chooseTickStepDays, DAY_MS, timelineDate, toTimelineItems } from '@/lib/timeline'

function node(overrides: Partial<BoardNodeData> = {}): BoardNodeData {
  return {
    id: overrides.id ?? 'n',
    kind: overrides.kind ?? 'entity',
    x: 0,
    y: 0,
    width: 260,
    height: 190,
    content: '',
    title: overrides.title ?? 'X',
    color: '#3b82f6',
    tags: [],
    fields: overrides.fields ?? [],
    createdBy: overrides.createdBy ?? 'moi',
    createdAt: overrides.createdAt ?? 1000,
    updatedBy: 'moi',
    updatedAt: 1000,
    ...overrides
  }
}

describe('lib/timeline — placement sur la frise (§4 v1.7)', () => {
  it('timelineDate : eventDate prioritaire sur createdAt', () => {
    expect(timelineDate(node({ createdAt: 100 }))).toBe(100)
    expect(timelineDate(node({ createdAt: 100, eventDate: 500 }))).toBe(500)
  })

  it('toTimelineItems : trié par date, flag isEventDate', () => {
    const items = toTimelineItems([
      node({ id: 'b', createdAt: 300 }),
      node({ id: 'a', createdAt: 100, eventDate: 50 }),
      node({ id: 'c', createdAt: 200 })
    ])
    expect(items.map((i) => i.id)).toEqual(['a', 'c', 'b'])
    expect(items[0].isEventDate).toBe(true)
    expect(items[1].isEventDate).toBe(false)
  })

  it('label : titre, sinon 1re valeur de champ', () => {
    const items = toTimelineItems([
      node({ id: 'x', title: '', fields: [{ id: 'f', label: 'Email', kind: 'email', value: 'a@ex.com', updatedBy: 'm', updatedAt: 1 }] })
    ])
    expect(items[0].label).toBe('a@ex.com')
  })

  it('assignLanes : éléments distants → même voie ; proches → voies séparées', () => {
    const minDate = 0
    const pxPerMs = 20 / DAY_MS // 20 px par jour (une carte de 158px = ~8 jours)
    // 10 jours d'écart (200px > 158+8) → même voie ; 1 jour (20px) → voies 0 et 1.
    const far = assignLanes([{ date: 0 }, { date: 10 * DAY_MS }], minDate, pxPerMs, 158, 8)
    expect(far).toEqual([0, 0])
    const near = assignLanes([{ date: 0 }, { date: 1 * DAY_MS }], minDate, pxPerMs, 158, 8)
    expect(near).toEqual([0, 1])
  })

  it('assignLanes : sans chevauchement même quand l’ordre n’est PAS croissant (§1 v1.8.1)', () => {
    const pxPerMs = 20 / DAY_MS
    // Trois éléments très éloignés (10 jours d'écart) FOURNIS à l'envers : chacun doit
    // rester en voie 0 (aucun chevauchement) — l'ancien balayage « dans l'ordre reçu »
    // les empilait à tort en voies 0/1/2.
    const lanes = assignLanes(
      [{ date: 20 * DAY_MS }, { date: 0 }, { date: 10 * DAY_MS }],
      0,
      pxPerMs,
      158,
      8
    )
    expect(lanes).toEqual([0, 0, 0])
  })

  it('assignLanes : largeur propre à l’élément (fenêtre) prise en compte', () => {
    const pxPerMs = 20 / DAY_MS
    // Deux éléments à 5 jours (100px) : sans largeur, 100 < 158 → voies 0 et 1.
    expect(assignLanes([{ date: 0 }, { date: 5 * DAY_MS }], 0, pxPerMs, 158, 8)).toEqual([0, 1])
    // Le premier ne fait que 40px de large → 100 ≥ 40+8 → le second tient en voie 0.
    expect(
      assignLanes([{ date: 0, width: 40 }, { date: 5 * DAY_MS, width: 40 }], 0, pxPerMs, 158, 8)
    ).toEqual([0, 0])
  })

  it('chooseTickStepDays : échelle adaptative', () => {
    // Très zoomé (3000 px/jour) → pas infra-journalier.
    expect(chooseTickStepDays(3000)).toBeLessThan(1)
    // Dézoomé (0.1 px/jour) → pas de l'ordre de l'année.
    expect(chooseTickStepDays(0.1)).toBeGreaterThanOrEqual(365)
  })
})
