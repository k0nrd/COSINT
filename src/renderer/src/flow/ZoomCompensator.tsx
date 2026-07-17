/**
 * Compensation inverse-zoom (§2 v1.6).
 *
 * Les poignées de connexion, les poignées de redimensionnement, les zones de clic
 * et les badges de statut vivent DANS la couche transformée de React Flow : leur
 * taille écran est donc multipliée par le facteur de zoom. Au dézoom elles
 * deviennent minuscules et impossibles à viser. Ce composant lit le zoom courant
 * dans le store React Flow et publie une variable CSS `--fl-inv-zoom` (l'inverse du
 * zoom, borné) sur le conteneur du canvas. Cette variable est HÉRITÉE par les nœuds
 * et l'overlay des libellés de liens, où le CSS l'applique via la propriété CSS
 * indépendante `scale:` (qui se compose avec le `transform: translate(...)` que
 * React Flow utilise déjà pour positionner les poignées — donc sans casser leur
 * placement).
 */
import { useEffect, type RefObject } from 'react'
import { useStore } from '@xyflow/react'

/** Bornes de la compensation : au dézoom on agrandit jusqu'à ×6, au zoom on réduit
 *  jusqu'à ×0,5 — les usages CSS resserrent encore selon l'élément (poignées,
 *  badges) pour rester « dans des limites raisonnables » (§2). */
const MIN_SCALE = 0.5
const MAX_SCALE = 6

interface ZoomCompensatorProps {
  /** Élément sur lequel poser la variable CSS (conteneur `.fl-canvas-wrap`). */
  targetRef: RefObject<HTMLElement>
}

export function ZoomCompensator({ targetRef }: ZoomCompensatorProps): null {
  // Abonnement au seul facteur de zoom (transform[2]) : le pan ne re-déclenche rien.
  const zoom = useStore((state) => state.transform[2])
  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    const inv = Math.min(MAX_SCALE, Math.max(MIN_SCALE, 1 / Math.max(zoom, 0.01)))
    el.style.setProperty('--fl-inv-zoom', String(inv))
  }, [zoom, targetRef])
  return null
}
