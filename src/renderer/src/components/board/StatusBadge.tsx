/**
 * Pastille de badge de statut (§3 v1.5) et sélecteur de statut.
 *
 * `StatusBadge` : petite pastille colorée avec glyphe, posée en coin d'un nœud ou
 * près d'un lien ; libellé français au survol.
 * `StatusPicker` : rangée des sept statuts, réutilisée dans la barre contextuelle
 * de sélection et les menus « Statut » (clic droit).
 */
import type { ElementStatus } from '@/types'
import { STATUS_DEFS, hasStatusBadge, statusDef } from '@/lib/status'
import { t } from '@/i18n'
import './status.css'

interface StatusBadgeProps {
  status: ElementStatus | undefined
  /** Taille de la pastille en px (défaut 16). */
  size?: number
  className?: string
}

export function StatusBadge({ status, size = 16, className }: StatusBadgeProps): JSX.Element | null {
  if (!hasStatusBadge(status)) return null
  const def = statusDef(status)
  return (
    <span
      className={className ? `bd-status-badge ${className}` : 'bd-status-badge'}
      style={{ background: def.color, width: size, height: size, fontSize: Math.round(size * 0.66) }}
      title={t(def.labelKey)}
      aria-label={t(def.labelKey)}
    >
      {def.glyph}
    </span>
  )
}

interface StatusPickerProps {
  value: ElementStatus | undefined
  onChange: (status: ElementStatus) => void
  /** Rendu compact (menus contextuels) vs plein (barres). */
  compact?: boolean
}

export function StatusPicker({ value, onChange, compact }: StatusPickerProps): JSX.Element {
  const current = value ?? 'none'
  return (
    <div
      className={compact ? 'bd-status-picker bd-status-picker--compact' : 'bd-status-picker'}
      role="radiogroup"
      aria-label={t('status.badge.label')}
    >
      {STATUS_DEFS.map((def) => {
        const active = def.id === current
        return (
          <button
            key={def.id}
            type="button"
            className={`bd-status-opt${active ? ' bd-status-opt--active' : ''}`}
            style={{
              // « Aucun » : contour seul ; les autres : pastille pleine colorée.
              background: def.id === 'none' ? 'transparent' : def.color,
              borderColor: def.color
            }}
            title={t(def.labelKey)}
            aria-label={t(def.labelKey)}
            aria-pressed={active}
            onClick={() => onChange(def.id)}
          >
            {def.glyph}
          </button>
        )
      })}
    </div>
  )
}
