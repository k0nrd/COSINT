/**
 * Nœud note horodatée : comme la note texte, avec un en-tête permanent qui
 * rappelle la date de consignation (traçabilité §3).
 */
import { memo } from 'react'
import { Clock } from 'lucide-react'
import { formatDateTime, t } from '@/i18n'
import { colorHex, withAlpha } from '@/lib/colors'
import type { CosintNodeProps } from '@/flow/flowTypes'
import { NodeShell } from './NodeShell'
import { MarkdownBody } from './TextNode'

export const TimestampedNode = memo(function TimestampedNode({
  id,
  data,
  selected
}: CosintNodeProps): JSX.Element {
  const board = data.board

  return (
    <NodeShell id={id} board={board} selected={selected}>
      <div
        className="nd-ts-header"
        style={{ background: withAlpha(colorHex(board.color), 0.15) }}
      >
        <Clock size={13} />
        <span>{t('node.timestampedAt', { date: formatDateTime(board.createdAt) })}</span>
      </div>
      <MarkdownBody nodeId={id} content={board.content} />
    </NodeShell>
  )
})
