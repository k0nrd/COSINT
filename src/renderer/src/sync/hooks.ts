/**
 * Ponts React ↔ Yjs : abonnements aux données du tableau, à la présence,
 * à l'état de connexion et à l'undo/redo.
 */
import { useEffect, useMemo, useState } from 'react'
import type {
  BoardComment,
  BoardEdgeData,
  BoardMeta,
  BoardNodeData,
  BoardRole,
  CustomEntityType,
  PresenceState
} from '@/types'
import type { BoardHandle } from './BoardDoc'
import {
  localOnlyDiagnostics,
  observeBoardConnection,
  readOthersPresence,
  retestBoardConnection
} from './BoardDoc'
import { logSync } from '@/store/syncLog'
import type { ConnectionDiagnostics } from './network'
import { readFileStatus, resolveAvatar, type FileStatus } from './files'
import {
  effectiveRole,
  getCommentsMap,
  getCustomTypesMap,
  getEdgesMap,
  getFilesMap,
  getMetaMap,
  getNodesMap,
  getRolesMap,
  readAllComments,
  readAllEdges,
  readAllNodes,
  readCustomTypes,
  readMeta
} from './model'

/** Nœuds et connexions du tableau, re-rendus à chaque changement (local ou distant). */
export function useBoardData(handle: BoardHandle): {
  nodes: BoardNodeData[]
  edges: BoardEdgeData[]
} {
  const [nodes, setNodes] = useState<BoardNodeData[]>(() => readAllNodes(handle.doc))
  const [edges, setEdges] = useState<BoardEdgeData[]>(() => readAllEdges(handle.doc))

  useEffect(() => {
    const nodesMap = getNodesMap(handle.doc)
    const edgesMap = getEdgesMap(handle.doc)
    const onNodes = (): void => setNodes(readAllNodes(handle.doc))
    const onEdges = (): void => setEdges(readAllEdges(handle.doc))
    nodesMap.observeDeep(onNodes)
    edgesMap.observeDeep(onEdges)
    onNodes()
    onEdges()
    return () => {
      nodesMap.unobserveDeep(onNodes)
      edgesMap.unobserveDeep(onEdges)
    }
  }, [handle])

  return { nodes, edges }
}

/** Types d'entité personnalisés du tableau (§2 v1.8), re-rendus à chaque changement. */
export function useCustomTypes(handle: BoardHandle): CustomEntityType[] {
  const [types, setTypes] = useState<CustomEntityType[]>(() => readCustomTypes(handle.doc))
  useEffect(() => {
    const map = getCustomTypesMap(handle.doc)
    const update = (): void => setTypes(readCustomTypes(handle.doc))
    map.observeDeep(update)
    update()
    return () => map.unobserveDeep(update)
  }, [handle])
  return types
}

/**
 * État de la synchronisation initiale d'un nouvel arrivant (§1a v1.5).
 *
 * Tant que l'intégralité de l'état courant n'est pas reçue, l'UI affiche un écran
 * « Synchronisation du tableau… » : le nouvel arrivant ne voit JAMAIS un canvas
 * vide alors que le tableau est déjà rempli. Considéré prêt quand :
 *  - le tableau est solo/local (aucun provider) → immédiatement ; ou
 *  - le meta du document est arrivé (`createdAt > 0`, preuve que l'état initial a
 *    été reçu — un membre qui rouvre un tableau déjà en cache local l'a d'emblée) ;
 *  - ou le provider a signalé au moins une synchro complète (`synced`).
 *
 * Robustesse : si rien n'est reçu après quelques secondes, on relance
 * automatiquement signalisation + découverte (backoff), plutôt que de rester
 * bloqué sur un canvas vide. Chaque tentative est journalisée (diagnostic §1d).
 *
 * IMPORTANT : le signal de « prêt » est l'arrivée du META du document
 * (`createdAt > 0`) — preuve que l'état initial a RÉELLEMENT été reçu. On NE se
 * fie PAS à l'événement `synced` de y-webrtc, qui émet un `synced: true` VACUEUX
 * quand la dernière connexion pair se ferme (room.webrtcConns vidée) — y compris
 * pendant notre propre backoff (disconnect/connect) : s'y fier ouvrirait le gate
 * sur un canvas vide (bug relevé en revue).
 */
