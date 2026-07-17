/**
 * Test d'intégration du critère d'acceptation §1.8 (v1.3) : DEUX clients
 * indépendants — création d'un tableau sur A, demande d'accès depuis B avec le
 * code, pop-up d'approbation côté A, acceptation, transmission du secret
 * scellé (ECDH → AES-GCM), puis synchronisation BIDIRECTIONNELLE du document
 * en moins de 2 secondes.
 *
 * Isolation réelle des clients : chaque client charge sa PROPRE instance des
 * modules (vi.resetModules) — y-webrtc y maintient un registre global de rooms
 * par instance, comme deux applications distinctes. Le transport est le vrai
 * BroadcastChannel de Node (mêmes messages chiffrés AES-GCM que via un serveur
 * de signalisation ; seule la découverte WebRTC réseau n'est pas exercée ici —
 * la procédure de test manuelle à deux PC est décrite dans le README).
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { PresenceUser } from '@/types'

/** Charge une instance isolée des modules de synchro (un « client »). */
async function loadClient(): Promise<{
  shareCode: typeof import('@/lib/shareCode')
  boardDoc: typeof import('@/sync/BoardDoc')
  lobby: typeof import('@/sync/lobby')
  boardOps: typeof import('@/sync/boardOps')
  model: typeof import('@/sync/model')
  files: typeof import('@/sync/files')
  rotation: typeof import('@/sync/rotation')
}> {
  vi.resetModules()
  return {
    shareCode: await import('@/lib/shareCode'),
    boardDoc: await import('@/sync/BoardDoc'),
    lobby: await import('@/sync/lobby'),
    boardOps: await import('@/sync/boardOps'),
    model: await import('@/sync/model'),
    files: await import('@/sync/files'),
    rotation: await import('@/sync/rotation')
  }
}

