/**
 * Dialogue de partage (§5/§6 v1.4).
 *
 * Cycle de vie du partage : un tableau naît SOLO (aucun code, aucune connexion).
 *  - Solo    → choix du mode d'accès + bouton « Générer un code de partage ».
 *  - Partagé → code + copie, révocation / régénération (admin), réglages (mode,
 *              limite de participants) et panneau « Participants » avec les rôles.
 */
import { useState } from 'react'
import { Clock, Copy, Lock, RefreshCw, ShieldOff, Unlock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  MAX_PARTICIPANT_LIMIT,
  MIN_PARTICIPANT_LIMIT,
  type AccessLogEntry,
  type AccessMode,
  type BoardRole,
  type PresenceAvatar
} from '@/types'
import { Modal } from '@/components/common/Modal'
import { Avatar } from '@/components/common/Avatar'
import { useToasts } from '@/store/toasts'
import { formatDateTime, t } from '@/i18n'
import type { MessageKey } from '@/i18n'
import './access.css'

export interface ShareParticipant {
  userId: string
  name: string
  color: string
  avatar: PresenceAvatar
  role: BoardRole
  online: boolean
}

interface ShareDialogProps {
  solo: boolean
  code: string | null
  participantCount: number
  accessMode: AccessMode
  accessLog: AccessLogEntry[]
  participantLimit: number
  /** true si l'utilisateur est admin (peut tout régler). */
  canManage: boolean
  myUserId: string
  adminId: string
  participants: ShareParticipant[]
  onGenerate: (mode: AccessMode) => void
  onRevoke: () => void
  onRegenerate: (mode: AccessMode) => void
  onSetMode: (mode: AccessMode) => void
  onSetLimit: (limit: number) => void
  onSetRole: (userId: string, role: BoardRole) => void
  onExclude: (userId: string) => void
  onTransferAdmin: (userId: string) => void
  onClose: () => void
}

const MODE_LABEL: Record<AccessMode, MessageKey> = {
  open: 'access.open',
  approval: 'access.approval',
  private: 'access.private'
}

const ACCESS_OPTIONS: { mode: AccessMode; icon: LucideIcon; descKey: MessageKey }[] = [
  { mode: 'open', icon: Unlock, descKey: 'access.openDesc' },
  { mode: 'approval', icon: Clock, descKey: 'access.approvalDesc' },
  { mode: 'private', icon: Lock, descKey: 'access.privateDesc' }
]

const ROLE_LABEL: Record<BoardRole, MessageKey> = {
  admin: 'role.admin',
  editor: 'role.editor',
  visitor: 'role.visitor'
}