export function useInitialSync(
  handle: BoardHandle,
  active: boolean
): { ready: boolean; peerCount: number; nodeCount: number; edgeCount: number } {
  const isReady = (): boolean => !handle.provider || readMeta(handle.doc).createdAt > 0
  const [ready, setReady] = useState<boolean>(() => !active || isReady())
  const [counts, setCounts] = useState<{ peers: number; nodes: number; edges: number }>(() => ({
    peers: handle.awareness ? Math.max(0, handle.awareness.getStates().size - 1) : 0,
    nodes: getNodesMap(handle.doc).size,
    edges: getEdgesMap(handle.doc).size
  }))

  useEffect(() => {
    if (!active || !handle.provider) {
      setReady(true)
      return
    }
    let done = false
    const awareness = handle.awareness
    const meta = getMetaMap(handle.doc)

    const refreshCounts = (): void => {
      setCounts({
        peers: awareness ? Math.max(0, awareness.getStates().size - 1) : 0,
        nodes: getNodesMap(handle.doc).size,
        edges: getEdgesMap(handle.doc).size
      })
    }

    const evaluate = (): void => {
      refreshCounts()
      if (done) return
      // Prêt UNIQUEMENT quand le meta réel est arrivé (état initial reçu).
      if (readMeta(handle.doc).createdAt > 0) {
        done = true
        logSync('success', 'Synchronisation initiale du tableau terminée.')
        setReady(true)
      }
    }

    const onMeta = (): void => evaluate()
    const onDoc = (): void => evaluate()

    meta.observe(onMeta)
    handle.doc.on('afterTransaction', onDoc)

    // Backoff de ré-essai : relance la découverte si l'état initial tarde.
    const delays = [4000, 8000, 16000]
    const timers = delays.map((delay, attempt) =>
      window.setTimeout(() => {
        if (done) return
        logSync('warn', `État initial toujours attendu — relance de la connexion (essai ${attempt + 1}).`)
        retestBoardConnection(handle)
      }, delay)
    )

    evaluate()
    return () => {
      meta.unobserve(onMeta)
      handle.doc.off('afterTransaction', onDoc)
      for (const timer of timers) window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, active])

  return { ready, peerCount: counts.peers, nodeCount: counts.nodes, edgeCount: counts.edges }
}

/** Métadonnées du tableau (titre…). */
export function useBoardMeta(handle: BoardHandle): BoardMeta {
  const [meta, setMeta] = useState<BoardMeta>(() => readMeta(handle.doc))
  useEffect(() => {
    const map = getMetaMap(handle.doc)
    const onChange = (): void => setMeta(readMeta(handle.doc))
    map.observe(onChange)
    onChange()
    return () => map.unobserve(onChange)
  }, [handle])
  return meta
}

/** Tous les commentaires du tableau (triés par date). */
export function useAllComments(handle: BoardHandle): BoardComment[] {
  const [comments, setComments] = useState<BoardComment[]>(() => readAllComments(handle.doc))
  useEffect(() => {
    const map = getCommentsMap(handle.doc)
    const onChange = (): void => setComments(readAllComments(handle.doc))
    map.observe(onChange)
    onChange()
    return () => map.unobserve(onChange)
  }, [handle])
  return comments
}

/** Fil de commentaires d'un nœud donné. */
export function useNodeComments(handle: BoardHandle, nodeId: string | null): BoardComment[] {
  const all = useAllComments(handle)
  return useMemo(
    () => (nodeId === null ? [] : all.filter((comment) => comment.nodeId === nodeId)),
    [all, nodeId]
  )
}

/**
 * Présence des autres participants (curseurs, sélections, identités). Les avatars
 * référencés par hash (§1 v1.4) sont résolus en data-URL via la Y.Map `files` :
 * on ré-évalue donc aussi à chaque changement de `files` (l'avatar d'un pair
 * apparaît dès que ses chunks sont arrivés).
 */
export function usePresence(handle: BoardHandle): Array<PresenceState & { clientId: number }> {
  const resolve = (): Array<PresenceState & { clientId: number }> =>
    readOthersPresence(handle).map((other) => ({
      ...other,
      user: { ...other.user, avatar: resolveAvatar(handle.doc, other.user.avatar) }
    }))
  const [others, setOthers] = useState<Array<PresenceState & { clientId: number }>>(resolve)
  useEffect(() => {
    const awareness = handle.awareness
    if (!awareness) return
    const files = getFilesMap(handle.doc)
    const onChange = (): void => setOthers(resolve())
    awareness.on('change', onChange)
    files.observe(onChange)
    onChange()
    return () => {
      awareness.off('change', onChange)
      files.unobserve(onChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle])
  return others
}

/**
 * État de résolution d'un fichier référencé par hash (§1 v1.4) : re-rendu à
 * chaque arrivée de chunk (affichage progressif du transfert d'image). `hash`
 * null (ou une data-URL héritée non migrée) → statut « missing » sans abonnement.
 */
export function useFile(handle: BoardHandle, hash: string | null): FileStatus {
  const [status, setStatus] = useState<FileStatus>(() =>
    hash ? readFileStatus(handle.doc, hash) : { status: 'missing' }
  )
  useEffect(() => {
    if (!hash) {
      setStatus({ status: 'missing' })
      return
    }
    const files = getFilesMap(handle.doc)
    const onChange = (): void => setStatus(readFileStatus(handle.doc, hash))
    files.observe(onChange)
    onChange()
    return () => files.unobserve(onChange)
  }, [handle, hash])
  return status
}

/** État de connexion P2P détaillé (§5, refondu v1.3 §1) : indicateur ET
 * panneau de diagnostic consomment la même photographie réseau. */
export function useConnectionStatus(handle: BoardHandle): ConnectionDiagnostics {
  const [info, setInfo] = useState<ConnectionDiagnostics>(() => {
    const base = localOnlyDiagnostics()
    // Avant la première photographie : « connexion en cours » si un provider existe.
    return handle.provider ? { ...base, status: 'connecting' } : base
  })
  useEffect(() => observeBoardConnection(handle, setInfo), [handle])
  return info
}

/**
 * Rôle effectif de l'utilisateur local sur le tableau (§6 v1.4), recalculé à
 * chaque changement de `meta` (adminId) ou de la map `roles`. Un tableau solo
 * (sans admin déclaré) : l'utilisateur est éditeur par défaut.
 */
export function useMyRole(handle: BoardHandle, userId: string): BoardRole {
  const [role, setRole] = useState<BoardRole>(() => effectiveRole(handle.doc, userId))
  useEffect(() => {
    const meta = getMetaMap(handle.doc)
    const roles = getRolesMap(handle.doc)
    const onChange = (): void => setRole(effectiveRole(handle.doc, userId))
    meta.observe(onChange)
    roles.observe(onChange)
    onChange()
    return () => {
      meta.unobserve(onChange)
      roles.unobserve(onChange)
    }
  }, [handle, userId])
  return role
}

/** Attributions de rôles explicites (§6), en enregistrement `userId → rôle`,
 * réactif. Sert au panneau Participants (l'admin y voit et change les rôles). */
export function useRoles(handle: BoardHandle): Record<string, string> {
  const read = (): Record<string, string> => {
    const record: Record<string, string> = {}
    getRolesMap(handle.doc).forEach((value, key) => {
      if (typeof value === 'string') record[key] = value
    })
    return record
  }
  const [roles, setRoles] = useState<Record<string, string>>(read)
  useEffect(() => {
    const map = getRolesMap(handle.doc)
    const onChange = (): void => setRoles(read())
    map.observe(onChange)
    onChange()
    return () => map.unobserve(onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle])
  return roles
}

/** Undo/redo par utilisateur (Ctrl+Z / Ctrl+Y). */
export function useUndoRedo(handle: BoardHandle): {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
} {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const bump = (): void => setVersion((v) => v + 1)
    handle.undo.on('stack-item-added', bump)
    handle.undo.on('stack-item-popped', bump)
    handle.undo.on('stack-cleared', bump)
    return () => {
      handle.undo.off('stack-item-added', bump)
      handle.undo.off('stack-item-popped', bump)
      handle.undo.off('stack-cleared', bump)
    }
  }, [handle])
  return {
    undo: () => handle.undo.undo(),
    redo: () => handle.undo.redo(),
    canUndo: handle.undo.canUndo(),
    canRedo: handle.undo.canRedo()
  }
}
