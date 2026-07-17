/**
 * Tests de la configuration des raccourcis clavier (§3 v1.6) : normalisation d'une
 * combinaison, raccourci effectif (défaut / réassignation / suppression), détection
 * de conflit, table inverse et import/export.
 */
import { describe, expect, it } from 'vitest'
import { bindingFromEvent, formatBinding, SHORTCUT_ACTIONS } from '@/lib/shortcuts'
import {
  bindingToActionMap,
  effectiveBinding,
  exportBindings,
  findConflict,
  sanitizeImportedBindings
} from '@/store/shortcuts'

/** Fabrique un pseudo-événement clavier (l'environnement de test est « node »). */
function key(k: string, mods: Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', boolean>> = {}): KeyboardEvent {
  return {
    key: k,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt
  } as KeyboardEvent
}

describe('bindingFromEvent — normalisation (§3 v1.6)', () => {
  it('normalise les combinaisons courantes', () => {
    expect(bindingFromEvent(key('z', { ctrl: true }))).toBe('Mod+Z')
    expect(bindingFromEvent(key('Z', { ctrl: true, shift: true }))).toBe('Mod+Shift+Z')
    expect(bindingFromEvent(key('Delete'))).toBe('Delete')
    expect(bindingFromEvent(key('f', { meta: true }))).toBe('Mod+F')
    expect(bindingFromEvent(key('d', { ctrl: true, alt: true }))).toBe('Mod+Alt+D')
  })

  it('Ctrl+= et Ctrl++ (avec Maj) donnent la MÊME combinaison (zoom)', () => {
    expect(bindingFromEvent(key('=', { ctrl: true }))).toBe('Mod+=')
    expect(bindingFromEvent(key('+', { ctrl: true, shift: true }))).toBe('Mod+=')
  })

  it('renvoie null pour une touche modificatrice seule (dont AltGr)', () => {
    expect(bindingFromEvent(key('Control', { ctrl: true }))).toBeNull()
    expect(bindingFromEvent(key('Shift', { shift: true }))).toBeNull()
    expect(bindingFromEvent(key('AltGraph', { alt: true }))).toBeNull()
    expect(bindingFromEvent(key('CapsLock'))).toBeNull()
  })
})

describe('formatBinding — affichage', () => {
  it('rend une combinaison lisible', () => {
    expect(formatBinding('Mod+Shift+Z')).toBe('Ctrl + Maj + Z')
    expect(formatBinding('Delete')).toBe('Suppr')
    expect(formatBinding(null)).toBe('—')
  })
})

describe('raccourci effectif (§3 v1.6)', () => {
  it('utilise le défaut sans override', () => {
    expect(effectiveBinding('undo', {})).toBe('Mod+Z')
    expect(effectiveBinding('newText', {})).toBeNull() // sans défaut
  })

  it('applique une réassignation', () => {
    expect(effectiveBinding('undo', { undo: 'Mod+K' })).toBe('Mod+K')
  })

  it('applique une suppression (override null)', () => {
    expect(effectiveBinding('undo', { undo: null })).toBeNull()
  })

  it('assigne un raccourci à une action qui n’en avait pas', () => {
    expect(effectiveBinding('newCode', { newCode: 'Mod+Shift+C' })).toBe('Mod+Shift+C')
  })
})

describe('détection de conflit (§3 v1.6)', () => {
  it('trouve l’action qui utilise déjà une combinaison', () => {
    // 'Mod+Z' est le défaut de « undo ».
    expect(findConflict('Mod+Z', {}, 'redo')).toBe('undo')
  })

  it('ne se signale pas conflit avec soi-même', () => {
    expect(findConflict('Mod+Z', {}, 'undo')).toBeNull()
  })

  it('aucun conflit pour une combinaison libre', () => {
    expect(findConflict('Mod+Shift+Q', {}, 'undo')).toBeNull()
  })

  it('tient compte des réassignations', () => {
    // On réassigne « redo » sur Mod+Z → conflit désormais avec redo.
    expect(findConflict('Mod+Z', { redo: 'Mod+Z' }, 'undo')).toBe('redo')
  })
})

describe('table inverse combinaison → action', () => {
  it('mappe chaque combinaison vers son action', () => {
    const map = bindingToActionMap({})
    expect(map.get('Mod+Z')).toBe('undo')
    expect(map.get('Mod+F')).toBe('search')
    expect(map.get('Delete')).toBe('delete')
  })
})

describe('import / export (§3 v1.6)', () => {
  it('exporte le jeu effectif complet', () => {
    const data = exportBindings({ undo: 'Mod+K' })
    expect(data.undo).toBe('Mod+K')
    expect(data.redo).toBe('Mod+Y')
    // Une clé par action.
    expect(Object.keys(data).length).toBe(SHORTCUT_ACTIONS.length)
  })

  it('assainit un import : ids connus seulement, valeurs plausibles', () => {
    const parsed = sanitizeImportedBindings({
      undo: 'Mod+K',
      delete: null,
      inconnu: 'Mod+X',
      redo: 42
    })
    expect(parsed).toEqual({ undo: 'Mod+K', delete: null })
  })

  it('rejette un import non-objet', () => {
    expect(sanitizeImportedBindings('nope')).toBeNull()
    expect(sanitizeImportedBindings(null)).toBeNull()
  })

  it('aller-retour export → import préserve les réassignations', () => {
    const exported = exportBindings({ duplicate: 'Mod+Shift+D' })
    const reimported = sanitizeImportedBindings(exported)
    expect(reimported?.duplicate).toBe('Mod+Shift+D')
  })
})
