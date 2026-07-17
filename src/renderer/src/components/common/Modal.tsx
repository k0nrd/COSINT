/** Modale générique : fermeture par Échap, clic hors cadre ou bouton ✕. */
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { t } from '@/i18n'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ title, onClose, children, footer, width }: ModalProps): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="cm-modal-overlay" onMouseDown={onClose}>
      <div
        className="cm-modal"
        style={width ? { width: `min(${width}px, calc(100vw - 48px))` } : undefined}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="cm-modal__header">
          <h2 className="cm-modal__title">{title}</h2>
          <button
            className="cm-btn cm-btn--ghost cm-btn--icon"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="cm-modal__body">{children}</div>
        {footer && <div className="cm-modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
