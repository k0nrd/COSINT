/**
 * Sélecteur de plateforme cherchable (§2 v1.5).
 *
 * Propose toutes les plateformes du catalogue (réseaux sociaux + comptes/
 * fournisseurs, lib/links.ts) PLUS les plateformes personnalisées de l'utilisateur
 * (mémorisées localement). Recherche instantanée, groupement par catégorie, et
 * option « Autre / personnalisé » pour définir une plateforme (nom, gabarit d'URL
 * avec `{id}`, icône) réutilisable ensuite.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Globe, Plus, Trash2 } from 'lucide-react'
import { PLATFORMS, customToPlatform, type Platform } from '@/lib/links'
import { newId } from '@/lib/id'
import { useSettings, type CustomPlatform } from '@/store/settings'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { t, type MessageKey } from '@/i18n'
import './platform.css'

/** Liste complète des plateformes (intégrées + personnalisées), réactive. */
export function useAllPlatforms(): Platform[] {
  const customPlatforms = useSettings((state) => state.customPlatforms)
  return useMemo(() => [...PLATFORMS, ...customPlatforms.map(customToPlatform)], [customPlatforms])
}

/** Résolveur incluant les plateformes personnalisées (pour buildSocialUrl). */
export function usePlatformResolver(): (id: string) => Platform | undefined {
  const customPlatforms = useSettings((state) => state.customPlatforms)
  return useMemo(() => {
    const byId = new Map<string, Platform>(PLATFORMS.map((p) => [p.id, p]))
    for (const custom of customPlatforms) byId.set(custom.id, customToPlatform(custom))
    return (id: string) => byId.get(id)
  }, [customPlatforms])
}

interface PlatformPickerProps {
  value: string
  onChange: (platformId: string) => void
}

const GROUP_LABELS: Record<Platform['category'], MessageKey> = {
  social: 'platform.groupSocial',
  account: 'platform.groupAccount',
  custom: 'platform.groupCustom'
}

export function PlatformPicker({ value, onChange }: PlatformPickerProps): JSX.Element {
  const customPlatforms = useSettings((state) => state.customPlatforms)
  const addCustomPlatform = useSettings((state) => state.addCustomPlatform)
  const removeCustomPlatform = useSettings((state) => state.removeCustomPlatform)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ label: '', template: '', icon: '' })
  const rootRef = useRef<HTMLDivElement>(null)

  const allPlatforms = useMemo<Platform[]>(
    () => [...PLATFORMS, ...customPlatforms.map(customToPlatform)],
    [customPlatforms]
  )
  const current = allPlatforms.find((platform) => platform.id === value) ?? PLATFORMS[0]

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
        setAdding(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const needle = query.trim().toLowerCase()
  const filtered = allPlatforms.filter((platform) =>
    needle === '' ? true : platform.label.toLowerCase().includes(needle)
  )
  const groups: Array<{ category: Platform['category']; items: Platform[] }> = (
    ['social', 'account', 'custom'] as Platform['category'][]
  )
    .map((category) => ({ category, items: filtered.filter((p) => p.category === category) }))
    .filter((group) => group.items.length > 0)

  const pick = (id: string): void => {
    onChange(id)
    setOpen(false)
    setQuery('')
    setAdding(false)
  }

  const saveCustom = (): void => {
    const label = draft.label.trim()
    if (label === '') return
    const platform: CustomPlatform = {
      id: `custom-${newId()}`,
      label,
      template: draft.template.trim(),
      icon: draft.icon.trim() || 'Globe'
    }
    addCustomPlatform(platform)
    setDraft({ label: '', template: '', icon: '' })
    pick(platform.id)
  }

  return (
    <div className="bd-platform" ref={rootRef}>
      <button
        type="button"
        className="bd-platform__current"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('social.platform')}
      >
        <EntityIcon icon={current.icon} size={13} />
        <span className="bd-platform__label">{current.label}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="bd-platform__pop" role="listbox">
          <input
            className="cm-input bd-platform__search"
            placeholder={t('platform.search')}
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="bd-platform__list">
            {groups.map((group) => (
              <div key={group.category}>
                <div className="bd-platform__grouplabel">{t(GROUP_LABELS[group.category])}</div>
                {group.items.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    className={`bd-platform__opt${platform.id === value ? ' bd-platform__opt--active' : ''}`}
                    onClick={() => pick(platform.id)}
                  >
                    <EntityIcon icon={platform.icon} size={13} />
                    <span className="bd-platform__optlabel">{platform.label}</span>
                    {platform.category === 'custom' && (
                      <span
                        className="bd-platform__del"
                        role="button"
                        tabIndex={0}
                        title={t('common.remove')}
                        onClick={(event) => {
                          event.stopPropagation()
                          removeCustomPlatform(platform.id)
                        }}
                      >
                        <Trash2 size={12} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="bd-platform__empty">{t('platform.noResult')}</div>
            )}
          </div>

          {/* Ajout d'une plateforme personnalisée. */}
          {adding ? (
            <div className="bd-platform__form">
              <input
                className="cm-input"
                placeholder={t('platform.namePlaceholder')}
                value={draft.label}
                autoFocus
                onChange={(event) => setDraft((d) => ({ ...d, label: event.target.value }))}
              />
              <input
                className="cm-input cm-mono"
                placeholder={t('platform.templatePlaceholder')}
                value={draft.template}
                spellCheck={false}
                onChange={(event) => setDraft((d) => ({ ...d, template: event.target.value }))}
              />
              <input
                className="cm-input"
                placeholder={t('platform.iconPlaceholder')}
                value={draft.icon}
                spellCheck={false}
                onChange={(event) => setDraft((d) => ({ ...d, icon: event.target.value }))}
              />
              <div className="bd-platform__formactions">
                <button className="cm-btn cm-btn--sm cm-btn--primary" onClick={saveCustom}>
                  {t('common.add')}
                </button>
                <button className="cm-btn cm-btn--sm" onClick={() => setAdding(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button className="bd-platform__add" type="button" onClick={() => setAdding(true)}>
              <Plus size={13} />
              {t('platform.addCustom')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Icône par défaut (repli) — exportée pour d'éventuels rendus hors picker. */
export const DEFAULT_PLATFORM_ICON = Globe
