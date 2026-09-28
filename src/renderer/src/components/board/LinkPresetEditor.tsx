/**
 * §7 v1.9 — éditeur d'un préréglage de lien : nom + CHAQUE réglage réutilisable d'un
 * lien (type de relation — liste prédéfinie ET « Autre… » libre —, libellé, couleur,
 * épaisseur, style de trait, flèches, tracé, statut, côtés de départ/d'arrivée), avec
 * APERÇU EN DIRECT. Chaque réglage a une case « appliquer » : décoché = inchangé sur
 * le lien. Modifier une valeur coche automatiquement sa case.
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Minus,
  MoveHorizontal,
  Spline,
  Waypoints,
  X
} from 'lucide-react'
import type { EdgeDirection, EdgePathType, EdgeStyle, EdgeWidth, ElementStatus } from '@/types'
import { colorHex, normalizeHex, PRESET_COLORS } from '@/lib/colors'
import { RELATION_TYPES } from '@/lib/relations'
import {
  LINK_PRESET_NAME_MAX,
  LINK_PRESET_PROPS,
  LINK_PRESET_TEXT_MAX,
  PRESET_ANCHORS,
  pickPresetProps,
  relationChoice,
  type LinkPresetProp,
  type LinkPresetProps,
  type LinkPresetValues,
  type PresetAnchor
} from '@/lib/linkPresets'
import { StatusPicker } from '@/components/board/StatusBadge'
import { LinkPresetPreview } from '@/components/board/LinkPresetPreview'
import {
  ANCHOR_LABEL,
  DIRECTION_LABEL,
  PATH_LABEL,
  PROP_LABEL,
  STYLE_LABEL,
  WIDTH_LABEL
} from '@/components/board/linkPresetLabels'
import { t } from '@/i18n'
import './linkPresets.css'

interface LinkPresetEditorProps {
  initialName: string
  initialValues: LinkPresetValues
  initialInclude: LinkPresetProp[]
  /** Valeurs reprises d'un lien existant (message d'aide adapté). */
  fromEdge?: boolean
  saveLabel: string
  /** Raison bloquante (ex. limite atteinte) : enregistrement désactivé. */
  blockedReason?: string
  onSave: (name: string, props: LinkPresetProps) => void
  onCancel: () => void
}

const OTHER = '__other__'

/** Groupe de boutons segmentés (une valeur parmi n). */
function Seg<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: Array<{ id: T; text: string; icon?: ReactNode }>
  onChange: (value: T) => void
  label: string
}): JSX.Element {
  return (
    <div className="lp-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          className={`lp-seg__btn${option.id === value ? ' lp-seg__btn--on' : ''}`}
          onClick={() => onChange(option.id)}
        >
          {option.icon}
          <span>{option.text}</span>
        </button>
      ))}
    </div>
  )
}

/** Petit échantillon de trait pour les options de style/épaisseur. */
function LineSample({ style, width }: { style?: EdgeStyle; width?: EdgeWidth }): JSX.Element {
  const w = width === 'thin' ? 1.5 : width === 'thick' ? 4 : 2
  return (
    <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
      <line
        x1="1"
        y1="4"
        x2="17"
        y2="4"
        stroke="currentColor"
        strokeWidth={w}
        strokeDasharray={style === 'dashed' ? '5 3' : style === 'dotted' ? '1 3' : undefined}
        strokeLinecap={style === 'dotted' ? 'round' : 'butt'}
      />
    </svg>
  )
}

