/**
 * Mini-carte du tableau (§5 v1.5).
 *
 * La MiniMap native de React Flow ne dessine que les nœuds (pas les liens) et
 * paraissait « vide ». Ici, une mini-carte SVG maison affiche les nœuds/entités
 * ET les liens à leurs couleurs, le cadre de la vue courante, et permet de
 * cliquer/glisser pour se déplacer sur le tableau.
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import type { BoardEdgeData, BoardNodeData } from '@/types'
import { colorHex, withAlpha } from '@/lib/colors'
import './minimap.css'

interface BoardMiniMapProps {
  nodes: BoardNodeData[]
  edges: BoardEdgeData[]
}

/** Bornes (x/y min-max) d'un rectangle en coordonnées du tableau. */
interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function BoardMiniMap({ nodes, edges }: BoardMiniMapProps): JSX.Element | null {
  const { setCenter, getZoom } = useReactFlow()
  const viewport = useViewport()
  // Dimensions du conteneur React Flow (store interne) — pour tracer le cadre de vue.
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  // Pendant un glisser de navigation, on FIGE le cadrage (viewBox) : sinon chaque
  // déplacement du cadre de vue étend les bornes → le viewBox change → la
  // correspondance curseur→tableau dérive et le glisser « chasse » (bug de revue).
  const [frozenBounds, setFrozenBounds] = useState<Bounds | null>(null)

  // Rectangle actuellement visible, en coordonnées du tableau.
  const view = useMemo<Bounds>(() => {
    const zoom = viewport.zoom || 1
    const x0 = -viewport.x / zoom
    const y0 = -viewport.y / zoom
    return { minX: x0, minY: y0, maxX: x0 + width / zoom, maxY: y0 + height / zoom }
  }, [viewport, width, height])

  // Bornes de la mini-carte = contenu (nœuds) + cadre de vue, avec une marge.
  const bounds = useMemo<Bounds | null>(() => {
    let b: Bounds | null = null
    for (const node of nodes) {
      const nb = { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height }
      b = b ? merge(b, nb) : nb
    }
    // Inclut toujours le cadre de vue pour situer l'utilisateur, même hors contenu.
    b = b ? merge(b, view) : view
    const padX = (b.maxX - b.minX) * 0.08 + 40
    const padY = (b.maxY - b.minY) * 0.08 + 40
    return { minX: b.minX - padX, minY: b.minY - padY, maxX: b.maxX + padX, maxY: b.maxY + padY }
  }, [nodes, view])

  // Centre de chaque nœud (pour tracer les liens).
  const centers = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const node of nodes) map.set(node.id, { x: node.x + node.width / 2, y: node.y + node.height / 2 })
    return map
  }, [nodes])

  if (!bounds || nodes.length === 0) return null

  // Cadrage effectif : figé pendant un glisser, sinon suit le contenu + la vue.
  const frame = frozenBounds ?? bounds
  const vbW = frame.maxX - frame.minX
  const vbH = frame.maxY - frame.minY

  /** Convertit un événement pointeur (écran) en coordonnées du tableau via la CTM SVG. */
  const toFlow = (event: ReactPointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const local = point.matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }

  const navigate = (event: ReactPointerEvent): void => {
    const flow = toFlow(event)
    if (flow) setCenter(flow.x, flow.y, { zoom: getZoom(), duration: 0 })
  }

  return (
    <div className="bd-minimap" aria-label="Mini-carte">
      <svg
        ref={svgRef}
        className="bd-minimap__svg"
        viewBox={`${frame.minX} ${frame.minY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(event) => {
          event.preventDefault()
          dragging.current = true
          setFrozenBounds(bounds) // fige le cadrage pour toute la durée du glisser
          ;(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId)
          navigate(event)
        }}
        onPointerMove={(event) => {
          if (dragging.current) navigate(event)
        }}
        onPointerUp={(event) => {
          dragging.current = false
          setFrozenBounds(null)
          const target = event.currentTarget as SVGSVGElement
          if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
        }}
      >
        {/* Liens (sous les nœuds), à leur couleur. */}
        <g className="bd-minimap__edges">
          {edges.map((edge) => {
            const a = centers.get(edge.source)
            const b = centers.get(edge.target)
            if (!a || !b) return null
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={colorHex(edge.color)}
                strokeWidth={1}
                strokeOpacity={0.7}
              />
            )
          })}
        </g>
        {/* Nœuds, à leur couleur (zones translucides). */}
        <g className="bd-minimap__nodes">
          {nodes.map((node) => {
            const hex = colorHex(node.color)
            const isZone = node.kind === 'group'
            return (
              <rect
                key={node.id}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={Math.min(node.width, node.height) * 0.12}
                fill={isZone ? withAlpha(hex, 0.18) : hex}
                stroke={isZone ? withAlpha(hex, 0.55) : 'none'}
                strokeWidth={isZone ? Math.max(vbW, vbH) * 0.004 : 0}
                fillOpacity={isZone ? 1 : 0.9}
              />
            )
          })}
        </g>
        {/* Cadre de la vue courante. */}
        <rect
          className="bd-minimap__view"
          x={view.minX}
          y={view.minY}
          width={view.maxX - view.minX}
          height={view.maxY - view.minY}
          strokeWidth={1.5}
        />
      </svg>
    </div>
  )
}

/** Union de deux rectangles. */
function merge(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  }
}
