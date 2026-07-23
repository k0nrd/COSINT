/**
 * §1 v1.8.7 — récupération de la MARQUE d'organisation et gestion du JETON d'accès,
 * en mode 100 % local.
 *
 * Contrainte de sécurité (CSP de production) : `connect-src` n'autorise que
 * `'self' ws: wss:` — donc PAS de `fetch()` HTTP. La marque transite par le MÊME
 * canal WebSocket que la signalisation : on ouvre une connexion courte au serveur,
 * on envoie `{ type: 'branding' }`, on lit la réponse `{ type: 'branding', branding }`,
 * puis on ferme. Le logo est une data-URI (autorisée par `img-src data:`). Aucune
 * requête sortante nouvelle, CSP inchangée.
 *
 * Le JETON d'accès (facultatif) est ajouté en paramètre `?token=` de l'URL du serveur :
 * le serveur le vérifie AVANT même d'établir la connexion (voir server/signaling.js).
 */
import { sanitizeBranding, type OrgBranding } from '@/lib/orgProfile'

/** Ajoute le jeton d'accès à une URL de signalisation (rien si le jeton est vide). */
export function appendToken(url: string, token: string): string {
  if (!token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(token)}`
}

/** Retire le paramètre `token` d'une URL (pour l'AFFICHAGE : jamais de secret à l'écran). */
export function stripToken(url: string): string {
  const q = url.indexOf('?')
  if (q === -1) return url
  const base = url.slice(0, q)
  const kept = url
    .slice(q + 1)
    .split('&')
    .filter((part) => !/^token=/i.test(part))
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base
}

/** Applique le jeton à une liste d'URLs (ouverture du provider signalisation). */
export function withToken(urls: string[], token: string): string[] {
  return token ? urls.map((url) => appendToken(url, token)) : urls
}

/**
 * Interroge un serveur de signalisation pour SA marque d'organisation. Essaie chaque
 * URL dans l'ordre ; la première réponse valide gagne. Silencieux et non bloquant :
 * un serveur sans marque (ou une ancienne version) ne répond pas → délai dépassé →
 * `null`. Jamais d'exception propagée.
 */
export function fetchBranding(
  urls: string[],
  token: string,
  timeoutMs = 3500
): Promise<OrgBranding | null> {
  const tryOne = (url: string): Promise<OrgBranding | null> =>
    new Promise((resolve) => {
      let settled = false
      let socket: WebSocket | null = null
      const finish = (result: OrgBranding | null): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          socket?.close()
        } catch {
          /* déjà fermé */
        }
        resolve(result)
      }
      const timer = setTimeout(() => finish(null), timeoutMs)
      try {
        socket = new WebSocket(appendToken(url, token))
      } catch {
        finish(null)
        return
      }
      socket.onopen = (): void => {
        try {
          socket?.send(JSON.stringify({ type: 'branding' }))
        } catch {
          finish(null)
        }
      }
      socket.onmessage = (event): void => {
        if (typeof event.data !== 'string') return
        try {
          const message = JSON.parse(event.data) as { type?: unknown; branding?: unknown }
          if (message && message.type === 'branding') finish(sanitizeBranding(message.branding))
        } catch {
          /* trames non-JSON (bruit y-webrtc) : ignorées */
        }
      }
      socket.onerror = (): void => finish(null)
      socket.onclose = (): void => finish(null)
    })

  return (async () => {
    for (const url of urls) {
      const branding = await tryOne(url)
      if (branding) return branding
    }
    return null
  })()
}
