/**
 * Racine applicative : navigation accueil ↔ tableau, profil, paramètres,
 * import/export, cycle de vie du partage (§5 : solo → code → révocation) et
 * contrôle d'accès P2P (§6) — salle d'attente côté demandeur, service
 * d'approbation côté membre.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import * as Y from 'yjs'
import { setLocale, t } from '@/i18n'
import {
  deriveRoomId,
  generateSessionSecret,
  generateShareCode,
  normalizeShareCode
} from '@/lib/shareCode'
import { newId } from '@/lib/id'
import { importTraceIntoDoc, parseTrace } from '@/lib/serialization'
import { openBoard, deleteBoardStorage, type BoardHandle } from '@/sync/BoardDoc'
import { createGraph, initBoardMeta, revokeShare as revokeShareToken, setAccessMode, transferAdmin } from '@/sync/boardOps'
import { migrateInlineImages } from '@/sync/files'
import { openRotationGrant, readRotation, rotateShare, rotationToken } from '@/sync/rotation'
import { effectiveRole, isExcluded, readMeta } from '@/sync/model'
import { logSync } from '@/store/syncLog'
import {
  requestAccess,
  startLobbyServer,
  type LobbyClientHandle,
  type LobbyServerHandle,
  type PendingRequest
} from '@/sync/lobby'
import type { AccessMode, BoardEdgeData, BoardNodeData } from '@/types'
import { effectiveNetworkConfig, useSettings } from '@/store/settings'
import { boardEntry, secretForBoard, useBoards } from '@/store/boards'
import { useToasts } from '@/store/toasts'
import { BoardView, profileToPresence, type BoardMenuSignal } from '@/flow/BoardView'
import { HomeScreen } from '@/components/home/HomeScreen'
import { ProfileSetup } from '@/components/home/ProfileSetup'
import { SettingsDialog } from '@/components/home/SettingsDialog'
import { WaitingRoom, type WaitingRoomState } from '@/components/board/WaitingRoom'
import { ApprovalPrompt } from '@/components/board/ApprovalPrompt'
import { Toasts } from '@/components/common/Toasts'
import { UpdateBanner } from '@/components/common/UpdateBanner'
import { UpdatePopup } from '@/components/common/UpdatePopup'

interface BoardRoute {
  handle: BoardHandle
  isJoining: boolean
  /** Secret de session utilisé (absent pour un tableau solo ou v1). */
  sessionSecret?: string
}

type MenuSignal = BoardMenuSignal | null

