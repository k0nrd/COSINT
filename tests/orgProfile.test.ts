/**
 * §1 v1.8.7 — personnalisation « marque blanche » du mode 100 % local.
 *
 * Ce fichier verrouille la FRONTIÈRE DE SÉCURITÉ de la fonctionnalité : tout ce qui
 * entre depuis une source non sûre (fichier `.cosint-org` choisi par l'utilisateur, ou
 * message d'un serveur de signalisation configuré par l'organisation) est ASSAINI avant
 * le moindre affichage. Trois propriétés y sont testées comme des contrats :
 *
 *  1. `sanitizeBranding` n'affiche JAMAIS une marque non bornée : ni CSS injectable via
 *     l'accent, ni logo autre qu'une data-URI d'image, ni texte démesuré.
 *  2. `parseOrgProfile` n'accepte QUE des URLs de signalisation ws(s):// valides.
 *  3. `stripToken` retire toujours le jeton d'accès de l'URL affichée — aucun secret à
 *     l'écran — et `appendToken`/`stripToken` forment un aller-retour exact.
 */
import { describe, expect, it } from 'vitest'
import {
  isSignalingUrl,
  parseOrgProfile,
  sanitizeBranding,
  serializeOrgProfile,
  type OrgProfile
} from '@/lib/orgProfile'
import { appendToken, stripToken, withToken } from '@/sync/branding'

describe('sanitizeBranding — marque servie par le serveur (source non sûre)', () => {
  it('rejette tout ce qui n’est pas un objet exploitable', () => {
    expect(sanitizeBranding(null)).toBeNull()
    expect(sanitizeBranding(undefined)).toBeNull()
    expect(sanitizeBranding('Organisation')).toBeNull()
    expect(sanitizeBranding(42)).toBeNull()
    expect(sanitizeBranding([])).toBeNull()
  })

  it('exige un nom : sans nom exploitable, aucune marque (null)', () => {
    expect(sanitizeBranding({})).toBeNull()
    expect(sanitizeBranding({ name: '' })).toBeNull()
    expect(sanitizeBranding({ name: '   ' })).toBeNull()
    expect(sanitizeBranding({ subtitle: 'sous-titre seul' })).toBeNull()
  })

  it('rejette un nom démesuré (> 60), garde et rogne un nom valide', () => {
    expect(sanitizeBranding({ name: 'x'.repeat(61) })).toBeNull()
    expect(sanitizeBranding({ name: '  Organisation Exemple  ' })).toEqual({
      name: 'Organisation Exemple'
    })
  })

  it('borne le sous-titre (> 140 écarté), garde un sous-titre valide', () => {
    expect(sanitizeBranding({ name: 'Org', subtitle: 'x'.repeat(141) })).toEqual({ name: 'Org' })
    expect(sanitizeBranding({ name: 'Org', subtitle: '  Cellule d’enquête  ' })).toEqual({
      name: 'Org',
      subtitle: 'Cellule d’enquête'
    })
  })

  it('n’accepte comme accent QUE #RRGGBB — jamais d’injection CSS', () => {
    expect(sanitizeBranding({ name: 'Org', accent: '#1A2B3C' })).toEqual({
      name: 'Org',
      accent: '#1A2B3C'
    })
    // Toutes ces valeurs sont écartées silencieusement (marque = juste le nom).
    for (const accent of [
      'red',
      '#abc',
      '#12345',
      '#1234567',
      '#12g456',
      '#fff;background:url(https://evil)',
      'rgb(0,0,0)',
      'url(javascript:alert(1))'
    ]) {
      expect(sanitizeBranding({ name: 'Org', accent })).toEqual({ name: 'Org' })
    }
  })

  it('n’accepte comme logo QU’une data-URI d’image, jamais un script ni du HTML', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const svg = 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E'
    expect(sanitizeBranding({ name: 'Org', logo: png })).toEqual({ name: 'Org', logo: png })
    expect(sanitizeBranding({ name: 'Org', logo: svg })).toEqual({ name: 'Org', logo: svg })
    // Tout ce qui n’est pas data:image/* est rejeté (le nom reste, le logo saute).
    for (const logo of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:application/javascript,alert(1)',
      'https://evil.example/logo.png',
      'vbscript:msgbox',
      'data:image/png' // pas de séparateur [;,] : incomplet
    ]) {
      expect(sanitizeBranding({ name: 'Org', logo })).toEqual({ name: 'Org' })
    }
  })

  it('rejette un logo trop lourd (> ~300 Kio de data-URI)', () => {
    const huge = `data:image/png;base64,${'A'.repeat(420_001)}`
    expect(sanitizeBranding({ name: 'Org', logo: huge })).toEqual({ name: 'Org' })
  })

  it('ignore les champs inconnus (aucune propriété parasite ne passe)', () => {
    const result = sanitizeBranding({
      name: 'Org',
      evil: '<script>',
      __proto__: { polluted: true },
      onclick: 'alert(1)'
    })
    expect(result).toEqual({ name: 'Org' })
  })
})

