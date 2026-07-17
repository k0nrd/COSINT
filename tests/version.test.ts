/**
 * Comparaison de versions (contrôle de compatibilité des pairs, v1.4) : une
 * version antérieure à celle de l'hôte est refusée à la connexion.
 */
import { describe, expect, it } from 'vitest'
import { compareVersions, isOlderVersion } from '@/lib/version'

describe('compareVersions', () => {
  it('ordonne major.minor.patch', () => {
    expect(compareVersions('1.4.0', '1.4.0')).toBe(0)
    expect(compareVersions('1.3.0', '1.4.0')).toBe(-1)
    expect(compareVersions('1.4.1', '1.4.0')).toBe(1)
    expect(compareVersions('1.3.9', '1.4.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
  })

  it('est défensif face aux valeurs malformées', () => {
    expect(compareVersions(undefined, '1.4.0')).toBe(-1)
    expect(compareVersions('', '0.0.0')).toBe(0)
    expect(compareVersions('1.4', '1.4.0')).toBe(0)
  })
})

describe('isOlderVersion', () => {
  it('détecte une version strictement antérieure', () => {
    expect(isOlderVersion('1.3.0', '1.4.0')).toBe(true)
    expect(isOlderVersion('1.4.0', '1.4.0')).toBe(false)
    expect(isOlderVersion('1.5.0', '1.4.0')).toBe(false)
    // Un pair sans version (client bien plus ancien) est considéré antérieur.
    expect(isOlderVersion(undefined, '1.4.0')).toBe(true)
  })
})
