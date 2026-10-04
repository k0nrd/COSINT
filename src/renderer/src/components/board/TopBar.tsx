/** Barre supérieure du tableau : retour, titre éditable, recherche, annuler/rétablir,
 * état de connexion, présence, partage, export, paramètres. */
import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Download, Home, Redo2, Search, Settings, Share2, Undo2 } from 'lucide-react'
import type { AccessMode, PresenceAvatar, PresenceState, UserStatus } from '@/types'
import type { ConnectionDiagnostics } from '@/sync/network'
import { t } from '@/i18n'
import { PresenceList } from './PresenceList'
import { AccessIndicator } from './AccessIndicator'
import { StatusBar } from './StatusBar'
import './board.css'

interface TopBarProps {
  title: string
  onRename: (title: string) => void
  onBack: () => void
  onShare: () => void
  onExportTrace: () => void
  onExportPng: () => void
  onExportReport: () => void
  /** §1 v1.7 : import/export CSV. */
  onImportCsv: () => void
  onExportCsvEntities: () => void
  onExportCsvEdges: () => void
  onOpenSettings: () => void
  accessMode: AccessMode
  /** true = tableau solo (jamais partagé, §5). */
  solo: boolean
  /** true si l'utilisateur peut renommer le tableau (éditeur ou admin, §6). */
  canRename: boolean
  /** État réseau (§1.5) — la pilule ouvre le panneau de diagnostic. */
  connection: ConnectionDiagnostics
  onOpenDiagnostics: () => void
  others: Array<PresenceState & { clientId: number }>
  self: { name: string; color: string; avatar: PresenceAvatar; role: string; status: UserStatus }
  /** Refonte UI : la recherche s'ouvre depuis la barre supérieure (vue canvas seulement). */
  onToggleSearch: () => void
  searchActive: boolean
  searchAvailable: boolean
  /** Refonte UI : annuler / rétablir (masqués pour un visiteur, §6). */
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function TopBar({
  title,
  onRename,
  onBack,
  onShare,
  onExportTrace,
  onExportPng,
  onExportReport,
  onImportCsv,
  onExportCsvEntities,
  onExportCsvEdges,
  onOpenSettings,
  accessMode,
  solo,
  canRename,
  connection,
  onOpenDiagnostics,
  others,
  self,
  onToggleSearch,
  searchActive,
  searchAvailable,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}: TopBarProps): JSX.Element {
  // Brouillon local du titre : le CRDT n'est écrit qu'au blur/Entrée.
  const [draft, setDraft] = useState(title)
  useEffect(() => setDraft(title), [title])

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onMouseDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // Ferme uniquement ce menu et arrête l'événement pour ne pas déclencher
        // les autres raccourcis Échap (recherche, etc.).
        event.stopPropagation()
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menuOpen])

  const commitTitle = (): void => {
    const next = draft.trim()
    if (next === '') {
      setDraft(title)
      return
    }
    if (next !== title) onRename(next)
  }

  return (
    <header className="bd-topbar">
      <div className="bd-topbar__left">
        <button
          className="cm-btn cm-btn--ghost cm-btn--icon"
          onClick={onBack}
          title={t('board.backHome')}
          aria-label={t('board.backHome')}
        >
          <Home size={17} />
        </button>
        <ChevronRight size={13} className="bd-topbar__crumb" aria-hidden="true" />
        <input
          className="bd-topbar__title"
          value={draft}
          placeholder={t('board.titlePlaceholder')}
          readOnly={!canRename}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          }}
          aria-label={t('board.titlePlaceholder')}
        />
      </div>

      {/* Refonte UI : champ de recherche au centre — ouvre la barre de recherche du
          tableau (Ctrl+F), qui porte la saisie, les options et la navigation. */}
      {searchAvailable && (
        <button
          type="button"
          className={`bd-topbar__search${searchActive ? ' bd-topbar__search--active' : ''}`}
          onClick={onToggleSearch}
          title={t('toolbar.search')}
          aria-label={t('toolbar.search')}
          aria-pressed={searchActive}
          data-tut="search"
        >
          <Search size={14} />
          <span className="bd-topbar__search-label">{t('search.placeholder')}</span>
        </button>
      )}

      <div className="bd-topbar__right">
        {canRename && searchAvailable && (
          <div className="bd-topbar__history">
            <button
              className="cm-btn cm-btn--ghost cm-btn--icon"
              onClick={onUndo}
              disabled={!canUndo}
              title={t('toolbar.undo')}
              aria-label={t('toolbar.undo')}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="cm-btn cm-btn--ghost cm-btn--icon"
              onClick={onRedo}
              disabled={!canRedo}
              title={t('toolbar.redo')}
              aria-label={t('toolbar.redo')}
            >
              <Redo2 size={16} />
            </button>
          </div>
        )}
        <StatusBar
          connection={connection}
          onOpenDiagnostics={onOpenDiagnostics}
          solo={solo}
          onShare={onShare}
        />
        <PresenceList others={others} self={self} />
        {!solo && <AccessIndicator mode={accessMode} onClick={onShare} />}
        <button
          className="cm-btn cm-btn--primary"
          onClick={onShare}
          title={t('share.title')}
          data-tut="share"
        >
          <Share2 size={15} />
          {t('toolbar.share')}
        </button>
        <div className="bd-menu-wrap" ref={menuRef}>
          <button
            ref={menuButtonRef}
            className="cm-btn cm-btn--ghost cm-btn--icon"
            onClick={() => setMenuOpen((open) => !open)}
            title={t('toolbar.export')}
            aria-label={t('toolbar.export')}
            aria-expanded={menuOpen}
            data-tut="export"
          >
            <Download size={17} />
          </button>
          {menuOpen && (
            <div className="bd-menu" role="menu">
              <button
                className="bd-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onExportTrace()
                }}
              >
                {t('export.trace')}
              </button>
              <button
                className="bd-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onExportPng()
                }}
              >
                {t('export.png')}
              </button>
              <button
                className="bd-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onExportReport()
                }}
              >
                {t('export.report')}
              </button>
              <div className="bd-menu__sep" role="separator" />
              <button
                className="bd-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onImportCsv()
                }}
              >
                {t('csv.menuImport')}
              </button>
              <button
                className="bd-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onExportCsvEntities()
                }}
              >
                {t('csv.exportEntities')}
              </button>
              <button
                className="bd-menu__item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onExportCsvEdges()
                }}
              >
                {t('csv.exportEdges')}
              </button>
            </div>
          )}
        </div>
        <button
          className="cm-btn cm-btn--ghost cm-btn--icon"
          onClick={onOpenSettings}
          title={t('settings.title')}
          aria-label={t('settings.title')}
        >
          <Settings size={17} />
        </button>
      </div>
    </header>
  )
}
