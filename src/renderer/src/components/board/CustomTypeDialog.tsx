/**
 * Création / édition d'un type d'entité PERSONNALISÉ du tableau (§2 v1.8).
 * Nom + icône (banque d'icônes lucide, recherchable) + couleur + gabarit de champs
 * par défaut (pré-créés sur chaque nouvelle entité de ce type). Enregistré dans le
 * document Yjs (synchronisé, exporté dans le .trace) via `upsertCustomType`.
 */
import { useMemo, useState } from 'react'
import { Check, Plus, Search, Trash2 } from 'lucide-react'
import * as Lucide from 'lucide-react'
import type { CustomEntityType, CustomTypeField, FieldKind } from '@/types'
import { Modal } from '@/components/common/Modal'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { ColorField } from '@/components/common/ColorPicker'
import { useBoardContext } from '@/flow/BoardContext'
import { newCustomTypeId, upsertCustomType } from '@/sync/boardOps'
import { CUSTOM_CATEGORY_COLOR } from '@/lib/entityTypes'
import { withAlpha } from '@/lib/colors'
import { t } from '@/i18n'
import './customType.css'

/** Banque d'icônes suggérées (noms lucide PascalCase) — couvre les usages OSINT
 *  courants. On peut aussi saisir n'importe quel autre nom lucide valide. */
const ICON_SUGGESTIONS = [
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
const FIELD_KINDS: FieldKind[] = ['text', 'longtext', 'url', 'email', 'phone', 'date', 'social']

interface CustomTypeDialogProps {
  /** Type à éditer, ou null pour une création. */
  editing?: CustomEntityType | null
  /** Appelé avec l'id du type créé/modifié après enregistrement. */
  onSaved?: (typeId: string) => void
  onClose: () => void
}

export function CustomTypeDialog({ editing, onSaved, onClose }: CustomTypeDialogProps): JSX.Element {
  const { handle, author } = useBoardContext()
  const [name, setName] = useState(editing?.name ?? '')
  const [icon, setIcon] = useState(editing?.icon ?? 'Circle')
  const [color, setColor] = useState(editing?.color ?? CUSTOM_CATEGORY_COLOR)
  const [fields, setFields] = useState<CustomTypeField[]>(editing?.fields ?? [])
  const [iconQuery, setIconQuery] = useState('')
  const [nameError, setNameError] = useState(false)

  // Icônes affichées : suggestions filtrées par la recherche ; si la recherche
  // désigne une icône lucide valide hors liste, on la propose aussi.
  const icons = useMemo(() => {
    const needle = iconQuery.trim().toLowerCase()
    if (needle === '') return ICON_SUGGESTIONS
    const matches = ICON_SUGGESTIONS.filter((n) => n.toLowerCase().includes(needle))
    // Saisie directe d'un nom exact hors suggestions (ex. « Rocket »).
    const exact = iconQuery.trim()
    if (/^[A-Za-z0-9]+$/.test(exact) && REGISTRY[exact] && !matches.includes(exact)) {
      matches.unshift(exact)
    }
    return matches
  }, [iconQuery])

  const addField = (): void => setFields((prev) => [...prev, { label: '', kind: 'text' }])
  const updateField = (index: number, patch: Partial<CustomTypeField>): void =>
    setFields((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)))
  const removeField = (index: number): void =>
    setFields((prev) => prev.filter((_, i) => i !== index))

  const save = (): void => {
    const trimmed = name.trim()
    if (trimmed === '') {
      setNameError(true)
      return
    }
    const id = editing?.id ?? newCustomTypeId()
    upsertCustomType(
      handle,
      {
        id,
        name: trimmed,
        icon,
        color,
        // Champs sans libellé ignorés (une ligne vide n'a pas de sens).
        fields: fields
          .map((field) => ({ label: field.label.trim(), kind: field.kind }))
          .filter((field) => field.label !== ''),
        createdBy: editing?.createdBy,
        createdAt: editing?.createdAt
      },
      author
    )
    onSaved?.(id)
    onClose()
  }

  return (
    <Modal
      title={editing ? t('customType.edit') : t('customType.create')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="cm-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="cm-btn cm-btn--primary" onClick={save}>
            {t('customType.save')}
          </button>
        </>
      }
    >
      {/* Aperçu + nom */}
      <div className="ct-preview">
        <span className="ct-preview__ico" style={{ background: withAlpha(color, 0.16), color }}>
          <EntityIcon icon={icon} size={18} />
        </span>
        <div className="ct-preview__name">
          <label className="cm-label" htmlFor="ct-name">{t('customType.name')}</label>
          <input
            id="ct-name"
            className="cm-input"
            value={name}
            autoFocus
            placeholder={t('customType.namePlaceholder')}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(false)
            }}
          />
          {nameError && <p className="hm-error">{t('customType.nameRequired')}</p>}
        </div>
      </div>

      <label className="cm-label">{t('customType.color')}</label>
      <ColorField value={color} onChange={setColor} />

      <label className="cm-label">{t('customType.icon')}</label>
      <div className="ct-iconsearch">
        <Search size={14} />
        <input
          className="ct-iconsearch__input"
          value={iconQuery}
          placeholder={t('customType.iconSearch')}
          onChange={(e) => setIconQuery(e.target.value)}
        />
      </div>
      <div className="ct-icons">
        {icons.map((name) => (
          <button
            key={name}
            className={`ct-icon${icon === name ? ' ct-icon--on' : ''}`}
            onClick={() => setIcon(name)}
            title={name}
            aria-pressed={icon === name}
          >
            <EntityIcon icon={name} size={16} />
          </button>
        ))}
      </div>

      <label className="cm-label">{t('customType.fields')}</label>
      <p className="cm-hint">{t('customType.fieldsHint')}</p>
      <div className="ct-fields">
        {fields.map((field, index) => (
          <div key={index} className="ct-field">
            <input
              className="cm-input"
              value={field.label}
              placeholder={t('customType.fieldLabel')}
              onChange={(e) => updateField(index, { label: e.target.value })}
            />
            <select
              className="cm-select"
              value={field.kind}
              onChange={(e) => updateField(index, { kind: e.target.value as FieldKind })}
            >
              {FIELD_KINDS.map((kind) => (
                <option key={kind} value={kind}>{t(`fieldKind.${kind}` as const)}</option>
              ))}
            </select>
            <button
              className="cm-btn cm-btn--ghost cm-btn--icon"
              onClick={() => removeField(index)}
              title={t('customType.delete')}
              aria-label={t('customType.delete')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button className="cm-btn cm-btn--sm ct-addfield" onClick={addField}>
          <Plus size={14} />
          {t('customType.addField')}
        </button>
      </div>

      {editing && (
        <p className="cm-hint ct-editing-note">
          <Check size={12} /> {t('customType.section')}
        </p>
      )}
    </Modal>
  )
}
