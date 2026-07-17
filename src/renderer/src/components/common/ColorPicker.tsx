/**
 * Sélecteur de couleur libre (§5) : 12 couleurs prédéfinies + historique des
 * dernières couleurs personnalisées + saisie/roue hex. Remplace la palette fixe
 * de la v1. `value`/`onChange` manipulent un hex #rrggbb.
 */
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { colorHex, contrastText, normalizeHex, PRESET_COLORS } from '@/lib/colors'
import { useSettings } from '@/store/settings'
import { t } from '@/i18n'
import './colorpicker.css'

interface ColorFieldProps {
  value: string
  onChange: (hex: string) => void
  /** false pour ne pas enregistrer dans l'historique (aperçus). */
  remember?: boolean
}

/** Une pastille de couleur cliquable. */
function Swatch({
  hex,
  active,
  onPick
}: {
  hex: string
  active: boolean
  onPick: (hex: string) => void
}): JSX.Element {
  return (
    <button
      type="button"
      className={`cp-swatch${active ? ' cp-swatch--active' : ''}`}
      style={{ background: hex }}
      title={hex}
      aria-label={hex}
      onClick={() => onPick(hex)}
    >
      {active && <Check size={12} color={contrastText(hex)} strokeWidth={3} />}
    </button>
  )
}

export function ColorField({ value, onChange, remember = true }: ColorFieldProps): JSX.Element {
  const current = colorHex(value)
  const history = useSettings((state) => state.colorHistory)
  const pushColor = useSettings((state) => state.pushColor)
  const [draft, setDraft] = useState(current)
  const [error, setError] = useState(false)

  useEffect(() => setDraft(current), [current])

  const pick = (hex: string): void => {
    const normalized = colorHex(hex)
    onChange(normalized)
    if (remember) pushColor(normalized)
    setDraft(normalized)
    setError(false)
  }

  const commitHex = (): void => {
    const normalized = normalizeHex(draft)
    if (!normalized) {
      setError(true)
      return
    }
    pick(normalized)
  }

  const recent = history.filter((hex) => !PRESET_COLORS.includes(hex)).slice(0, 6)

  return (
    <div className="cp-root">
      <div className="cp-label">{t('colorPicker.presets')}</div>
      <div className="cp-grid">
        {PRESET_COLORS.map((hex) => (
          <Swatch key={hex} hex={hex} active={colorHex(hex) === current} onPick={pick} />
        ))}
      </div>

      {recent.length > 0 && (
        <>
          <div className="cp-label">{t('colorPicker.recent')}</div>
          <div className="cp-grid">
            {recent.map((hex) => (
              <Swatch key={hex} hex={hex} active={colorHex(hex) === current} onPick={pick} />
            ))}
          </div>
        </>
      )}

      <div className="cp-label">{t('colorPicker.custom')}</div>
      <div className="cp-custom">
        <input
          type="color"
          className="cp-wheel"
          value={current}
          onChange={(event) => pick(event.target.value)}
          aria-label={t('colorPicker.custom')}
        />
        <input
          className={`cm-input cm-mono cp-hex${error ? ' cp-hex--error' : ''}`}
          value={draft}
          spellCheck={false}
          placeholder={t('colorPicker.hexPlaceholder')}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(false)
          }}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitHex()
          }}
        />
      </div>
      {error && <div className="cp-error">{t('colorPicker.invalidHex')}</div>}
    </div>
  )
}

/** Variante pour la couleur d'identité de l'utilisateur (§7). */
export function UserColorField(props: ColorFieldProps): JSX.Element {
  return <ColorField {...props} />
}
