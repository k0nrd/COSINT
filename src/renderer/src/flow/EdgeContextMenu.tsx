/** Menu contextuel d'un lien (clic droit, §1/§3) : statut, modifier, dessiner le
 * tracé (§1 v1.7.1), inverser, supprimer. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pencil, PenLine, Repeat, Route, Trash2 } from 'lucide-react'
import type { ElementStatus } from '@/types'
import { StatusPicker } from '@/components/board/StatusBadge'
import { LinkPresetMenuSection } from '@/components/board/LinkPresetMenuSection'
import { t } from '@/i18n'

interface EdgeContextMenuProps {
  screenX: number
  screenY: number
  /** Statut courant du lien (§3). */
  status: ElementStatus
  /** true si le lien porte un routage manuel (waypoints/ancrages) — §1 v1.6. */
  hasRouting: boolean
  onSetStatus: (status: ElementStatus) => void
  onEdit: () => void
  /** §1 v1.7.1 : entre dans le mode « Dessiner le tracé » (côtés + trajet). */
  onDrawRoute: () => void
  onReverse: () => void
  onResetRouting: () => void
  onDelete: () => void
  onClose: () => void
  /** §7 v1.9 : liens visés par « Appliquer un préréglage » (ce lien, ou toute la
   *  sélection de liens s'il en fait partie). */
  presetEdgeIds?: string[]
}

export function EdgeContextMenu({
  screenX,
  screenY,
  status,
  hasRouting,
  onSetStatus,
  onEdit,
  onDrawRoute,
  onReverse,
  onResetRouting,
  onDelete,
  onClose,
  presetEdgeIds
}: EdgeContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: screenX, top: screenY })

  useLayoutEffect(() => {
    const menu = ref.current
    const parent = menu?.offsetParent as HTMLElement | null
    if (!menu || !parent) return
    const margin = 8
    const clamp = (): void =>
      setPos({
        left: Math.max(margin, Math.min(screenX, parent.clientWidth - menu.offsetWidth - margin)),
        top: Math.max(margin, Math.min(screenY, parent.clientHeight - menu.offsetHeight - margin))
      })
    clamp()
    // §7 v1.9 — re-borne quand le menu grandit (sous-menu « Appliquer un préréglage » déplié).
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(clamp)
    observer.observe(menu)
    return () => observer.disconnect()
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
      {/* §3 : statut du lien. */}
      <div className="bd-status-menurow">
        <span className="bd-status-menurow__label">{t('status.badge.label')}</span>
        <StatusPicker value={status} compact onChange={onSetStatus} />
      </div>
      <button className="fl-add-menu__item" onClick={onEdit}>
        <Pencil size={15} />
        {t('edge.edit')}
      </button>
      {/* §7 v1.9 : appliquer un préréglage (à ce lien ou à tous les liens sélectionnés). */}
      {presetEdgeIds && <LinkPresetMenuSection edgeIds={presetEdgeIds} onDone={onClose} />}
      {/* §1 v1.7.1 : dessiner soi-même le tracé (côté de départ, trajet, côté
          d'arrivée) — remplace le routage manuel existant du lien. */}
      <button className="fl-add-menu__item" onClick={onDrawRoute}>
        <PenLine size={15} />
        {t('edge.drawRoute')}
      </button>
      <button className="fl-add-menu__item" onClick={onReverse}>
        <Repeat size={15} />
        {t('edge.reverse')}
      </button>
      {/* §1 v1.6 : réinitialiser le tracé (efface waypoints + ancrages). Affiché
          seulement si le lien porte un routage manuel. */}
      {hasRouting && (
        <button className="fl-add-menu__item" onClick={onResetRouting}>
          <Route size={15} />
          {t('edge.resetRouting')}
        </button>
      )}
      <button className="fl-add-menu__item fl-add-menu__item--danger" onClick={onDelete}>
        <Trash2 size={15} />
        {t('edge.delete')}
      </button>
    </div>
  )
}
