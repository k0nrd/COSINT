import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'

// Stockage local en mémoire AVANT l'import du store : sans `window.localStorage`
// (Node), le middleware `persist` de zustand se désactive et n'expose ni `merge` ni
// `migrate`. Ce fichier de test est isolé : la cale ne fuit pas vers les autres.
vi.hoisted(() => {
  const g = globalThis as { window?: { localStorage?: unknown } }
  if (typeof g.window?.localStorage === 'object') return
  const data = new Map<string, string>()
  g.window = g.window ?? {}
  g.window.localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    }
  }
})
import type { BoardEdgeData } from '@/types'
import type { BoardHandle } from '@/sync/BoardDoc'
import {
  applyEdgePreset,
  createEdge,
  createNode,
  setEdgeRouting,
  setEdgesStatus,
  updateEdge
} from '@/sync/boardOps'
import { getEdgesMap, readAllEdges } from '@/sync/model'
import { useSettings } from '@/store/settings'
import {
  DEFAULT_PRESET_VALUES,
  EDGE_TEXT_MAX,
  LINK_PRESETS_MAX,
  LINK_PRESET_NAME_MAX,
  LINK_PRESET_PROPS,
  LINK_PRESET_TEXT_MAX,
  applyPatchToEdge,
  captureEdgePreset,
  cleanPresetText,
  duplicateLinkPreset,
  edgeDashArray,
  edgePresetValues,
  edgeWidthPx,
  isPresetEmpty,
  moveLinkPreset,
  pickPresetProps,
  presetDisplayText,
  previewPath,
  relationChoice,
  removeLinkPresetFrom,
  resolvePresetPatch,
  sanitizeEdgePatch,
  sanitizeLinkPreset,
  sanitizeLinkPresetProps,
  sanitizeLinkPresets,
  upsertLinkPreset,
  type LinkPresetDef
} from '@/lib/linkPresets'

function edge(overrides: Partial<BoardEdgeData> = {}): BoardEdgeData {
  return {
    id: 'e1',
    source: 'a',
    target: 'b',
    label: '',
    relationType: '',
    style: 'solid',
    direction: 'single',
    width: 'normal',
    pathType: 'bezier',
    color: '#8a94a6',
    createdBy: 'alice',
    createdAt: 1,
    updatedBy: 'alice',
    updatedAt: 1,
    ...overrides
  }
}

function preset(id: string, name = id): LinkPresetDef {
  return { id, name, props: { color: '#ef4444' } }
}

