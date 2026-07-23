#!/usr/bin/env node
/**
 * Mini-serveur de signalisation y-webrtc pour COSINT (v1.3, §1.2 ; durci v1.8.7).
 *
 * Adapté du script officiel `y-webrtc/bin/server.js` (MIT). Rôle : mettre en
 * relation les pairs d'une même « room » (identifiant dérivé, non réversible).
 * Il ne voit passer AUCUNE donnée de tableau : les messages `publish` sont
 * chiffrés de bout en bout (AES-GCM, clé dérivée du code de partage) et le
 * contenu des tableaux ne transite jamais par la signalisation.
 *
 * ——— §1 v1.8.7 : deux ajouts pour les déploiements en réseau fermé ———
 *
 *  1. JETON D'ACCÈS (facultatif). Définissez la variable d'environnement
 *     `COSINT_TOKEN` : le serveur EXIGE alors ce jeton (paramètre `?token=` de
 *     l'URL) et REFUSE toute connexion sans le bon jeton, AVANT même d'établir la
 *     WebSocket. Empêche tout poste extérieur d'utiliser le serveur. Sans cette
 *     variable, le serveur reste ouvert (comportement historique).
 *
 *  2. MARQUE D'ORGANISATION (facultative). Renseignez `COSINT_ORG_NAME` (et,
 *     au besoin, `COSINT_ORG_SUBTITLE`, `COSINT_ORG_ACCENT` = #RRGGBB,
 *     `COSINT_ORG_LOGO` = chemin d'une image png/jpg/gif/webp/svg ≤ 300 Ko) :
 *     le serveur répond à la demande `{type:'branding'}` par ces informations,
 *     que l'application affiche sur son écran principal en mode 100 % local
 *     (co-marquage « COSINT · Organisation »). La marque est purement cosmétique
 *     et ne change RIEN au chiffrement ni à la confidentialité.
 *
 * Déploiement en 5 minutes : voir server/README.md (Render, Docker, ou n'importe
 * quel hôte Node). Une seule dépendance : `ws`.
 *
 * Usage : PORT=4444 [COSINT_TOKEN=…] [COSINT_ORG_NAME=…] node signaling.js
 */
const { WebSocketServer } = require('ws')
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/** Codes d'état WebSocket utilisés (readyState). */
const WS_CONNECTING = 0
const WS_OPEN = 1

/** Un client qui ne répond pas au ping pendant 30 s est considéré parti. */
const PING_TIMEOUT_MS = 30000

// ——— Bornes anti-abus (client non authentifié) ———
/** Taille maximale d'un message WebSocket (64 Kio) : un « subscribe » légitime
 *  ne porte que quelques identifiants de room. */
const MAX_MESSAGE_BYTES = 64 * 1024
/** Nombre maximal de topics (rooms) abonnés simultanément par connexion. */
const MAX_TOPICS_PER_CONN = 100
/** Longueur maximale d'un nom de topic. */
const MAX_TOPIC_LENGTH = 200

const port = Number(process.env.PORT) || 4444

// ——— §1 v1.8.7 : jeton d'accès pré-partagé (facultatif) ———
const ACCESS_TOKEN = (process.env.COSINT_TOKEN || '').trim()

/** Comparaison à temps constant du jeton fourni (paramètre `?token=`). */
function tokenAccepted(request) {
  if (ACCESS_TOKEN === '') return true // serveur ouvert (aucun jeton exigé)
  let provided = ''
  try {
    provided = new URL(request.url, 'http://localhost').searchParams.get('token') || ''
  } catch {
    provided = ''
  }
  const a = Buffer.from(provided)
  const b = Buffer.from(ACCESS_TOKEN)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ——— §1 v1.8.7 : marque d'organisation (facultative), lue une fois au démarrage ———
const LOGO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}
const MAX_LOGO_BYTES = 300 * 1024

/** Lit un logo depuis un chemin et l'encode en data-URI, ou undefined si invalide. */
function readLogo(file) {
  if (!file) return undefined
  const mime = LOGO_MIME[path.extname(file).toLowerCase()]
  if (!mime) {
    console.warn(`[COSINT] Logo ignoré (type non supporté) : ${file}`)
    return undefined
  }
  try {
    const bytes = fs.readFileSync(file)
    if (bytes.length > MAX_LOGO_BYTES) {
      console.warn(`[COSINT] Logo ignoré (> 300 Ko) : ${file}`)
      return undefined
    }
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    console.warn(`[COSINT] Logo introuvable : ${file}`)
    return undefined
  }
}

