/** Saisie de tags libres (§3) : Entrée ou virgule pour ajouter, ✕ pour retirer. */
import { useState } from 'react'
import { t } from '@/i18n'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ tags, onChange, placeholder }: TagInputProps): JSX.Element {
  const [draft, setDraft] = useState('')

  const addDraft = (): void => {
    const tag = draft.trim().replace(/,+$/, '')
    setDraft('')
    if (tag === '' || tags.includes(tag)) return
    onChange([...tags, tag])
  }

  return (
    <div className="cm-tags">
      {tags.map((tag) => (
        <span key={tag} className="cm-tag">
          <span className="cm-tag__text">{tag}</span>
          <button
            onClick={() => onChange(tags.filter((existing) => existing !== tag))}
            title={t('common.delete')}
            aria-label={`${t('common.delete')} ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={placeholder ?? t('details.tagsPlaceholder')}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            addDraft()
          } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={addDraft}
      />
    </div>
  )
}
