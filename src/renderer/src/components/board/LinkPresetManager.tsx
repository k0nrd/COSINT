/**
 * §7 v1.9 — gestionnaire des préréglages de lien : créer, modifier, renommer,
 * dupliquer, supprimer, réordonner, avec l'aperçu de chaque préréglage. Utilisé dans
 * les Paramètres (onglet « Liens ») et depuis le tableau (fenêtre des préréglages,
 * avec alors un bouton « Appliquer » par ligne pour les liens visés).
 *
 * Les préréglages vivent dans les paramètres LOCAUX (store/settings) : toute action ici
 * est enregistrée immédiatement sur ce poste (rien n'est diffusé aux pairs).
 */
import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  CopyPlus,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2
} from 'lucide-react'
import { newId } from '@/lib/id'
import {
  DEFAULT_PRESET_VALUES,
  LINK_PRESETS_MAX,
  LINK_PRESET_NAME_MAX,
  LINK_PRESET_PROPS,
  cleanPresetText,
  duplicateLinkPreset,
  moveLinkPreset,
  sanitizeValues,
  type LinkPresetDef,
  type LinkPresetProp
} from '@/lib/linkPresets'
import { useSettings } from '@/store/settings'
import { LinkPresetPreview } from '@/components/board/LinkPresetPreview'
import { LinkPresetEditor } from '@/components/board/LinkPresetEditor'
import { presetSummary } from '@/components/board/linkPresetLabels'
import { t } from '@/i18n'
import './linkPresets.css'

interface LinkPresetManagerProps {
  /** Applique un préréglage aux liens visés (fenêtre ouverte depuis le tableau). */
  onApply?: (preset: LinkPresetDef) => void
  /** Nombre de liens visés par « Appliquer » (affiché dans l'infobulle). */
  applyCount?: number
}

type Editing = { id: string | null } | null

