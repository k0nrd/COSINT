/**
 * §1 v1.8.9 — découverte du serveur de signalisation sur le réseau local.
 *
 * POURQUOI ICI, DANS LE PROCESSUS PRINCIPAL. La CSP de production n'autorise que
 * `connect-src 'self' ws: wss:` : le renderer ne peut émettre AUCUNE requête HTTP.
 * Le balayage vit donc côté Node, et le renderer n'obtient qu'un résultat déjà
 * validé (une adresse, ou rien).
 *
 * CE QUE ÇA RÉSOUT. Un serveur en DHCP change d'adresse (souvent quotidiennement).
 * Plutôt que de refaire un profil `.cosint-org` chaque matin, le poste retrouve son
 * serveur tout seul : il compare l'empreinte publiée sur `GET /cosint` à celle qu'il
 * dérive de SON jeton, et n'accepte que la correspondance exacte.
 *
 * GARDE-FOUS (un balayage de sous-réseau n'est pas anodin) :
 *  - uniquement les plages PRIVÉES (RFC 1918 + lien-local) des interfaces de CETTE
 *    machine — jamais une plage publique, jamais une plage saisie par l'utilisateur ;
 *  - un seul port, celui déjà configuré par l'utilisateur pour son serveur ;
 *  - au plus /24 par interface et 3 interfaces (bornes dures : 762 sondes maximum) ;
 *  - requête GET minuscule, réponse plafonnée, délai court, concurrence bornée ;
 *  - le jeton n'est JAMAIS envoyé pendant la découverte : il ne part qu'ensuite, à
 *    la connexion, une fois l'identité du serveur confirmée.
 */
import { networkInterfaces } from 'node:os'
import http from 'node:http'

/** Chemin de l'empreinte d'identité publiée par le serveur (server/signaling.js). */
const DISCOVERY_PATH = '/cosint'

/** Délai d'une sonde unitaire. Court : sur un LAN, un hôte vivant répond en ~10 ms. */
const PROBE_TIMEOUT_MS = 800

/** Sondes simultanées. Assez pour balayer un /24 en ~2 s, assez peu pour rester discret. */
const CONCURRENCY = 40

/** Taille maximale acceptée pour la réponse d'empreinte (elle fait ~60 octets). */
const MAX_RESPONSE_BYTES = 4096

/** Nombre maximal de sous-réseaux balayés (Wi-Fi + Ethernet + un de secours). */
const MAX_SUBNETS = 3

/** Résultat d'une découverte réussie. */
export interface DiscoveredServer {
  host: string
  port: number
}

/** true pour une adresse IPv4 privée (RFC 1918) ou lien-local (169.254/16). */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return false
}

/**
 * Sous-réseaux /24 à balayer : un par adresse IPv4 privée de cette machine.
 * On se limite volontairement au /24 CONTENANT l'adresse locale, même si le masque
 * est plus large (un /16 ferait 65 000 sondes — hors de question).
 */
function localSubnets(): string[] {
  const prefixes: string[] = []
  const interfaces = networkInterfaces()
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      if (!isPrivateIpv4(address.address)) continue
      const prefix = address.address.split('.').slice(0, 3).join('.')
      if (!prefixes.includes(prefix)) prefixes.push(prefix)
    }
  }
  return prefixes.slice(0, MAX_SUBNETS)
}

/**
 * Interroge `GET http://host:port/cosint` et renvoie l'empreinte publiée, ou null.
 * Ne lève jamais : un hôte absent, muet, ou qui répond autre chose vaut `null`.
 */
export function probeHost(host: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const request = http.get(
      { host, port, path: DISCOVERY_PATH, timeout: PROBE_TIMEOUT_MS, agent: false },
      (response) => {
        if (response.statusCode !== 200) {
          response.destroy()
          finish(null)
          return
        }
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          body += chunk
          // Réponse anormalement grosse : ce n'est pas notre serveur, on coupe.
          if (body.length > MAX_RESPONSE_BYTES) {
            response.destroy()
            finish(null)
          }
        })
        response.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { cosint?: unknown; id?: unknown }
            if (parsed && parsed.cosint === 1 && typeof parsed.id === 'string') {
              finish(parsed.id)
              return
            }
          } catch {
            /* pas du JSON : hôte quelconque */
          }
          finish(null)
        })
        response.on('error', () => finish(null))
      }
    )
    request.on('timeout', () => {
      request.destroy()
      finish(null)
    })
    request.on('error', () => finish(null))
  })
}

/** Exécute `task` sur chaque entrée, `limit` en vol, et s'arrête au premier succès. */
async function racePool<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R | null>
): Promise<R | null> {
  let index = 0
  let found: R | null = null
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (found === null) {
      const current = index++
      if (current >= items.length) return
      const result = await task(items[current])
      if (result !== null && found === null) found = result
    }
  })
  await Promise.all(workers)
  return found
}

/**
 * Vérifie qu'un serveur PRÉCIS est joignable ET qu'il s'agit bien du nôtre.
 * C'est le test le moins coûteux (une requête) : il évite un balayage tant que
 * l'adresse enregistrée reste valable.
 */
export async function checkServer(
  host: string,
  port: number,
  expectedId: string
): Promise<boolean> {
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return false
  const id = await probeHost(host, port)
  return id !== null && id === expectedId
}

/**
 * Balaie les sous-réseaux privés de cette machine à la recherche du serveur dont
 * l'empreinte vaut `expectedId`. Renvoie la première correspondance, ou null.
 *
 * `expectedId` est calculé par le renderer depuis le jeton de l'utilisateur : sans
 * lui, aucune correspondance n'est possible, et l'appel ne fait rien.
 */
export async function discoverServer(
  port: number,
  expectedId: string
): Promise<DiscoveredServer | null> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  if (typeof expectedId !== 'string' || expectedId.length < 8) return null

  for (const prefix of localSubnets()) {
    const hosts: string[] = []
    for (let last = 1; last <= 254; last++) hosts.push(`${prefix}.${last}`)
    const match = await racePool(hosts, CONCURRENCY, async (host) => {
      const id = await probeHost(host, port)
      return id !== null && id === expectedId ? host : null
    })
    if (match) return { host: match, port }
  }
  return null
}
