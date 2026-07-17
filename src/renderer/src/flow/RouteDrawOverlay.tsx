/**
 * Mode « Dessiner le tracé » d'un lien (§1 v1.7.1) — couche de dessin rendue
 * dans le repère du canvas via <ViewportPortal> (doit vivre À L'INTÉRIEUR de
 * <ReactFlow>).
 *
 * Déroulé en deux étapes, piloté par BoardView (qui capte les clics du canvas) :
 *  1. `step: 'source'` — quatre pastilles sur les bords du nœud SOURCE : cliquer
 *     l'une d'elles fixe le côté de départ (haut/bas/gauche/droite) ;
 *  2. `step: 'path'`   — chaque clic sur le fond pose un point de passage ; les
 *     pastilles apparaissent sur le nœud CIBLE et cliquer l'une d'elles fixe le
 *     côté d'arrivée ET termine le tracé.
 * L'aperçu (pointillé animé) suit la souris en continu ; les pastilles et points
 * gardent une taille écran ~constante (compensation --fl-inv-zoom, comme les
 * poignées de waypoints v1.6).
 */
import { useEffect, useState } from 'react'
import { ViewportPortal, useInternalNode, useReactFlow } from '@xyflow/react'
import type { EdgeAnchor, EdgeWaypoint } from '@/types'
import { t } from '@/i18n'

interface NodeRect {
  x: number
  y: number
  width: number
  height: number
}

/** Point médian du côté `side` d'un rectangle (position des pastilles d'ancrage). */
export function anchorPoint(rect: NodeRect, side: EdgeAnchor): EdgeWaypoint {
  switch (side) {
    case 't':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'b':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'l':
      return { x: rect.x, y: rect.y + rect.height / 2 }
    default:
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
  }
}

const SIDES: EdgeAnchor[] = ['t', 'b', 'l', 'r']

const SIDE_LABEL_KEY = {
  t: 'edge.anchorTop',
  b: 'edge.anchorBottom',
  l: 'edge.anchorLeft',
  r: 'edge.anchorRight'
} as const

interface RouteDrawOverlayProps {
  sourceId: string
  targetId: string
  step: 'source' | 'path'
  /** Côté de départ déjà choisi (null = pas encore choisi, ou « auto »). */
  sourceAnchor: EdgeAnchor | null
  waypoints: EdgeWaypoint[]
  /** Couleur du lien (hex), reprise pour l'aperçu. */
  color: string
  onPickSource: (anchor: EdgeAnchor) => void
  onPickTarget: (anchor: EdgeAnchor) => void
}

/**
 * Position du pointeur en coordonnées tableau, suivie ICI (et non dans l'état
 * de BoardView) : chaque mouvement de souris ne re-rend que cette petite couche,
 * jamais tout le canvas.
 */
function usePointerFlowPosition(): EdgeWaypoint | null {
  const reactFlow = useReactFlow()
  const [cursor, setCursor] = useState<EdgeWaypoint | null>(null)
  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      setCursor(reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [reactFlow])
  return cursor
}

/** Rectangle absolu d'un nœud, mesures React Flow en priorité (auto-hauteur). */
function useNodeRect(nodeId: string): NodeRect | null {
  const node = useInternalNode(nodeId)
  if (!node) return null
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0
  }
}

/**
 * Les 4 pastilles d'ancrage d'un nœud. Des DIV positionnés (comme les curseurs
 * des collègues) et non des cercles SVG : le hit-testing HTML est garanti quelle
 * que soit la position, et la compensation de zoom se fait dans le transform
 * (le translate vers le point du tableau reste, lui, non compensé).
 */
function AnchorDots({
  rect,
  onPick,
  titlePrefix
}: {
  rect: NodeRect
  onPick: (anchor: EdgeAnchor) => void
  titlePrefix: string
}): JSX.Element {
  return (
    <>
      {SIDES.map((side) => {
        const point = anchorPoint(rect, side)
        const label = `${titlePrefix} · ${t(SIDE_LABEL_KEY[side])}`
        return (
          <div
            key={side}
            className="fl-route-ui fl-route-dot"
            role="button"
            title={label}
            aria-label={label}
            style={{
              transform: `translate(${point.x}px, ${point.y}px) scale(clamp(0.8, var(--fl-inv-zoom, 1), 3)) translate(-50%, -50%)`
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.stopPropagation()
              event.preventDefault()
              onPick(side)
            }}
          />
        )
      })}
    </>
  )
}

export function RouteDrawOverlay({
  sourceId,
  targetId,
  step,
  sourceAnchor,
  waypoints,
  color,
  onPickSource,
  onPickTarget
}: RouteDrawOverlayProps): JSX.Element | null {
  const sourceRect = useNodeRect(sourceId)
  const targetRect = useNodeRect(targetId)
  const cursor = usePointerFlowPosition()
  if (!sourceRect || !targetRect) return null

  // Point de départ de l'aperçu : la pastille choisie, sinon le centre du nœud
  // source (départ « auto » — le rendu final ancrera automatiquement).
  const start: EdgeWaypoint = sourceAnchor
    ? anchorPoint(sourceRect, sourceAnchor)
    : { x: sourceRect.x + sourceRect.width / 2, y: sourceRect.y + sourceRect.height / 2 }
  const previewPoints: EdgeWaypoint[] =
    step === 'path' ? [start, ...waypoints, ...(cursor ? [cursor] : [])] : []
  const previewPath = previewPoints
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x},${point.y}`)
    .join(' ')

  const activeRect = step === 'source' ? sourceRect : targetRect

  return (
    <ViewportPortal>
      {/* Couche PEINTE (aucun événement) : contour du nœud actif, aperçu du
          tracé, points déjà posés. */}
      <svg className="fl-route-svg" width="2" height="2" aria-hidden="true">
        <rect
          className="fl-route-outline"
          x={activeRect.x}
          y={activeRect.y}
          width={activeRect.width}
          height={activeRect.height}
          rx={10}
        />
        {previewPoints.length >= 2 && (
          <path className="fl-route-preview" d={previewPath} style={{ stroke: color }} />
        )}
        {waypoints.map((point, i) => (
          <circle
            key={`p${i}`}
            className="fl-route-point"
            cx={point.x}
            cy={point.y}
            r={4.5}
            style={{ fill: color }}
          />
        ))}
      </svg>
      {/* Couche CLIQUABLE : pastilles d'ancrage du nœud actif. */}
      {step === 'source' && (
        <AnchorDots rect={sourceRect} onPick={onPickSource} titlePrefix={t('edge.anchorSource')} />
      )}
      {step === 'path' && (
        <AnchorDots rect={targetRect} onPick={onPickTarget} titlePrefix={t('edge.anchorTarget')} />
      )}
    </ViewportPortal>
  )
}
