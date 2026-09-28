/**
 * Création / édition d'un type d'entité PERSONNALISÉ du tableau (§2 v1.8).
 * Nom + icône (banque d'icônes lucide, recherchable) + couleur + gabarit de champs
 * par défaut (pré-créés sur chaque nouvelle entité de ce type). Enregistré dans le
 * document Yjs (synchronisé, exporté dans le .trace) via `upsertCustomType`.
 */
import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import type { CustomEntityType, CustomTypeField, FieldKind } from '@/types'
import { Modal } from '@/components/common/Modal'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { IconPicker } from '@/components/board/IconPicker'
import { ColorField } from '@/components/common/ColorPicker'
import { useBoardContext } from '@/flow/BoardContext'
import { newCustomTypeId, upsertCustomType } from '@/sync/boardOps'
import { CUSTOM_CATEGORY_COLOR } from '@/lib/entityTypes'
import { withAlpha } from '@/lib/colors'
import { t } from '@/i18n'
import './customType.css'

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
  const [nameError, setNameError] = useState(false)

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
      <IconPicker value={icon} onChange={setIcon} />

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
