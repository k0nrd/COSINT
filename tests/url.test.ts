/**
 * Tests de la normalisation/validation des URLs externes (v1.3, §4).
 * Cette règle est PARTAGÉE entre le processus principal (IPC open-external,
 * setWindowOpenHandler) et le renderer (nœuds Lien / Source).
 */
import { describe, expect, it } from 'vitest'
import { MAX_URL_LENGTH, normalizeExternalUrl } from '@shared/url'

describe('normalizeExternalUrl — cas valides', () => {
  it('accepte une URL https complète', () => {
    expect(normalizeExternalUrl('https://www.google.com')).toBe('https://www.google.com/')
  })

  it('accepte une URL http', () => {
    expect(normalizeExternalUrl('http://exemple.org/page')).toBe('http://exemple.org/page')
  })

  it('préfixe https:// quand le schéma est absent (exigence §4)', () => {
    expect(normalizeExternalUrl('google.com')).toBe('https://google.com/')
    expect(normalizeExternalUrl('www.google.com/search')).toBe('https://www.google.com/search')
  })

  it('conserve les paramètres de requête et le fragment', () => {
    expect(normalizeExternalUrl('https://exemple.org/r?q=osint&lang=fr#section')).toBe(
      'https://exemple.org/r?q=osint&lang=fr#section'
    )
    expect(normalizeExternalUrl('exemple.org/r?q=a b'.replace(' ', '%20'))).toBe(
      'https://exemple.org/r?q=a%20b'
    )
  })

  it('accepte hôte:port sans schéma (le chiffre après « : » n’est pas un schéma)', () => {
    expect(normalizeExternalUrl('exemple.org:8080/admin')).toBe('https://exemple.org:8080/admin')
  })

  it('accepte localhost et les adresses IP sans schéma', () => {
    expect(normalizeExternalUrl('localhost:3000')).toBe('https://localhost:3000/')
    expect(normalizeExternalUrl('192.168.1.10/panel')).toBe('https://192.168.1.10/panel')
  })

  it('tolère les espaces autour de la saisie', () => {
    expect(normalizeExternalUrl('  google.com  ')).toBe('https://google.com/')
  })
})

describe('normalizeExternalUrl — cas refusés', () => {
  it('refuse les schémas dangereux (jamais ouverts)', () => {
    expect(normalizeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeExternalUrl('file:///C:/Windows/System32')).toBeNull()
    expect(normalizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(normalizeExternalUrl('vbscript:msgbox(1)')).toBeNull()
    expect(normalizeExternalUrl('about:blank')).toBeNull()
    expect(normalizeExternalUrl('chrome://settings')).toBeNull()
  })

  it('refuse les autres schémas non web (mailto, tel, ftp…)', () => {
    expect(normalizeExternalUrl('mailto:x@exemple.org')).toBeNull()
    expect(normalizeExternalUrl('tel:+33612345678')).toBeNull()
    expect(normalizeExternalUrl('ftp://exemple.org/fichier')).toBeNull()
  })

  it('refuse un mot isolé sans schéma (hôte non plausible)', () => {
    expect(normalizeExternalUrl('bonjour')).toBeNull()
  })

  it('refuse le vide, les non-chaînes et les entrées géantes', () => {
    expect(normalizeExternalUrl('')).toBeNull()
    expect(normalizeExternalUrl('   ')).toBeNull()
    expect(normalizeExternalUrl(42)).toBeNull()
    expect(normalizeExternalUrl(null)).toBeNull()
    expect(normalizeExternalUrl(undefined)).toBeNull()
    expect(normalizeExternalUrl(`https://exemple.org/${'a'.repeat(MAX_URL_LENGTH)}`)).toBeNull()
  })

  it('refuse les caractères de contrôle', () => {
    expect(normalizeExternalUrl('https://exemple.org/\tpage')).toBeNull()
    expect(normalizeExternalUrl('exem\u0000ple.org')).toBeNull()
  })

  it('ne se laisse pas piéger par une casse de schéma inhabituelle', () => {
    expect(normalizeExternalUrl('JaVaScRiPt:alert(1)')).toBeNull()
    expect(normalizeExternalUrl('HTTPS://EXEMPLE.ORG')).toBe('https://exemple.org/')
  })
})
