/**
 * Sélecteur d'icône lucide réutilisable (§6 v1.9), extrait de CustomTypeDialog :
 * banque d'icônes suggérées + recherche + saisie libre d'un nom lucide valide.
 * Réutilisé pour l'icône d'un type personnalisé ET pour l'icône propre d'une entité.
 * Classes CSS partagées avec customType.css (`ct-iconsearch`, `ct-icons`, `ct-icon`).
 */
import { useMemo, useState } from 'react'
import { RotateCcw, Search } from 'lucide-react'
import * as Lucide from 'lucide-react'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { t } from '@/i18n'
import './customType.css'

/** Banque d'icônes suggérées (noms lucide PascalCase) — couvre les usages OSINT
 *  courants. On peut aussi saisir n'importe quel autre nom lucide valide. */
export const ICON_SUGGESTIONS = [
  'User', 'Users', 'UserSearch', 'UserX', 'UserCheck', 'Contact', 'Fingerprint', 'Eye',
  'Building2', 'Landmark', 'Factory', 'Store', 'Home', 'MapPin', 'MapPinned', 'Globe',
  'Car', 'Truck', 'Plane', 'Ship', 'Bike', 'Train', 'Package', 'Box',
  'Phone', 'Smartphone', 'Mail', 'MessageSquare', 'AtSign', 'Wifi', 'Radio', 'RadioTower',
  'CreditCard', 'Banknote', 'Coins', 'Wallet', 'TrendingUp', 'ShoppingCart', 'Receipt', 'Scale',
  'FileText', 'File', 'Folder', 'Book', 'Newspaper', 'ScrollText', 'Clipboard', 'Stamp',
  'Camera', 'Image', 'Video', 'Mic', 'Music', 'Film', 'Aperture', 'ScanLine',
  'Shield', 'ShieldAlert', 'Lock', 'Key', 'KeyRound', 'Flag', 'Target', 'Crosshair',
  'Calendar', 'Clock', 'AlarmClock', 'Timer', 'History', 'CalendarClock', 'Hourglass', 'Bell',
  'Briefcase', 'Gavel', 'Handshake', 'Network', 'Share2', 'GitBranch', 'Boxes', 'Layers',
  'Cpu', 'Server', 'Database', 'HardDrive', 'Terminal', 'Bug', 'Wrench', 'Cog',
  'Heart', 'Star', 'Zap', 'Flame', 'Droplet', 'Leaf', 'Skull', 'Bomb',
  'Pill', 'Syringe', 'Cross', 'Stethoscope', 'Dna', 'FlaskConical', 'Microscope', 'Atom',
  'Music2', 'Church', 'Vote', 'Swords', 'Anchor', 'Compass', 'Tag', 'Circle'
]

const REGISTRY = Lucide as unknown as Record<string, unknown>

interface IconPickerProps {
  /** Icône actuellement sélectionnée (nom lucide PascalCase). */
  value: string
  onChange: (icon: string) => void
  /** Si fourni, affiche un bouton « rétablir l'icône par défaut ». */
  onReset?: () => void
}

export function IconPicker({ value, onChange, onReset }: IconPickerProps): JSX.Element {
  const [query, setQuery] = useState('')

  const icons = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return ICON_SUGGESTIONS
    const matches = ICON_SUGGESTIONS.filter((n) => n.toLowerCase().includes(needle))
    const exact = query.trim()
    if (/^[A-Za-z0-9]+$/.test(exact) && REGISTRY[exact] && !matches.includes(exact)) {
      matches.unshift(exact)
    }
    return matches
  }, [query])

  return (
    <>
      <div className="ct-iconsearch">
        <Search size={14} />
        <input
          className="ct-iconsearch__input"
          value={query}
          placeholder={t('customType.iconSearch')}
          onChange={(e) => setQuery(e.target.value)}
        />
        {onReset && (
          <button
            type="button"
            className="cm-btn cm-btn--ghost cm-btn--sm"
            onClick={onReset}
            title={t('entity.iconReset')}
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
      <div className="ct-icons">
        {icons.map((name) => (
          <button
            key={name}
            type="button"
            className={`ct-icon${value === name ? ' ct-icon--on' : ''}`}
            onClick={() => onChange(name)}
            title={name}
            aria-pressed={value === name}
          >
            <EntityIcon icon={name} size={16} />
          </button>
        ))}
      </div>
    </>
  )
}
