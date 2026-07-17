#!/usr/bin/env node
/**
 * Mini-serveur de signalisation y-webrtc pour COSINT (v1.3, §1.2).
 *
 * Adapté du script officiel `y-webrtc/bin/server.js` (MIT). Rôle : mettre en
 * relation les pairs d'une même « room » (identifiant dérivé, non réversible).
 * Il ne voit passer AUCUNE donnée de tableau : les messages `publish` sont
 * chiffrés de bout en bout (AES-GCM, clé dérivée du code de partage) et le
 * contenu des tableaux ne transite jamais par la signalisation.
 *
 * Déploiement en 5 minutes : voir server/README.md (Render gratuit, Docker,
 * ou n'importe quel hôte Node avec un port HTTP). Une seule dépendance : `ws`.
 *
 * Usage : PORT=4444 node signaling.js
 */
const { WebSocketServer } = require('ws')
const http = require('http')

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

/** Gère le cycle de vie d'un client (protocole y-webrtc : 4 types de message). */
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
    }
  })
}

wss.on('connection', onConnection)

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

server.listen(port, () => {
  console.log(`Serveur de signalisation COSINT à l'écoute sur le port ${port}`)
})
