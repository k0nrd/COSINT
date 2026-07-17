/**
 * §réseau v1.7.1 — configuration réseau effective (mode standard / 100 % local).
 *
 * Le contrat testé ici est la GARANTIE du mode local : quelles que soient les
 * saisies (vides, invalides), AUCUNE valeur publique par défaut ne réapparaît —
 * ni signalisation, ni STUN, ni vérification de mise à jour. C'est la propriété
 * de confidentialité affichée par l'interface (récapitulatif des Paramètres),
 * calculée par la même fonction que les connexions réelles.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIGNALING_URLS,
  effectiveNetworkConfig,
  parseIceServers
} from '@/store/settings'
import { ICE_SERVERS } from '@/sync/network'

describe('parseIceServers — saisie STUN/TURN (une entrée par ligne)', () => {
  it('accepte stun:hôte[:port] sans identifiants', () => {
    const result = parseIceServers('stun:10.0.0.6:3478\nstun:coturn.interne')
    expect(result.invalid).toEqual([])
    expect(result.servers).toEqual([{ urls: 'stun:10.0.0.6:3478' }, { urls: 'stun:coturn.interne' }])
  })

  it('accepte turn/turns avec identifiants (espaces ou « | »)', () => {
    const result = parseIceServers(
      'turn:10.0.0.6:3478 cosint MotDePasse\nturns:coturn.interne:5349|user|pass'
    )
    expect(result.invalid).toEqual([])
    expect(result.servers).toEqual([
      { urls: 'turn:10.0.0.6:3478', username: 'cosint', credential: 'MotDePasse' },
      { urls: 'turns:coturn.interne:5349', username: 'user', credential: 'pass' }
    ])
  })

  it('rejette turn SANS identifiants (Chromium refuserait le serveur)', () => {
    const result = parseIceServers('turn:10.0.0.6:3478')
    expect(result.servers).toEqual([])
    expect(result.invalid).toEqual(['turn:10.0.0.6:3478'])
  })

  it('rejette stun AVEC identifiants, schémas inconnus et lignes malformées', () => {
    const result = parseIceServers(
      ['stun:10.0.0.6:3478 user pass', 'https://stun.example.org', 'stun:', 'nimportequoi'].join('\n')
    )
    expect(result.servers).toEqual([])
    expect(result.invalid).toHaveLength(4)
  })

  it('ignore les lignes vides', () => {
    const result = parseIceServers('\n  \nstun:10.0.0.6\n\n')
    expect(result.invalid).toEqual([])
    expect(result.servers).toEqual([{ urls: 'stun:10.0.0.6' }])
  })
})

describe('effectiveNetworkConfig — mode standard', () => {
  const base = { customSignalingUrl: '', customIceServers: '', autoUpdateCheck: true }

  it('sans saisie : serveurs publics par défaut + mise à jour autorisée', () => {
    const config = effectiveNetworkConfig({ networkMode: 'standard', ...base })
    expect(config.signalingUrls).toEqual(DEFAULT_SIGNALING_URLS)
    expect(config.iceServers).toEqual(ICE_SERVERS)
    expect(config.updateCheck).toBe(true)
    expect(config.localNoSignaling).toBe(false)
    expect(config.contactsPublicServices).toBe(true)
  })

  it('les saisies personnalisées REMPLACENT les défauts (jamais en plus)', () => {
    const config = effectiveNetworkConfig({
      networkMode: 'standard',
      customSignalingUrl: 'wss://cosint.interne:443',
      customIceServers: 'stun:10.0.0.6:3478',
      autoUpdateCheck: false
    })
    expect(config.signalingUrls).toEqual(['wss://cosint.interne:443'])
    expect(config.iceServers).toEqual([{ urls: 'stun:10.0.0.6:3478' }])
    expect(config.updateCheck).toBe(false)
    expect(config.contactsPublicServices).toBe(false)
  })

  it('une saisie signalisation INVALIDE retombe sur les défauts (comportement historique du mode standard)', () => {
    const config = effectiveNetworkConfig({
      networkMode: 'standard',
      ...base,
      customSignalingUrl: 'http://pas-du-websocket'
    })
    expect(config.signalingUrls).toEqual(DEFAULT_SIGNALING_URLS)
    expect(config.contactsPublicServices).toBe(true)
  })
})

describe('effectiveNetworkConfig — mode 100 % local (garantie de non-repli)', () => {
  it('utilise UNIQUEMENT les adresses saisies, et coupe la mise à jour', () => {
    const config = effectiveNetworkConfig({
      networkMode: 'local',
      customSignalingUrl: 'ws://10.0.0.5:4444',
      customIceServers: 'turn:10.0.0.6:3478 cosint secret',
      autoUpdateCheck: true // même cochée, ignorée en mode local
    })
    expect(config.signalingUrls).toEqual(['ws://10.0.0.5:4444'])
    expect(config.iceServers).toEqual([
      { urls: 'turn:10.0.0.6:3478', username: 'cosint', credential: 'secret' }
    ])
    expect(config.updateCheck).toBe(false)
    expect(config.localNoSignaling).toBe(false)
    expect(config.contactsPublicServices).toBe(false)
  })

  it('saisie vide → listes VIDES (hors ligne), jamais les serveurs publics', () => {
    const config = effectiveNetworkConfig({
      networkMode: 'local',
      customSignalingUrl: '',
      customIceServers: '',
      autoUpdateCheck: true
    })
    expect(config.signalingUrls).toEqual([])
    expect(config.iceServers).toEqual([])
    expect(config.updateCheck).toBe(false)
    expect(config.localNoSignaling).toBe(true)
    expect(config.contactsPublicServices).toBe(false)
  })

  it('saisie INVALIDE → même garantie : échec franc, aucun repli public silencieux', () => {
    const config = effectiveNetworkConfig({
      networkMode: 'local',
      customSignalingUrl: 'wss;//faute-de-frappe:4444',
      customIceServers: 'turn:sans-identifiants',
      autoUpdateCheck: true
    })
    expect(config.signalingUrls).toEqual([])
    expect(config.iceServers).toEqual([])
    expect(config.localNoSignaling).toBe(true)
    expect(config.contactsPublicServices).toBe(false)
  })
})
