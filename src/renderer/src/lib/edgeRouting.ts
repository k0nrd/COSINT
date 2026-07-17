/**
 * Construction du tracé d'un lien (§1 v1.6).
 *
 * Sans point de passage, on délègue aux fonctions de React Flow (comportement
 * v1.2 inchangé : courbe / droite / coudé). Avec des points de passage, on
 * construit nous-mêmes le chemin SVG qui traverse la source, puis chaque waypoint
 * dans l'ordre, jusqu'à la cible :
 *  - `straight` : polyligne (segments droits) ;
 *  - `step`     : segments orthogonaux (angles droits) ;
 *  - `bezier`   : courbe lisse passant PAR chaque point (Catmull-Rom → Bézier
 *                 cubique) — la « torsion » de la courbe se règle en déplaçant les
 *                 points de passage (poignées sur la courbe).
 *
 * Les points de passage sont en coordonnées absolues du tableau ; `sourceX/…` et
 * `targetX/…` sont déjà résolus par React Flow dans le même repère, donc tout se
 * compose directement.
 */
import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position
} from '@xyflow/react'
import type { EdgePathType, EdgeWaypoint } from '@/types'

export interface EdgeRoutingInput {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  pathType: EdgePathType
  waypoints?: EdgeWaypoint[]
}

export interface EdgeRoutingResult {
  path: string
  labelX: number
  labelY: number
}

/** Point médian d'une polyligne (par longueur cumulée) — sert à placer le libellé. */
function polylineMidpoint(points: EdgeWaypoint[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { x: points[0].x, y: points[0].y }
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  }
  let half = total / 2
  for (let i = 0; i < points.length - 1; i++) {
    const seg = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    if (seg >= half) {
      const ratio = seg === 0 ? 0 : half / seg
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio
      }
    }
    half -= seg
  }
  const last = points[points.length - 1]
  return { x: last.x, y: last.y }
}

/** Polyligne à segments droits. */
function straightThrough(points: EdgeWaypoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ')
}

/** Chemin orthogonal (angles droits) : coude horizontal puis vertical par segment. */
function stepThrough(points: EdgeWaypoint[]): string {
  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const p = points[i]
    // Coude à (p.x, prev.y) : d'abord horizontal, puis vertical, jusqu'à p.
    d += ` L ${p.x},${prev.y} L ${p.x},${p.y}`
  }
  return d
}

/** Courbe lisse (Catmull-Rom → Bézier) passant par tous les points. */
function bezierThrough(points: EdgeWaypoint[]): string {
  if (points.length === 2) {
    // Deux points seulement : Bézier « plat » = segment droit lissé.
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`
  }
  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

/**
 * Calcule le chemin SVG d'un lien et la position de son libellé. `[path, labelX,
 * labelY]` conserve le contrat des fonctions React Flow.
 */
export function buildEdgePath(input: EdgeRoutingInput): EdgeRoutingResult {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, pathType } = input
  const waypoints = input.waypoints ?? []

  // Aucun point de passage → comportement natif React Flow (inchangé depuis v1.2).
  if (waypoints.length === 0) {
    const geo = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
    const [path, labelX, labelY] =
      pathType === 'straight'
        ? getStraightPath({ sourceX, sourceY, targetX, targetY })
        : pathType === 'step'
          ? getSmoothStepPath(geo)
          : getBezierPath(geo)
    return { path, labelX, labelY }
  }

  const points: EdgeWaypoint[] = [
    { x: sourceX, y: sourceY },
    ...waypoints,
    { x: targetX, y: targetY }
  ]
  const path =
    pathType === 'straight'
      ? straightThrough(points)
      : pathType === 'step'
        ? stepThrough(points)
        : bezierThrough(points)
  const mid = polylineMidpoint(points)
  return { path, labelX: mid.x, labelY: mid.y }
}
