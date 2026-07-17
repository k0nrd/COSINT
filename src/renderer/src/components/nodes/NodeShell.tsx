/**
 * Cadre commun des nœuds texte / lien / image / horodaté : barre d'accent à la
 * couleur du nœud, redimensionnement, poignées de connexion et chips de tags.
 * Occupe 100 % du wrapper React Flow — BoardView pose width/height sur le nœud.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Handle, NodeResizer, Position } from '@xyflow/react'
import type { BoardNodeData } from '@/types'
import { colorHex } from '@/lib/colors'
import { AUTO_HEIGHT_KINDS, entityShellVisual } from '@/lib/nodeStyle'
import { useBoardContext } from '@/flow/BoardContext'
import { StatusBadge } from '@/components/board/StatusBadge'
import './nodes.css'

interface NodeShellProps {
  id: string
  board: BoardNodeData
  selected: boolean
  /** Classe additionnelle posée sur le corps (ex. nd-link, nd-image-body). */
  className?: string
  children: ReactNode
}

export function NodeShell({ id, board, selected, className, children }: NodeShellProps): JSX.Element {
  const { updateNodeData, canEdit } = useBoardContext()
  // Personnalisation visuelle (§4) — appliquée uniquement aux entités/sources
  // (les autres nœuds n'ont pas de `style`, on garde le rendu par défaut).
  const visual = entityShellVisual(board.style)
  // Hauteur pilotée par le CONTENU (§6bis v1.4, généralisé §4 v1.6) : entités,
  // sources, notes texte et notes horodatées grandissent pour afficher tout leur
  // contenu (aucun texte masqué) — la hauteur stockée sert de minimum ; on peut
  // toujours élargir/agrandir à la main (le redimensionnement fixe le minimum).
  const autoHeight = AUTO_HEIGHT_KINDS.has(board.kind)
  const shellStyle: CSSProperties = autoHeight
    ? { ...visual.vars, height: 'auto', minHeight: board.height }
    : (visual.vars as CSSProperties)

  return (
    <div
      className={`nd-shell${selected ? ' nd-shell--selected' : ''}`}
      data-textsize={visual.textSize}
      style={shellStyle}
    >
      {/* Pendant le resize, React Flow gère l'affichage ; on ne committe qu'à la fin.
          x/y inclus : redimensionner par la gauche/le haut déplace aussi le nœud. */}
      <NodeResizer
        isVisible={selected && canEdit}
        minWidth={120}
        minHeight={60}
        onResizeEnd={(_event, params) =>
          updateNodeData(id, {
            x: params.x,
            y: params.y,
            width: params.width,
            height: params.height
          })
        }
      />
      {/* Le contenu est clippé aux coins arrondis par ce wrapper interne — le
          cadre (.nd-shell) NE clippe PAS, sinon les poignées débordantes seraient
          rognées et la connexion deviendrait quasi impossible (§1). */}
      <div className="nd-clip">
        <div className="nd-accent" style={{ background: colorHex(board.color) }} />
        <div className={className ? `nd-body ${className}` : 'nd-body'}>{children}</div>
        {board.tags.length > 0 && (
          <div className="nd-tags">
            {board.tags.map((tag) => (
              <span key={tag} className="nd-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {/* Badge de statut (§3 v1.5) : pastille en coin HAUT-GAUCHE (§5c v1.7 : déplacée
          du coin haut-droit pour libérer la poignée de resize, cf. status.css). §2 v1.6 :
          taille de base 18 px ; la compensation zoom est en CSS. */}
      <StatusBadge status={board.status} size={18} className="bd-status-badge--corner" />
      {/* Poignées de connexion (§1) : larges cibles, discrètes au repos, révélées
          au survol/sélection. 4 côtés, en mode Loose chacune sert de départ OU
          d'arrivée — on peut tirer un lien depuis n'importe quel côté. */}
      <Handle type="source" position={Position.Left} id="l" className="nd-handle nd-handle--left" />
      <Handle type="source" position={Position.Top} id="t" className="nd-handle nd-handle--top" />
      <Handle type="source" position={Position.Right} id="r" className="nd-handle nd-handle--right" />
      <Handle type="source" position={Position.Bottom} id="b" className="nd-handle nd-handle--bottom" />
    </div>
  )
}
