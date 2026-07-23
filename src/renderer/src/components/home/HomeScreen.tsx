/**
 * Écran d'accueil (§4) : actions principales et tableaux récents.
 * Présentationnel — la navigation et les effets (création, import…) sont
 * délégués au parent via les props ; seul l'état des dialogues est local.
 */
import { useState, type CSSProperties } from 'react'
import { FileUp, KeyRound, Plus, Settings, Trash2 } from 'lucide-react'
import { formatDateTime, t } from '@/i18n'
import { sortedBoards, useBoards } from '@/store/boards'
import type { BoardRegistryEntry } from '@/types'
import type { OrgBranding } from '@/lib/orgProfile'
import { Modal } from '@/components/common/Modal'
import { JoinDialog } from './JoinDialog'
import './home.css'

interface HomeScreenProps {
  /** §1 v1.8.7 : marque d'organisation (mode 100 % local) — co-marquage « COSINT · Org ». */
  branding: OrgBranding | null
  onCreate: () => void
  onJoin: (canonicalCode: string) => void
  onImport: () => void
  onOpen: (boardId: string) => void
  onDelete: (boardId: string) => void
  onOpenSettings: () => void
}

export function HomeScreen({
  branding,
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

  // §1 v1.8.7 : l'accent de l'organisation (le cas échéant) ne re-teinte QUE l'accueil.
  const screenStyle = branding?.accent ? ({ '--accent': branding.accent } as CSSProperties) : undefined

  return (
    <div className="hm-screen" style={screenStyle}>
      <div className="hm-container">
        <header className="hm-header">
          {branding ? (
            // Co-marquage « COSINT · Organisation » : le logo + le nom de l'organisation
            // mènent, l'identité COSINT reste visible (jamais de confusion sur l'origine).
            <div className="hm-brand hm-brand--org">
              {branding.logo && (
                <img className="hm-brand__logo" src={branding.logo} alt="" aria-hidden="true" />
              )}
              <div className="hm-brand__text">
                <h1 className="hm-brand-title">{branding.name}</h1>
                <p className="hm-brand-tagline">
                  {branding.subtitle || t('app.tagline')}
                  <span className="hm-brand__cobrand">{t('home.onCosint')}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="hm-brand">
              <h1 className="hm-brand-title">{t('app.title')}</h1>
              <p className="hm-brand-tagline">{t('app.tagline')}</p>
            </div>
          )}
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
