/**
 * Registre local des tableaux connus de ce poste (écran d'accueil, §4/§5).
 *
 * §5 v1.4 : l'identifiant local `boardId` est découplé du code de partage. Un
 * tableau peut être solo (`shareCode: null`). Migration depuis la v1.3
 * (`roomId` → `boardId`) via `persist` versionné.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BoardRegistryEntry } from '@/types'

interface BoardsState {
  boards: BoardRegistryEntry[]
  upsert: (entry: BoardRegistryEntry) => void
  /** Met à jour le titre et/ou la date de dernière ouverture. */
  touch: (boardId: string, patch?: Partial<Pick<BoardRegistryEntry, 'title'>>) => void
  /** Met à jour le partage d'un tableau (génération / révocation de code, §5). */
  setShare: (
    boardId: string,
    share: { shareCode: string | null; sessionSecret?: string; role?: BoardRegistryEntry['role'] }
  ) => void
  remove: (boardId: string) => void
}

/** Secret de session mémorisé localement pour un tableau (undefined si inconnu). */
export function secretForBoard(boardId: string): string | undefined {
  return useBoards.getState().boards.find((board) => board.boardId === boardId)?.sessionSecret
}

/** Entrée du registre pour un boardId donné. */
export function boardEntry(boardId: string): BoardRegistryEntry | undefined {
  return useBoards.getState().boards.find((board) => board.boardId === boardId)
}

export const useBoards = create<BoardsState>()(
  persist(
    (set) => ({
      boards: [],
      upsert: (entry) =>
        set((state) => ({
          boards: [entry, ...state.boards.filter((board) => board.boardId !== entry.boardId)]
        })),
      touch: (boardId, patch) =>
        set((state) => ({
          boards: state.boards.map((board) =>
            board.boardId === boardId ? { ...board, ...patch, lastOpenedAt: Date.now() } : board
          )
        })),
      setShare: (boardId, share) =>
        set((state) => ({
          boards: state.boards.map((board) =>
            board.boardId === boardId
              ? {
                  ...board,
                  shareCode: share.shareCode,
                  sessionSecret: share.sessionSecret,
                  ...(share.role ? { role: share.role } : {})
                }
              : board
          )
        })),
      remove: (boardId) =>
        set((state) => ({ boards: state.boards.filter((board) => board.boardId !== boardId) }))
    }),
    {
      name: 'cosint:boards',
      version: 1,
      // Migration v1.3 → v1.4 : `roomId` devient `boardId` (même valeur, le
      // stockage `cosint-<roomId>` reste `cosint-<boardId>`). Les tableaux
      // existants gardent leur code (jamais solo rétroactivement).
      migrate: (persisted, version) => {
        const state = persisted as { boards?: unknown }
        if (version >= 1) return state as { boards: BoardRegistryEntry[] }
        const boards = Array.isArray(state.boards) ? state.boards : []
        return {
          boards: boards.map((raw) => {
            const board = raw as Record<string, unknown>
            const legacyId = typeof board.boardId === 'string' ? board.boardId : board.roomId
            return {
              boardId: typeof legacyId === 'string' ? legacyId : '',
              shareCode: typeof board.shareCode === 'string' ? board.shareCode : null,
              title: typeof board.title === 'string' ? board.title : '',
              createdAt: typeof board.createdAt === 'number' ? board.createdAt : Date.now(),
              lastOpenedAt: typeof board.lastOpenedAt === 'number' ? board.lastOpenedAt : Date.now(),
              sessionSecret:
                typeof board.sessionSecret === 'string' ? board.sessionSecret : undefined
            } as BoardRegistryEntry
          })
        }
      }
    }
  )
)

/** Tableaux triés par dernière ouverture décroissante. */
export function sortedBoards(boards: BoardRegistryEntry[]): BoardRegistryEntry[] {
  return [...boards].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}