describe('parseOrgProfile — fichier .cosint-org (source non sûre)', () => {
  it('rejette un JSON invalide ou non-objet', () => {
    expect(parseOrgProfile('pas du json')).toBeNull()
    expect(parseOrgProfile('null')).toBeNull()
    expect(parseOrgProfile('123')).toBeNull()
    expect(parseOrgProfile('"chaine"')).toBeNull()
  })

  it('exige le marqueur de format (cosintOrgProfile === 1)', () => {
    expect(parseOrgProfile(JSON.stringify({ signalingUrl: 'ws://10.0.0.5:4444' }))).toBeNull()
    expect(
      parseOrgProfile(JSON.stringify({ cosintOrgProfile: 2, signalingUrl: 'ws://10.0.0.5:4444' }))
    ).toBeNull()
  })

  it('n’accepte QUE des URLs de signalisation ws:// ou wss://', () => {
    expect(
      parseOrgProfile(JSON.stringify({ cosintOrgProfile: 1, signalingUrl: 'https://evil.example' }))
    ).toBeNull()
    expect(
      parseOrgProfile(JSON.stringify({ cosintOrgProfile: 1, signalingUrl: 'http://10.0.0.5:4444' }))
    ).toBeNull()
    expect(
      parseOrgProfile(JSON.stringify({ cosintOrgProfile: 1, signalingUrl: 'file:///etc/passwd' }))
    ).toBeNull()
    expect(
      parseOrgProfile(JSON.stringify({ cosintOrgProfile: 1, signalingUrl: 'ws;//faute:4444' }))
    ).toBeNull()
  })

  it('accepte un profil minimal (URL seule)', () => {
    const profile = parseOrgProfile(
      JSON.stringify({ cosintOrgProfile: 1, signalingUrl: 'wss://cosint.interne' })
    )
    expect(profile).toEqual({ signalingUrl: 'wss://cosint.interne' })
  })

  it('accepte URL + jeton + organisation, en les rognant', () => {
    const profile = parseOrgProfile(
      JSON.stringify({
        cosintOrgProfile: 1,
        signalingUrl: 'wss://cosint.interne',
        token: '  jeton-partage  ',
        organization: '  Organisation  '
      })
    )
    expect(profile).toEqual({
      signalingUrl: 'wss://cosint.interne',
      token: 'jeton-partage',
      organization: 'Organisation'
    })
  })
})

describe('serializeOrgProfile — aller-retour exact', () => {
  it('sérialise puis re-analyse à l’identique (URL + jeton + organisation)', () => {
    const profile: OrgProfile = {
      signalingUrl: 'wss://cosint.interne',
      token: 'jeton-partage',
      organization: 'Organisation'
    }
    expect(parseOrgProfile(serializeOrgProfile(profile))).toEqual(profile)
  })

  it('omet le jeton et l’organisation absents (fichier minimal)', () => {
    const json = serializeOrgProfile({ signalingUrl: 'ws://10.0.0.5:4444' })
    expect(json).not.toMatch(/token/)
    expect(json).not.toMatch(/organization/)
    expect(parseOrgProfile(json)).toEqual({ signalingUrl: 'ws://10.0.0.5:4444' })
  })
})

describe('isSignalingUrl — schémas WebSocket uniquement', () => {
  it('accepte ws:// et wss://', () => {
    expect(isSignalingUrl('ws://10.0.0.5:4444')).toBe(true)
    expect(isSignalingUrl('wss://cosint.interne')).toBe(true)
  })

  it('refuse tout autre schéma et les URLs malformées', () => {
    for (const url of ['http://x', 'https://x', 'ftp://x', 'file:///x', 'javascript:1', 'nawak']) {
      expect(isSignalingUrl(url)).toBe(false)
    }
  })
})

describe('jeton d’accès — appendToken / stripToken / withToken', () => {
  it('appendToken ajoute ?token= (ou &token=) et encode la valeur', () => {
    expect(appendToken('ws://10.0.0.5:4444', 'abc')).toBe('ws://10.0.0.5:4444?token=abc')
    expect(appendToken('ws://10.0.0.5:4444?x=1', 'abc')).toBe('ws://10.0.0.5:4444?x=1&token=abc')
    expect(appendToken('ws://10.0.0.5:4444', 'a b/c')).toBe('ws://10.0.0.5:4444?token=a%20b%2Fc')
  })

  it('appendToken sans jeton laisse l’URL intacte', () => {
    expect(appendToken('ws://10.0.0.5:4444', '')).toBe('ws://10.0.0.5:4444')
  })

  it('stripToken retire le jeton — jamais de secret à l’écran', () => {
    expect(stripToken('ws://10.0.0.5:4444?token=secret')).toBe('ws://10.0.0.5:4444')
    expect(stripToken('ws://10.0.0.5:4444?TOKEN=secret')).toBe('ws://10.0.0.5:4444')
    expect(stripToken('ws://10.0.0.5:4444')).toBe('ws://10.0.0.5:4444')
  })

  it('stripToken ne retire QUE le jeton, en préservant les autres paramètres', () => {
    expect(stripToken('ws://10.0.0.5:4444?x=1&token=secret&y=2')).toBe('ws://10.0.0.5:4444?x=1&y=2')
    expect(stripToken('ws://10.0.0.5:4444?token=secret&y=2')).toBe('ws://10.0.0.5:4444?y=2')
  })

  it('appendToken puis stripToken redonne l’URL d’origine (aller-retour)', () => {
    for (const url of ['ws://10.0.0.5:4444', 'wss://cosint.interne?region=eu']) {
      expect(stripToken(appendToken(url, 'un-jeton-quelconque'))).toBe(url)
    }
  })

  it('withToken applique le jeton à toute la liste ; sans jeton, liste intacte', () => {
    const urls = ['ws://a:4444', 'wss://b']
    expect(withToken(urls, 'k')).toEqual(['ws://a:4444?token=k', 'wss://b?token=k'])
    expect(withToken(urls, '')).toEqual(urls)
  })
})