export function LinkPresetManager({ onApply, applyCount = 0 }: LinkPresetManagerProps): JSX.Element {
  const presets = useSettings((state) => state.linkPresets)
  const addLinkPreset = useSettings((state) => state.addLinkPreset)
  const removeLinkPreset = useSettings((state) => state.removeLinkPreset)
  const setLinkPresets = useSettings((state) => state.setLinkPresets)

  const [editing, setEditing] = useState<Editing>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const full = presets.length >= LINK_PRESETS_MAX
  const limitText = t('linkPreset.limit', { max: LINK_PRESETS_MAX })

  if (editing) {
    const current = editing.id ? presets.find((preset) => preset.id === editing.id) : undefined
    // Préréglage NEUF : rien de coché (tout « inchangé ») — modifier une valeur coche
    // sa case ; on n'impose donc jamais une relation vide ou un tracé par défaut.
    const include: LinkPresetProp[] = current
      ? LINK_PRESET_PROPS.filter((key) => current.props[key] !== undefined)
      : []
    return (
      <div className="lp-manager">
        <div className="lp-manager__title">
          {current ? t('linkPreset.editTitle') : t('linkPreset.newTitle')}
        </div>
        <LinkPresetEditor
          key={editing.id ?? 'new'}
          initialName={current?.name ?? ''}
          initialValues={current ? sanitizeValues(current.props) : DEFAULT_PRESET_VALUES}
          initialInclude={include}
          saveLabel={t('linkPreset.save')}
          blockedReason={!current && full ? limitText : undefined}
          onSave={(name, props) => {
            addLinkPreset({ id: current?.id ?? newId(), name, props })
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  const commitRename = (preset: LinkPresetDef): void => {
    const name = cleanPresetText(renameDraft, LINK_PRESET_NAME_MAX)
    if (name && name !== preset.name) addLinkPreset({ ...preset, name })
    setRenaming(null)
  }

  return (
    <div className="lp-manager">
      <p className="cm-hint lp-manager__hint">{t('linkPreset.hint')}</p>

      {presets.length === 0 ? (
        <p className="lp-manager__empty">{t('linkPreset.empty')}</p>
      ) : (
        <ul className="lp-list">
          {presets.map((preset, index) => {
            const summary = presetSummary(preset.props)
            return (
              <li key={preset.id} className="lp-list__item">
                <LinkPresetPreview props={preset.props} />
                <div className="lp-list__text">
                  {renaming === preset.id ? (
                    <input
                      className="cm-input lp-list__rename"
                      value={renameDraft}
                      autoFocus
                      maxLength={LINK_PRESET_NAME_MAX}
                      aria-label={t('linkPreset.rename')}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={() => commitRename(preset)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitRename(preset)
                        } else if (event.key === 'Escape') {
                          // Annule le renommage SANS fermer la fenêtre parente.
                          event.preventDefault()
                          event.stopPropagation()
                          setRenaming(null)
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="lp-list__name"
                      title={t('linkPreset.rename')}
                      onDoubleClick={() => {
                        setRenaming(preset.id)
                        setRenameDraft(preset.name)
                      }}
                    >
                      {preset.name}
                    </span>
                  )}
                  {summary !== '' && <span className="lp-list__summary">{summary}</span>}
                </div>
                <div className="lp-list__actions">
                  {onApply && (
                    <button
                      type="button"
                      className="cm-btn cm-btn--sm cm-btn--primary"
                      title={`${t('linkPreset.apply')} (${applyCount})`}
                      onClick={() => onApply(preset)}
                    >
                      <Check size={13} />
                      {t('linkPreset.apply')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cm-btn cm-btn--sm cm-btn--ghost cm-btn--icon"
                    title={t('linkPreset.moveUp')}
                    aria-label={t('linkPreset.moveUp')}
                    disabled={index === 0}
                    onClick={() => setLinkPresets(moveLinkPreset(presets, preset.id, -1))}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="cm-btn cm-btn--sm cm-btn--ghost cm-btn--icon"
                    title={t('linkPreset.moveDown')}
                    aria-label={t('linkPreset.moveDown')}
                    disabled={index === presets.length - 1}
                    onClick={() => setLinkPresets(moveLinkPreset(presets, preset.id, 1))}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="cm-btn cm-btn--sm cm-btn--ghost cm-btn--icon"
                    title={t('linkPreset.rename')}
                    aria-label={t('linkPreset.rename')}
                    onClick={() => {
                      setRenaming(preset.id)
                      setRenameDraft(preset.name)
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="cm-btn cm-btn--sm cm-btn--ghost cm-btn--icon"
                    title={full ? limitText : t('linkPreset.duplicate')}
                    aria-label={t('linkPreset.duplicate')}
                    disabled={full}
                    onClick={() =>
                      setLinkPresets(
                        duplicateLinkPreset(
                          presets,
                          preset.id,
                          newId(),
                          t('linkPreset.copyName', { name: preset.name })
                        )
                      )
                    }
                  >
                    <CopyPlus size={14} />
                  </button>
                  <button
                    type="button"
                    className="cm-btn cm-btn--sm cm-btn--ghost cm-btn--icon"
                    title={t('linkPreset.edit')}
                    aria-label={t('linkPreset.edit')}
                    onClick={() => setEditing({ id: preset.id })}
                  >
                    <SlidersHorizontal size={14} />
                  </button>
                  <button
                    type="button"
                    className="cm-btn cm-btn--sm cm-btn--ghost cm-btn--icon lp-list__del"
                    title={t('edge.presetDelete')}
                    aria-label={t('edge.presetDelete')}
                    onClick={() => {
                      if (window.confirm(t('linkPreset.deleteConfirm', { name: preset.name }))) {
                        removeLinkPreset(preset.id)
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="lp-manager__foot">
        <button
          type="button"
          className="cm-btn cm-btn--sm"
          disabled={full}
          title={full ? limitText : undefined}
          onClick={() => setEditing({ id: null })}
        >
          <Plus size={14} />
          {t('linkPreset.new')}
        </button>
        {full && <span className="cm-hint">{limitText}</span>}
      </div>
    </div>
  )
}
