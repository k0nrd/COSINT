/**
 * Contexte fourni par BoardView à tous les composants du tableau (nœuds,
 * panneaux, barre d'outils). Centralise les opérations d'écriture — prêt pour
 * l'ajout de rôles en v2 (il suffira d'y brancher un mode lecture seule).
 */
import { createContext, useContext } from 'react'
import type { BoardRole, CustomEntityType, EdgeAnchor, ElementStatus, UserProfile } from '@/types'
import type { BoardHandle } from '@/sync/BoardDoc'
import type { EdgePatch, NodePatch } from '@/sync/boardOps'
import type { CustomTypeMap } from '@/lib/entityTypes'
import type { ValueMatch } from '@/lib/matching'

export interface BoardContextValue {
  handle: BoardHandle
  profile: UserProfile
  /** Pseudo utilisé pour la traçabilité createdBy/updatedBy. */
  author: string
  /** Rôle effectif de l'utilisateur local sur ce tableau (§6). */
  role: BoardRole
  /** true si l'utilisateur peut éditer le contenu (éditeur ou admin). */
  canEdit: boolean
  /** true si l'utilisateur gère le partage/les rôles (admin seul). */
  canManageSharing: boolean
  /** §2 v1.8 : types d'entité personnalisés du tableau (liste + table id→def). */
  customTypes: CustomEntityType[]
  customTypeMap: CustomTypeMap
  updateNodeData: (id: string, patch: NodePatch) => void
  deleteNodes: (ids: string[]) => void
  duplicateNodes: (ids: string[]) => void
  updateEdgeData: (id: string, patch: EdgePatch) => void
  deleteEdges: (ids: string[]) => void
  /** Fixe (ou libère avec `null`) le côté d'ancrage d'une extrémité de lien (§1 v1.6). */
  setEdgeAnchor: (id: string, which: 'source' | 'target', anchor: EdgeAnchor | null) => void
  /** Efface le routage manuel d'un lien → tracé automatique (§1 v1.6). */
  resetEdgeRouting: (id: string) => void
  /** Pose/retire le badge de statut d'un lot de nœuds (§3 v1.5). */
  setNodesStatus: (ids: string[], status: ElementStatus) => void
  /** Pose/retire le badge de statut d'un lot de liens (§3 v1.5). */
  setEdgesStatus: (ids: string[], status: ElementStatus) => void
  addComment: (nodeId: string, text: string) => void
  deleteComment: (commentId: string) => void
  /** Ouvre une URL dans le navigateur externe (jamais dans l'app, §8). */
  openExternal: (url: string) => void
  /**
   * §3 v1.8.1 : cherche les autres éléments du tableau portant déjà l'information
   * `value` (hors `excludeNodeId`), pour proposer discrètement une liaison.
   */
  findValueMatches: (value: string, excludeNodeId: string) => ValueMatch[]
  /**
   * §3 v1.8.1 : relie deux éléments (lien « associé à »), avec un libellé optionnel
   * (ex. l'information partagée). Sans effet s'ils sont déjà reliés (toast informatif).
   */
  createRelation: (sourceId: string, targetId: string, label?: string) => void
}

export const BoardContext = createContext<BoardContextValue | null>(null)

export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoardContext doit être utilisé sous <BoardContext.Provider>')
  return value
}
