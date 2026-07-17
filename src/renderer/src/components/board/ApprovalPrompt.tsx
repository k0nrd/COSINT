/**
 * Pop-ups d'approbation (§6) : demandes d'accès en attente d'une décision,
 * empilées en bas à droite, non bloquantes pour le travail en cours.
 */
import { Check, X } from 'lucide-react'
import type { AvatarType } from '@/types'
import { Avatar } from '@/components/common/Avatar'
import { t } from '@/i18n'
import './access.css'

/** Demande affichée (sous-ensemble de PendingRequest côté lobby). */
export interface ApprovalRequestItem {
  requestId: string
  pseudo: string
  color: string
  avatarType: string
  avatarValue: string
  role: string
}

interface ApprovalPromptProps {
  pending: ApprovalRequestItem[]
  onApprove: (requestId: string) => void
  onRefuse: (requestId: string) => void
}

export function ApprovalPrompt({
  pending,
  onApprove,
  onRefuse
}: ApprovalPromptProps): JSX.Element | null {
  if (pending.length === 0) return null

  return (
    <div
      className="bd-approval-stack"
      role="region"
      aria-label={t('approval.pendingCount', { count: pending.length })}
    >
      {pending.map((request) => (
        <div key={request.requestId} className="bd-approval-card" role="group">
          <p className="bd-approval-title">{t('approval.title')}</p>
          <div className="bd-approval-who">
            <Avatar
              name={request.pseudo}
              color={request.color}
              avatar={{ type: request.avatarType as AvatarType, value: request.avatarValue }}
              size={26}
            />
            <span className="bd-approval-id">
              <span className="bd-approval-pseudo">{request.pseudo}</span>
              {request.role !== '' && <span className="bd-approval-role">{request.role}</span>}
            </span>
          </div>
          <p className="bd-approval-message">{t('approval.wantsToJoin', { name: request.pseudo })}</p>
          <div className="bd-approval-actions">
            <button
              className="cm-btn cm-btn--primary cm-btn--sm"
              onClick={() => onApprove(request.requestId)}
            >
              <Check size={14} />
              {t('approval.accept')}
            </button>
            <button className="cm-btn cm-btn--sm" onClick={() => onRefuse(request.requestId)}>
              <X size={14} />
              {t('approval.refuse')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