/** Construit la marque depuis l'environnement (null si aucun nom d'organisation). */
function buildBranding() {
  const name = (process.env.COSINT_ORG_NAME || '').trim()
  if (name === '') return null
  const branding = { name: name.slice(0, 60) }
  const subtitle = (process.env.COSINT_ORG_SUBTITLE || '').trim()
  if (subtitle) branding.subtitle = subtitle.slice(0, 140)
  const accent = (process.env.COSINT_ORG_ACCENT || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(accent)) branding.accent = accent
  const logo = readLogo((process.env.COSINT_ORG_LOGO || '').trim())
  if (logo) branding.logo = logo
  return branding
}

const BRANDING = buildBranding()

// Petit serveur HTTP : répond « okay » (health-check des hébergeurs gratuits).
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

// maxPayload borne la taille des trames au niveau du protocole ws (défense en
// profondeur, en plus du contrôle applicatif ci-dessous).
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })

/**
 * Abonnements : nom de room (« topic ») → ensemble des connexions abonnées.
 * @type {Map<string, Set<import('ws').WebSocket>>}
 */
const topics = new Map()

/** Envoie un message JSON, en fermant la connexion si elle est morte. */
const send = (conn, message) => {
  if (conn.readyState !== WS_CONNECTING && conn.readyState !== WS_OPEN) {
    conn.close()
    return
  }
  try {
    conn.send(JSON.stringify(message))
  } catch {
    conn.close()
  }
}

/** Gère le cycle de vie d'un client (protocole y-webrtc + demande de marque). */
const onConnection = (conn) => {
  /** @type {Set<string>} */
  const subscribedTopics = new Set()
  let closed = false

  // Détection des clients silencieusement déconnectés (ping/pong WebSocket).
  let pongReceived = true
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      conn.close()
      clearInterval(pingInterval)
      return
    }
    pongReceived = false
    try {
      conn.ping()
    } catch {
      conn.close()
    }
  }, PING_TIMEOUT_MS)
  conn.on('pong', () => {
    pongReceived = true
  })

  conn.on('close', () => {
    for (const topicName of subscribedTopics) {
      const subs = topics.get(topicName)
      if (subs) {
        subs.delete(conn)
        if (subs.size === 0) topics.delete(topicName)
      }
    }
    subscribedTopics.clear()
    closed = true
    clearInterval(pingInterval)
  })

  conn.on('message', (raw) => {
    // Rejette les messages trop volumineux (double garde avec maxPayload).
    if (raw.length > MAX_MESSAGE_BYTES) return
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (!message || typeof message.type !== 'string' || closed) return
    switch (message.type) {
      case 'subscribe':
        for (const topicName of Array.isArray(message.topics) ? message.topics : []) {
          if (typeof topicName !== 'string' || topicName.length > MAX_TOPIC_LENGTH) continue
          // Plafond du nombre de topics par connexion : empêche un client anonyme
          // de saturer la mémoire du relais en s'abonnant à des rooms aléatoires.
          if (!subscribedTopics.has(topicName) && subscribedTopics.size >= MAX_TOPICS_PER_CONN) {
            continue
          }
          let topic = topics.get(topicName)
          if (!topic) {
            topic = new Set()
            topics.set(topicName, topic)
          }
          topic.add(conn)
          subscribedTopics.add(topicName)
        }
        break
      case 'unsubscribe':
        for (const topicName of Array.isArray(message.topics) ? message.topics : []) {
          const subs = topics.get(topicName)
          if (subs) subs.delete(conn)
        }
        break
      case 'publish':
        if (typeof message.topic === 'string') {
          const receivers = topics.get(message.topic)
          if (receivers) {
            message.clients = receivers.size
            receivers.forEach((receiver) => send(receiver, message))
          }
        }
        break
      case 'ping':
        send(conn, { type: 'pong' })
        break
      // §1 v1.8.7 : marque d'organisation (co-marquage de l'écran principal). La
      // connexion a déjà franchi le contrôle de jeton (à l'upgrade) : seul un poste
      // autorisé peut donc lire la marque.
      case 'branding':
        send(conn, { type: 'branding', branding: BRANDING })
        break
    }
  })
}

wss.on('connection', onConnection)

server.on('upgrade', (request, socket, head) => {
  // §1 v1.8.7 : contrôle du jeton AVANT d'établir la WebSocket — un poste sans le
  // bon jeton est éconduit immédiatement (jamais de room, jamais de marque).
  if (!tokenAccepted(request)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

server.listen(port, () => {
  const guard = ACCESS_TOKEN === '' ? 'ouvert (aucun jeton)' : 'protégé par jeton'
  const brand = BRANDING ? `marque « ${BRANDING.name} »` : 'sans marque'
  console.log(`Serveur de signalisation COSINT — port ${port}, ${guard}, ${brand}.`)
})