export default function App(): ReactElement {
  const settings = useSettings()
  const boards = useBoards()
  const pushToast = useToasts((state) => state.push)

  // §4 v1.8.6 : langue de l'interface appliquée AVANT le rendu des enfants. Le changement
  // de langue re-rend App (abonné au store) ; les sous-arbres portant la langue dans leur
  // `key` (tableau, accueil) se remontent pour recalculer toutes les traductions.
  setLocale(settings.language)

  const [board, setBoard] = useState<BoardRoute | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuSignal, setMenuSignal] = useState<MenuSignal>(null)
  const [waiting, setWaiting] = useState<{ state: WaitingRoomState } | null>(null)
  const [updateReady, setUpdateReady] = useState<string | null>(null)
  // §3 v1.8.2 : fenêtre légère annonçant une mise à jour GitHub (disponible ou prête).
  const [updatePopup, setUpdatePopup] = useState<{ state: 'available' | 'downloaded'; version: string } | null>(null)
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [lobbyServer, setLobbyServer] = useState<LobbyServerHandle | null>(null)

  const menuSeq = useRef(0)
  const busy = useRef(false)
  const boardRef = useRef<BoardRoute | null>(null)
  boardRef.current = board
  // §1 v1.7 : CSV en attente d'import quand aucun tableau n'est ouvert (on en crée un
  // puis on relaie l'assistant une fois le tableau monté).
  const pendingCsv = useRef<{ text: string; encoding?: string } | null>(null)
  const lobbyClientRef = useRef<LobbyClientHandle | null>(null)
  const joinEpochRef = useRef(0)
  const lastJoinCodeRef = useRef<string | null>(null)
  /** Jeton de révocation snapshotté à la connexion du tableau courant (§5) :
   * un changement de ce jeton dans le document signifie « partage révoqué ». */
  const revocationSnapshotRef = useRef<string>('')
  /** Jeton de rotation snapshotté (§1b v1.5) : un changement signifie « code
   * régénéré » → migration transparente si une enveloppe m'est destinée. */
  const rotationSnapshotRef = useRef<string>('')
  /**
   * true quand la référence de synchro est ÉTABLIE (état initial reçu). Pour un
   * nouvel arrivant, le document est d'abord vide : les jetons snapshottés valent
   * '' et la première sync apporterait un jeton HISTORIQUE non vide, faussement
   * interprété comme une révocation (bug §1a). On n'arme donc le veilleur qu'une
   * fois l'état initial reçu (meta.createdAt > 0), en re-snapshottant à ce
   * moment-là les jetons réels — sans réagir. */
  const shareBaselineReadyRef = useRef<boolean>(false)

  // Thème appliqué sur <html> (sombre par défaut).
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  // §réseau v1.7.1 : configuration réseau EFFECTIVE (mode standard / 100 % local).
  // Source de vérité unique — les mêmes valeurs alimentent toutes les connexions
  // (tableaux, salon d'attente, service d'approbation) ET le récapitulatif des
  // Paramètres. En mode local sans adresse valide, les listes sont VIDES : échec
  // franc, jamais de repli silencieux vers les serveurs publics.
  const network = useMemo(
    () => effectiveNetworkConfig(settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      settings.networkMode,
      settings.customSignalingUrl,
      settings.customIceServers,
      settings.autoUpdateCheck,
      settings.localUpdateCheck
    ]
  )

  // Politique de mise à jour transmise au processus principal : la vérification
  // GitHub n'est lancée QUE si le mode réseau l'autorise (jamais en 100 % local).
  useEffect(() => {
    if (typeof window.cosint === 'undefined' || !window.cosint.setUpdateCheck) return
    void window.cosint.setUpdateCheck(network.updateCheck)
  }, [network.updateCheck])

  /**
   * Ouvre un tableau par boardId (+ code/secret éventuels) et remplace le
   * courant. Un `shareCode` null ouvre le tableau SOLO (aucune connexion, §5).
   */
  const openRoute = useCallback(
    async (
      boardId: string,
      shareCode: string | null,
      isJoining: boolean,
      sessionSecret?: string
    ): Promise<BoardHandle | null> => {
      if (busy.current) return null
      busy.current = true
      try {
        const handle = await openBoard({
          boardId,
          shareCode,
          signalingUrls: network.signalingUrls,
          iceServers: network.iceServers,
          sessionSecret
        })
        await handle.whenLoaded
        // Mode 100 % local sans signalisation : le tableau partagé s'ouvre en
        // copie locale, mais ne joindra personne — on l'explique clairement.
        if (shareCode && network.localNoSignaling) {
          pushToast(t('settings.localNoSignalingToast'), 'info')
        }
        // Migration §1.5 : convertit les images base64 inline vers le format en
        // chunks (idempotent, non bloquant). JAMAIS pour un visiteur : sa migration
        // serait révoquée à la réception, restaurant la grosse valeur inline (§1/§6).
        {
          const me = useSettings.getState().profile
          if (!me || effectiveRole(handle.doc, me.userId) !== 'visitor') {
            void migrateInlineImages(handle)
          }
        }
        // §1a/§1b : snapshot des jetons de partage. Si l'état initial n'est pas
        // encore là (nouvel arrivant, doc vide), on diffère la référence : le
        // veilleur l'établira à la première sync (évite le faux « révoqué »).
        shareBaselineReadyRef.current = readMeta(handle.doc).createdAt > 0
        revocationSnapshotRef.current = readMeta(handle.doc).shareRevocation
        rotationSnapshotRef.current = rotationToken(handle.doc)
        boardRef.current?.handle.destroy()
        setBoard({ handle, isJoining, sessionSecret })
        return handle
      } catch (error) {
        pushToast(t('error.unknown', { message: String(error) }), 'error')
        return null
      } finally {
        busy.current = false
      }
    },
    [network, pushToast]
  )

  /**
   * Reconfigure le partage du tableau COURANT (§5) : ré-ouvre le même document
   * (état préservé via un instantané Yjs, sans dépendre du vidage IndexedDB) avec
   * un nouveau code/secret, ou en solo (`shareCode` null). Le boardId (stockage
   * local) ne change pas.
   */
  const reconfigureShare = useCallback(
    async (shareCode: string | null, sessionSecret?: string): Promise<void> => {
      const current = boardRef.current
      if (!current || busy.current) return
      busy.current = true
      try {
        const boardId = current.handle.boardId
        const state = Y.encodeStateAsUpdate(current.handle.doc)
        const handle = await openBoard({
          boardId,
          shareCode,
          signalingUrls: network.signalingUrls,
          iceServers: network.iceServers,
          sessionSecret
        })
        // Réinjecte l'état courant (idempotent avec le chargement IndexedDB).
        Y.applyUpdate(handle.doc, state)
        handle.undo.clear()
        await handle.whenLoaded
        // L'état est ré-injecté en entier : la référence de partage est établie.
        shareBaselineReadyRef.current = true
        revocationSnapshotRef.current = readMeta(handle.doc).shareRevocation
        rotationSnapshotRef.current = rotationToken(handle.doc)
        current.handle.destroy()
        setBoard({ handle, isJoining: false, sessionSecret })
        boards.setShare(boardId, { shareCode, sessionSecret })
      } finally {
        busy.current = false
      }
    },
    [network, boards]
  )

  // §réseau v1.7.1b : un changement de configuration réseau s'applique
  // IMMÉDIATEMENT au tableau ouvert. Sans cela, un tableau resté ouvert pendant
  // le passage en « 100 % local » garderait ses connexions déjà établies vers
  // les serveurs publics (le provider WebRTC n'est configuré qu'à l'ouverture) —
  // exactement ce que le mode promet d'empêcher. On rouvre donc la connexion du
  // tableau courant (même code/secret, état local préservé) à chaque changement
  // effectif de configuration.
  const networkKey = `${network.mode}|${network.signalingUrls.join(',')}|${JSON.stringify(network.iceServers)}`
  const previousNetworkKey = useRef(networkKey)
  useEffect(() => {
    if (previousNetworkKey.current === networkKey) return
    previousNetworkKey.current = networkKey
    const current = boardRef.current
    // Tableau solo (aucune connexion) ou aucun tableau ouvert : rien à rouvrir.
    if (!current || !current.handle.shareCode) return
    pushToast(t('settings.networkReapplied'), 'info')
    void reconfigureShare(current.handle.shareCode, current.sessionSecret)
  }, [networkKey, reconfigureShare, pushToast])

  // ——— Service d'approbation (membre) : actif tant qu'un tableau PARTAGÉ est ouvert ———
  useEffect(() => {
    const profile = useSettings.getState().profile
    if (!board || !board.handle.shareCode || !board.sessionSecret || !profile) return
    let handle: LobbyServerHandle | null = null
    let cancelled = false
    void startLobbyServer({
      code: board.handle.shareCode,
      signalingUrls: network.signalingUrls,
      iceServers: network.iceServers,
      sessionSecret: board.sessionSecret,
      identity: profileToPresence(profile),
      getAccessMode: () => readMeta(board.handle.doc).accessMode,
      isPolicyReady: () => readMeta(board.handle.doc).createdAt > 0,
      // §1e : limite atteinte = nombre de participants du DOCUMENT (awareness)
      // supérieur ou égal à la limite réglée. Le demandeur est encore dans le
      // lobby (pas dans le document) : sa venue ferait dépasser la limite.
      isFull: () => {
        const count = board.handle.awareness?.getStates().size ?? 1
        return count >= readMeta(board.handle.doc).participantLimit
      },
      onPendingChange: (list) => {
        if (!cancelled) setPending(list)
      }
    }).then((server) => {
      if (cancelled) server.destroy()
      else {
        handle = server
        setLobbyServer(server)
      }
    })
    return () => {
      cancelled = true
      handle?.destroy()
      setLobbyServer(null)
      setPending([])
    }
  }, [board, network])

  // ——— Détection de rotation / révocation / exclusion (§1b/§5/§6) ———
  // Trois évolutions distinctes du partage, dans cet ordre de priorité :
  //  1. ROTATION (§1b) : l'admin a régénéré le code → si une enveloppe m'est
  //     destinée, je MIGRE de façon transparente vers le nouveau code/secret
  //     (jamais de retour au mode solo). Sans enveloppe pour moi (détenteur de
  //     l'ancien code non connecté au moment de la rotation), je perds l'accès.
  //  2. RÉVOCATION (§5) : le partage a été coupé volontairement → je repasse en
  //     solo (copie locale conservée).
  //  3. EXCLUSION (§6) : j'ai été retiré → je repasse en solo.
  useEffect(() => {
    const current = board
    const profile = useSettings.getState().profile
    if (!current || !current.handle.shareCode || !profile) return
    const doc = current.handle.doc
    let migrating = false
    const react = (): void => {
      const meta = readMeta(doc)
      // §1a : tant que l'état initial n'est pas reçu (nouvel arrivant), on établit
      // la référence sur les VRAIS jetons dès qu'ils arrivent, SANS réagir aux
      // rotations/révocations (un jeton historique serait pris à tort pour une
      // révocation). L'EXCLUSION, elle, est un état COURANT (pas un changement de
      // jeton) : on la contrôle même sur cette première passe, sinon un participant
      // exclu ré-admis par le lobby resterait connecté tant que le tableau est inactif.
      if (!shareBaselineReadyRef.current) {
        if (meta.createdAt > 0) {
          shareBaselineReadyRef.current = true
          revocationSnapshotRef.current = meta.shareRevocation
          rotationSnapshotRef.current = rotationToken(doc)
          if (isExcluded(doc, profile.userId)) {
            pushToast(t('share.excludedForYou'), 'info')
            boards.setShare(current.handle.boardId, { shareCode: null, sessionSecret: undefined })
            void reconfigureShare(null, undefined)
          }
        }
        return
      }
      if (migrating) return
      // 1. Rotation de code : migration transparente si une enveloppe m'est destinée.
      const rotation = readRotation(doc)
      if (rotation && rotation.token !== rotationSnapshotRef.current) {
        rotationSnapshotRef.current = rotation.token
        migrating = true
        void openRotationGrant(current.handle, profile.userId).then((payload) => {
          if (payload) {
            logSync('success', 'Nouveau code reçu — migration transparente vers la nouvelle session.')
            pushToast(t('share.rotatedForYou'), 'success')
            boards.setShare(current.handle.boardId, {
              shareCode: payload.code,
              sessionSecret: payload.secret
            })
            void reconfigureShare(payload.code, payload.secret)
          } else {
            // Aucune enveloppe pour moi : je ne suis pas un participant migrant
            // (arrivée après la rotation, ou détenteur de l'ancien code hors ligne).
            migrating = false
          }
        })
        return
      }
      // 2. Révocation volontaire du partage.
      if (meta.shareRevocation !== revocationSnapshotRef.current) {
        revocationSnapshotRef.current = meta.shareRevocation
        pushToast(t('share.revokedForYou'), 'info')
        boards.setShare(current.handle.boardId, { shareCode: null, sessionSecret: undefined })
        void reconfigureShare(null, undefined)
        return
      }
      // 3. Exclusion individuelle.
      if (isExcluded(doc, profile.userId)) {
        pushToast(t('share.excludedForYou'), 'info')
        boards.setShare(current.handle.boardId, { shareCode: null, sessionSecret: undefined })
        void reconfigureShare(null, undefined)
      }
    }
    doc.on('update', react)
    // Évalue une fois immédiatement (l'état peut déjà contenir createdAt > 0).
    react()
    return () => doc.off('update', react)
  }, [board, boards, pushToast, reconfigureShare])

  const handleCreate = useCallback(async () => {
    const profile = useSettings.getState().profile
    if (!profile) return
    // §5 : un tableau naît SOLO — aucun code, aucune connexion réseau.
    const boardId = `local-${newId()}`
    const handle = await openRoute(boardId, null, false)
    if (!handle) return
    const title = t('home.newBoardTitle')
    // Mode « sur approbation » par défaut (servira dès qu'un code sera généré).
    // Le créateur devient admin (§6) — rôle attaché à son identité stable.
    initBoardMeta(handle, title, profile.pseudo, 'approval', profile.userId)
    handle.undo.clear()
    const now = Date.now()
    boards.upsert({
      boardId,
      shareCode: null,
      title,
      createdAt: now,
      lastOpenedAt: now,
      role: 'admin'
    })
  }, [openRoute, boards])

  /** Ouvre un tableau en tant que membre (secret déjà connu). */
  const openAsMember = useCallback(
    async (code: string, secret: string): Promise<void> => {
      const boardId = await deriveRoomId(code)
      const handle = await openRoute(boardId, code, true, secret)
      if (!handle) return
      const now = Date.now()
      boards.upsert({
        boardId,
        shareCode: code,
        title: readMeta(handle.doc).title,
        createdAt: now,
        lastOpenedAt: now,
        sessionSecret: secret
      })
    },
    [openRoute, boards]
  )

  /** Lance le handshake d'accès (§6) : salle d'attente jusqu'à approbation. */
  const requestJoin = useCallback(
    async (code: string) => {
      const profile = useSettings.getState().profile
      if (!profile) return
      // Mode 100 % local sans signalisation : la demande ne peut joindre personne
      // (aucun repli public) — on le dit tout de suite plutôt que d'attendre le
      // délai « réseau injoignable » de la salle d'attente.
      if (network.localNoSignaling) pushToast(t('settings.localNoSignalingToast'), 'info')
      lastJoinCodeRef.current = code
      lobbyClientRef.current?.destroy()
      lobbyClientRef.current = null
      const epoch = ++joinEpochRef.current
      setWaiting({ state: 'connecting' })
      const client = await requestAccess({
        code,
        signalingUrls: network.signalingUrls,
        iceServers: network.iceServers,
        identity: profileToPresence(profile),
        onPhase: (phase) => {
          if (joinEpochRef.current !== epoch) return
          setWaiting((current) =>
            current && current.state !== 'refused' ? { state: phase } : current
          )
        },
        onResult: (result) => {
          if (joinEpochRef.current !== epoch) return
          lobbyClientRef.current = null
          if (result.status === 'refused') {
            // Message dédié selon le motif : version antérieure (mise à jour
            // requise, sans « Réessayer »), tableau complet (§1e), ou refus simple.
            const state =
              result.reason === 'outdated'
                ? 'outdated'
                : result.reason === 'full'
                  ? 'full'
                  : 'refused'
            setWaiting({ state })
            return
          }
          void (async () => {
            const boardId = await deriveRoomId(code)
            const now = Date.now()
            boards.upsert({
              boardId,
              shareCode: code,
              title: '',
              createdAt: now,
              lastOpenedAt: now,
              sessionSecret: result.secret
            })
            setWaiting(null)
            await openAsMember(code, result.secret)
          })()
        }
      })
      if (joinEpochRef.current !== epoch) {
        client.destroy()
        return
      }
      lobbyClientRef.current = client
    },
    [network, boards, openAsMember, pushToast]
  )

  const handleJoin = useCallback(
    async (rawCode: string) => {
      const code = normalizeShareCode(rawCode)
      if (!code) return
      const boardId = await deriveRoomId(code)
      const secret = secretForBoard(boardId)
      if (secret) await openAsMember(code, secret)
      else await requestJoin(code)
    },
    [openAsMember, requestJoin]
  )

  const handleOpen = useCallback(
    async (boardId: string) => {
      const entry = boardEntry(boardId)
      if (!entry) return
      if (entry.shareCode && entry.sessionSecret) {
        // Tableau partagé avec secret : rouvre connecté (membre).
        const handle = await openRoute(boardId, entry.shareCode, true, entry.sessionSecret)
        if (handle) boards.touch(boardId)
      } else if (entry.shareCode) {
        // Tableau v1 (code sans secret) : accès historique par clé dérivée.
        const handle = await openRoute(boardId, entry.shareCode, true)
        if (handle) boards.touch(boardId)
      } else {
        // Tableau SOLO : aucune connexion (§5).
        const handle = await openRoute(boardId, null, false)
        if (handle) boards.touch(boardId)
      }
    },
    [openRoute, boards]
  )

  const handleDelete = useCallback(
    (boardId: string) => {
      boards.remove(boardId)
      void deleteBoardStorage(boardId)
    },
    [boards]
  )

  const handleImport = useCallback(async () => {
    const profile = useSettings.getState().profile
    const picked = await window.cosint.openTrace()
    if ('canceled' in picked) return
    if ('error' in picked) {
      pushToast(
        t('import.error', {
          message: picked.error === 'too-large' ? t('import.tooLarge') : t('import.unreadable')
        }),
        'error'
      )
      return
    }
    let trace
    try {
      trace = parseTrace(picked.json)
    } catch (error) {
      pushToast(t('import.error', { message: (error as Error).message }), 'error')
      return
    }
    // Import = nouveau tableau local SOLO (§5) ; l'importateur en est l'admin (§6).
    const boardId = `local-${newId()}`
    const handle = await openRoute(boardId, null, false)
    if (!handle) return
    importTraceIntoDoc(trace, handle.doc)
    void migrateInlineImages(handle)
    if (profile) transferAdmin(handle, profile.userId)
    handle.undo.clear()
    const now = Date.now()
    boards.upsert({
      boardId,
      shareCode: null,
      title: trace.meta.title || t('board.untitled'),
      createdAt: now,
      lastOpenedAt: now,
      role: 'admin'
    })
    pushToast(t('import.done'), 'success')
  }, [openRoute, boards, pushToast])

  // ——— Import CSV (§1 v1.7) ———
  // Ouvre le fichier, puis relaie l'assistant à BoardView. Si aucun tableau n'est
  // ouvert, on crée d'abord un nouveau tableau vierge (l'assistant s'ouvrira dessus).
  const handleImportCsv = useCallback(async () => {
    const picked = await window.cosint.openCsv()
    if ('canceled' in picked) return
    if ('error' in picked) {
      pushToast(
        t('csv.importError', {
          message: picked.error === 'too-large' ? t('import.tooLarge') : t('import.unreadable')
        }),
        'error'
      )
      return
    }
    if (boardRef.current) {
      menuSeq.current += 1
      setMenuSignal({ action: 'import-csv', seq: menuSeq.current, csvText: picked.text, encoding: picked.encoding })
    } else {
      pendingCsv.current = { text: picked.text, encoding: picked.encoding }
      await handleCreate()
      // Si la création n'a pas ouvert de tableau (profil absent, verrou…), on n'attend
      // rien : nettoie le CSV en attente pour ne pas le rejouer à la prochaine ouverture.
      if (!boardRef.current) pendingCsv.current = null
    }
  }, [pushToast, handleCreate])

  // Quand un tableau vient d'être ouvert et qu'un CSV attend, on relaie l'assistant.
  useEffect(() => {
    if (board && pendingCsv.current) {
      const csv = pendingCsv.current
      pendingCsv.current = null
      menuSeq.current += 1
      setMenuSignal({ action: 'import-csv', seq: menuSeq.current, csvText: csv.text, encoding: csv.encoding })
    }
  }, [board])

  // Importe un graphe CSV construit (par l'assistant) dans un NOUVEAU tableau.
  const handleImportCsvNewBoard = useCallback(
    async (nodes: BoardNodeData[], edges: BoardEdgeData[], title: string) => {
      const profile = useSettings.getState().profile
      const boardId = `local-${newId()}`
      const handle = await openRoute(boardId, null, false)
      if (!handle) return
      const boardTitle = title || t('home.newBoardTitle')
      initBoardMeta(handle, boardTitle, profile?.pseudo ?? '?', 'approval', profile?.userId ?? '')
      createGraph(handle, nodes, edges)
      handle.undo.clear()
      const now = Date.now()
      boards.upsert({
        boardId,
        shareCode: null,
        title: boardTitle,
        createdAt: now,
        lastOpenedAt: now,
        role: 'admin'
      })
      pushToast(t('csv.imported', { nodes: nodes.length, edges: edges.length }), 'success')
    },
    [openRoute, boards, pushToast]
  )

  const handleBack = useCallback(() => {
    const previous = boardRef.current
    if (previous) {
      useBoards.getState().touch(previous.handle.boardId)
      previous.handle.destroy()
    }
    setBoard(null)
  }, [])

  // ——— Actions de partage (§5), transmises à BoardView ———
  const generateShare = useCallback(
    async (mode: AccessMode): Promise<void> => {
      const current = boardRef.current
      const profile = useSettings.getState().profile
      if (!current || !profile) return
      const code = generateShareCode()
      const secret = generateSessionSecret()
      // Applique le mode choisi et garantit l'identité d'admin AVANT de connecter.
      setAccessMode(current.handle, mode, profile.pseudo)
      if (readMeta(current.handle.doc).adminId === '') transferAdmin(current.handle, profile.userId)
      await reconfigureShare(code, secret)
      pushToast(t('share.generated'), 'success')
    },
    [reconfigureShare, pushToast]
  )

  const revokeShare = useCallback(async (): Promise<void> => {
    const current = boardRef.current
    if (!current) return
    const token = newId()
    // Snapshot AVANT écriture : le watcher ne me révoque pas moi-même.
    revocationSnapshotRef.current = token
    revokeShareToken(current.handle, token)
    // Laisse le jeton se propager aux participants avant de couper.
    await new Promise((resolve) => setTimeout(resolve, 800))
    boards.setShare(current.handle.boardId, { shareCode: null, sessionSecret: undefined })
    await reconfigureShare(null, undefined)
    pushToast(t('share.revoked'), 'info')
  }, [reconfigureShare, boards, pushToast])

  const regenerateShare = useCallback(
    async (mode: AccessMode): Promise<void> => {
      const current = boardRef.current
      const profile = useSettings.getState().profile
      if (!current || !profile) return
      // §1b : ROTATION du code (≠ révocation). On garde les participants déjà
      // connectés : on leur SCELLE le nouveau code/secret via leur clé publique
      // éphémère (awareness), écrit dans meta.shareRotation sur l'ANCIEN salon, ils
      // migrent de façon transparente. Seuls les détenteurs de l'ancien code non
      // connectés perdent l'accès (le nouveau salon les isole).
      const newCode = generateShareCode()
      const newSecret = generateSessionSecret()
      const token = newId()
      // Snapshot AVANT écriture : le veilleur ne me fait pas migrer moi-même.
      rotationSnapshotRef.current = token
      setAccessMode(current.handle, mode, profile.pseudo)
      const migrating = await rotateShare(current.handle, newCode, newSecret, token)
      logSync('info', `Rotation du code — ${migrating} participant(s) migré(s) sans interruption.`)
      // Laisse les enveloppes se propager sur l'ancien salon avant de basculer.
      await new Promise((resolve) => setTimeout(resolve, 800))
      boards.setShare(current.handle.boardId, { shareCode: newCode, sessionSecret: newSecret })
      await reconfigureShare(newCode, newSecret)
      pushToast(t('share.regenerated', { count: migrating }), 'success')
    },
    [reconfigureShare, boards, pushToast]
  )

  const cancelWaiting = useCallback(() => {
    joinEpochRef.current++
    lobbyClientRef.current?.destroy()
    lobbyClientRef.current = null
    setWaiting(null)
  }, [])

  const retryJoin = useCallback(() => {
    const code = lastJoinCodeRef.current
    if (code) void requestJoin(code)
  }, [requestJoin])

  // Actions du menu applicatif (Fichier → Exporter / Importer / Paramètres).
  useEffect(() => {
    if (typeof window.cosint === 'undefined') return
    return window.cosint.onMenuAction((action) => {
      if (action === 'open-settings') {
        setSettingsOpen(true)
      } else if (action === 'import-trace') {
        void handleImport()
      } else if (action === 'import-csv') {
        void handleImportCsv()
      } else if (
        boardRef.current &&
        (action === 'export-trace' || action === 'export-png' || action === 'export-csv')
      ) {
        menuSeq.current += 1
        setMenuSignal({ action, seq: menuSeq.current })
      }
    })
  }, [handleImport, handleImportCsv])

  useEffect(() => () => lobbyClientRef.current?.destroy(), [])

  useEffect(() => {
    if (typeof window.cosint === 'undefined' || !window.cosint.onUpdateStatus) return
    return window.cosint.onUpdateStatus((status) => {
      // §3 v1.8.2 : fenêtre légère (version + lien GitHub) dès qu'une MAJ est publiée,
      // enrichie d'un bouton « Redémarrer » une fois la version téléchargée.
      setUpdatePopup(status)
      if (status.state === 'downloaded') setUpdateReady(status.version)
    })
  }, [])

  if (!settings.profile) {
    return (
      <>
        <ProfileSetup />
        <Toasts />
      </>
    )
  }

  return (
    <>
      {board ? (
        <BoardView
          key={`${board.handle.boardId}:${settings.language}`}
          handle={board.handle}
          profile={settings.profile}
          isJoining={board.isJoining}
          menuSignal={menuSignal}
          onImportCsvNewBoard={(nodes, edges, title) => void handleImportCsvNewBoard(nodes, edges, title)}
          onBack={handleBack}
          onOpenSettings={() => setSettingsOpen(true)}
          onGenerateShare={(mode) => void generateShare(mode)}
          onRevokeShare={() => void revokeShare()}
          onRegenerateShare={(mode) => void regenerateShare(mode)}
        />
      ) : (
        <HomeScreen
          key={`home:${settings.language}`}
          onCreate={() => void handleCreate()}
          onJoin={(code) => void handleJoin(code)}
          onImport={() => void handleImport()}
          onOpen={(boardId) => void handleOpen(boardId)}
          onDelete={handleDelete}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {waiting && (
        <WaitingRoom
          state={waiting.state}
          onCancel={cancelWaiting}
          onRetry={
            waiting.state === 'refused' ||
            waiting.state === 'no-member' ||
            waiting.state === 'unreachable' ||
            waiting.state === 'full'
              ? retryJoin
              : undefined
          }
        />
      )}

      {lobbyServer && pending.length > 0 && (
        <ApprovalPrompt
          pending={pending}
          onApprove={(id) => lobbyServer.approve(id)}
          onRefuse={(id) => lobbyServer.refuse(id)}
        />
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {updatePopup && (
        <UpdatePopup
          state={updatePopup.state}
          version={updatePopup.version}
          onClose={() => setUpdatePopup(null)}
        />
      )}
      {/* La bannière discrète subsiste après fermeture de la fenêtre, comme rappel. */}
      {updateReady !== null && updatePopup === null && <UpdateBanner version={updateReady} />}
      <Toasts />
    </>
  )
}
