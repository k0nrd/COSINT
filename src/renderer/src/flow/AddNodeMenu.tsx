/** Menu d'ajout de nœud, ouvert par double-clic sur le canvas (§6). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Clock, Code2, Contact, FileText, Image, Link, Square, StickyNote } from 'lucide-react'
import type { NodeKind } from '@/types'
import { t } from '@/i18n'

/**
 * Sélection émise par le menu : un type de nœud simple, ou « ouvrir le sélecteur
 * d'entité par catégories » (§2, résolu à la position du double-clic).
 */
export type AddSelection = { kind: Exclude<NodeKind, 'entity'> } | { kind: 'entity' }

const ENTRIES: Array<{ kind: NodeKind; icon: typeof StickyNote; labelKey: Parameters<typeof t>[0] }> = [
  { kind: 'text', icon: StickyNote, labelKey: 'nodeType.text' },
  { kind: 'link', icon: Link, labelKey: 'nodeType.link' },
  { kind: 'image', icon: Image, labelKey: 'nodeType.image' },
  { kind: 'timestamped', icon: Clock, labelKey: 'nodeType.timestamped' },
  { kind: 'group', icon: Square, labelKey: 'nodeType.group' },
  { kind: 'code', icon: Code2, labelKey: 'nodeType.code' },
  { kind: 'source', icon: FileText, labelKey: 'nodeType.source' },
  { kind: 'entity', icon: Contact, labelKey: 'nodeType.entity' }
]

interface AddNodeMenuProps {
  /** Position écran (px, relative au conteneur du canvas). */
  screenX: number
  screenY: number
  onSelect: (selection: AddSelection) => void
  onClose: () => void
}

export function AddNodeMenu({ screenX, screenY, onSelect, onClose }: AddNodeMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: screenX, top: screenY })

  useLayoutEffect(() => {
    const menu = ref.current
    const parent = menu?.offsetParent as HTMLElement | null
    if (!menu || !parent) return
    const margin = 8
    const maxLeft = parent.clientWidth - menu.offsetWidth - margin
    const maxTop = parent.clientHeight - menu.offsetHeight - margin
    setPos({
      left: Math.max(margin, Math.min(screenX, maxLeft)),
      top: Math.max(margin, Math.min(screenY, maxTop))
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
      <div className="fl-add-menu__title">{t('nodeMenu.title')}</div>
      {ENTRIES.map(({ kind, icon: Icon, labelKey }) => (
        <button
          key={kind}
          className="fl-add-menu__item"
          onClick={() =>
            onSelect(
              kind === 'entity'
                ? { kind: 'entity' }
                : { kind: kind as Exclude<NodeKind, 'entity'> }
            )
          }
        >
          <Icon size={15} />
          {t(labelKey)}
        </button>
      ))}
    </div>
  )
}
