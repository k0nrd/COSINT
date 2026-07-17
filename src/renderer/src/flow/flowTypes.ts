/**
 * Types React Flow spécialisés pour COSINT : chaque nœud/connexion React Flow
 * transporte sa donnée métier (`board`) dans `data`.
 */
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import type { BoardEdgeData, BoardNodeData, NodeKind } from '@/types'

export type CosintNodeData = { board: BoardNodeData; [key: string]: unknown }
export type CosintFlowNode = Node<CosintNodeData, NodeKind>
export type CosintNodeProps = NodeProps<CosintFlowNode>

export type CosintEdgeData = { board: BoardEdgeData; [key: string]: unknown }
export type CosintFlowEdge = Edge<CosintEdgeData, 'cosint'>
export type CosintEdgeProps = EdgeProps<CosintFlowEdge>
