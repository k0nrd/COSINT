/**
 * Indicateur d'état de connexion (v1.3, §1.5) — pilule cliquable de la barre
 * supérieure. Quatre états réellement distincts (voir sync/network.ts) ;
 * un clic ouvre le panneau de diagnostic détaillé.
 */
import type { ConnectionDiagnostics } from '@/sync/network'
import { t } from '@/i18n'

interface StatusBarProps {
  connection: ConnectionDiagnostics
  onOpenDiagnostics: () => void
  /** true = tableau solo (jamais partagé, §5) : indicateur dédié « privé (solo) ». */
  solo?: boolean
  /** Ouvre le menu de partage (clic sur l'indicateur solo). */
  onShare?: () => void
}

export function StatusBar({ connection, onOpenDiagnostics, solo, onShare }: StatusBarProps): JSX.Element {
  const { status, peerCount } = connection

  // Tableau solo (§5) : indicateur dédié qui invite à générer un code.
  if (solo) {
    return (
      <button
        type="button"
        className="bd-status bd-status--topbar bd-status--solo"
        onClick={onShare}
        title={t('share.generateHint')}
        aria-label={t('status.solo')}
      >
        <span className="bd-status__dot" aria-hidden="true" />
        <span className="bd-status__label">{t('status.solo')}</span>
      </button>
    )
  }

  const label =
    status === 'connected'
      ? t('status.connected', { count: peerCount })
      : status === 'waiting'
        ? t('status.waiting')
        : status === 'connecting'
          ? t('status.connecting')
          : status === 'unreachable'
            ? t('status.unreachable')
            : t('status.localOnly')

  return (
    <button
      type="button"
      className={`bd-status bd-status--topbar bd-status--${status}`}
      onClick={onOpenDiagnostics}
      title={t('status.openDiagnostics')}
      aria-label={`${label} — ${t('status.openDiagnostics')}`}
    >
      <span className="bd-status__dot" aria-hidden="true" />
      <span className="bd-status__label">{label}</span>
    </button>
  )
}