export function LinkPresetEditor({
  initialName,
  initialValues,
  initialInclude,
  fromEdge,
  saveLabel,
  blockedReason,
  onSave,
  onCancel
}: LinkPresetEditorProps): JSX.Element {
  const [name, setName] = useState(initialName)
  const [values, setValues] = useState<LinkPresetValues>(initialValues)
  const [include, setInclude] = useState<Set<LinkPresetProp>>(() => new Set(initialInclude))
  // « Autre… » : mode découplé de la valeur (on peut le choisir avant de taper le texte).
  const [otherMode, setOtherMode] = useState(() => relationChoice(initialValues.relationType).kind === 'other')
  const [hexDraft, setHexDraft] = useState(colorHex(initialValues.color))
  const [tried, setTried] = useState(false)

  /** Modifie une valeur ET coche le réglage (changer une valeur = vouloir l'appliquer). */
  const set = <K extends LinkPresetProp>(key: K, value: LinkPresetValues[K]): void => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setInclude((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
  }
  const toggle = (key: LinkPresetProp, on: boolean): void => {
    setInclude((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const props = useMemo(() => pickPresetProps(values, include), [values, include])
  const trimmedName = name.trim()
  const relationMissing = include.has('relationType') && otherMode && values.relationType.trim() === ''
  const errors: string[] = []
  if (trimmedName === '') errors.push(t('linkPreset.nameRequired'))
  if (include.size === 0) errors.push(t('linkPreset.noneIncluded'))
  if (relationMissing) errors.push(t('linkPreset.otherRequired'))
  if (blockedReason) errors.push(blockedReason)
  const valid = errors.length === 0

  const save = (): void => {
    setTried(true)
    if (!valid) return
    onSave(trimmedName, props)
  }

  const relationSelectValue = otherMode
    ? OTHER
    : relationChoice(values.relationType).kind === 'known'
      ? values.relationType
      : ''

  const controls: Record<LinkPresetProp, ReactNode> = {
    relationType: (
      <div className="lp-inline">
        <select
          className="cm-select lp-select"
          value={relationSelectValue}
          aria-label={t(PROP_LABEL.relationType)}
          onChange={(event) => {
            const next = event.target.value
            if (next === OTHER) {
              setOtherMode(true)
              // Le texte libre repart de vide si l'on venait d'un type prédéfini.
              set('relationType', relationChoice(values.relationType).kind === 'other' ? values.relationType : '')
            } else {
              setOtherMode(false)
              set('relationType', next)
            }
          }}
        >
          <option value="">{t('relation.none')}</option>
          {RELATION_TYPES.map((relation) => (
            <option key={relation.id} value={relation.id}>
              {t(relation.labelKey)}
            </option>
          ))}
          <option value={OTHER}>{t('linkPreset.relationOther')}</option>
        </select>
        {otherMode && (
          <input
            className="cm-input"
            value={values.relationType}
            maxLength={LINK_PRESET_TEXT_MAX}
            placeholder={t('linkPreset.relationOtherPlaceholder')}
            aria-label={t('linkPreset.relationOtherPlaceholder')}
            onChange={(event) => set('relationType', event.target.value)}
            aria-invalid={tried && relationMissing}
          />
        )}
      </div>
    ),
    label: (
      <input
        className="cm-input"
        value={values.label}
        maxLength={LINK_PRESET_TEXT_MAX}
        placeholder={t('linkPreset.labelPlaceholder')}
        aria-label={t(PROP_LABEL.label)}
        onChange={(event) => set('label', event.target.value)}
      />
    ),
    color: (
      <div className="lp-colors" role="group" aria-label={t(PROP_LABEL.color)}>
        {PRESET_COLORS.map((hex) => (
          <button
            key={hex}
            type="button"
            className={`lp-swatch${colorHex(values.color) === hex ? ' lp-swatch--on' : ''}`}
            style={{ background: hex }}
            title={hex}
            aria-label={hex}
            aria-pressed={colorHex(values.color) === hex}
            onClick={() => {
              set('color', hex)
              setHexDraft(hex)
            }}
          />
        ))}
        <input
          type="color"
          className="lp-color-input"
          value={colorHex(values.color)}
          title={t('colorPicker.custom')}
          aria-label={t('colorPicker.custom')}
          onChange={(event) => {
            const hex = colorHex(event.target.value)
            set('color', hex)
            setHexDraft(hex)
          }}
        />
        <input
          className="cm-input cm-mono lp-hex"
          value={hexDraft}
          maxLength={7}
          aria-label={t('colorPicker.custom')}
          onChange={(event) => {
            setHexDraft(event.target.value)
            const hex = normalizeHex(event.target.value)
            if (hex) set('color', hex)
          }}
          onBlur={() => setHexDraft(colorHex(values.color))}
        />
      </div>
    ),
    width: (
      <Seg<EdgeWidth>
        label={t(PROP_LABEL.width)}
        value={values.width}
        onChange={(v) => set('width', v)}
        options={(['thin', 'normal', 'thick'] as EdgeWidth[]).map((id) => ({
          id,
          text: t(WIDTH_LABEL[id]),
          icon: <LineSample width={id} />
        }))}
      />
    ),
    style: (
      <Seg<EdgeStyle>
        label={t(PROP_LABEL.style)}
        value={values.style}
        onChange={(v) => set('style', v)}
        options={(['solid', 'dashed', 'dotted'] as EdgeStyle[]).map((id) => ({
          id,
          text: t(STYLE_LABEL[id]),
          icon: <LineSample style={id} />
        }))}
      />
    ),
    direction: (
      <Seg<EdgeDirection>
        label={t(PROP_LABEL.direction)}
        value={values.direction}
        onChange={(v) => set('direction', v)}
        options={[
          { id: 'none', text: t(DIRECTION_LABEL.none), icon: <MoveHorizontal size={14} /> },
          { id: 'single', text: t(DIRECTION_LABEL.single), icon: <ArrowRight size={14} /> },
          { id: 'double', text: t(DIRECTION_LABEL.double), icon: <ArrowLeftRight size={14} /> }
        ]}
      />
    ),
    pathType: (
      <Seg<EdgePathType>
        label={t(PROP_LABEL.pathType)}
        value={values.pathType}
        onChange={(v) => set('pathType', v)}
        options={[
          { id: 'bezier', text: t(PATH_LABEL.bezier), icon: <Spline size={14} /> },
          { id: 'straight', text: t(PATH_LABEL.straight), icon: <Minus size={14} /> },
          { id: 'step', text: t(PATH_LABEL.step), icon: <Waypoints size={14} /> }
        ]}
      />
    ),
    status: (
      <StatusPicker value={values.status} compact onChange={(v: ElementStatus) => set('status', v)} />
    ),
    sourceAnchor: (
      <select
        className="cm-select lp-select"
        value={values.sourceAnchor}
        aria-label={t(PROP_LABEL.sourceAnchor)}
        onChange={(event) => set('sourceAnchor', event.target.value as PresetAnchor)}
      >
        {PRESET_ANCHORS.map((anchor) => (
          <option key={anchor} value={anchor}>
            {t(ANCHOR_LABEL[anchor])}
          </option>
        ))}
      </select>
    ),
    targetAnchor: (
      <select
        className="cm-select lp-select"
        value={values.targetAnchor}
        aria-label={t(PROP_LABEL.targetAnchor)}
        onChange={(event) => set('targetAnchor', event.target.value as PresetAnchor)}
      >
        {PRESET_ANCHORS.map((anchor) => (
          <option key={anchor} value={anchor}>
            {t(ANCHOR_LABEL[anchor])}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div
      className="lp-editor"
      onKeyDown={(event) => {
        // Échap = annuler l'édition SANS fermer la fenêtre parente (ex. les Paramètres,
        // dont Échap abandonnerait aussi les autres réglages en cours).
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
          return
        }
        // Entrée dans un champ texte = enregistrer (pas dans une liste déroulante).
        if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
          const type = (event.target as HTMLInputElement).type
          if (type === 'text' || type === '') {
            event.preventDefault()
            save()
          }
        }
      }}
    >
      <span className="cm-label lp-editor__first">{t('edge.presetName')}</span>
      <input
        className="cm-input"
        value={name}
        autoFocus
        maxLength={LINK_PRESET_NAME_MAX}
        placeholder={t('edge.presetName')}
        aria-label={t('edge.presetName')}
        aria-invalid={tried && trimmedName === ''}
        onChange={(event) => setName(event.target.value)}
      />

      {/* Aperçu COLLANT : reste visible pendant qu'on règle les lignes du bas. */}
      <div className="lp-editor__preview">
        <span className="cm-label">{t('linkPreset.preview')}</span>
        <LinkPresetPreview props={props} size="lg" />
      </div>

      <div className="lp-editor__bar">
        <p className="cm-hint lp-editor__hint">
          {fromEdge ? t('linkPreset.fromEdgeHint') : t('linkPreset.includeHint')}
        </p>
        <div className="lp-editor__bulk">
          <button type="button" className="cm-btn cm-btn--sm cm-btn--ghost" onClick={() => setInclude(new Set(LINK_PRESET_PROPS))}>
            {t('linkPreset.checkAll')}
          </button>
          <button type="button" className="cm-btn cm-btn--sm cm-btn--ghost" onClick={() => setInclude(new Set())}>
            {t('linkPreset.checkNone')}
          </button>
        </div>
      </div>

      <div className="lp-rows">
        {LINK_PRESET_PROPS.map((key) => {
          const on = include.has(key)
          return (
            <div key={key} className={`lp-row${on ? '' : ' lp-row--off'}`}>
              <label className="lp-row__head">
                <input type="checkbox" checked={on} onChange={(event) => toggle(key, event.target.checked)} />
                <span className="lp-row__label">
                  <span className="lp-row__name">{t(PROP_LABEL[key])}</span>
                  {!on && <span className="lp-row__unchanged">{t('linkPreset.unchanged')}</span>}
                </span>
              </label>
              <div className="lp-row__ctl">{controls[key]}</div>
            </div>
          )
        })}
      </div>

      {tried && !valid && (
        <ul className="lp-editor__errors" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      {!tried && blockedReason && (
        <p className="lp-editor__errors" role="alert">
          {blockedReason}
        </p>
      )}

      <div className="lp-editor__actions">
        <button type="button" className="cm-btn" onClick={onCancel}>
          <X size={14} />
          {t('common.cancel')}
        </button>
        <button type="button" className="cm-btn cm-btn--primary" onClick={save} disabled={tried && !valid}>
          <Check size={14} />
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