describe('lib/linkPresets — migration et nettoyage (§7 v1.9)', () => {
  it('migre le format hérité de la première 1.9.0 (label = NOM, couleur/épaisseur/style)', () => {
    const [migrated] = sanitizeLinkPresets([
      { id: 'p1', label: 'Source principale', color: '#8A94A6', width: 'thick', style: 'solid' }
    ])
    expect(migrated).toEqual({
      id: 'p1',
      name: 'Source principale',
      props: { color: '#8a94a6', width: 'thick', style: 'solid' }
    })
    // Le nom hérité ne doit JAMAIS devenir le libellé du lien.
    expect(migrated.props.label).toBeUndefined()
  })

  it('conserve le format actuel et ignore les valeurs hors énumération', () => {
    const [clean] = sanitizeLinkPresets([
      {
        id: 'p2',
        name: '  Source secondaire  ',
        props: {
          relationType: 'worksFor',
          label: 'vu le 12/03',
          color: 'rouge',
          width: 'énorme',
          style: 'dotted',
          direction: 'both',
          pathType: 'step',
          status: 'maybe',
          sourceAnchor: 'r',
          targetAnchor: 'center',
          waypoints: [{ x: 1, y: 2 }],
          __proto__: { polluted: true }
        }
      }
    ])
    expect(clean.name).toBe('Source secondaire')
    expect(clean.props).toEqual({
      relationType: 'worksFor',
      label: 'vu le 12/03',
      style: 'dotted',
      pathType: 'step',
      sourceAnchor: 'r'
    })
    expect('waypoints' in clean.props).toBe(false)
  })

  it('rejette les entrées malformées sans jeter', () => {
    expect(sanitizeLinkPresets(null)).toEqual([])
    expect(sanitizeLinkPresets('x')).toEqual([])
    expect(sanitizeLinkPresets({ 0: preset('a') })).toEqual([])
    const list = sanitizeLinkPresets([
      null,
      42,
      'texte',
      [],
      { id: 'sans-nom', props: { color: '#000000' } },
      { id: 'vide', name: '   ', props: {} },
      { id: 'ko', name: 'Sans réglage', props: 'pas un objet' },
      { id: 'ok', name: 'Valide', props: { color: '#ef4444' } }
    ])
    expect(list).toEqual([{ id: 'ok', name: 'Valide', props: { color: '#ef4444' } }])
  })

  it('écarte les préréglages qui ne définissent aucun réglage valide', () => {
    const list = sanitizeLinkPresets([
      { id: 'null', name: 'Props nulles', props: null },
      { id: 'vide', name: 'Props vides', props: {} },
      { id: 'invalide', name: 'Tout invalide', props: { color: 'bogus', width: 'énorme', style: 42 } },
      { id: 'herite', label: 'Hérité cassé', color: 'bogus' },
      { id: 'garde', label: 'Hérité valide', color: '#22c55e' }
    ])
    expect(list.map((item) => item.id)).toEqual(['garde'])
  })

  it('répare les ids manquants/invalides et dédoublonne', () => {
    const list = sanitizeLinkPresets([
      { name: 'Sans id', props: { width: 'thin' } },
      { id: 'a b <script>', name: 'Id invalide', props: { width: 'thin' } },
      { id: 'dup', name: 'Un', props: { width: 'thin' } },
      { id: 'dup', name: 'Deux', props: { width: 'thin' } },
      { id: 'x'.repeat(200), name: 'Id trop long', props: { width: 'thin' } }
    ])
    const ids = list.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('lp-0')
    expect(ids[1]).toBe('lp-1')
    expect(ids.slice(2, 4)).toEqual(['dup', 'dup-2'])
    expect(ids[4]).toBe('lp-4')
  })

  it('plafonne le nombre de préréglages et la longueur des textes', () => {
    const many = Array.from({ length: LINK_PRESETS_MAX + 20 }, (_, i) => preset(`p${i}`))
    expect(sanitizeLinkPresets(many)).toHaveLength(LINK_PRESETS_MAX)
    const [long] = sanitizeLinkPresets([
      {
        id: 'long',
        name: 'N'.repeat(500),
        props: { label: 'L'.repeat(500), relationType: 'R'.repeat(500) }
      }
    ])
    expect(long.name).toHaveLength(LINK_PRESET_NAME_MAX)
    expect(long.props.label).toHaveLength(LINK_PRESET_TEXT_MAX)
    expect(long.props.relationType).toHaveLength(LINK_PRESET_TEXT_MAX)
  })

  it('nettoie les textes : contrôles retirés, émojis jamais coupés en deux', () => {
    expect(cleanPresetText('a\nb\tc\u0000d', 50)).toBe('a b c d')
    expect(cleanPresetText(12, 50)).toBeUndefined()
    const emoji = '😀'.repeat(5)
    expect(cleanPresetText(emoji, 3)).toBe('😀😀😀')
  })
})

