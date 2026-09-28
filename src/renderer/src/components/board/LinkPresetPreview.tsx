/**
 * §7 v1.9 — aperçu d'un préréglage de lien : le lien tel qu'il apparaîtrait sur un
 * lien NEUF une fois le préréglage appliqué (réglages non définis = valeurs par défaut
 * de `createEdge`). Miroir visuel de CosintEdge : couleur, épaisseur, style de trait
 * (tirets « 8 5 », pointillés « 1.5 5 » à bouts ronds), flèches selon la direction,
 * type de tracé, libellé (texte libre > relation) et badge de statut.
 *  - `sm` : vignette de liste (trait + flèches + tracé) ;
 *  - `lg` : aperçu complet entre deux nœuds, avec côtés d'ancrage, libellé et statut.
 */
import { useId, type SVGProps } from 'react'
import type { EdgeAnchor } from '@/types'
import { colorHex } from '@/lib/colors'
import {
  edgeDashArray,
  edgeWidthPx,
  presetDisplayText,
  previewPath,
  sanitizeValues,
  type LinkPresetProps,
  type PresetAnchor
} from '@/lib/linkPresets'
import { StatusBadge } from '@/components/board/StatusBadge'
import { t } from '@/i18n'

interface LinkPresetPreviewProps {
  props: LinkPresetProps
  size?: 'sm' | 'lg'
}

interface Pt {
  x: number
  y: number
}

/** Boîtes des deux nœuds de l'aperçu `lg` (coordonnées du viewBox 260 × 104) : assez
 *  de marge autour pour les sorties par le haut/bas (côtés d'ancrage, tracé coudé). */
const SOURCE_BOX = { x: 12, y: 58, w: 46, h: 26 }
const TARGET_BOX = { x: 202, y: 22, w: 46, h: 26 }

function anchorPoint(box: typeof SOURCE_BOX, side: EdgeAnchor): Pt {
  switch (side) {
    case 't':
      return { x: box.x + box.w / 2, y: box.y }
    case 'b':
      return { x: box.x + box.w / 2, y: box.y + box.h }
    case 'l':
      return { x: box.x, y: box.y + box.h / 2 }
    default:
      return { x: box.x + box.w, y: box.y + box.h / 2 }
  }
}

function normal(side: EdgeAnchor): Pt {
  return side === 't' ? { x: 0, y: -1 } : side === 'b' ? { x: 0, y: 1 } : side === 'l' ? { x: -1, y: 0 } : { x: 1, y: 0 }
}

/** Tracé entre deux côtés d'ancrage (courbe / droite / coudé), comme sur le tableau. */
function anchoredPath(
  pathType: 'bezier' | 'straight' | 'step',
  sourceSide: EdgeAnchor,
  targetSide: EdgeAnchor
): string {
  const s = anchorPoint(SOURCE_BOX, sourceSide)
  const e = anchorPoint(TARGET_BOX, targetSide)
  if (pathType === 'straight') return `M ${s.x} ${s.y} L ${e.x} ${e.y}`
  const ns = normal(sourceSide)
  const ne = normal(targetSide)
  if (pathType === 'step') {
    const s1 = { x: s.x + ns.x * 12, y: s.y + ns.y * 12 }
    const e1 = { x: e.x + ne.x * 12, y: e.y + ne.y * 12 }
    const mx = (s1.x + e1.x) / 2
    return `M ${s.x} ${s.y} L ${s1.x} ${s1.y} L ${mx} ${s1.y} L ${mx} ${e1.y} L ${e1.x} ${e1.y} L ${e.x} ${e.y}`
  }
  const k = 60
  return `M ${s.x} ${s.y} C ${s.x + ns.x * k} ${s.y + ns.y * k}, ${e.x + ne.x * k} ${e.y + ne.y * k}, ${e.x} ${e.y}`
}

/** Côté automatique : celui tourné vers l'autre nœud (ici : droite → gauche). */
function resolveSide(anchor: PresetAnchor, fallback: EdgeAnchor): EdgeAnchor {
  return anchor === 'auto' ? fallback : anchor
}

export function LinkPresetPreview({ props, size = 'sm' }: LinkPresetPreviewProps): JSX.Element {
  // `useId` produit des « : » : on les retire pour des références url(#…) sûres.
  const uid = `lpv${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const values = sanitizeValues(props)
  const hex = colorHex(values.color)
  const strokeWidth = edgeWidthPx(values.width)
  const dash = edgeDashArray(values.style)
  const arrowEnd = values.direction !== 'none'
  const arrowStart = values.direction === 'double'
  const arrow = size === 'lg' ? 7 + strokeWidth * 1.6 : 5 + strokeWidth
  const shown = presetDisplayText(values)
  const text = shown ? ('key' in shown ? t(shown.key) : shown.text) : ''

  const markers = (
    <defs>
      <marker
        id={`${uid}-a`}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth={arrow}
        markerHeight={arrow}
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={hex} />
      </marker>
    </defs>
  )
  // Attributs SVG (et non `style`) : les marqueurs de flèche y sont les plus fiables.
  const stroke: SVGProps<SVGPathElement> = {
    stroke: hex,
    strokeWidth,
    strokeDasharray: dash,
    strokeLinecap: values.style === 'dotted' ? 'round' : 'butt',
    fill: 'none',
    markerEnd: arrowEnd ? `url(#${uid}-a)` : undefined,
    markerStart: arrowStart ? `url(#${uid}-a)` : undefined
  }

  if (size === 'sm') {
    return (
      <svg className="lp-preview lp-preview--sm" width="64" height="24" viewBox="0 0 64 24" aria-hidden="true">
        {markers}
        <path d={previewPath(values.pathType, 5, 18, 59, 6)} {...stroke} />
      </svg>
    )
  }

  const sourceSide = resolveSide(values.sourceAnchor, 'r')
  const targetSide = resolveSide(values.targetAnchor, 'l')
  const path = anchoredPath(values.pathType, sourceSide, targetSide)
  return (
    <div className="lp-preview lp-preview--lg" aria-label={t('linkPreset.preview')} role="img">
      <svg width="100%" height="100%" viewBox="0 0 260 104" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {markers}
        <rect className="lp-preview__node" x={SOURCE_BOX.x} y={SOURCE_BOX.y} width={SOURCE_BOX.w} height={SOURCE_BOX.h} rx="3" />
        <rect className="lp-preview__node" x={TARGET_BOX.x} y={TARGET_BOX.y} width={TARGET_BOX.w} height={TARGET_BOX.h} rx="3" />
        <text className="lp-preview__node-text" x={SOURCE_BOX.x + SOURCE_BOX.w / 2} y={SOURCE_BOX.y + SOURCE_BOX.h / 2 + 3.5}>
          A
        </text>
        <text className="lp-preview__node-text" x={TARGET_BOX.x + TARGET_BOX.w / 2} y={TARGET_BOX.y + TARGET_BOX.h / 2 + 3.5}>
          B
        </text>
        <path d={path} {...stroke} />
      </svg>
      {text !== '' && (
        <span className="lp-preview__label" style={{ borderColor: hex }} title={text}>
          {text}
        </span>
      )}
      {values.status !== 'none' && (
        <span className="lp-preview__status">
          <StatusBadge status={values.status} size={16} />
        </span>
      )}
    </div>
  )
}
