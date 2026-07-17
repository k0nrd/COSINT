/**
 * Table des composants de nœuds passée à <ReactFlow nodeTypes={...}>.
 * Record<NodeKind, …> garantit qu'aucun type de nœud n'est oublié.
 */
import type { NodeTypes } from '@xyflow/react'
import type { NodeKind } from '@/types'
import { TextNode } from './TextNode'
import { LinkNode } from './LinkNode'
import { ImageNode } from './ImageNode'
import { TimestampedNode } from './TimestampedNode'
import { GroupNode } from './GroupNode'
import { EntityNode } from './EntityNode'
import { SourceNode } from './SourceNode'
import { CodeNode } from './CodeNode'

export const nodeTypes: Record<NodeKind, NodeTypes[string]> = {
  text: TextNode,
  link: LinkNode,
  image: ImageNode,
  timestamped: TimestampedNode,
  group: GroupNode,
  entity: EntityNode,
  source: SourceNode,
  code: CodeNode
}