describe('lib/linkPresets — patch résolu = uniquement les réglages définis', () => {
  it('ne contient que les réglages définis', () => {
    expect(resolvePresetPatch({ id: 'p', name: 'P', props: { color: '#ef4444' } })).toEqual({
      color: '#ef4444'
    })
    expect(resolvePresetPatch({})).toEqual({})
    expect(isPresetEmpty({})).toBe(true)
    expect(isPresetEmpty({ label: '' })).toBe(false)
  })

  it('traduit « auto » en suppression d’ancre et garde « none » pour retirer le statut', () => {
    expect(
      resolvePresetPatch({ sourceAnchor: 'auto', targetAnchor: 'l', status: 'none' })
    ).toEqual({ sourceAnchor: null, targetAnchor: 'l', status: 'none' })
  })

  it('re-valide un préréglage même s’il a été construit à la main', () => {
    const forged = { width: 'huge', direction: 'double', color: 'javascript:alert(1)' } as never
    expect(resolvePresetPatch(forged)).toEqual({ direction: 'double' })
  })

  it('accepte chaque valeur de direction et de tracé', () => {
    for (const direction of ['none', 'single', 'double'] as const) {
      expect(resolvePresetPatch({ direction })).toEqual({ direction })
    }
    for (const pathType of ['bezier', 'straight', 'step'] as const) {
      expect(resolvePresetPatch({ pathType })).toEqual({ pathType })
    }
  })

  it('applique le patch sur un lien sans toucher au reste (ni aux waypoints)', () => {
    const base = edge({
      label: 'garder',
      status: 'issue',
      sourceAnchor: 'b',
      waypoints: [{ x: 5, y: 6 }]
    })
    const next = applyPatchToEdge(
      base,
      resolvePresetPatch({ color: '#22c55e', status: 'none', sourceAnchor: 'auto', direction: 'none' })
    )
    expect(next.color).toBe('#22c55e')
    expect(next.direction).toBe('none')
    expect(next.status).toBeUndefined()
    expect(next.sourceAnchor).toBeUndefined()
    expect(next.label).toBe('garder')
    expect(next.waypoints).toEqual([{ x: 5, y: 6 }])
    expect(base.status).toBe('issue') // pur : l'original n'est pas modifié
  })
})

describe('lib/linkPresets — type de relation (liste + « Autre » libre)', () => {
  it('classe une relation : sans type, prédéfinie ou libre', () => {
    expect(relationChoice('')).toEqual({ kind: 'none' })
    expect(relationChoice('  ')).toEqual({ kind: 'none' })
    expect(relationChoice('worksFor')).toEqual({ kind: 'known', id: 'worksFor' })
    expect(relationChoice('Hébergé par')).toEqual({ kind: 'other', text: 'Hébergé par' })
  })

  it('un texte libre « Autre » est conservé tel quel dans le patch', () => {
    const [clean] = sanitizeLinkPresets([
      { id: 'o', name: 'Hébergement', props: { relationType: '  Hébergé par  ' } }
    ])
    expect(resolvePresetPatch(clean)).toEqual({ relationType: 'Hébergé par' })
  })

  it('« Sans type » explicite (chaîne vide) efface la relation', () => {
    expect(resolvePresetPatch({ relationType: '' })).toEqual({ relationType: '' })
  })

  it('texte affiché : libellé libre, sinon relation (clé i18n ou texte libre)', () => {
    expect(presetDisplayText({ label: 'vu', relationType: 'owns' })).toEqual({ text: 'vu' })
    expect(presetDisplayText({ relationType: 'owns' })).toEqual({ key: 'relation.owns' })
    expect(presetDisplayText({ relationType: 'Hébergé par' })).toEqual({ text: 'Hébergé par' })
    expect(presetDisplayText({})).toBeNull()
  })
})

