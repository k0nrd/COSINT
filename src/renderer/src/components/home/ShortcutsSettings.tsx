/**
 * Gestionnaire de raccourcis clavier (§3 v1.6) — section des Paramètres.
 *
 * Liste toutes les actions raccourciables (groupées par catégorie), avec pour
 * chacune : le raccourci actuel, un bouton pour le RÉASSIGNER (capture en direct de
 * la combinaison pressée), le RÉINITIALISER ou le SUPPRIMER. Détection de conflits,
 * import/export JSON, réinitialisation globale, filtre de recherche. Les préférences
 * sont stockées localement (store/shortcuts).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { t, type MessageKey } from '@/i18n'
import {
  DRAG_MODIFIERS,
  SHORTCUT_ACTIONS,
  SHORTCUT_CATEGORIES,
  bindingFromEvent,
  formatBinding,
  modifierKeyLabel,
  shortcutAction,
  type ShortcutCategory
} from '@/lib/shortcuts'
import {
  effectiveBinding,
  exportBindings,
  findConflict,
  sanitizeImportedBindings,
  useShortcuts
} from '@/store/shortcuts'
import { useToasts } from '@/store/toasts'

const CATEGORY_LABEL: Record<ShortcutCategory, MessageKey> = {
  edition: 'shortcut.category.edition',
  navigation: 'shortcut.category.navigation',
  creation: 'shortcut.category.creation',
  view: 'shortcut.category.view'
}

export function ShortcutsSettings(): JSX.Element {
  const overrides = useShortcuts((state) => state.overrides)
  const setBinding = useShortcuts((state) => state.setBinding)
  const unbindAction = useShortcuts((state) => state.unbindAction)
  const resetBinding = useShortcuts((state) => state.resetBinding)
  const resetAll = useShortcuts((state) => state.resetAll)
  const importOverrides = useShortcuts((state) => state.importOverrides)
  const dragModifier = useShortcuts((state) => state.dragModifier)
  const setDragModifier = useShortcuts((state) => state.setDragModifier)
  const pushToast = useToasts((state) => state.push)

  const [query, setQuery] = useState('')
  const [capturingId, setCapturingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Capture d'une combinaison en direct. Écoute en phase de CAPTURE + stopPropagation
  // pour que la touche (dont Échap) ne remonte PAS au gestionnaire Échap de la modale.
  useEffect(() => {
    if (!capturingId) return
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setCapturingId(null)
        return
      }
      const binding = bindingFromEvent(event)
      if (!binding) return // touche modificatrice seule : on attend une vraie touche
      const conflict = findConflict(binding, overrides, capturingId)
      if (conflict) {
        const conflictLabel = t(shortcutAction(conflict)!.labelKey)
        const ok = window.confirm(
          t('shortcut.conflict', { binding: formatBinding(binding), action: conflictLabel })
        )
        if (!ok) {
          setCapturingId(null)
          return
        }
        // Réassignation : l'ancienne action perd le raccourci.
        unbindAction(conflict)
      }
      setBinding(capturingId, binding)
      setCapturingId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturingId, overrides, setBinding, unbindAction])

  const needle = query.trim().toLowerCase()
  const actionsByCategory = useMemo(() => {
    const groups = new Map<ShortcutCategory, typeof SHORTCUT_ACTIONS>()
    for (const category of SHORTCUT_CATEGORIES) groups.set(category, [])
    for (const action of SHORTCUT_ACTIONS) {
      if (needle !== '' && !t(action.labelKey).toLowerCase().includes(needle)) continue
      groups.get(action.category)!.push(action)
    }
    return groups
  }, [needle])

  const doExport = (): void => {
    const data = JSON.stringify(exportBindings(overrides), null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'cosint-raccourcis.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const doImportFile = (file: File): void => {
    const reader = new FileReader()
    reader.onload = (): void => {
      try {
        const parsed = sanitizeImportedBindings(JSON.parse(String(reader.result)))
        if (!parsed) throw new Error('format')
        importOverrides(parsed)
        pushToast(t('shortcut.imported'), 'success')
      } catch {
        pushToast(t('shortcut.importError'), 'error')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="sc-manager">
      <div className="sc-toolbar">
        <input
          className="cm-input sc-search"
          value={query}
          placeholder={t('shortcut.filterActions')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="cm-btn cm-btn--sm" onClick={doExport} title={t('shortcut.export')}>
          <Download size={14} />
        </button>
        <button
          className="cm-btn cm-btn--sm"
          onClick={() => fileRef.current?.click()}
          title={t('shortcut.import')}
        >
          <Upload size={14} />
        </button>
        <button
          className="cm-btn cm-btn--sm"
          onClick={() => {
            if (window.confirm(t('shortcut.resetAllConfirm'))) resetAll()
          }}
          title={t('shortcut.resetAll')}
        >
          <RotateCcw size={14} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) doImportFile(file)
            event.target.value = ''
          }}
        />
      </div>

      {/* §3 v1.8.6 : touche de MAINTIEN pour l'édition au glisser sur la frise. */}
      <section className="sc-group">
        <h4 className="sc-group__title">{t('shortcut.holdSection')}</h4>
        <div className="sc-row">
          <span className="sc-row__label">{t('shortcut.holdTimelineEdit')}</span>
          <div className="hm-seg" role="group" aria-label={t('shortcut.holdSection')}>
            {DRAG_MODIFIERS.map((mod) => (
              <button
                key={mod}
                type="button"
                className={`hm-seg__btn${dragModifier === mod ? ' hm-seg__btn--on' : ''}`}
                onClick={() => setDragModifier(mod)}
              >
                {modifierKeyLabel(mod)}
              </button>
            ))}
          </div>
        </div>
        <p className="cm-hint">{t('shortcut.holdHint')}</p>
      </section>

      {SHORTCUT_CATEGORIES.map((category) => {
        const actions = actionsByCategory.get(category) ?? []
        if (actions.length === 0) return null
        return (
          <section key={category} className="sc-group">
            <h4 className="sc-group__title">{t(CATEGORY_LABEL[category])}</h4>
            {actions.map((action) => {
              const binding = effectiveBinding(action.id, overrides)
              const capturing = capturingId === action.id
              const isDefault = !Object.prototype.hasOwnProperty.call(overrides, action.id)
              return (
                <div key={action.id} className="sc-row">
                  <span className="sc-row__label">{t(action.labelKey)}</span>
                  <button
                    className={`sc-binding${capturing ? ' sc-binding--capturing' : ''}`}
                    onClick={() => setCapturingId(capturing ? null : action.id)}
                    title={t('shortcut.reassign')}
                  >
                    {capturing ? t('shortcut.pressKeys') : formatBinding(binding)}
                  </button>
                  <div className="sc-row__actions">
                    <button
                      className="cm-btn cm-btn--icon"
                      onClick={() => resetBinding(action.id)}
                      disabled={isDefault}
                      title={t('shortcut.reset')}
                      aria-label={t('shortcut.reset')}
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      className="cm-btn cm-btn--icon"
                      onClick={() => unbindAction(action.id)}
                      disabled={binding === null}
                      title={t('shortcut.remove')}
                      aria-label={t('shortcut.remove')}
                    >
                      {capturing ? <X size={13} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
