/**
 * Écran d'accueil (§4) : actions principales et tableaux récents.
 * Présentationnel — la navigation et les effets (création, import…) sont
 * délégués au parent via les props ; seul l'état des dialogues est local.
 */
import { useState } from 'react'
import { FileUp, KeyRound, Plus, Settings, Trash2 } from 'lucide-react'
import { formatDateTime, t } from '@/i18n'
import { sortedBoards, useBoards } from '@/store/boards'
import type { BoardRegistryEntry } from '@/types'
import { Modal } from '@/components/common/Modal'
import { JoinDialog } from './JoinDialog'
import './home.css'

interface HomeScreenProps {
  onCreate: () => void
  onJoin: (canonicalCode: string) => void
  onImport: () => void
  onOpen: (boardId: string) => void
  onDelete: (boardId: string) => void
  onOpenSettings: () => void
}

export function HomeScreen({
  onCreate,
  onJoin,
  onImport,
  onOpen,
  onDelete,
  onOpenSettings
}: HomeScreenProps): JSX.Element {
  const boards = useBoards((state) => state.boards)
  const [joinOpen, setJoinOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<BoardRegistryEntry | null>(null)

  const recent = sortedBoards(boards)

  return (
    <div className="hm-screen">
      <div className="hm-container">
        <header className="hm-header">
          <div>
            <h1 className="hm-brand-title">{t('app.title')}</h1>
            <p className="hm-brand-tagline">{t('app.tagline')}</p>
          </div>
          <button
            className="cm-btn cm-btn--ghost cm-btn--icon"
            onClick={onOpenSettings}
            title={t('home.settings')}
            aria-label={t('home.settings')}
          >
            <Settings size={18} />
          </button>
        </header>

        <div className="hm-actions">
          <button className="hm-action" onClick={onCreate}>
            <span className="hm-action__icon">
              <Plus size={22} />
            </span>
            <span className="hm-action__label">{t('home.create')}</span>
          </button>
          <button className="hm-action" onClick={() => setJoinOpen(true)}>
            <span className="hm-action__icon">
              <KeyRound size={22} />
            </span>
            <span className="hm-action__label">{t('home.join')}</span>
          </button>
          <button className="hm-action" onClick={onImport}>
            <span className="hm-action__icon">
              <FileUp size={22} />
            </span>
            <span className="hm-action__label">{t('home.import')}</span>
          </button>
        </div>

        <section>
          <h2 className="hm-section-title">{t('home.recent')}</h2>
          {recent.length === 0 ? (
            <p className="hm-empty">{t('home.noRecent')}</p>
          ) : (
            <ul className="hm-board-list">
              {recent.map((board) => (
                <li key={board.boardId} className="hm-board">
                  <button
                    className="hm-board__main"
                    onClick={() => onOpen(board.boardId)}
                    title={t('home.open')}
                  >
                    <span className="hm-board__title">{board.title || t('board.untitled')}</span>
                    <span className="hm-board__meta">
                      <span className="hm-board__code">
                        {board.shareCode ?? t('home.soloBadge')}
                      </span>
                      <span>{t('home.lastOpened', { date: formatDateTime(board.lastOpenedAt) })}</span>
                    </span>
                  </button>
                  <button
                    className="cm-btn cm-btn--ghost cm-btn--icon hm-board__delete"
                    onClick={() => setPendingDelete(board)}
                    title={t('home.delete')}
                    aria-label={t('home.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {joinOpen && (
        <JoinDialog
          onSubmit={(canonical) => {
            setJoinOpen(false)
            onJoin(canonical)
          }}
          onClose={() => setJoinOpen(false)}
        />
      )}

      {pendingDelete && (
        <Modal
          title={t('home.delete')}
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <button className="cm-btn" onClick={() => setPendingDelete(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="cm-btn cm-btn--danger"
                onClick={() => {
                  onDelete(pendingDelete.boardId)
                  setPendingDelete(null)
                }}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p className="hm-confirm-text">
            {t('home.deleteConfirm', { title: pendingDelete.title || t('board.untitled') })}
          </p>
        </Modal>
      )}
    </div>
  )
}
