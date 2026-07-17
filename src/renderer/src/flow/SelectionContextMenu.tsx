/** Menu contextuel de la sélection (clic droit → Statut + Supprimer, §3/§6bis). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { ElementStatus } from '@/types'
import { StatusPicker } from '@/components/board/StatusBadge'
import { t } from '@/i18n'

interface SelectionContextMenuProps {
  screenX: number
  screenY: number
  count: number
  /** Statut courant de la sélection (§3) — pour surligner l'option active. */
  status: ElementStatus
  /** Pose le statut sur toute la sélection (nœuds + liens). */
  onSetStatus: (status: ElementStatus) => void
  onDelete: () => void
  onClose: () => void
}

export function SelectionContextMenu({
  screenX,
  screenY,
  count,
  status,
  onSetStatus,
  onDelete,
  onClose
}: SelectionContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: screenX, top: screenY })

  useLayoutEffect(() => {
    const menu = ref.current
    const parent = menu?.offsetParent as HTMLElement | null
    if (!menu || !parent) return
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(screenX, parent.clientWidth - menu.offsetWidth - margin)),
      top: Math.max(margin, Math.min(screenY, parent.clientHeight - menu.offsetHeight - margin))
    })
  }, [screenX, screenY])

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fl-add-menu" style={{ left: pos.left, top: pos.top }} ref={ref}>
      {/* §3 : statut de la sélection. */}
      <div className="bd-status-menurow">
        <span className="bd-status-menurow__label">{t('status.badge.label')}</span>
        <StatusPicker
          value={status}
          compact
          onChange={(next) => {
            onSetStatus(next)
            onClose()
          }}
        />
      </div>
      <button
        className="fl-add-menu__item fl-add-menu__item--danger"
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        <Trash2 size={15} />
        {t('delete.selection', { count })}
      </button>
    </div>
  )
}
