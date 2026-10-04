/**
 * Écran d'accueil (§4) : barre latérale d'actions et liste des tableaux récents.
 * Présentationnel — la navigation et les effets (création, import…) sont
 * délégués au parent via les props ; seul l'état des dialogues est local.
 */
import { useState, type CSSProperties, type FormEvent } from 'react'
import {
  FileUp,
  GraduationCap,
  KeyRound,
  Lock,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  Users
} from 'lucide-react'
import { formatDateTime, t } from '@/i18n'
import { sortedBoards, useBoards } from '@/store/boards'
import { useTutorial } from '@/store/tutorial'
import type { BoardRegistryEntry } from '@/types'
import type { OrgBranding } from '@/lib/orgProfile'
import { Modal } from '@/components/common/Modal'
import { AuthorTag } from '@/components/common/AuthorTag'
import { normalizeShareCode } from '@/lib/shareCode'
import { JoinDialog, formatShareCodeDraft } from './JoinDialog'
import cosintLogo from '@/assets/logo.png'
import './home.css'
import '@/components/tutorial/tutorial.css'

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
  const openTutorialIntro = useTutorial((state) => state.openIntro)
  const tutorialSeen = useTutorial((state) => state.seen)
  const tutorialActive = useTutorial((state) => state.active)
  const [joinOpen, setJoinOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<BoardRegistryEntry | null>(null)

  // Refonte UI : champ « rejoindre avec un code » directement dans l'en-tête de la liste
  // (même validation que le dialogue, qui reste accessible depuis la barre latérale).
  const [joinCode, setJoinCode] = useState('')
  const [joinInvalid, setJoinInvalid] = useState(false)
  const submitInlineJoin = (event: FormEvent): void => {
    event.preventDefault()
    if (joinCode === '') return
    const canonical = normalizeShareCode(joinCode)
    if (canonical === null) {
      setJoinInvalid(true)
      return
    }
    setJoinCode('')
    onJoin(canonical)
  }

  const recent = sortedBoards(boards)

  // §1 v1.8.7 : l'accent de l'organisation (le cas échéant) ne re-teinte QUE l'accueil.
  const screenStyle = branding?.accent ? ({ '--accent': branding.accent } as CSSProperties) : undefined

  return (
    <div className={branding?.accent ? 'hm-screen hm-screen--branded' : 'hm-screen'} style={screenStyle}>
      {/* Refonte UI : barre latérale (marque, action principale, actions secondaires,
          tutoriel/paramètres) + zone principale réservée à la liste des tableaux. */}
      <aside className="hm-side">
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
          <div className="hm-brand hm-brand--cosint">
            <img className="hm-brand__logo" src={cosintLogo} alt="" aria-hidden="true" />
            <div className="hm-brand__text">
              <h1 className="hm-brand-title">{t('app.title')}</h1>
              <p className="hm-brand-tagline">{t('app.tagline')}</p>
            </div>
          </div>
        )}

        <div className="hm-actions">
          <button
            className="cm-btn cm-btn--primary hm-action hm-action--primary"
            onClick={onCreate}
            data-tut="home-create"
          >
            <Plus size={15} />
            <span className="hm-action__label">{t('home.create')}</span>
          </button>
          <button className="hm-action" onClick={() => setJoinOpen(true)}>
            <KeyRound size={15} />
            <span className="hm-action__label">{t('home.join')}</span>
          </button>
          <button className="hm-action" onClick={onImport}>
            <FileUp size={15} />
            <span className="hm-action__label">{t('home.import')}</span>
          </button>
        </div>

        <div className="hm-side__foot">
          {/* Rappel de confidentialité (même phrase qu'à la première ouverture). */}
          <p className="hm-side__note">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>{t('profile.privacyNote')}</span>
          </p>
          {/* §1 v1.8.8 : porte d'entrée du parcours guidé — discrète, jamais imposée.
              Retirée pendant le parcours : le coach est déjà à l'écran. */}
          {!tutorialActive && (
            <button
              className="hm-action tu-launch"
              onClick={openTutorialIntro}
              title={t('tutorial.buttonTitle')}
            >
              <GraduationCap size={15} />
              <span className="hm-action__label">{t('tutorial.button')}</span>
              {!tutorialSeen && <span className="tu-launch__new" aria-hidden="true" />}
            </button>
          )}
          <button
            className="hm-action"
            onClick={onOpenSettings}
            title={t('home.settings')}
            aria-label={t('home.settings')}
          >
            <Settings size={15} />
            <span className="hm-action__label">{t('home.settings')}</span>
          </button>
          {/* §2 v1.8.8 : l'origine du logiciel reste lisible, y compris co-marqué. */}
          <AuthorTag className="hm-brand__author" />
        </div>
      </aside>

      <main className="hm-main">
        <div className="hm-container">
          <div className="hm-head">
            <h2 className="hm-section-title">
              {t('home.recent')}
              {recent.length > 0 && <span className="hm-section-count">{recent.length}</span>}
            </h2>
            <form className="hm-joinbar" onSubmit={submitInlineJoin}>
              <div className="hm-joinbar__row">
                <div className="hm-joinbar__field">
                  <KeyRound size={13} aria-hidden="true" />
                  <input
                    className="cm-input hm-joinbar__input"
                    value={joinCode}
                    placeholder={t('home.joinInline')}
                    aria-label={t('home.joinInline')}
                    aria-invalid={joinInvalid}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => {
                      setJoinCode(formatShareCodeDraft(event.target.value))
                      setJoinInvalid(false)
                    }}
                  />
                </div>
                <button className="cm-btn" type="submit" disabled={joinCode === ''}>
                  {t('join.submit')}
                </button>
              </div>
              {joinInvalid && (
                <p className="hm-error" role="alert">
                  {t('join.invalidCode')}
                </p>
              )}
            </form>
          </div>
          {recent.length === 0 ? (
            <p className="hm-empty">{t('home.noRecent')}</p>
          ) : (
            <ul className="hm-board-list">
              <li className="hm-board hm-board--head" aria-hidden="true">
                <span className="hm-board__main">
                  <span>{t('home.colName')}</span>
                  <span>{t('home.colShare')}</span>
                  <span>{t('home.colOpened')}</span>
                </span>
                <span className="hm-board__delete-slot" />
              </li>
              {recent.map((board) => (
                <li key={board.boardId} className="hm-board">
                  <button
                    className="hm-board__main"
                    onClick={() => onOpen(board.boardId)}
                    title={t('home.open')}
                  >
                    <span className="hm-board__title">{board.title || t('board.untitled')}</span>
                    <span className="hm-board__code">
                      {board.shareCode ? <Users size={13} /> : <Lock size={13} />}
                      <span className={board.shareCode ? 'hm-board__codeval' : undefined}>
                        {board.shareCode ?? t('home.soloBadge')}
                      </span>
                    </span>
                    <span
                      className="hm-board__date"
                      title={t('home.lastOpened', { date: formatDateTime(board.lastOpenedAt) })}
                    >
                      {formatDateTime(board.lastOpenedAt)}
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
          {recent.length > 0 && <p className="hm-list-note">{t('home.deleteNote')}</p>}
        </div>
      </main>

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
