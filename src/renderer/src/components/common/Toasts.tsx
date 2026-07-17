/** Affichage des notifications éphémères (cliquer pour fermer). */
import { useToasts } from '@/store/toasts'

export function Toasts(): JSX.Element | null {
  const { toasts, dismiss } = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className="cm-toasts">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`cm-toast cm-toast--${toast.kind}`}
          onClick={() => dismiss(toast.id)}
          role="status"
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
