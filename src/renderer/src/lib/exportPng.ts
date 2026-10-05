/**
 * Export PNG du canvas entier en haute résolution (§7).
 * Technique recommandée par React Flow : re-projeter le viewport sur l'emprise
 * de tous les nœuds, puis rasteriser le conteneur `.react-flow__viewport`.
 */
import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng } from 'html-to-image'
import type { CosintFlowNode } from '@/flow/flowTypes'

/** Bord max de l'image générée (px) — garde-fou mémoire. */
const MAX_EDGE = 8192
/** Facteur de sur-échantillonnage (« haute résolution »). */
const SCALE = 2

export async function renderBoardToPng(
  container: HTMLElement,
  nodes: CosintFlowNode[],
  backgroundColor: string
): Promise<string | null> {
  const viewport = container.querySelector<HTMLElement>('.react-flow__viewport')
  if (!viewport || nodes.length === 0) return null

  const bounds = getNodesBounds(nodes)
  const margin = 48
  bounds.x -= margin
  bounds.y -= margin
  bounds.width += margin * 2
  bounds.height += margin * 2

  const scale = Math.min(SCALE, MAX_EDGE / bounds.width, MAX_EDGE / bounds.height)
  const width = Math.max(1, Math.round(bounds.width * scale))
  const height = Math.max(1, Math.round(bounds.height * scale))
  const transform = getViewportForBounds(bounds, width, height, 0.05, 10, 0)

  // Polices embarquées fournies en data: URI (chargées à la demande) : l'image exportée
  // utilise la même typographie que l'écran, sans requête de police.
  const { FONT_EMBED_CSS } = await import('@/lib/fontEmbed')

  return toPng(viewport, {
    width,
    height,
    backgroundColor,
    fontEmbedCSS: FONT_EMBED_CSS,
    pixelRatio: 1,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`
    }
  })
}
