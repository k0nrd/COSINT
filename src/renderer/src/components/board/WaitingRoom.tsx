/**
 * Salle d'attente (§6, refondue v1.3 §1.6) : écran plein affiché au demandeur
 * pendant le handshake d'accès. Chaque cause d'attente a son message :
 * « réseau injoignable » n'est plus confondu avec « aucun membre en ligne ».
 */
import { Hourglass, Radio, ShieldX, UserX, WifiOff, ArrowUpCircle, Users } from 'lucide-react'
import type { LobbyClientPhase } from '@/sync/lobby'
import { t } from '@/i18n'
import type { MessageKey } from '@/i18n'
import './access.css'

export type WaitingRoomState = LobbyClientPhase | 'refused' | 'outdated' | 'full'

interface WaitingRoomProps {
  state: WaitingRoomState
  onCancel: () => void
  onRetry?: () => void
}

/** Icône, message principal et détail par état. */
const STATE_META: Record<
  WaitingRoomState,
  { icon: JSX.Element; textKey: MessageKey; subKey?: MessageKey; busy: boolean }
> = {
  connecting: {
    icon: <Radio size={18} />,
    textKey: 'waiting.connecting',
    subKey: 'waiting.connectingSub',
    busy: true
  },
  searching: {
    icon: <Radio size={18} />,
    textKey: 'waiting.searching',
    subKey: 'waiting.searchingSub',
    busy: true
  },
  'member-present': {
    icon: <Hourglass size={18} />,
    textKey: 'waiting.sent',
    subKey: 'waiting.pending',
    busy: true
  },
  'no-member': {
    icon: <UserX size={18} />,
    textKey: 'waiting.noMember',
    subKey: 'waiting.noMemberSub',
    busy: true
  },
  unreachable: {
    icon: <WifiOff size={18} />,
    textKey: 'waiting.unreachable',
    subKey: 'waiting.unreachableSub',
    busy: false
  },
  refused: {
    icon: <ShieldX size={18} />,
    textKey: 'waiting.refused',
    busy: false
  },
  outdated: {
    icon: <ArrowUpCircle size={18} />,
    textKey: 'waiting.outdated',
    subKey: 'waiting.outdatedSub',
    busy: false
  },
  full: {
    icon: <Users size={18} />,
    textKey: 'waiting.full',
    subKey: 'waiting.fullSub',
    busy: false
  }
}

export function WaitingRoom({ state, onCancel, onRetry }: WaitingRoomProps): JSX.Element {
  const meta = STATE_META[state]

  return (
    <div className={`bd-waiting bd-waiting--${state}`}>
      <div className="bd-waiting-card" role="status" aria-live="polite">
        <div className="bd-waiting-icon" aria-hidden="true">
          {meta.icon}
        </div>
        <h1 className="bd-waiting-title">{t('waiting.title')}</h1>

        <p className="bd-waiting-text">{t(meta.textKey)}</p>
        {meta.subKey && <p className="bd-waiting-sub">{t(meta.subKey)}</p>}
        {meta.busy && (
          <div className="bd-waiting-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}

        <div className="bd-waiting-actions">
          {onRetry && (
            <button className="cm-btn cm-btn--primary" onClick={onRetry}>
              {t('common.retry')}
            </button>
          )}
          <button className="cm-btn" onClick={onCancel}>
            {t('waiting.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
