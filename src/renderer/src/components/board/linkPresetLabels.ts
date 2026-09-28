/**
 * §7 v1.9 — libellés traduits des réglages d'un préréglage de lien (résumé affiché
 * sous le nom, dans les listes et les menus). Séparé de lib/linkPresets (pur, sans
 * i18n) : ici on traduit.
 */
import type { EdgeDirection, EdgePathType, EdgeStyle, EdgeWidth } from '@/types'
import { t, type MessageKey } from '@/i18n'
import { statusDef } from '@/lib/status'
import {
  LINK_PRESET_PROPS,
  presetDisplayText,
  type LinkPresetProp,
  type LinkPresetProps,
  type PresetAnchor
} from '@/lib/linkPresets'

export const PROP_LABEL: Record<LinkPresetProp, MessageKey> = {
  relationType: 'linkPreset.prop.relationType',
  label: 'linkPreset.prop.label',
  color: 'linkPreset.prop.color',
  width: 'linkPreset.prop.width',
  style: 'linkPreset.prop.style',
  direction: 'linkPreset.prop.direction',
  pathType: 'linkPreset.prop.pathType',
  status: 'linkPreset.prop.status',
  sourceAnchor: 'linkPreset.prop.sourceAnchor',
  targetAnchor: 'linkPreset.prop.targetAnchor'
}

export const STYLE_LABEL: Record<EdgeStyle, MessageKey> = {
  solid: 'details.styleSolid',
  dashed: 'linkPreset.styleDashed',
  dotted: 'style.dotted'
}

export const WIDTH_LABEL: Record<EdgeWidth, MessageKey> = {
  thin: 'width.thin',
  normal: 'width.normal',
  thick: 'width.thick'
}

export const DIRECTION_LABEL: Record<EdgeDirection, MessageKey> = {
  none: 'direction.none',
  single: 'direction.single',
  double: 'direction.double'
}

export const PATH_LABEL: Record<EdgePathType, MessageKey> = {
  bezier: 'path.bezier',
  straight: 'path.straight',
  step: 'path.step'
}

export const ANCHOR_LABEL: Record<PresetAnchor, MessageKey> = {
  auto: 'edge.anchorAuto',
  t: 'edge.anchorTop',
  b: 'edge.anchorBottom',
  l: 'edge.anchorLeft',
  r: 'edge.anchorRight'
}

/** Texte de relation affiché (prédéfinie traduite, libre telle quelle, vide = « Sans type »). */
export function relationText(relationType: string): string {
  const shown = presetDisplayText({ relationType })
  if (!shown) return t('relation.none')
  return 'key' in shown ? t(shown.key) : shown.text
}

/** Valeur lisible d'UN réglage défini (null si non défini). */
export function propValueText(props: LinkPresetProps, key: LinkPresetProp): string | null {
  switch (key) {
    case 'relationType':
      return props.relationType === undefined ? null : relationText(props.relationType)
    case 'label':
      return props.label === undefined ? null : props.label === '' ? '∅' : `« ${props.label} »`
    case 'color':
      return props.color ?? null
    case 'width':
      return props.width ? t(WIDTH_LABEL[props.width]) : null
    case 'style':
      return props.style ? t(STYLE_LABEL[props.style]) : null
    case 'direction':
      return props.direction ? t(DIRECTION_LABEL[props.direction]) : null
    case 'pathType':
      return props.pathType ? t(PATH_LABEL[props.pathType]) : null
    case 'status':
      return props.status ? t(statusDef(props.status).labelKey) : null
    case 'sourceAnchor':
      return props.sourceAnchor
        ? `${t('edge.anchorSource')} · ${t(ANCHOR_LABEL[props.sourceAnchor])}`
        : null
    case 'targetAnchor':
      return props.targetAnchor
        ? `${t('edge.anchorTarget')} · ${t(ANCHOR_LABEL[props.targetAnchor])}`
        : null
    default:
      return null
  }
}

/**
 * Résumé compact d'un préréglage (réglages DÉFINIS seulement, couleur exclue — l'aperçu
 * la montre), ex. « travaille pour · Épais · Tirets · Double ↔ ».
 */
export function presetSummary(props: LinkPresetProps): string {
  return LINK_PRESET_PROPS.filter((key) => key !== 'color')
    .map((key) => propValueText(props, key))
    .filter((text): text is string => text !== null && text !== '')
    .join(' · ')
}
