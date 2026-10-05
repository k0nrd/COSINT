/**
 * Curseurs des collègues, dessinés dans le repère du canvas via <ViewportPortal>.
 * Doit être rendu À L'INTÉRIEUR de <ReactFlow> (contexte React Flow requis).
 */
import { ViewportPortal, useViewport } from '@xyflow/react'
import type { PresenceState } from '@/types'
import { contrastText } from '@/lib/colors'

interface CursorsOverlayProps {
  others: Array<PresenceState & { clientId: number }>
}

export function CursorsOverlay({ others }: CursorsOverlayProps): JSX.Element {
  const { zoom } = useViewport()
  // Contre-zoom : le curseur garde une taille constante à l'écran.
  const scale = 1 / Math.max(zoom, 0.05)

  return (
    <ViewportPortal>
      {others.map((presence) => {
        const cursor = presence.cursor
        if (!cursor) return null
        return (
          <div
            key={presence.clientId}
            className="bd-cursor"
            style={{ transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${scale})` }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3.5 2.2 L21 10.6 L12.6 12.6 L9 20.4 Z"
                fill={presence.user.color}
                stroke="#fff"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="bd-cursor__label"
              style={{
                background: presence.user.color,
                color: contrastText(presence.user.color)
              }}
            >
              {presence.user.name}
            </span>
          </div>
        )
      })}
    </ViewportPortal>
  )
}
