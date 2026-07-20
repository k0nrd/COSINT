import { describe, it, expect } from 'vitest'
import type { BoardNodeData } from '@/types'
import {
  assignLanes,
  chooseTickStepDays,
  DAY_MS,
  eventTimingOf,
  timelineDate,
  toTimelineItems
} from '@/lib/timeline'

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

  it('toTimelineItems : Ajouts = date de CRÉATION, jamais la date d’événement (§1 v1.8.2)', () => {
    // « a » porte une date d'événement TRÈS antérieure (10) mais a été ajouté en
    // DERNIER (createdAt 300) : la frise Ajouts le place à sa date d'ajout, donc en fin.
    const items = toTimelineItems([
      node({ id: 'a', createdAt: 300, eventDate: 10 }),
      node({ id: 'b', createdAt: 100 }),
      node({ id: 'c', createdAt: 200 })
    ])
    expect(items.map((i) => i.id)).toEqual(['b', 'c', 'a'])
    // La date affichée est toujours celle de l'ajout → isEventDate faux partout.
    expect(items.every((i) => i.isEventDate === false)).toBe(true)
    expect(items[2].date).toBe(300)
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

describe('lib/timeline — datation d’événement (§1 v1.8, durées §1 v1.8.2)', () => {
  it('null si aucune date d’événement', () => {
    expect(eventTimingOf(node())).toBeNull()
  })

  it('date exacte : point (start === end), pas une durée', () => {
    const timing = eventTimingOf(node({ eventDate: 500 }))!
    expect(timing.isDuration).toBe(false)
    expect(timing.isRange).toBe(false)
    expect([timing.start, timing.end]).toEqual([500, 500])
  })

  it('fenêtre au plus tôt/tard : plage d’incertitude, pas une durée', () => {
    const timing = eventTimingOf(node({ eventEarliest: 100, eventLatest: 400 }))!
    expect(timing.isDuration).toBe(false)
    expect(timing.isRange).toBe(true)
    expect([timing.start, timing.end]).toEqual([100, 400])
  })

  it('durée de/à : isDuration, plage bornée par from/to, prioritaire sur l’instant', () => {
    const timing = eventTimingOf(node({ eventFrom: 200, eventTo: 900, eventDate: 300 }))!
    expect(timing.isDuration).toBe(true)
    expect(timing.isRange).toBe(true)
    expect([timing.start, timing.end]).toEqual([200, 900])
    expect(timing.from).toBe(200)
    expect(timing.to).toBe(900)
  })
})
