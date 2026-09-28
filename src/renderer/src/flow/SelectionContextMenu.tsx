/** Menu contextuel de la sélection (clic droit → Statut + Supprimer, §3/§6bis). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Copy, Download, ImagePlus, Trash2 } from 'lucide-react'
import type { ElementStatus } from '@/types'
import { StatusPicker } from '@/components/board/StatusBadge'
import { LinkPresetMenuSection } from '@/components/board/LinkPresetMenuSection'
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
  /** §2 v1.9 (galerie) : clic droit sur UNE entité → « Ajouter une image… » (absent sinon). */
  onAddImages?: () => void
  /** §1 v1.9 (copie d'image) : clic droit sur UN nœud image → « Copier l'image » et
   *  « Enregistrer l'image sous… » (absents sinon). */
  onCopyImage?: () => void
  onSaveImage?: () => void
  /** §1 v1.9 : visiteur (lecture seule) — seules les actions image restent (ni statut
   *  ni suppression). */
  readOnly?: boolean
  onClose: () => void
  /** §7 v1.9 : liens de la sélection — « Appliquer un préréglage » à tous d'un coup. */
  edgeIds?: string[]
}

export function SelectionContextMenu({
  screenX,
  screenY,
  count,
  status,
  onSetStatus,
  onDelete,
  onAddImages,
  onCopyImage,
  onSaveImage,
  readOnly = false,
  onClose,
  edgeIds
}: SelectionContextMenuProps): JSX.Element {
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

  // §1 v1.9 (copie d'image) : sortir l'image du tableau — en tête du menu, et SEULES
  // entrées pour un visiteur (lecture seule : copier/enregistrer reste permis).
  const imageItems = (
    <>
      {onCopyImage && (
        <button
          className="fl-add-menu__item"
          onClick={() => {
            onCopyImage()
            onClose()
          }}
        >
          <Copy size={15} />
          {t('image.copy')}
        </button>
      )}
      {onSaveImage && (
        <button
          className="fl-add-menu__item"
          onClick={() => {
            onSaveImage()
            onClose()
          }}
        >
          <Download size={15} />
          {t('image.saveAs')}
        </button>
      )}
    </>
  )
  if (readOnly) {
    return (
      <div className="fl-add-menu" style={{ left: pos.left, top: pos.top }} ref={ref}>
        {imageItems}
      </div>
    )
  }

  return (
    <div className="fl-add-menu" style={{ left: pos.left, top: pos.top }} ref={ref}>
      {imageItems}
      {(onCopyImage || onSaveImage) && <div className="fl-add-menu__sep" role="separator" />}
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
      {/* §2 v1.9 (galerie) : attacher des images à l'entité visée. */}
      {onAddImages && (
        <button
          className="fl-add-menu__item"
          onClick={() => {
            onAddImages()
            onClose()
          }}
        >
          <ImagePlus size={15} />
          {t('entity.addImage')}
        </button>
      )}
      {/* §7 v1.9 : préréglage de lien appliqué à tous les liens de la sélection. */}
      {edgeIds && <LinkPresetMenuSection edgeIds={edgeIds} onDone={onClose} />}
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
