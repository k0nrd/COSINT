/**
 * Panneau de diagnostic de connexion (v1.3, §1.4) : état de chaque serveur de
 * signalisation, pairs découverts et état WebRTC, dernière erreur, et bouton
 * « Retester la connexion ». Tout est en français et mis à jour en temps réel
 * (mêmes données que l'indicateur d'état).
 */
import { Activity, Globe, MonitorSmartphone, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { ConnectionDiagnostics, PeerStatus, SignalingServerStatus } from '@/sync/network'
import { Modal } from '@/components/common/Modal'
import { effectiveNetworkConfig, useSettings } from '@/store/settings'
import { useSyncLog } from '@/store/syncLog'
import { formatTime, t } from '@/i18n'
import './access.css'

interface DiagnosticsPanelProps {
  connection: ConnectionDiagnostics
  onRetest: () => void
  /** §1d : rafraîchit l'affichage (re-mesure) sans quitter l'app. */
  onRefreshView: () => void
  onClose: () => void
}

/** Libellé d'état d'un serveur de signalisation. */
function signalingLabel(server: SignalingServerStatus): string {
  if (server.state === 'connected') return t('diag.signalingConnected')
  if (server.state === 'connecting') return t('diag.signalingConnecting')
  return t('diag.signalingFailed', { retries: server.retries })
}

/** Libellé d'état d'une connexion pair. */
function peerLabel(peer: PeerStatus): string {
  if (peer.transport === 'local') return t('diag.peerLocal')
  if (peer.state === 'connected') return t('diag.peerConnected')
  if (peer.state === 'negotiating') return t('diag.peerNegotiating')
  return t('diag.peerFailed')
}

/** Résumé global affiché en tête du panneau. */
function statusSummary(connection: ConnectionDiagnostics): string {
  switch (connection.status) {
    case 'connected':
      return t('status.connected', { count: connection.peerCount })
    case 'waiting':
      return t('status.waiting')
    case 'connecting':
      return t('status.connecting')
    case 'unreachable':
      return t('status.unreachable')
    default:
      return t('status.localOnly')
  }
}

export function DiagnosticsPanel({
  connection,
  onRetest,
  onRefreshView,
  onClose
}: DiagnosticsPanelProps): JSX.Element {
  const syncLog = useSyncLog((state) => state.entries)
  const settings = useSettings()
  const networkMode = settings.networkMode
  // §réseau v1.7.1b — cohérence affichée = réalité : toute connexion de
  // signalisation qui ne figure PAS dans la configuration effective actuelle
  // (ex. serveur public encore connecté après un passage en 100 % local, avant
  // que la reconnexion automatique n'aboutisse) est signalée en clair.
  const expected = effectiveNetworkConfig(settings)
  const staleServers = connection.signaling.filter(
    (server) => !expected.signalingUrls.includes(server.url)
  )
  return (
    <Modal title={t('diag.title')} onClose={onClose} width={520}>
      <div className={`bd-diag-summary bd-diag-summary--${connection.status}`}>
        <Activity size={15} aria-hidden="true" />
        <span>{statusSummary(connection)}</span>
      </div>

      {/* §réseau v1.7.1 : rappel du mode réseau actif (Paramètres). */}
      <p className="bd-diag-netmode">
        {networkMode === 'local' ? (
          <ShieldCheck size={13} aria-hidden="true" />
        ) : (
          <Globe size={13} aria-hidden="true" />
        )}
        <span>{networkMode === 'local' ? t('diag.modeLocal') : t('diag.modeStandard')}</span>
      </p>
      {staleServers.length > 0 && (
        <p className="bd-diag-netmode bd-diag-netmode--warn" role="alert">
          <TriangleAlert size={13} aria-hidden="true" />
          <span>{t('diag.staleNetwork', { urls: staleServers.map((s) => s.url).join(', ') })}</span>
        </p>
      )}

      {/* Serveurs de signalisation */}
      <h3 className="bd-diag-section">{t('diag.signalingTitle')}</h3>
      <p className="cm-hint">{t('diag.signalingHint')}</p>
      {connection.signaling.length === 0 ? (
        <p className="bd-diag-empty">{t('diag.noSignaling')}</p>
      ) : (
        <ul className="bd-diag-list">
          {connection.signaling.map((server) => (
            <li key={server.url} className="bd-diag-item">
              <span
                className={`bd-diag-dot bd-diag-dot--${server.state}`}
                aria-hidden="true"
              />
              <span className="bd-diag-url">{server.url}</span>
              <span className="bd-diag-state">{signalingLabel(server)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Pairs découverts */}
      <h3 className="bd-diag-section">
        {t('diag.peersTitle', { count: connection.peers.length })}
      </h3>
      {connection.peers.length === 0 ? (
        <p className="bd-diag-empty">
          {connection.status === 'waiting' ? t('diag.noPeersWaiting') : t('diag.noPeers')}
        </p>
      ) : (
        <ul className="bd-diag-list">
          {connection.peers.map((peer) => (
            <li key={peer.peerId} className="bd-diag-item">
              <span
                className={`bd-diag-dot bd-diag-dot--${peer.state === 'connected' ? 'connected' : peer.state === 'negotiating' ? 'connecting' : 'failed'}`}
                aria-hidden="true"
              />
              <span className="bd-diag-url">{t('diag.peerName', { id: peer.peerId.slice(0, 8) })}</span>
              <span className="bd-diag-state">{peerLabel(peer)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Réseau restrictif : pairs découverts mais WebRTC bloqué (TURN requis). */}
      {connection.webrtcBlocked && (
        <p className="bd-diag-warning" role="alert">
          {t('diag.webrtcBlocked')}
        </p>
      )}

      {/* Dernière erreur détaillée */}
      {connection.lastError && (
        <>
          <h3 className="bd-diag-section">{t('diag.lastError')}</h3>
          <p className="bd-diag-error">{connection.lastError}</p>
        </>
      )}

      {/* Journal des événements de synchronisation (§1d) */}
      <h3 className="bd-diag-section">{t('diag.syncLogTitle')}</h3>
      <p className="cm-hint">{t('diag.syncLogHint')}</p>
      {syncLog.length === 0 ? (
        <p className="bd-diag-empty">{t('diag.syncLogEmpty')}</p>
      ) : (
        <ul className="bd-diag-log">
          {syncLog.map((entry) => (
            <li key={entry.id} className={`bd-diag-logitem bd-diag-logitem--${entry.level}`}>
              <span className="bd-diag-logtime">{formatTime(entry.at)}</span>
              <span className="bd-diag-logmsg">{entry.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="bd-diag-actions">
        <button className="cm-btn cm-btn--primary" onClick={onRetest}>
          <RefreshCw size={15} />
          {t('diag.retest')}
        </button>
        <button className="cm-btn" onClick={onRefreshView}>
          <MonitorSmartphone size={15} />
          {t('diag.refreshView')}
        </button>
      </div>
    </Modal>
  )
}