describe('lib/linkPresets — capture depuis un lien', () => {
  it('capture par défaut l’apparence + la relation, pas le libellé/statut/côtés', () => {
    const source = edge({
      relationType: 'owns',
      label: 'propre à ce lien',
      color: '#3B82F6',
      width: 'thick',
      style: 'dashed',
      direction: 'double',
      pathType: 'straight',
      status: 'confirmed',
      targetAnchor: 't'
    })
    expect(captureEdgePreset(source)).toEqual({
      relationType: 'owns',
      color: '#3b82f6',
      width: 'thick',
      style: 'dashed',
      direction: 'double',
      pathType: 'straight'
    })
  })

  it('peut capturer tous les réglages, ancres absentes = « auto »', () => {
    const all = captureEdgePreset(edge({ status: 'question', targetAnchor: 'l' }), LINK_PRESET_PROPS)
    expect(Object.keys(all).sort()).toEqual([...LINK_PRESET_PROPS].sort())
    expect(all.sourceAnchor).toBe('auto')
    expect(all.targetAnchor).toBe('l')
    expect(all.status).toBe('question')
  })

  it('capture la couleur AFFICHÉE d’un lien au nom de couleur hérité v1', () => {
    expect(edgePresetValues(edge({ color: 'red' })).color).toBe('#ef4444')
    expect(edgePresetValues(edge({ color: 'n’importe quoi' })).color).toBe('#8a94a6')
  })

  it('valeurs complètes d’un lien et sélection des réglages cochés', () => {
    const values = edgePresetValues(edge({ label: 'x' }))
    expect(values).toEqual({ ...DEFAULT_PRESET_VALUES, label: 'x' })
    expect(pickPresetProps(values, ['label', 'width'])).toEqual({ label: 'x', width: 'normal' })
  })
})