/** Attend qu'une condition devienne vraie (échec au-delà de timeoutMs). */
function waitFor(check: () => boolean, timeoutMs: number, label: string): Promise<number> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (check()) {
        resolve(Date.now() - started)
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Délai dépassé (${timeoutMs} ms) : ${label}`))
        return
      }
      setTimeout(poll, 25)
    }
    poll()
  })
}

function identity(name: string): PresenceUser {
  return {
    id: crypto.randomUUID(),
    name,
    color: '#3b82f6',
    avatar: { type: 'initials', value: '' },
    role: 'Analyste',
    status: 'available'
  }
}

const cleanups: Array<() => void> = []
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) {
    try {
      cleanup()
    } catch {
      /* déjà détruit */
    }
  }
  // Laisse les destructions asynchrones (clé y-webrtc) se terminer.
  await new Promise((resolve) => setTimeout(resolve, 200))
})

describe('scénario d’acceptation §1.8 — deux clients', () => {
  it(
    'A crée, B rejoint par code avec approbation, puis la synchro est bidirectionnelle en < 2 s',
    { timeout: 20000 },
    async () => {
      const clientA = await loadClient()
      const clientB = await loadClient()

      // ——— A : création du tableau (code + secret de session) ———
      const code = clientA.shareCode.generateShareCode()
      const secret = clientA.shareCode.generateSessionSecret()
      const handleA = await clientA.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleA.destroy())
      clientA.boardOps.initBoardMeta(handleA, 'Enquête test', 'analyste-A', 'approval')

      // ——— A : service d'approbation (membre en ligne) ———
      let pendingA: import('@/sync/lobby').PendingRequest[] = []
      const serverA = await clientA.lobby.startLobbyServer({
        code,
        signalingUrls: [],
        sessionSecret: secret,
        identity: identity('analyste-A'),
        getAccessMode: () => clientA.model.readMeta(handleA.doc).accessMode,
        // A a créé le tableau (initBoardMeta → createdAt > 0) : politique connue.
        isPolicyReady: () => clientA.model.readMeta(handleA.doc).createdAt > 0,
        // §1e : sans awareness peuplée dans ce test, la limite n'est jamais atteinte.
        isFull: () => false,
        onPendingChange: (pending) => {
          pendingA = pending
        }
      })
      cleanups.push(() => serverA.destroy())

      // ——— B : demande d'accès avec le code ———
      const phases: string[] = []
      let resultB: import('@/sync/lobby').AccessResult | null = null
      const requestB = await clientB.lobby.requestAccess({
        code,
        signalingUrls: [],
        identity: identity('analyste-B'),
        onPhase: (phase) => phases.push(phase),
        onResult: (result) => {
          resultB = result
        }
      })
      cleanups.push(() => requestB.destroy())

      // La demande de B apparaît chez A (pop-up d'approbation).
      await waitFor(() => pendingA.length === 1, 2000, 'demande visible côté A')
      expect(pendingA[0].pseudo).toBe('analyste-B')

      // B a détecté un membre en ligne (jamais « aucun membre » ni « réseau
      // inaccessible » alors qu'A est bien là — bug corrigé en v1.3).
      await waitFor(() => phases.includes('member-present'), 2000, 'membre détecté côté B')
      expect(phases).not.toContain('no-member')
      expect(phases).not.toContain('unreachable')

      // ——— A approuve → B reçoit le secret de session, déchiffré pour lui seul ———
      serverA.approve(pendingA[0].requestId)
      await waitFor(() => resultB !== null, 2000, 'résultat du handshake côté B')
      expect(resultB).toEqual({ status: 'approved', secret })

      // ——— B rejoint le salon de document avec le secret reçu ———
      const handleB = await clientB.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: (resultB as unknown as { secret: string }).secret,
        persist: false
      })
      cleanups.push(() => handleB.destroy())

      // Comme dans l'app : chaque participant diffuse sa présence au montage.
      clientA.boardDoc.setLocalPresence(handleA, identity('analyste-A'))
      clientB.boardDoc.setLocalPresence(handleB, identity('analyste-B'))

      // Le titre du tableau (écrit par A) parvient à B.
      await waitFor(
        () => clientB.model.readMeta(handleB.doc).title === 'Enquête test',
        2000,
        'métadonnées synchronisées vers B'
      )

      // ——— A crée un nœud → il apparaît chez B en < 2 s ———
      const nodeIdFromA = clientA.boardOps.createNode(
        handleA,
        { kind: 'text', x: 100, y: 100, width: 200, height: 120, content: 'Note de A' },
        'analyste-A'
      )
      const delayAtoB = await waitFor(
        () => clientB.model.readAllNodes(handleB.doc).some((node) => node.id === nodeIdFromA),
        2000,
        'nœud de A visible chez B'
      )
      expect(delayAtoB).toBeLessThan(2000)

      // ——— Et inversement : B crée un nœud → il apparaît chez A en < 2 s ———
      const nodeIdFromB = clientB.boardOps.createNode(
        handleB,
        { kind: 'text', x: 400, y: 100, width: 200, height: 120, content: 'Note de B' },
        'analyste-B'
      )
      const delayBtoA = await waitFor(
        () => clientA.model.readAllNodes(handleA.doc).some((node) => node.id === nodeIdFromB),
        2000,
        'nœud de B visible chez A'
      )
      expect(delayBtoA).toBeLessThan(2000)

      // ——— L'indicateur d'état (§1.5) voit la connexion : « connecté », 2 participants ———
      let statusA: import('@/sync/network').ConnectionDiagnostics | null = null
      const stopObserving = clientA.boardDoc.observeBoardConnection(handleA, (diagnostics) => {
        statusA = diagnostics
      })
      cleanups.push(stopObserving)
      await waitFor(
        () => statusA !== null && statusA.status === 'connected' && statusA.participantCount >= 2,
        3000,
        'état « connecté » côté A'
      )
    }
  )

  it(
    'critère §1.6 — une image chunkée se synchronise A→B et une édition s’intercale',
    { timeout: 20000 },
    async () => {
      const clientA = await loadClient()
      const clientB = await loadClient()

      const code = clientA.shareCode.generateShareCode()
      const secret = clientA.shareCode.generateSessionSecret()

      const handleA = await clientA.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleA.destroy())
      const handleB = await clientB.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleB.destroy())

      // Les deux clients sont connectés (comme dans le critère d'acceptation).
      clientA.boardDoc.setLocalPresence(handleA, identity('A'))
      clientB.boardDoc.setLocalPresence(handleB, identity('B'))

      // A enregistre une image chunkée (plusieurs chunks) : chaque chunk est une
      // mise à jour bornée. Elle se réassemble complète chez B.
      const CHUNK = clientA.files.CHUNK_SIZE
      const dataUrl = `data:image/webp;base64,${'A'.repeat(CHUNK * 3 + 20)}`
      const hash = await clientA.files.registerFile(handleA, dataUrl, { width: 10, height: 10 })
      expect(hash).not.toBeNull()

      // Pendant/juste après le transfert, B modifie un nœud → il arrive chez A < 2 s.
      const nodeB = clientB.boardOps.createNode(
        handleB,
        { kind: 'text', x: 0, y: 0, content: 'pendant transfert' },
        'B'
      )
      const editDelay = await waitFor(
        () => clientA.model.readAllNodes(handleA.doc).some((n) => n.id === nodeB),
        2000,
        'édition de B reçue par A pendant le transfert'
      )
      expect(editDelay).toBeLessThan(2000)

      // B reçoit l'image complète (réassemblée depuis les chunks).
      await waitFor(
        () => clientB.files.readFileStatus(handleB.doc, hash!).status === 'complete',
        3000,
        'image complète chez B'
      )
      const status = clientB.files.readFileStatus(handleB.doc, hash!)
      expect(status.status).toBe('complete')
      if (status.status === 'complete') expect(status.dataUrl).toBe(dataUrl)
    }
  )

  it(
    '§1a — un nouvel arrivant reçoit l’INTÉGRALITÉ de l’état d’un tableau déjà rempli',
    { timeout: 20000 },
    async () => {
      const clientA = await loadClient()
      const code = clientA.shareCode.generateShareCode()
      const secret = clientA.shareCode.generateSessionSecret()

      // A crée et REMPLIT le tableau AVANT que B n'arrive.
      const handleA = await clientA.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleA.destroy())
      clientA.boardOps.initBoardMeta(handleA, 'Tableau rempli', 'analyste-A', 'open')
      const ids: string[] = []
      for (let i = 0; i < 8; i++) {
        ids.push(
          clientA.boardOps.createNode(
            handleA,
            { kind: 'text', x: i * 40, y: i * 30, content: `Note ${i}` },
            'analyste-A'
          )
        )
      }
      clientA.boardOps.createEdge(handleA, { source: ids[0], target: ids[1] }, 'analyste-A')
      const hash = await clientA.files.registerFile(
        handleA,
        `data:image/webp;base64,${'A'.repeat(clientA.files.CHUNK_SIZE * 2 + 10)}`,
        { width: 10, height: 10 }
      )

      // B REJOINT en cours : son document est d'abord vide.
      const clientB = await loadClient()
      const handleB = await clientB.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleB.destroy())
      clientA.boardDoc.setLocalPresence(handleA, identity('A'))
      clientB.boardDoc.setLocalPresence(handleB, identity('B'))

      // B reçoit TOUS les nœuds, le lien, le meta ET l'image complète.
      await waitFor(
        () => clientB.model.readAllNodes(handleB.doc).length === 8,
        3000,
        'les 8 nœuds arrivent chez B'
      )
      expect(clientB.model.readAllEdges(handleB.doc)).toHaveLength(1)
      expect(clientB.model.readMeta(handleB.doc).title).toBe('Tableau rempli')
      await waitFor(
        () => clientB.files.readFileStatus(handleB.doc, hash!).status === 'complete',
        3000,
        'image complète chez le nouvel arrivant'
      )
    }
  )

  it(
    '§1b — rotation du code : un participant CONNECTÉ reçoit le nouveau code/secret (migration)',
    { timeout: 20000 },
    async () => {
      const clientA = await loadClient()
      const clientB = await loadClient()
      const code = clientA.shareCode.generateShareCode()
      const secret = clientA.shareCode.generateSessionSecret()

      const handleA = await clientA.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleA.destroy())
      const adminId = 'user-admin'
      clientA.boardOps.initBoardMeta(handleA, 'Rotation', 'admin', 'approval', adminId)

      const handleB = await clientB.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleB.destroy())

      // Chaque participant diffuse son identité (userId) ET publie sa clé de rotation.
      const idA = identity('admin')
      idA.id = adminId
      const idB = identity('membre-B')
      const userB = idB.id
      clientA.boardDoc.setLocalPresence(handleA, idA)
      clientB.boardDoc.setLocalPresence(handleB, idB)
      clientA.rotation.publishRekey(handleA)
      clientB.rotation.publishRekey(handleB)

      // A voit B dans l'awareness (avec sa clé de rotation).
      await waitFor(
        () => handleA.awareness!.getStates().size >= 2,
        3000,
        'B visible dans l’awareness de A'
      )
      // Petit délai pour la propagation de la clé de rotation de B.
      await new Promise((resolve) => setTimeout(resolve, 300))

      // A fait TOURNER le code : nouveau code + secret scellés aux participants.
      const newCode = clientA.shareCode.generateShareCode()
      const newSecret = clientA.shareCode.generateSessionSecret()
      const token = 'rot-' + newCode
      const migrating = await clientA.rotation.rotateShare(handleA, newCode, newSecret, token)
      expect(migrating).toBeGreaterThanOrEqual(1)

      // B reçoit l'enveloppe de rotation et la déchiffre → nouveau code/secret.
      await waitFor(
        () => clientB.rotation.readRotation(handleB.doc)?.token === token,
        3000,
        'enveloppe de rotation reçue par B'
      )
      const payload = await clientB.rotation.openRotationGrant(handleB, userB)
      expect(payload).toEqual({ code: newCode, secret: newSecret })

      // Un utilisateur SANS enveloppe (détenteur de l'ancien code non connecté) n'obtient rien.
      const absent = await clientB.rotation.openRotationGrant(handleB, 'user-inconnu')
      expect(absent).toBeNull()
    }
  )

  it(
    '§1e — au-delà de la limite, une demande d’accès est refusée « tableau complet »',
    { timeout: 20000 },
    async () => {
      const clientA = await loadClient()
      const clientB = await loadClient()
      const code = clientA.shareCode.generateShareCode()
      const secret = clientA.shareCode.generateSessionSecret()

      const handleA = await clientA.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleA.destroy())
      clientA.boardOps.initBoardMeta(handleA, 'Complet', 'analyste-A', 'open')

      const serverA = await clientA.lobby.startLobbyServer({
        code,
        signalingUrls: [],
        sessionSecret: secret,
        identity: identity('analyste-A'),
        getAccessMode: () => clientA.model.readMeta(handleA.doc).accessMode,
        isPolicyReady: () => clientA.model.readMeta(handleA.doc).createdAt > 0,
        // §1e : le tableau est déclaré COMPLET.
        isFull: () => true,
        onPendingChange: () => undefined
      })
      cleanups.push(() => serverA.destroy())

      let resultB: import('@/sync/lobby').AccessResult | null = null
      const requestB = await clientB.lobby.requestAccess({
        code,
        signalingUrls: [],
        identity: identity('analyste-B'),
        onPhase: () => undefined,
        onResult: (result) => {
          resultB = result
        }
      })
      cleanups.push(() => requestB.destroy())

      await waitFor(() => resultB !== null, 5000, 'réponse de refus « complet »')
      expect(resultB).toEqual({ status: 'refused', reason: 'full' })
    }
  )

  it('un mauvais secret ne donne pas accès au document (chiffrement effectif)', async () => {
    // Les échecs de déchiffrement AES-GCM sont ici le comportement ATTENDU :
    // y-webrtc ne les rattrape pas (rejets de promesse non gérés), on les
    // neutralise donc pendant la fenêtre du test, puis on restaure vitest.
    const listeners = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')
    const swallow = (): void => undefined
    process.on('unhandledRejection', swallow)
    try {
      const clientA = await loadClient()
      const clientB = await loadClient()

      const code = clientA.shareCode.generateShareCode()
      const secret = clientA.shareCode.generateSessionSecret()

      const handleA = await clientA.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      clientA.boardOps.initBoardMeta(handleA, 'Confidentiel', 'analyste-A', 'private')

      // B tente d'ouvrir le salon de document avec un secret FAUX : les
      // messages ne se déchiffrent pas, rien ne se synchronise.
      const handleB = await clientB.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: clientB.shareCode.generateSessionSecret(),
        persist: false
      })

      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(clientB.model.readMeta(handleB.doc).title).toBe('')

      // Destruction DANS la fenêtre de neutralisation : les messages d'adieu
      // (peer-id) provoquent eux aussi des échecs de déchiffrement attendus.
      handleA.destroy()
      handleB.destroy()
      await new Promise((resolve) => setTimeout(resolve, 300))
    } finally {
      process.removeListener('unhandledRejection', swallow)
      for (const listener of listeners) {
        process.on('unhandledRejection', listener as NodeJS.UnhandledRejectionListener)
      }
    }
  })

  it(
    'un membre dont la politique n’est pas encore synchronisée n’admet PERSONNE (anti-contournement §6)',
    { timeout: 20000 },
    async () => {
      // Régression du finding HIGH : un membre fraîchement admis a d'abord un
      // document vide, dont readMeta retombe sur accessMode='open'. Sans le
      // garde isPolicyReady, il aurait auto-scellé le secret à tout demandeur en
      // attente, contournant le mode « approbation »/« privé ». Ici on simule
      // exactement ce cas : getAccessMode renvoie 'open' (le fallback), mais
      // isPolicyReady est faux tant que la politique réelle n'est pas connue.
      const clientA = await loadClient()
      const clientB = await loadClient()

      const code = clientA.shareCode.generateShareCode()
      const secret = clientA.shareCode.generateSessionSecret()

      // A n'appelle PAS initBoardMeta : createdAt reste 0 (meta non synchronisé).
      const handleA = await clientA.boardDoc.openBoard({
        boardId: 'board-' + code,
        shareCode: code,
        signalingUrls: [],
        sessionSecret: secret,
        persist: false
      })
      cleanups.push(() => handleA.destroy())

      let policyReady = false
      const serverA = await clientA.lobby.startLobbyServer({
        code,
        signalingUrls: [],
        sessionSecret: secret,
        identity: identity('analyste-A'),
        getAccessMode: () => 'open', // le fallback dangereux
        isPolicyReady: () => policyReady,
        isFull: () => false,
        onPendingChange: () => undefined
      })
      cleanups.push(() => serverA.destroy())

      let resultB: import('@/sync/lobby').AccessResult | null = null
      const requestB = await clientB.lobby.requestAccess({
        code,
        signalingUrls: [],
        identity: identity('analyste-B'),
        onPhase: () => undefined,
        onResult: (result) => {
          resultB = result
        }
      })
      cleanups.push(() => requestB.destroy())

      // Politique inconnue : malgré mode 'open', AUCUN grant ne doit partir.
      await new Promise((resolve) => setTimeout(resolve, 1500))
      expect(resultB).toBeNull()

      // La politique devient connue (mode 'open' réel) : l'admission reprend au
      // prochain re-évaluation (republication du demandeur ~4 s, horloge 5 s).
      policyReady = true
      await waitFor(() => resultB !== null, 8000, 'admission une fois la politique connue')
      expect(resultB).toEqual({ status: 'approved', secret })
    }
  )
})
