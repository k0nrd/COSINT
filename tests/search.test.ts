import { describe, it, expect } from 'vitest'
import { fold, makeMatcher, stripAccents } from '@/lib/search'

describe('lib/search — pliage accents/casse (§3 v1.7)', () => {
  it('fold retire accents et met en minuscules', () => {
    expect(fold('Élément')).toBe('element')
    expect(fold('CRÉÉ À PARIS')).toBe('cree a paris')
    expect(fold('Motörhead')).toBe('motorhead')
  })

  it('stripAccents conserve la casse', () => {
    expect(stripAccents('Éléphant')).toBe('Elephant')
  })

  it('recherche insensible aux accents ET à la casse par défaut', () => {
    const match = makeMatcher('elephant')!
    expect(match('un Éléphant gris')).toBe(true)
    expect(match('ELEPHANT')).toBe(true)
  })

  it('needle vide → null (aucune recherche)', () => {
    expect(makeMatcher('')).toBeNull()
    expect(makeMatcher('   ')).toBeNull()
  })

  it('option sensible à la casse', () => {
    const match = makeMatcher('Paris', { caseSensitive: true })!
    expect(match('à Paris')).toBe(true)
    expect(match('à paris')).toBe(false)
    // Les accents restent ignorés même en mode sensible à la casse.
    expect(makeMatcher('Pàris', { caseSensitive: true })!('à Paris')).toBe(true)
  })

  it('option mot entier', () => {
    const match = makeMatcher('port', { wholeWord: true })!
    expect(match('le port de Brest')).toBe(true)
    expect(match('aéroport international')).toBe(false)
    expect(match('PORT.')).toBe(true)
  })

  it('sans mot entier, correspondance partielle', () => {
    expect(makeMatcher('port')!('aéroport')).toBe(true)
  })
})
