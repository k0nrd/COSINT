/** Table des composants de connexions passée à <ReactFlow edgeTypes={...}>. */
import type { EdgeTypes } from '@xyflow/react'
import { CosintEdge } from './CosintEdge'

export const edgeTypes = { cosint: CosintEdge } satisfies EdgeTypes
