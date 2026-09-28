/**
 * Barre contextuelle du lien sélectionné (§1) : réglage immédiat du type de
 * relation, du label, du style de trait, des extrémités (direction), de
 * l'épaisseur, du tracé et de la couleur ; inversion et suppression.
 * §1 v1.7.1 : routage manuel au premier plan — côté de départ/arrivée sur les
 * nœuds (Auto/Haut/Bas/Gauche/Droite), mode « Dessiner le tracé » et retour au
 * tracé automatique.
 * §7 v1.9 : préréglages de lien — appliquer un préréglage (liste avec aperçu),
 * enregistrer ce lien comme préréglage (réglages à inclure au choix), gérer.
 */
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowLeftRight,
  BookmarkPlus,
  ChevronDown,
  Minus,
  MoveHorizontal,
  PenLine,
  Repeat,
  Route,
  Settings2,
  Spline,
  SwatchBook,
  Trash2,
  Waypoints,
  X
} from 'lucide-react'
import type {
  BoardEdgeData,
  EdgeAnchor,
  EdgeDirection,
  EdgePathType,
  EdgeStyle,
  EdgeWidth
} from '@/types'
import { reverseEdge } from '@/sync/boardOps'
import { useBoardContext } from '@/flow/BoardContext'
import { RELATION_TYPES } from '@/lib/relations'
import { colorHex } from '@/lib/colors'
import { ColorField } from '@/components/common/ColorPicker'
import { StatusPicker } from '@/components/board/StatusBadge'
// §7 v1.9 : préréglages de lien.
import { DEFAULT_CAPTURED_PROPS, edgePresetValues } from '@/lib/linkPresets'
import { useSettings } from '@/store/settings'
import { useLinkPresetDialog } from '@/store/linkPresetDialog'
import { LinkPresetPickList, onPickListKeyDown } from '@/components/board/LinkPresetPickList'
import { useApplyLinkPreset } from '@/components/board/LinkPresetDialog'
import { relationText } from '@/components/board/linkPresetLabels'
import { t } from '@/i18n'
import './edgeToolbar.css'

interface EdgeToolbarProps {
  edge: BoardEdgeData
  /** §1 v1.7.1 : entre dans le mode « Dessiner le tracé ». */
  onDrawRoute: () => void
  onClose: () => void
}

/** Options d'ancrage d'une extrémité (§1 v1.7.1). '' = automatique. */
const ANCHOR_CHOICES: Array<{ value: '' | EdgeAnchor; labelKey: Parameters<typeof t>[0] }> = [
  { value: '', labelKey: 'edge.anchorAuto' },
  { value: 't', labelKey: 'edge.anchorTop' },
  { value: 'b', labelKey: 'edge.anchorBottom' },
  { value: 'l', labelKey: 'edge.anchorLeft' },
  { value: 'r', labelKey: 'edge.anchorRight' }
]

/** Un groupe de boutons segmentés (style, direction, épaisseur, tracé). */
function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: Array<{ id: T; icon: JSX.Element; title: string }>
  value: T
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="et-seg" role="group">
      {options.map((option) => (
        <button
          key={option.id}
          className={`et-seg__btn${option.id === value ? ' et-seg__btn--active' : ''}`}
          onClick={() => onChange(option.id)}
          title={option.title}
          aria-label={option.title}
          aria-pressed={option.id === value}
        >
          {option.icon}
        </button>
      ))}
    </div>
  )
}

const CUSTOM = '__custom__'

