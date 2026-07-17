/**
 * Sélecteur de catalogue cherchable (§2 v1.8.1) — module générique adossé à
 * lib/catalogs.ts, sur le modèle de PlatformPicker (réseaux sociaux).
 *
 * Propose une liste RICHE (banque, cryptomonnaie, marque, opérateur, pays, réseau
 * de carte, algorithme de hachage…) avec recherche instantanée insensible aux
 * accents et regroupement. RÈGLE ABSOLUE : jamais limitant — une zone « Autre /
 * valeur libre » permet TOUJOURS de saisir n'importe quelle valeur hors liste (et
 * pré-remplie quand la valeur courante n'est pas dans le catalogue). La valeur
 * stockée reste une simple chaîne (portable, rétro-compatible avec un champ texte).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { FieldKind } from '@/types'
import { catalogForKind, foldSearch, type CatalogOption } from '@/lib/catalogs'
import { EntityIcon } from '@/components/nodes/entityIcons'
import { t } from '@/i18n'
import './catalog.css'

interface CatalogPickerProps {
  kind: FieldKind
  value: string
  onChange: (value: string) => void
}

export function CatalogPicker({ kind, value, onChange }: CatalogPickerProps): JSX.Element | null {
  const catalog = catalogForKind(kind)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [freeDraft, setFreeDraft] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  // La valeur courante est-elle une option du catalogue, ou une saisie libre ?
  const matched = useMemo(
    () => (catalog ? catalog.options.find((option) => option.value === value) : undefined),
    [catalog, value]
  )
  const isCustom = value.trim() !== '' && !matched

  // À l'ouverture, pré-remplir la zone « Autre » avec la valeur libre courante.
  useEffect(() => {
    if (open) setFreeDraft(isCustom ? value : '')
  }, [open, isCustom, value])

  // Fermeture au clic extérieur / Échap.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!catalog) return null

  const needle = foldSearch(query)
  const filtered = catalog.options.filter((option) => {
    if (needle === '') return true
    if (foldSearch(option.value).includes(needle)) return true
    return option.aliases?.some((alias) => foldSearch(alias).includes(needle)) ?? false
  })

  // Regroupement (dans l'ordre d'apparition des groupes).
  const groups: Array<{ group: string | undefined; items: CatalogOption[] }> = []
  for (const option of filtered) {
    const last = groups[groups.length - 1]
    if (last && last.group === option.group) last.items.push(option)
    else groups.push({ group: option.group, items: [option] })
  }

  const pick = (next: string): void => {
    if (next !== value) onChange(next)
    setOpen(false)
    setQuery('')
  }

  const commitFree = (): void => {
    const next = freeDraft.trim()
    // Si la saisie libre correspond en fait à une option, on la range dessus.
    pick(next)
  }

  const displayIcon = matched?.icon ?? catalog.icon
  const displayLabel = value.trim() !== '' ? value : t('catalog.choose')

  return (
    <div className="bd-catalog" ref={rootRef}>
      <button
        type="button"
        className={`bd-catalog__current${value.trim() === '' ? ' bd-catalog__current--empty' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <EntityIcon icon={displayIcon} size={13} />
        <span className="bd-catalog__label">{displayLabel}</span>
        {value.trim() !== '' && (
          <span
            className="bd-catalog__clear"
            role="button"
            tabIndex={0}
            title={t('catalog.clear')}
            aria-label={t('catalog.clear')}
            onClick={(event) => {
              event.stopPropagation()
              pick('')
            }}
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="bd-catalog__pop" role="listbox">
          <input
            className="cm-input bd-catalog__search"
            placeholder={t('catalog.search')}
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Entrée : si une seule option filtrée, la choisir ; sinon valeur libre.
              if (event.key !== 'Enter') return
              event.preventDefault()
              if (filtered.length === 1) pick(filtered[0].value)
              else if (query.trim() !== '') pick(query.trim())
            }}
          />
          <div className="bd-catalog__list">
            {groups.map((group, gi) => (
              <div key={group.group ?? gi}>
                {group.group && <div className="bd-catalog__grouplabel">{group.group}</div>}
                {group.items.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`bd-catalog__opt${option.value === value ? ' bd-catalog__opt--active' : ''}`}
                    onClick={() => pick(option.value)}
                  >
                    <EntityIcon icon={option.icon ?? catalog.icon} size={13} />
                    <span className="bd-catalog__optlabel">{option.value}</span>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <button
                type="button"
                className="bd-catalog__opt bd-catalog__opt--use"
                onClick={() => query.trim() !== '' && pick(query.trim())}
                disabled={query.trim() === ''}
              >
                {t('catalog.use', { value: query.trim() })}
              </button>
            )}
          </div>

          {/* Zone « Autre / valeur libre » — jamais limitant (§2 v1.8.1). */}
          <div className="bd-catalog__free">
            <span className="bd-catalog__grouplabel">{t('catalog.otherGroup')}</span>
            <div className="bd-catalog__freerow">
              <input
                className="cm-input"
                placeholder={t('catalog.otherPlaceholder')}
                value={freeDraft}
                spellCheck={false}
                onChange={(event) => setFreeDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitFree()
                  }
                }}
              />
              <button
                className="cm-btn cm-btn--sm cm-btn--primary"
                onClick={commitFree}
                disabled={freeDraft.trim() === '' && value.trim() === ''}
              >
                {t('catalog.useShort')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