describe('lib/linkPresets — opérations de liste', () => {
  const list = [preset('a'), preset('b'), preset('c')]

  it('ajoute en fin ou remplace en place', () => {
    expect(upsertLinkPreset(list, preset('d')).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
    const renamed = upsertLinkPreset(list, { ...preset('b'), name: 'Bravo' })
    expect(renamed.map((p) => p.name)).toEqual(['a', 'Bravo', 'c'])
  })

  it('refuse un NOUVEAU préréglage quand la liste est pleine', () => {
    const full = Array.from({ length: LINK_PRESETS_MAX }, (_, i) => preset(`p${i}`))
    expect(upsertLinkPreset(full, preset('trop'))).toBe(full)
    expect(duplicateLinkPreset(full, 'p0', 'copie', 'Copie')).toBe(full)
  })

  it('réordonne dans les bornes', () => {
    expect(moveLinkPreset(list, 'c', -1).map((p) => p.id)).toEqual(['a', 'c', 'b'])
    expect(moveLinkPreset(list, 'a', -1)).toBe(list)
    expect(moveLinkPreset(list, 'a', 10).map((p) => p.id)).toEqual(['b', 'c', 'a'])
    expect(moveLinkPreset(list, 'absent', 1)).toBe(list)
  })

  it('duplique juste après l’original, avec une copie indépendante des réglages', () => {
    const next = duplicateLinkPreset(list, 'a', 'a2', 'a (copie)')
    expect(next.map((p) => p.id)).toEqual(['a', 'a2', 'b', 'c'])
    expect(next[1].name).toBe('a (copie)')
    expect(next[1].props).toEqual(next[0].props)
    expect(next[1].props).not.toBe(next[0].props)
  })

  it('supprime', () => {
    expect(removeLinkPresetFrom(list, 'b').map((p) => p.id)).toEqual(['a', 'c'])
  })

  it('sanitizeLinkPreset renvoie null pour une entrée inexploitable', () => {
    expect(sanitizeLinkPreset(undefined, 'x')).toBeNull()
    expect(sanitizeLinkPreset({ name: 'ok' }, 'x')).toBeNull()
    expect(sanitizeLinkPreset({ name: 'ok', style: 'dotted' }, 'x')).toEqual({ id: 'x', name: 'ok', props: { style: 'dotted' } })
  })

  it('sanitizeLinkPresetProps ignore les tableaux et non-objets', () => {
    expect(sanitizeLinkPresetProps([1, 2])).toEqual({})
    expect(sanitizeLinkPresetProps(null)).toEqual({})
  })
})

describe('lib/linkPresets — aperçu (miroir de CosintEdge)', () => {
  it('edgeDashArray reste identique au rendu de CosintEdge', () => {
    expect(edgeDashArray('solid')).toBeUndefined()
    expect(edgeDashArray('dashed')).toBe('8 5')
    expect(edgeDashArray('dotted')).toBe('1.5 5')
  })

  it('edgeWidthPx suit les paliers de CosintEdge', () => {
    expect(edgeWidthPx('thin')).toBe(1.25)
    expect(edgeWidthPx('normal')).toBe(1.75)
    expect(edgeWidthPx('thick')).toBe(3.5)
  })

  it('previewPath distingue courbe, droite et coudé', () => {
    expect(previewPath('straight', 0, 10, 100, 0)).toBe('M 0 10 L 100 0')
    expect(previewPath('step', 0, 10, 100, 0)).toBe('M 0 10 H 50 V 0 H 100')
    expect(previewPath('bezier', 0, 10, 100, 0)).toBe('M 0 10 C 50 10, 50 0, 100 0')
  })
})

// ——— §7 v1.9 (reprise) : application réelle sur un document Yjs + réglages locaux ———

function makeHandle(): BoardHandle {
  return { doc: new Y.Doc(), localOrigin: {} } as unknown as BoardHandle
}

describe('sync/boardOps.applyEdgePreset — un seul pas d’annulation', () => {
  it('Ctrl+Z restaure en UNE fois tous les liens visés (clés supprimées comprises)', () => {
    const handle = makeHandle()
    const a = createNode(handle, { kind: 'text', x: 0, y: 0, content: 'a' }, 'alice')
    const b = createNode(handle, { kind: 'text', x: 300, y: 0, content: 'b' }, 'alice')
    const c = createNode(handle, { kind: 'text', x: 600, y: 0, content: 'c' }, 'alice')
    const e1 = createEdge(handle, { source: a, target: b }, 'alice')!
    const e2 = createEdge(handle, { source: b, target: c }, 'alice')!
    setEdgesStatus(handle, [e2], 'confirmed', 'alice')
    setEdgeRouting(handle, e2, { waypoints: [], sourceAnchor: 't', targetAnchor: 'b' }, 'alice')
    const before = readAllEdges(handle.doc)

    const undo = new Y.UndoManager([getEdgesMap(handle.doc)], {
      trackedOrigins: new Set([handle.localOrigin]),
      captureTimeout: 0
    })
    const applied = applyEdgePreset(
      handle,
      [e1, e2],
      {
        id: 'p',
        name: 'Tout',
        props: {
          relationType: 'Hébergé par',
          label: 'vu le 12/03',
          color: '#a855f7',
          width: 'thick',
          style: 'dashed',
          direction: 'double',
          pathType: 'straight',
          status: 'none',
          sourceAnchor: 'auto',
          targetAnchor: 'l'
        }
      },
      'bob'
    )
    expect(applied).toBe(2)
    const after = readAllEdges(handle.doc).find((edge) => edge.id === e2)!
    expect(after.status).toBeUndefined()
    expect(after.sourceAnchor).toBeUndefined()
    expect(after.targetAnchor).toBe('l')
    expect(undo.undoStack).toHaveLength(1)

    undo.undo()
    const restored = readAllEdges(handle.doc)
    const byId = (list: BoardEdgeData[]): BoardEdgeData[] =>
      [...list].sort((x, y) => x.id.localeCompare(y.id))
    expect(byId(restored)).toEqual(byId(before))
  })

  it('ignore les liens absents et un préréglage vide (aucune transaction)', () => {
    const handle = makeHandle()
    const undo = new Y.UndoManager([getEdgesMap(handle.doc)], {
      trackedOrigins: new Set([handle.localOrigin])
    })
    expect(applyEdgePreset(handle, ['absent'], { color: '#000000' }, 'bob')).toBe(0)
    expect(applyEdgePreset(handle, [], { color: '#000000' }, 'bob')).toBe(0)
    expect(undo.undoStack).toHaveLength(0)
  })

  it('ré-appliquer le même préréglage ne compte ni n’horodate rien (pas d’étape d’annulation vide)', () => {
    const handle = makeHandle()
    const a = createNode(handle, { kind: 'text', x: 0, y: 0, content: 'a' }, 'alice')
    const b = createNode(handle, { kind: 'text', x: 300, y: 0, content: 'b' }, 'alice')
    const c = createNode(handle, { kind: 'text', x: 600, y: 0, content: 'c' }, 'alice')
    const e1 = createEdge(handle, { source: a, target: b }, 'alice')!
    const e2 = createEdge(handle, { source: b, target: c }, 'alice')!
    const props = { color: '#a855f7', style: 'dashed', status: 'none', sourceAnchor: 'auto' } as const
    expect(applyEdgePreset(handle, [e1], props, 'bob')).toBe(1)
    const stamped = readAllEdges(handle.doc).find((edge) => edge.id === e1)!
    const undo = new Y.UndoManager([getEdgesMap(handle.doc)], {
      trackedOrigins: new Set([handle.localOrigin]),
      captureTimeout: 0
    })
    // e1 est déjà conforme : seul e2 change.
    expect(applyEdgePreset(handle, [e1, e2], props, 'carol')).toBe(1)
    const again = readAllEdges(handle.doc).find((edge) => edge.id === e1)!
    expect(again.updatedBy).toBe(stamped.updatedBy)
    expect(again.updatedAt).toBe(stamped.updatedAt)
    expect(applyEdgePreset(handle, [e1, e2], props, 'carol')).toBe(0)
    expect(undo.undoStack).toHaveLength(1)
  })
})

describe('store/settings — préréglages de lien nettoyés à chaque chargement', () => {
  it('fusion : les préréglages de la PREMIÈRE 1.9.0 (même version) sont migrés', () => {
    const { merge } = useSettings.persist.getOptions()
    const merged = merge!(
      {
        theme: 'light',
        linkPresets: [
          // Format exact de la première 1.9.0 (ajout EN TÊTE, `label` = nom).
          { id: 'n2', label: 'Source secondaire', color: '#ef4444', width: 'thin', style: 'dashed' },
          { id: 'n1', label: 'Source principale', color: '#8a94a6', width: 'thick', style: 'solid' },
          { id: 'bad', label: '', color: 'x' },
          'n’importe quoi'
        ]
      },
      useSettings.getState()
    )
    expect(merged.theme).toBe('light')
    expect(merged.linkPresets).toEqual([
      { id: 'n2', name: 'Source secondaire', props: { color: '#ef4444', width: 'thin', style: 'dashed' } },
      { id: 'n1', name: 'Source principale', props: { color: '#8a94a6', width: 'thick', style: 'solid' } }
    ])
    // Réglage absent / corrompu : liste vide, jamais d'exception.
    expect(merge!(undefined, useSettings.getState()).linkPresets).toEqual([])
    expect(merge!({ linkPresets: { 0: 'x' } }, useSettings.getState()).linkPresets).toEqual([])
  })

  it('migration depuis la 1.8.9 (version 8, sans préréglages) : liste vide', () => {
    const { migrate } = useSettings.persist.getOptions()
    const migrated = migrate!({ theme: 'dark', language: 'fr' }, 8) as { linkPresets: unknown }
    expect(migrated.linkPresets).toEqual([])
  })

  it('actions : modifier garde l’ordre, la liste est re-nettoyée et plafonnée', () => {
    const store = useSettings.getState()
    store.setLinkPresets([
      { id: 'a', name: 'A', props: { color: '#ef4444' } },
      { id: 'b', name: 'B', props: { width: 'thick' } }
    ])
    useSettings.getState().addLinkPreset({ id: 'a', name: 'A bis', props: { style: 'dotted' } })
    expect(useSettings.getState().linkPresets.map((p) => p.name)).toEqual(['A bis', 'B'])
    useSettings
      .getState()
      .setLinkPresets([
        { id: 'x', name: 'X', props: { direction: 'both', pathType: 'step' } } as unknown as LinkPresetDef
      ])
    expect(useSettings.getState().linkPresets).toEqual([{ id: 'x', name: 'X', props: { pathType: 'step' } }])
    useSettings
      .getState()
      .setLinkPresets(Array.from({ length: LINK_PRESETS_MAX + 5 }, (_, i) => preset(`p${i}`)))
    expect(useSettings.getState().linkPresets).toHaveLength(LINK_PRESETS_MAX)
    useSettings.getState().addLinkPreset(preset('en-trop'))
    expect(useSettings.getState().linkPresets).toHaveLength(LINK_PRESETS_MAX)
    useSettings.getState().removeLinkPreset('p0')
    expect(useSettings.getState().linkPresets).toHaveLength(LINK_PRESETS_MAX - 1)
    useSettings.getState().setLinkPresets([])
  })
})

describe('sync/boardOps — updateEdge / createEdge valident chaque réglage', () => {
  it('sanitizeEdgePatch abandonne les valeurs invalides et garde les valides', () => {
    expect(
      sanitizeEdgePatch({
        style: 'wavy',
        width: 'huge',
        direction: 'both',
        pathType: 'curve',
        status: 'nope',
        sourceAnchor: 'x',
        targetAnchor: 5,
        color: 'rouge',
        label: 42,
        evil: 'x'
      })
    ).toEqual({})
    expect(
      sanitizeEdgePatch({
        style: 'dotted',
        width: 'thin',
        direction: 'none',
        pathType: 'step',
        status: 'none',
        sourceAnchor: null,
        targetAnchor: 'auto',
        relationType: 'Autre libre ',
        waypoints: [{ x: 1, y: 2 }, { x: NaN, y: 0 }, 'bad']
      })
    ).toEqual({
      style: 'dotted',
      width: 'thin',
      direction: 'none',
      pathType: 'step',
      status: 'none',
      sourceAnchor: null,
      targetAnchor: null,
      relationType: 'Autre libre ',
      waypoints: [{ x: 1, y: 2 }]
    })
    expect(Array.from(sanitizeEdgePatch({ label: 'é'.repeat(EDGE_TEXT_MAX + 9) }).label!)).toHaveLength(
      EDGE_TEXT_MAX
    )
    expect(sanitizeEdgePatch(null)).toEqual({})
  })

  it('updateEdge écrit status/ancres, les supprime (none/null) et ignore l’invalide', () => {
    const handle = makeHandle()
    const a = createNode(handle, { kind: 'text', x: 0, y: 0, content: 'a' }, 'alice')
    const b = createNode(handle, { kind: 'text', x: 300, y: 0, content: 'b' }, 'alice')
    const id = createEdge(handle, { source: a, target: b }, 'alice')!
    updateEdge(handle, id, { status: 'confirmed', sourceAnchor: 't', style: 'dashed' }, 'bob')
    let got = readAllEdges(handle.doc)[0]
    expect(got).toMatchObject({ status: 'confirmed', sourceAnchor: 't', style: 'dashed' })
    const bad = { style: 'wavy', width: 'huge', status: 'none', sourceAnchor: null } as never
    updateEdge(handle, id, bad, 'bob')
    got = readAllEdges(handle.doc)[0]
    expect(got.style).toBe('dashed')
    expect(got.width).toBe('normal')
    expect(got.status).toBeUndefined()
    expect(got.sourceAnchor).toBeUndefined()
  })

  it('createEdge accepte statut et ancres validés, valeurs invalides → défauts', () => {
    const handle = makeHandle()
    const a = createNode(handle, { kind: 'text', x: 0, y: 0, content: 'a' }, 'alice')
    const b = createNode(handle, { kind: 'text', x: 300, y: 0, content: 'b' }, 'alice')
    const init = {
      source: a,
      target: b,
      status: 'issue',
      sourceAnchor: 'l',
      targetAnchor: 'zz',
      style: 'wavy',
      pathType: 'step'
    } as never
    createEdge(handle, init, 'alice')
    const got = readAllEdges(handle.doc)[0]
    expect(got).toMatchObject({ status: 'issue', sourceAnchor: 'l', style: 'solid', pathType: 'step' })
    expect(got.targetAnchor).toBeUndefined()
  })
})
