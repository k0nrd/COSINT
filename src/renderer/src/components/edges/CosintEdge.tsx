/**
 * Connexion custom (§1) : tracé (courbe / droite / coudé), épaisseur, style
 * (plein / tirets / pointillés), couleur et libellé métier (data.board). Les
 * flèches (markerEnd/markerStart) sont fournies par BoardView selon la direction.
 *
 * §1 v1.6 — routage manuel : le tracé peut traverser des points de passage
 * (waypoints) en coordonnées absolues. Quand le lien est sélectionné (et qu'on peut
 * éditer), des poignées apparaissent SUR la courbe : ronds pleins = waypoints
 * déplaçables (glisser) et supprimables (clic droit) ; ronds creux au milieu de
 * chaque segment = ajout d'un point (glisser depuis le milieu). Les poignées gardent
 * une taille écran ~constante (compensation --fl-inv-zoom, §2).
 */
import { memo, useCallback, useRef } from 'react'
import { BaseEdge, EdgeLabelRenderer, useReactFlow } from '@xyflow/react'
import { colorHex } from '@/lib/colors'
import { relationLabelKey } from '@/lib/relations'
import { hasStatusBadge } from '@/lib/status'
import { buildEdgePath } from '@/lib/edgeRouting'
import { useBoardContext } from '@/flow/BoardContext'
import { t } from '@/i18n'
import type { EdgeWaypoint, EdgeWidth } from '@/types'
import type { CosintEdgeProps } from '@/flow/flowTypes'
import { StatusBadge } from '@/components/board/StatusBadge'
import '../nodes/nodes.css'

/** Épaisseur de base (px) selon le réglage, avant surépaisseur de sélection. */
// Refonte UI : traits affinés (le lien normal ne domine plus les fiches).
const WIDTH_PX: Record<EdgeWidth, number> = { thin: 1.25, normal: 1.75, thick: 3.5 }

/** §5b v1.7 : décalages du libellé (au-dessus) et du badge (au-dessous) de la ligne,
 *  pour dégager la poignée de tracé centrale. */
const LABEL_OFFSET_Y = 13
const BADGE_OFFSET_Y = 13

