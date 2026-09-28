/**
 * §7 v1.9 — entrée « Appliquer un préréglage » des menus contextuels (clic droit sur un
 * lien, ou sur une sélection contenant des liens). Dépliable : la liste des préréglages
 * (avec aperçu) s'ouvre dans le menu ; choisir applique le préréglage à TOUS les liens
 * visés en une transaction (un seul Ctrl+Z). Masquée s'il n'y a aucun lien visé.
 */
import { useState } from 'react'
import { Settings2, SwatchBook } from 'lucide-react'
import { useSettings } from '@/store/settings'
import { useLinkPresetDialog } from '@/store/linkPresetDialog'
import { LinkPresetPickList, onPickListKeyDown } from '@/components/board/LinkPresetPickList'
import { useApplyLinkPreset } from '@/components/board/LinkPresetDialog'
import { t } from '@/i18n'

interface LinkPresetMenuSectionProps {
  edgeIds: string[]
  /** Appelé après une action (ferme le menu). */
  onDone: () => void
}

export function LinkPresetMenuSection({ edgeIds, onDone }: LinkPresetMenuSectionProps): JSX.Element | null {
  const presets = useSettings((state) => state.linkPresets)
  const openDialog = useLinkPresetDialog((state) => state.open)
  const apply = useApplyLinkPreset()
  const [open, setOpen] = useState(false)

  if (edgeIds.length === 0) return null
  return (
    <>
      <button className="fl-add-menu__item" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <SwatchBook size={15} />
        {edgeIds.length > 1
          ? t('linkPreset.applyToEdges', { count: edgeIds.length })
          : t('linkPreset.applyTitle')}
        <span className="fl-add-menu__chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="lp-menu-sub" onKeyDown={onPickListKeyDown}>
          <LinkPresetPickList
            presets={presets}
            showEmpty
            autoFocus
            keyboardNav={false}
            onPick={(preset) => {
              apply(edgeIds, preset)
              onDone()
            }}
          />
          <button
            className="fl-add-menu__item"
            data-lp-item
            onClick={() => {
              openDialog({ mode: 'manage', edgeIds })
              onDone()
            }}
          >
            <Settings2 size={15} />
            {t('linkPreset.manage')}
          </button>
        </div>
      )}
    </>
  )
}