export function EdgeToolbar({ edge, onDrawRoute, onClose }: EdgeToolbarProps): JSX.Element {
  const { handle, author, updateEdgeData, deleteEdges, setEdgesStatus, setEdgeAnchor, resetEdgeRouting } =
    useBoardContext()
  const [colorOpen, setColorOpen] = useState(false)
  const [label, setLabel] = useState(edge.label)
  // Mode « relation personnalisée » découplé de la valeur stockée : sélectionner
  // « Lien personnalisé… » n'écrit RIEN dans le document (sinon le libellé de menu
  // s'y retrouverait et serait diffusé aux pairs) ; le texte est un brouillon
  // local commité au blur/Entrée, sans transaction Yjs à chaque frappe.
  const [customMode, setCustomMode] = useState(false)
  const [relDraft, setRelDraft] = useState('')
  const colorRef = useRef<HTMLDivElement>(null)

  // ——— §7 v1.9 : préréglages de lien ———
  const linkPresets = useSettings((state) => state.linkPresets)
  const openPresetDialog = useLinkPresetDialog((state) => state.open)
  const applyPreset = useApplyLinkPreset()
  const [presetOpen, setPresetOpen] = useState(false)
  const presetRef = useRef<HTMLDivElement>(null)
  useEffect(() => setPresetOpen(false), [edge.id])
  useEffect(() => {
    if (!presetOpen) return
    const onDown = (event: MouseEvent): void => {
      if (presetRef.current && !presetRef.current.contains(event.target as Node)) setPresetOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [presetOpen])
  /** Enregistre CE lien comme préréglage : ses réglages actuels pré-remplissent
   *  l'éditeur, l'utilisateur nomme et choisit ce qu'il inclut. */
  const saveAsPreset = (): void => {
    setPresetOpen(false)
    openPresetDialog({
      mode: 'create',
      values: edgePresetValues(edge),
      include: DEFAULT_CAPTURED_PROPS,
      name: edge.relationType.trim() !== '' ? relationText(edge.relationType) : '',
      fromEdge: true
    })
  }

  useEffect(() => setLabel(edge.label), [edge.id, edge.label])
  // Réinitialise le mode custom au changement de lien (le composant n'est pas
  // remonté entre deux liens sélectionnés).
  useEffect(() => {
    const known = RELATION_TYPES.some((relation) => relation.id === edge.relationType)
    setCustomMode(false)
    setRelDraft(known || edge.relationType === '' ? '' : edge.relationType)
  }, [edge.id, edge.relationType])

  // Fermeture du sélecteur de couleur au clic extérieur.
  useEffect(() => {
    if (!colorOpen) return
    const onDown = (event: MouseEvent): void => {
      if (colorRef.current && !colorRef.current.contains(event.target as Node)) setColorOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [colorOpen])

  const hex = colorHex(edge.color)
  // Le sélecteur de relation connaît-il ce type ? sinon c'est une relation libre.
  const relationKnown = RELATION_TYPES.some((relation) => relation.id === edge.relationType)
  const showCustom = customMode || (!relationKnown && edge.relationType !== '')
  const relationValue = showCustom ? CUSTOM : edge.relationType === '' ? '' : edge.relationType

  const commitRelation = (): void => {
    const next = relDraft.trim()
    // Ne rien écrire si vide (sinon un simple blur effacerait une relation
    // existante) ni si inchangé (évite une transaction Yjs et un undo parasites).
    if (next !== '' && next !== edge.relationType) updateEdgeData(edge.id, { relationType: next })
  }

  const styleOptions: Array<{ id: EdgeStyle; icon: JSX.Element; title: string }> = [
    { id: 'solid', icon: <Minus size={15} />, title: t('details.styleSolid') },
    { id: 'dashed', icon: <span className="et-ico-dashed" />, title: t('details.styleDashed') },
    { id: 'dotted', icon: <span className="et-ico-dotted" />, title: t('style.dotted') }
  ]
  const dirOptions: Array<{ id: EdgeDirection; icon: JSX.Element; title: string }> = [
    { id: 'none', icon: <MoveHorizontal size={15} />, title: t('direction.none') },
    { id: 'single', icon: <ArrowRight size={15} />, title: t('direction.single') },
    { id: 'double', icon: <ArrowLeftRight size={15} />, title: t('direction.double') }
  ]
  const widthOptions: Array<{ id: EdgeWidth; icon: JSX.Element; title: string }> = [
    { id: 'thin', icon: <span className="et-ico-w et-ico-w1" />, title: t('width.thin') },
    { id: 'normal', icon: <span className="et-ico-w et-ico-w2" />, title: t('width.normal') },
    { id: 'thick', icon: <span className="et-ico-w et-ico-w3" />, title: t('width.thick') }
  ]
  const pathOptions: Array<{ id: EdgePathType; icon: JSX.Element; title: string }> = [
    { id: 'bezier', icon: <Spline size={15} />, title: t('path.bezier') },
    { id: 'straight', icon: <Minus size={15} />, title: t('path.straight') },
    { id: 'step', icon: <Waypoints size={15} />, title: t('path.step') }
  ]

  return (
    <div className="et-bar" role="toolbar" aria-label={t('edge.title')}>
      {/* §7 v1.9 : préréglages — appliquer (liste avec aperçu), enregistrer, gérer. */}
      <div className="lp-anchor" ref={presetRef}>
        <button
          className="et-btn lp-et-btn"
          onClick={() => setPresetOpen((open) => !open)}
          title={t('linkPreset.applyTitle')}
          aria-label={t('linkPreset.applyTitle')}
          aria-haspopup="menu"
          aria-expanded={presetOpen}
        >
          <SwatchBook size={15} />
          <span>{t('linkPreset.menuShort')}</span>
          <ChevronDown size={12} />
        </button>
        {presetOpen && (
          <div
            className="lp-pop"
            role="menu"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setPresetOpen(false)
                return
              }
              // ↑/↓ parcourent préréglages ET actions « Enregistrer » / « Gérer ».
              onPickListKeyDown(event)
            }}
          >
            <div className="fl-add-menu__title">{t('linkPreset.applyTitle')}</div>
            <LinkPresetPickList
              presets={linkPresets}
              autoFocus
              showEmpty
              keyboardNav={false}
              onPick={(preset) => {
                applyPreset([edge.id], preset)
                setPresetOpen(false)
              }}
            />
            <div className="lp-sep" role="separator" />
            <button className="fl-add-menu__item" role="menuitem" data-lp-item onClick={saveAsPreset}>
              <BookmarkPlus size={15} />
              {t('linkPreset.saveFromEdge')}
            </button>
            <button
              className="fl-add-menu__item"
              role="menuitem"
              data-lp-item
              onClick={() => {
                setPresetOpen(false)
                openPresetDialog({ mode: 'manage', edgeIds: [edge.id] })
              }}
            >
              <Settings2 size={15} />
              {t('linkPreset.manage')}
            </button>
          </div>
        )}
      </div>
      <button
        className="et-btn"
        onClick={saveAsPreset}
        title={t('linkPreset.saveFromEdge')}
        aria-label={t('linkPreset.saveFromEdge')}
      >
        <BookmarkPlus size={15} />
      </button>

      <span className="et-sep" />

      {/* Type de relation */}
      <select
        className="et-select"
        value={relationValue}
        onChange={(event) => {
          const next = event.target.value
          if (next === CUSTOM) {
            // Passer en saisie libre sans rien écrire dans le document.
            setCustomMode(true)
          } else {
            setCustomMode(false)
            updateEdgeData(edge.id, { relationType: next })
          }
        }}
        title={t('relation.choose')}
      >
        <option value="">{t('relation.none')}</option>
        {RELATION_TYPES.map((relation) => (
          <option key={relation.id} value={relation.id}>
            {t(relation.labelKey)}
          </option>
        ))}
        <option value={CUSTOM}>{t('relation.custom')}</option>
      </select>

      {showCustom && (
        <input
          className="et-input"
          value={relDraft}
          autoFocus
          placeholder={t('relation.custom')}
          onChange={(event) => setRelDraft(event.target.value)}
          onBlur={commitRelation}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          }}
        />
      )}

      {/* Label libre */}
      <input
        className="et-input"
        value={label}
        placeholder={t('details.label')}
        onChange={(event) => setLabel(event.target.value)}
        onBlur={() => label !== edge.label && updateEdgeData(edge.id, { label })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        }}
      />

      <span className="et-sep" />

      <Segmented options={styleOptions} value={edge.style} onChange={(v) => updateEdgeData(edge.id, { style: v })} />
      <Segmented options={dirOptions} value={edge.direction} onChange={(v) => updateEdgeData(edge.id, { direction: v })} />
      <Segmented options={widthOptions} value={edge.width} onChange={(v) => updateEdgeData(edge.id, { width: v })} />
      <Segmented options={pathOptions} value={edge.pathType} onChange={(v) => updateEdgeData(edge.id, { pathType: v })} />

      <span className="et-sep" />

      {/* §1 v1.7.1 — routage manuel : côté de sortie/d'entrée du lien sur les
          nœuds (le logiciel n'impose plus le côté), dessin du tracé à la main,
          retour au tracé automatique. */}
      <select
        className="et-select"
        value={edge.sourceAnchor ?? ''}
        title={t('edge.anchorSourceTitle')}
        aria-label={t('edge.anchorSourceTitle')}
        onChange={(event) =>
          setEdgeAnchor(edge.id, 'source', (event.target.value || null) as EdgeAnchor | null)
        }
      >
        {ANCHOR_CHOICES.map((choice) => (
          <option key={`s${choice.value}`} value={choice.value}>
            {t('edge.anchorSource')} · {t(choice.labelKey)}
          </option>
        ))}
      </select>
      <select
        className="et-select"
        value={edge.targetAnchor ?? ''}
        title={t('edge.anchorTargetTitle')}
        aria-label={t('edge.anchorTargetTitle')}
        onChange={(event) =>
          setEdgeAnchor(edge.id, 'target', (event.target.value || null) as EdgeAnchor | null)
        }
      >
        {ANCHOR_CHOICES.map((choice) => (
          <option key={`t${choice.value}`} value={choice.value}>
            {t('edge.anchorTarget')} · {t(choice.labelKey)}
          </option>
        ))}
      </select>
      <button
        className="et-btn"
        onClick={onDrawRoute}
        title={t('edge.drawRoute')}
        aria-label={t('edge.drawRoute')}
      >
        <PenLine size={15} />
      </button>
      {((edge.waypoints?.length ?? 0) > 0 || edge.sourceAnchor || edge.targetAnchor) && (
        <button
          className="et-btn"
          onClick={() => resetEdgeRouting(edge.id)}
          title={t('edge.resetRouting')}
          aria-label={t('edge.resetRouting')}
        >
          <Route size={15} />
        </button>
      )}

      <span className="et-sep" />

      {/* Couleur : pastille + sélecteur complet */}
      <div className="et-color" ref={colorRef}>
        <button
          className="et-color__swatch"
          style={{ background: hex }}
          onClick={() => setColorOpen((open) => !open)}
          title={t('colorPicker.custom')}
          aria-label={t('colorPicker.custom')}
        />
        {colorOpen && (
          <div className="et-color__pop">
            <ColorField value={edge.color} onChange={(color) => updateEdgeData(edge.id, { color })} />
          </div>
        )}
      </div>

      <span className="et-sep" />

      {/* Badge de statut du lien (§3 v1.5). */}
      <StatusPicker
        value={edge.status}
        compact
        onChange={(status) => setEdgesStatus([edge.id], status)}
      />

      <span className="et-sep" />

      <button
        className="et-btn"
        onClick={() => reverseEdge(handle, edge.id, author)}
        title={t('edge.reverse')}
        aria-label={t('edge.reverse')}
      >
        <Repeat size={15} />
      </button>
      <button
        className="et-btn et-btn--danger"
        onClick={() => {
          deleteEdges([edge.id])
          onClose()
        }}
        title={t('edge.delete')}
        aria-label={t('edge.delete')}
      >
        <Trash2 size={15} />
      </button>
      <button className="et-btn" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
        <X size={15} />
      </button>
    </div>
  )
}