export const CosintEdge = memo(function CosintEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  markerEnd,
  markerStart
}: CosintEdgeProps): JSX.Element {
  const board = data?.board
  const reactFlow = useReactFlow()
  const { updateEdgeData, canEdit } = useBoardContext()

  const waypoints = board?.waypoints ?? []
  // Miroir des waypoints courants, lu par les gestionnaires de glissement (qui
  // sont attachés à `window` et survivent aux re-rendus pendant le drag).
  const waypointsRef = useRef<EdgeWaypoint[]>(waypoints)
  waypointsRef.current = waypoints
  const dragIndex = useRef<number | null>(null)

  const { path, labelX, labelY } = buildEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    pathType: board?.pathType ?? 'bezier',
    waypoints
  })

  const hex = colorHex(board?.color ?? 'gray')
  const baseWidth = WIDTH_PX[board?.width ?? 'normal']
  const dash =
    board?.style === 'dashed' ? '8 5' : board?.style === 'dotted' ? '1.5 5' : undefined

  // Libellé : texte libre, sinon le type de relation traduit (§1).
  const freeLabel = board?.label.trim() ?? ''
  const relationType = board?.relationType ?? ''
  const relationKey = relationType !== '' ? relationLabelKey(relationType) : null
  const label = freeLabel !== '' ? freeLabel : relationKey ? t(relationKey) : relationType

  // ——— Glissement d'un point de passage (§1 v1.6) ———
  // On écoute au niveau `window` : les ronds SVG sont recréés à chaque écriture Yjs
  // (comme les nœuds pendant un déplacement), la capture de pointeur sur l'élément
  // ne survivrait donc pas. `dragIndex` + `waypointsRef` pilotent le point courant.
  const beginDrag = useCallback(
    (index: number) => {
      dragIndex.current = index
      const move = (event: PointerEvent): void => {
        if (dragIndex.current === null) return
        const pos = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        const next = waypointsRef.current.map((point, i) =>
          i === dragIndex.current ? { x: pos.x, y: pos.y } : point
        )
        waypointsRef.current = next
        updateEdgeData(id, { waypoints: next })
      }
      const up = (): void => {
        dragIndex.current = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        // §5b v1.7 : `pointercancel` (perte de capture, changement d'onglet…) doit
        // aussi terminer le drag — sinon poignée « collante » et écouteurs fuités.
        window.removeEventListener('pointercancel', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [reactFlow, updateEdgeData, id]
  )

  const onGripDown = (index: number) => (event: React.PointerEvent) => {
    // Seul le clic gauche déplace/insère un point (le clic droit sert à supprimer,
    // la molette/le clic milieu ne doivent rien démarrer).
    if (!canEdit || event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    beginDrag(index)
  }

  const onGripRemove = (index: number) => (event: React.MouseEvent) => {
    if (!canEdit) return
    event.stopPropagation()
    event.preventDefault()
    const next = waypointsRef.current.filter((_, i) => i !== index)
    waypointsRef.current = next
    updateEdgeData(id, { waypoints: next })
  }

  const onAddDown = (segIndex: number, mid: EdgeWaypoint) => (event: React.PointerEvent) => {
    if (!canEdit || event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    const next = [
      ...waypointsRef.current.slice(0, segIndex),
      { x: mid.x, y: mid.y },
      ...waypointsRef.current.slice(segIndex)
    ]
    waypointsRef.current = next
    updateEdgeData(id, { waypoints: next })
    // On enchaîne directement sur le glissement du point tout juste inséré.
    beginDrag(segIndex)
  }

  // Poignées affichées seulement quand le lien est sélectionné et éditable.
  const showGrips = selected && canEdit
  const routePoints: EdgeWaypoint[] = [
    { x: sourceX, y: sourceY },
    ...waypoints,
    { x: targetX, y: targetY }
  ]

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: hex,
          strokeWidth: selected ? baseWidth + 1.25 : baseWidth,
          strokeDasharray: dash,
          strokeLinecap: board?.style === 'dotted' ? 'round' : 'butt'
        }}
      />
      {showGrips && (
        <g className="cosint-wp-layer">
          {/* Ronds creux au milieu de chaque segment : glisser pour insérer un point. */}
          {routePoints.slice(0, -1).map((point, j) => {
            const nextPoint = routePoints[j + 1]
            const mid = { x: (point.x + nextPoint.x) / 2, y: (point.y + nextPoint.y) / 2 }
            return (
              <circle
                key={`add-${j}`}
                className="cosint-wp-add"
                cx={mid.x}
                cy={mid.y}
                r={4}
                onPointerDown={onAddDown(j, mid)}
              >
                <title>{t('edge.addWaypoint')}</title>
              </circle>
            )
          })}
          {/* Ronds pleins : waypoints déplaçables (glisser) / supprimables (clic droit). */}
          {waypoints.map((point, i) => (
            <circle
              key={`wp-${i}`}
              className="cosint-wp"
              cx={point.x}
              cy={point.y}
              r={5.5}
              onPointerDown={onGripDown(i)}
              onContextMenu={onGripRemove(i)}
            >
              <title>{t('edge.waypointHint')}</title>
            </circle>
          ))}
        </g>
      )}
      {/* §5b v1.7 — Découplage label/badge ↔ poignée de tracé : le libellé est
          décalé AU-DESSUS de la ligne et le badge EN DESSOUS, pour ne plus recouvrir
          la poignée d'ajout de point (au milieu du segment). Surtout, quand les
          poignées sont visibles (lien sélectionné et éditable), on neutralise le
          pointeur du libellé/badge (`pointer-events: none`) pour que les clics
          atteignent TOUJOURS les cercles SVG du tracé, même s'ils se chevauchent. */}
      {label !== '' && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan nd-edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - LABEL_OFFSET_Y}px)`,
              // Bordure à la couleur du lien, atténuée : le libellé reste lisible sans « flasher ».
              borderColor: `color-mix(in srgb, ${hex} 55%, transparent)`,
              pointerEvents: showGrips ? 'none' : undefined
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
      {hasStatusBadge(board?.status) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + BADGE_OFFSET_Y}px)`,
              pointerEvents: showGrips ? 'none' : undefined
            }}
          >
            <StatusBadge status={board?.status} size={17} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
