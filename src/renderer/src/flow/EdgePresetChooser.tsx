/**
 * Sélecteur de préréglage de lien (§7 v1.9), ouvert juste après avoir relié deux
 * entités. Propose « Automatique » (style par défaut) + les préréglages nommés de
 * l'utilisateur, chacun avec son APERÇU (trait, épaisseur, couleur, flèches, tracé) et
 * le résumé de ses réglages (relation, libellé, statut, côtés…). Accessible au
 * clavier : le focus est posé sur « Automatique », ↑/↓ naviguent, Entrée choisit,
 * Échap ferme (= automatique : le lien est déjà créé avec le style par défaut).
 *
 * « Nouveau préréglage… » et « Gérer les préréglages… » ouvrent la fenêtre complète
 * (`LinkPresetDialog`) — le préréglage créé depuis ici est appliqué au nouveau lien.
 * Les préréglages vivent dans les paramètres LOCAUX ; les réglages résolus sont copiés
 * sur le lien (donc visibles des pairs). Réutilise le cadre visuel de `.fl-add-menu`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, Settings2 } from 'lucide-react'
import { LINK_PRESETS_MAX, type LinkPresetDef } from '@/lib/linkPresets'
import { useSettings } from '@/store/settings'
import { useLinkPresetDialog } from '@/store/linkPresetDialog'
import { LinkPresetPickList, onPickListKeyDown } from '@/components/board/LinkPresetPickList'
import { t } from '@/i18n'
import './edgePresetChooser.css'

interface EdgePresetChooserProps {
  screenX: number
  screenY: number
  /** Lien tout juste créé (cible de « Nouveau préréglage… » / « Gérer… »). */
  edgeId?: string
  /** Garder le style automatique (aucun préréglage appliqué). */
  onPickAutomatique: () => void
  onPickPreset: (preset: LinkPresetDef) => void
  onClose: () => void
}

export function EdgePresetChooser({
  screenX,
  screenY,
  edgeId,
  onPickAutomatique,
  onPickPreset,
  onClose
}: EdgePresetChooserProps): JSX.Element {
  const presets = useSettings((state) => state.linkPresets)
  const openDialog = useLinkPresetDialog((state) => state.open)

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
  }, [screenX, screenY, presets.length])

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

  const edgeIds = edgeId ? [edgeId] : undefined
  const full = presets.length >= LINK_PRESETS_MAX

  return (
    <div
      className="fl-add-menu fl-preset-menu"
      style={{ left: pos.left, top: pos.top }}
      ref={ref}
      role="menu"
      aria-label={t('edge.presetTitle')}
      onKeyDown={onPickListKeyDown}
    >
      <div className="fl-add-menu__title">{t('edge.presetTitle')}</div>

      {/* Automatique — toujours en tête (comportement par défaut), focus initial. */}
      <LinkPresetPickList
        presets={presets}
        onPick={onPickPreset}
        onPickAutomatique={onPickAutomatique}
        autoFocus
        keyboardNav={false}
      />

      <div className="fl-preset-sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        data-lp-item
        className="fl-add-menu__item fl-preset-add"
        disabled={full}
        title={full ? t('linkPreset.limit', { max: LINK_PRESETS_MAX }) : undefined}
        onClick={() => {
          openDialog({ mode: 'create', edgeIds })
          onClose()
        }}
      >
        <Plus size={15} />
        {t('edge.presetAdd')}
      </button>
      <button
        type="button"
        role="menuitem"
        data-lp-item
        className="fl-add-menu__item"
        onClick={() => {
          openDialog({ mode: 'manage', edgeIds })
          onClose()
        }}
      >
        <Settings2 size={15} />
        {t('linkPreset.manage')}
      </button>
      <div className="fl-preset-hint">{t('linkPreset.chooserHint')}</div>
    </div>
  )
}
