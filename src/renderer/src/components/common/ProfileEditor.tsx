/**
 * Éditeur de profil réutilisable (§7) : pseudo, couleur, avatar
 * (initiales / emoji / image), rôle et statut — avec aperçu en direct.
 * Composant contrôlé : ne persiste rien, remonte chaque changement via onChange.
 */
import { useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus } from 'lucide-react'
import { t } from '@/i18n'
import type { AvatarType, UserProfile, UserStatus } from '@/types'
import { AVATAR_IMAGE_PROFILE, processImage } from '@/lib/image'
import { useToasts } from '@/store/toasts'
import { Avatar } from '@/components/common/Avatar'
import { ColorField } from '@/components/common/ColorPicker'
import './profile.css'

interface ProfileEditorProps {
  value: UserProfile
  onChange: (profile: UserProfile) => void
}

/** Onglets d'avatar, dans l'ordre d'affichage. */
const AVATAR_TABS: Array<{
  type: AvatarType
  labelKey: 'profile.avatarInitials' | 'profile.avatarEmoji' | 'profile.avatarImage'
}> = [
  { type: 'initials', labelKey: 'profile.avatarInitials' },
  { type: 'emoji', labelKey: 'profile.avatarEmoji' },
  { type: 'image', labelKey: 'profile.avatarImage' }
]

/** Statuts proposés, dans l'ordre d'affichage. */
const STATUS_OPTIONS: Array<{
  status: UserStatus
  labelKey: 'status.available' | 'status.busy' | 'status.away'
}> = [
  { status: 'available', labelKey: 'status.available' },
  { status: 'busy', labelKey: 'status.busy' },
  { status: 'away', labelKey: 'status.away' }
]

/** Premier graphème d'une saisie (emoji composés inclus) ; '' si vide. */
function firstGlyph(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)
  const first = segments[Symbol.iterator]().next()
  return first.done ? '' : first.value.segment
}

export function ProfileEditor({ value, onChange }: ProfileEditorProps): JSX.Element {
  const pushToast = useToasts((state) => state.push)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Valeurs mémorisées par type d'avatar : changer d'onglet ne perd rien.
  const [emojiValue, setEmojiValue] = useState(value.avatarType === 'emoji' ? value.avatarValue : '')
  const [imageValue, setImageValue] = useState(value.avatarType === 'image' ? value.avatarValue : '')

  const patch = (fields: Partial<UserProfile>): void => onChange({ ...value, ...fields })

  const selectAvatarType = (type: AvatarType): void => {
    const avatarValue = type === 'emoji' ? emojiValue : type === 'image' ? imageValue : ''
    patch({ avatarType: type, avatarValue })
  }

  const handleEmojiChange = (raw: string): void => {
    const glyph = firstGlyph(raw)
    setEmojiValue(glyph)
    patch({ avatarValue: glyph })
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    // Réinitialisé pour permettre de re-sélectionner le même fichier.
    event.target.value = ''
    if (!file) return
    const result = await processImage(file, AVATAR_IMAGE_PROFILE)
    if (!result.ok) {
      pushToast(t('profile.imageError'), 'error')
      return
    }
    setImageValue(result.dataUrl)
    patch({ avatarType: 'image', avatarValue: result.dataUrl })
  }

  const statusLabelKey =
    STATUS_OPTIONS.find((option) => option.status === value.status)?.labelKey ?? 'status.available'

  return (
    <div className="pe-root">
      <label className="cm-label" htmlFor="pe-pseudo">
        {t('profile.pseudoLabel')}
      </label>
      <input
        id="pe-pseudo"
        className="cm-input"
        value={value.pseudo}
        maxLength={24}
        placeholder={t('profile.pseudoPlaceholder')}
        onChange={(event) => patch({ pseudo: event.target.value })}
      />

      <span className="cm-label">{t('profile.colorLabel')}</span>
      <ColorField value={value.colorHex} onChange={(hex) => patch({ colorHex: hex })} />

      <span className="cm-label">{t('profile.avatar')}</span>
      <div className="pe-tabs" role="tablist" aria-label={t('profile.avatar')}>
        {AVATAR_TABS.map((tab) => (
          <button
            key={tab.type}
            type="button"
            role="tab"
            aria-selected={value.avatarType === tab.type}
            className={`pe-tab${value.avatarType === tab.type ? ' pe-tab--active' : ''}`}
            onClick={() => selectAvatarType(tab.type)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      {value.avatarType === 'emoji' && (
        <input
          className="cm-input pe-emoji-input"
          value={emojiValue}
          placeholder={t('profile.emojiPlaceholder')}
          aria-label={t('profile.avatarEmoji')}
          onChange={(event) => handleEmojiChange(event.target.value)}
        />
      )}
      {value.avatarType === 'image' && (
        <div className="pe-image-row">
          <button type="button" className="cm-btn" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={14} />
            {t('profile.chooseImage')}
          </button>
          <input
            ref={fileInputRef}
            className="pe-file-input"
            type="file"
            accept="image/*"
            onChange={handleFile}
          />
        </div>
      )}

      <label className="cm-label" htmlFor="pe-role">
        {t('profile.role')}
      </label>
      <input
        id="pe-role"
        className="cm-input"
        value={value.role}
        maxLength={40}
        placeholder={t('profile.rolePlaceholder')}
        onChange={(event) => patch({ role: event.target.value })}
      />

      <span className="cm-label">{t('profile.status')}</span>
      <div className="pe-radios">
        {STATUS_OPTIONS.map((option) => (
          <label key={option.status} className="pe-radio">
            <input
              type="radio"
              name="pe-status"
              checked={value.status === option.status}
              onChange={() => patch({ status: option.status })}
            />
            {t(option.labelKey)}
          </label>
        ))}
      </div>

      <span className="cm-label">{t('profile.preview')}</span>
      <div className="pe-preview">
        <Avatar
          name={value.pseudo || '?'}
          color={value.colorHex}
          avatar={{ type: value.avatarType, value: value.avatarValue }}
          status={value.status}
          size={40}
        />
        <div className="pe-preview-info">
          <span className="pe-preview-name">{value.pseudo || t('profile.pseudoPlaceholder')}</span>
          {value.role.trim() !== '' && <span className="pe-preview-role">{value.role}</span>}
          <span className="pe-preview-status">
            <span className="pe-status-dot" data-status={value.status} aria-hidden="true" />
            {t(statusLabelKey)}
          </span>
        </div>
      </div>
    </div>
  )
}
