/**
 * §7 v1.9 — liste de choix de préréglages de lien, partagée par le sélecteur ouvert
 * après une liaison, la barre du lien et les menus contextuels (un ou plusieurs liens).
 * Chaque ligne montre l'aperçu (trait, flèches, tracé), le nom et un résumé des
 * réglages définis. Accessible au clavier : ↑/↓/Début/Fin déplacent le focus,
 * Entrée/Espace choisissent (boutons natifs).
 */
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Wand2 } from 'lucide-react'
import type { LinkPresetDef } from '@/lib/linkPresets'
import { LinkPresetPreview } from '@/components/board/LinkPresetPreview'
import { presetSummary } from '@/components/board/linkPresetLabels'
import { t } from '@/i18n'
import './linkPresets.css'

interface LinkPresetPickListProps {
  presets: LinkPresetDef[]
  onPick: (preset: LinkPresetDef) => void
  /** Ligne « Automatique » en tête (sélecteur ouvert après une liaison). */
  onPickAutomatique?: () => void
  /** Donne le focus à la première ligne au montage (navigation clavier immédiate). */
  autoFocus?: boolean
  /** Affiche « Aucun préréglage » si la liste est vide. */
  showEmpty?: boolean
  /** false : la navigation ↑/↓ est gérée par le conteneur parent (qui inclut d'autres
   *  entrées, ex. « Nouveau préréglage… »). */
  keyboardNav?: boolean
}

/** Navigation ↑/↓ entre les lignes `[data-lp-item]` d'un conteneur. */
export function onPickListKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-lp-item]:not(:disabled)'))
  if (items.length === 0) return
  event.preventDefault()
  event.stopPropagation()
  const index = items.indexOf(document.activeElement as HTMLElement)
  let next = 0
  if (event.key === 'End') next = items.length - 1
  else if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length
  else if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1
  items[next].focus()
}

export function LinkPresetPickList({
  presets,
  onPick,
  onPickAutomatique,
  autoFocus,
  showEmpty,
  keyboardNav = true
}: LinkPresetPickListProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    ref.current?.querySelector<HTMLElement>('[data-lp-item]')?.focus()
    // Au montage seulement : ne pas voler le focus à chaque mise à jour de la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="lp-pick" role="group" ref={ref} onKeyDown={keyboardNav ? onPickListKeyDown : undefined}>
      {onPickAutomatique && (
        <button
          type="button"
          role="menuitem"
          data-lp-item
          className="fl-add-menu__item lp-pick__item"
          onClick={onPickAutomatique}
        >
          <span className="lp-pick__auto">
            <Wand2 size={15} />
          </span>
          <span className="lp-pick__text">
            <span className="lp-pick__name">{t('edge.presetAutomatique')}</span>
            <span className="lp-pick__summary">{t('linkPreset.automatiqueHint')}</span>
          </span>
        </button>
      )}
      {presets.map((preset) => {
        const summary = presetSummary(preset.props)
        return (
          <button
            key={preset.id}
            type="button"
            role="menuitem"
            data-lp-item
            className="fl-add-menu__item lp-pick__item"
            onClick={() => onPick(preset)}
            title={summary ? `${preset.name} — ${summary}` : preset.name}
          >
            <LinkPresetPreview props={preset.props} />
            <span className="lp-pick__text">
              <span className="lp-pick__name">{preset.name}</span>
              {summary !== '' && <span className="lp-pick__summary">{summary}</span>}
            </span>
          </button>
        )
      })}
      {showEmpty && presets.length === 0 && <div className="lp-pick__empty">{t('linkPreset.emptyShort')}</div>}
    </div>
  )
}