/** Sélecteur de mode d'accès (radios) — modifiable ou lecture seule. */
function AccessModePicker({
  value,
  disabled,
  onChange
}: {
  value: AccessMode
  disabled: boolean
  onChange: (mode: AccessMode) => void
}): JSX.Element {
  return (
    <div className="bd-access-options" role="radiogroup" aria-label={t('access.mode')}>
      {ACCESS_OPTIONS.map(({ mode, icon: Icon, descKey }) => (
        <label
          key={mode}
          className={'bd-access-option' + (mode === value ? ' bd-access-option--active' : '')}
        >
          <input
            type="radio"
            className="bd-access-option__radio"
            name="bd-access-mode"
            checked={mode === value}
            disabled={disabled}
            onChange={() => onChange(mode)}
          />
          <span className="bd-access-option__icon" aria-hidden="true">
            <Icon size={14} />
          </span>
          <span className="bd-access-option__text">
            <span className="bd-access-option__label">{t(MODE_LABEL[mode])}</span>
            <span className="bd-access-option__desc">{t(descKey)}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

export function ShareDialog(props: ShareDialogProps): JSX.Element {
  const pushToast = useToasts((state) => state.push)
  // Mode choisi au moment de générer/régénérer (défaut : sur approbation, §5).
  const [pendingMode, setPendingMode] = useState<AccessMode>('approval')

  const copyCode = async (): Promise<void> => {
    if (!props.code) return
    const copied = await window.cosint.copyText(props.code)
    if (copied) pushToast(t('share.copied'), 'success')
    else pushToast(t('error.clipboard'), 'error')
  }

  return (
    <Modal title={t('share.title')} onClose={props.onClose} width={520}>
      {props.solo ? (
        // ——— Tableau SOLO : générer un code (§5) ———
        <>
          <p className="cm-hint">{t('share.soloHint')}</p>
          {props.canManage ? (
            <>
              <h3 className="bd-access-title">{t('access.mode')}</h3>
              <AccessModePicker value={pendingMode} disabled={false} onChange={setPendingMode} />
              <div className="bd-share-actions">
                <button
                  className="cm-btn cm-btn--primary"
                  onClick={() => props.onGenerate(pendingMode)}
                >
                  <RefreshCw size={15} />
                  {t('share.generate')}
                </button>
              </div>
            </>
          ) : (
            // Copie locale d'un tableau dont on n'est pas l'admin (partage révoqué,
            // §5) : édition locale possible, mais pas de re-partage sous l'autorité
            // d'un admin absent.
            <p className="cm-hint">{t('share.soloNotAdmin')}</p>
          )}
        </>
      ) : (
        // ——— Tableau PARTAGÉ ———
        <>
          <p className="cm-hint">{t('share.hint')}</p>
          <div className="bd-share-code" aria-label={t('share.code')}>
            {props.code}
          </div>
          <div className="bd-share-actions">
            <button className="cm-btn cm-btn--primary" onClick={() => void copyCode()}>
              <Copy size={15} />
              {t('share.copy')}
            </button>
          </div>
          {props.canManage && (
            <>
              {/* §1b : deux actions clairement distinctes. */}
              <div className="bd-share-lifecycle">
                <button
                  className="cm-btn bd-share-lifecycle__btn"
                  onClick={() => props.onRegenerate(props.accessMode)}
                >
                  <RefreshCw size={15} />
                  {t('share.regenerate')}
                </button>
                <p className="cm-hint">{t('share.regenerateHint')}</p>
                <button
                  className="cm-btn cm-btn--danger bd-share-lifecycle__btn"
                  onClick={props.onRevoke}
                >
                  <ShieldOff size={15} />
                  {t('share.revoke')}
                </button>
                <p className="cm-hint">{t('share.revokeHint')}</p>
              </div>
            </>
          )}
          <p className="bd-share-participants">
            {t('share.participants', {
              count: props.participantCount,
              max: props.participantLimit
            })}
          </p>

          {/* Mode d'accès */}
          <div className="bd-access-section">
            <h3 className="bd-access-title">{t('access.mode')}</h3>
            <AccessModePicker
              value={props.accessMode}
              disabled={!props.canManage}
              onChange={props.onSetMode}
            />
          </div>

          {/* Limite de participants (admin) */}
          {props.canManage && (
            <div className="bd-access-section">
              <h3 className="bd-access-title">{t('share.limit')}</h3>
              <div className="bd-limit-row">
                <input
                  type="range"
                  min={MIN_PARTICIPANT_LIMIT}
                  max={MAX_PARTICIPANT_LIMIT}
                  value={props.participantLimit}
                  onChange={(event) => props.onSetLimit(Number(event.target.value))}
                  aria-label={t('share.limit')}
                />
                <span className="bd-limit-value">{props.participantLimit}</span>
              </div>
            </div>
          )}

          {/* Participants et rôles (§6) */}
          <div className="bd-access-section">
            <h3 className="bd-access-title">{t('participants.title')}</h3>
            <ul className="bd-participants">
              {props.participants.map((participant) => (
                <ParticipantRow
                  key={participant.userId}
                  participant={participant}
                  isMe={participant.userId === props.myUserId}
                  canManage={props.canManage}
                  onSetRole={props.onSetRole}
                  onExclude={props.onExclude}
                  onTransferAdmin={props.onTransferAdmin}
                />
              ))}
            </ul>
          </div>

          {/* Journal des changements de mode */}
          {props.accessLog.length > 0 && (
            <div className="bd-access-log">
              <h3 className="bd-access-title">{t('access.log')}</h3>
              <ul className="bd-access-log__list">
                {[...props.accessLog].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="bd-access-log__item">
                    {t('access.changedBy', {
                      mode: t(MODE_LABEL[entry.mode]),
                      by: entry.by,
                      date: formatDateTime(entry.at)
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

function ParticipantRow({
  participant,
  isMe,
  canManage,
  onSetRole,
  onExclude,
  onTransferAdmin
}: {
  participant: ShareParticipant
  isMe: boolean
  canManage: boolean
  onSetRole: (userId: string, role: BoardRole) => void
  onExclude: (userId: string) => void
  onTransferAdmin: (userId: string) => void
}): JSX.Element {
  const isAdmin = participant.role === 'admin'
  // L'admin peut agir sur les AUTRES (pas sur lui-même ni sur un autre admin).
  const actionable = canManage && !isMe && !isAdmin

  return (
    <li className="bd-participant">
      <Avatar
        name={participant.name}
        color={participant.color}
        avatar={participant.avatar}
        size={26}
      />
      <span className="bd-participant__name">
        {participant.name || '—'}
        {isMe && <span className="bd-participant__me"> {t('participants.you')}</span>}
      </span>
      {!participant.online && <span className="bd-participant__offline">{t('participants.offline')}</span>}
      {actionable ? (
        <select
          className="cm-select bd-participant__role"
          value={participant.role}
          aria-label={t('participants.role')}
          onChange={(event) => onSetRole(participant.userId, event.target.value as BoardRole)}
        >
          <option value="editor">{t('role.editor')}</option>
          <option value="visitor">{t('role.visitor')}</option>
        </select>
      ) : (
        <span className={`bd-participant__badge bd-participant__badge--${participant.role}`}>
          {t(ROLE_LABEL[participant.role])}
        </span>
      )}
      {actionable && (
        <div className="bd-participant__actions">
          <button
            className="cm-btn cm-btn--sm"
            onClick={() => onTransferAdmin(participant.userId)}
            title={t('participants.makeAdmin')}
          >
            {t('participants.makeAdmin')}
          </button>
          <button
            className="cm-btn cm-btn--sm cm-btn--danger"
            onClick={() => onExclude(participant.userId)}
            title={t('participants.exclude')}
          >
            {t('participants.exclude')}
          </button>
        </div>
      )}
    </li>
  )
}
