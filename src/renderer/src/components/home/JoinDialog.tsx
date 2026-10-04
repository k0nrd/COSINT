/**
 * Dialogue « Rejoindre un tableau » : saisie du code de partage,
 * reformatée en direct (majuscules + tirets), validée à la soumission.
 */
import { useState, type FormEvent } from 'react'
import { t } from '@/i18n'
import { normalizeShareCode } from '@/lib/shareCode'
import { Modal } from '@/components/common/Modal'
import './home.css'

interface JoinDialogProps {
  onSubmit: (canonical: string) => void
  onClose: () => void
}

/**
 * Reformate la saisie en `XXXX-XXXX-XXXX` au fil de la frappe.
 * On conserve les caractères hors alphabet (O, 0, I, 1…) : c'est la
 * validation à la soumission qui signale l'erreur, sans saisie « fantôme ».
 */
export function formatShareCodeDraft(value: string): string {
  const raw = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 12)
  return [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)]
    .filter((group) => group !== '')
    .join('-')
}

export function JoinDialog({ onSubmit, onClose }: JoinDialogProps): JSX.Element {
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (code === '') return
    const canonical = normalizeShareCode(code)
    if (canonical === null) {
      setInvalid(true)
      return
    }
    onSubmit(canonical)
  }

  return (
    <Modal
      title={t('join.title')}
      onClose={onClose}
      footer={
        <>
          <button className="cm-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="cm-btn cm-btn--primary"
            type="submit"
            form="hm-join-form"
            disabled={code === ''}
          >
            {t('join.submit')}
          </button>
        </>
      }
    >
      <form id="hm-join-form" onSubmit={handleSubmit}>
        <p className="cm-hint">{t('join.hint')}</p>
        <input
          className="cm-input hm-code-input"
          value={code}
          placeholder={t('join.placeholder')}
          onChange={(event) => {
            setCode(formatShareCodeDraft(event.target.value))
            setInvalid(false)
          }}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
        />
        {invalid && (
          <p className="hm-error" role="alert">
            {t('join.invalidCode')}
          </p>
        )}
      </form>
    </Modal>
  )
}
