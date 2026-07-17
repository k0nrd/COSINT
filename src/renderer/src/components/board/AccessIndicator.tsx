/** Pastille du mode d'accès courant (§6), cliquable pour ouvrir le partage. */
import { Clock, Lock, Unlock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AccessMode } from '@/types'
import { t } from '@/i18n'
import type { MessageKey } from '@/i18n'
import './access.css'

interface AccessIndicatorProps {
  mode: AccessMode
  onClick?: () => void
}

/** Icône et libellé d'info-bulle par mode. */
const MODE_META: Record<AccessMode, { icon: LucideIcon; labelKey: MessageKey }> = {
  open: { icon: Unlock, labelKey: 'access.indicatorOpen' },
  approval: { icon: Clock, labelKey: 'access.indicatorApproval' },
  private: { icon: Lock, labelKey: 'access.indicatorPrivate' }
}

export function AccessIndicator({ mode, onClick }: AccessIndicatorProps): JSX.Element {
  const { icon: Icon, labelKey } = MODE_META[mode]
  const label = t(labelKey)

  return (
    <button
      type="button"
      className={`bd-access-indicator bd-access-indicator--${mode}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon size={14} />
    </button>
  )
}
