/**
 * §1 v1.8.9 — découverte du serveur de signalisation (serveur en DHCP).
 *
 * Ce fichier verrouille les propriétés dont dépend la SÛRETÉ du mécanisme :
 *
 *  1. l'empreinte du renderer et celle du serveur sont le MÊME calcul — si elles
 *     divergent, plus aucun serveur n'est jamais reconnu (panne silencieuse) ;
 *  2. l'empreinte ne révèle pas le jeton et change dès que le jeton change — c'est
 *     ce qui empêche un serveur pirate du réseau de se faire passer pour le bon ;
 *  3. la réécriture d'adresse ne touche QUE l'hôte : schéma, port et chemin d'un
 *     déploiement derrière reverse-proxy doivent survivre au déplacement ;
 *  4. l'analyse d'URL applique les ports par défaut ws/wss, sinon un balayage
 *     partirait sur le mauvais port.
 */
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { discoveryId, parseSignalingTarget, withHost } from '@/sync/discovery'
import { checkServer, probeHost } from '../src/main/discovery'

/** Réplique EXACTE du calcul de server/signaling.js (source de vérité du protocole). */
function serverSideId(token: string): string {
  return createHash('sha256').update(`cosint-discovery-v1:${token}`).digest('hex').slice(0, 32)
}

describe('empreinte d’identité du serveur', () => {
  it('le client calcule exactement la même empreinte que le serveur', async () => {
    for (const token of ['', 'a', 'jeton-de-test', 'K3y_-avec.des~signes', 'é'.repeat(40)]) {
      expect(await discoveryId(token)).toBe(serverSideId(token))
    }
  })

  it('elle est bornée à 32 caractères hexadécimaux', async () => {
    const id = await discoveryId('un-jeton')
    expect(id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('elle ne contient pas le jeton et change avec lui', async () => {
    const token = 'jeton-tres-secret-1234'
    const id = await discoveryId(token)
    expect(id).not.toContain(token)
    expect(id).not.toBe(await discoveryId(`${token}x`))
  })

  it('un serveur SANS jeton donne une empreinte constante (serveur ouvert, assumé)', async () => {
    expect(await discoveryId('')).toBe(await discoveryId(''))
    expect(await discoveryId('')).not.toBe(await discoveryId('x'))
  })
})

/**
 * Épreuve de bout en bout du PROTOCOLE réel : un serveur HTTP qui répond comme
 * `server/signaling.js`, et la sonde du processus principal qui l'interroge. C'est
 * ce qui garantit que les deux moitiés du mécanisme se parlent vraiment — un test
 * purement unitaire des deux côtés pourrait rester vert avec un protocole cassé.
 */
describe('sonde du processus principal contre un vrai serveur', () => {
  const TOKEN = 'jeton-de-test-pour-la-decouverte'
  let server: Server
  let port = 0

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.method === 'GET' && (request.url || '').split('?')[0] === '/cosint') {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ cosint: 1, id: serverSideId(TOKEN) }))
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end('okay')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address ? address.port : 0
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('lit l’empreinte publiée par le serveur', async () => {
    expect(await probeHost('127.0.0.1', port)).toBe(serverSideId(TOKEN))
  })

  it('reconnaît le serveur quand le jeton du poste est le bon', async () => {
    expect(await checkServer('127.0.0.1', port, await discoveryId(TOKEN))).toBe(true)
  })

  it('REFUSE le serveur quand le jeton diffère (anti-usurpation)', async () => {
    expect(await checkServer('127.0.0.1', port, await discoveryId('mauvais-jeton'))).toBe(false)
  })

  it('renvoie null sur un port fermé, sans lever', async () => {
    // Port réservé puis libéré : rien n'écoute, la sonde doit échouer proprement.
    const idle = createServer()
    await new Promise<void>((resolve) => idle.listen(0, '127.0.0.1', resolve))
    const address = idle.address()
    const closedPort = typeof address === 'object' && address ? address.port : 0
    await new Promise<void>((resolve) => idle.close(() => resolve()))
    expect(await probeHost('127.0.0.1', closedPort)).toBeNull()
  })

  it('refuse une entrée hors bornes sans émettre de requête', async () => {
    expect(await checkServer('', 4444, 'x'.repeat(32))).toBe(false)
    expect(await checkServer('127.0.0.1', 0, 'x'.repeat(32))).toBe(false)
    expect(await checkServer('127.0.0.1', 70000, 'x'.repeat(32))).toBe(false)
  })
})

describe('analyse d’une adresse de signalisation', () => {
  it('extrait hôte et port explicites', () => {
    expect(parseSignalingTarget('ws://192.168.11.42:4444')).toEqual({
      host: '192.168.11.42',
      port: 4444
    })
  })

  it('applique les ports par défaut de ws:// et wss://', () => {
    expect(parseSignalingTarget('ws://cosint.interne')).toEqual({ host: 'cosint.interne', port: 80 })
    expect(parseSignalingTarget('wss://cosint.interne')).toEqual({
      host: 'cosint.interne',
      port: 443
    })
  })

  it('refuse ce qui n’est pas une adresse de signalisation', () => {
    for (const url of ['', 'http://10.0.0.1:4444', 'pas une url', 'ws://']) {
      expect(parseSignalingTarget(url)).toBeNull()
    }
  })

  it('déshabille les crochets d’une adresse IPv6 littérale', () => {
    expect(parseSignalingTarget('ws://[fe80::1]:4444')?.host).toBe('fe80::1')
  })
})

describe('réécriture de l’adresse après déplacement', () => {
  it('ne change que l’hôte, en conservant port et schéma', () => {
    expect(withHost('ws://192.168.11.42:4444', '192.168.11.57')).toBe('ws://192.168.11.57:4444')
    expect(withHost('wss://ancien.interne:8443', 'nouveau.interne')).toBe(
      'wss://nouveau.interne:8443'
    )
  })

  it('conserve le chemin d’un déploiement derrière reverse-proxy', () => {
    expect(withHost('wss://ancien.interne/signal', '10.0.0.9')).toBe('wss://10.0.0.9/signal')
  })

  it('rend l’entrée inchangée si elle est inexploitable', () => {
    expect(withHost('pas une url', '10.0.0.9')).toBe('pas une url')
  })
})
