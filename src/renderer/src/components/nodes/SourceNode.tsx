/**
 * Nœud source (§4) : titre éditable, URL ouvrable dans le navigateur externe,
 * badge fiabilité/crédibilité (échelle Amirauté) et type de source.
 * Notation et champs complets s'éditent dans le panneau Détails.
 */
import { memo } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { normalizeExternalUrl } from '@shared/url'
import { t } from '@/i18n'
import { CREDIBILITY_SCALE, RELIABILITY_SCALE, SOURCE_TYPES } from '@/lib/entities'
import { colorHex, withAlpha } from '@/lib/colors'
import { useBoardContext } from '@/flow/BoardContext'
import type { CosintNodeProps } from '@/flow/flowTypes'
import { NodeShell } from './NodeShell'
import { InlineTitle } from './EntityNode'
import './entity.css'

export const SourceNode = memo(function SourceNode({ id, data, selected }: CosintNodeProps): JSX.Element {
  const board = data.board
  const { openExternal } = useBoardContext()
  const hex = colorHex(board.color)
  const url = board.content.trim()

  // Notation Amirauté : on ne traduit que les codes connus des échelles.
  const reliability = RELIABILITY_SCALE.find((entry) => entry.code === board.reliability)
  const credibility = CREDIBILITY_SCALE.find((entry) => entry.code === board.credibility)
  const rating = `${reliability?.code ?? '–'}${credibility?.code ?? '–'}`
  const ratingTitle = [
    reliability ? t(reliability.labelKey) : null,
    credibility ? t(credibility.labelKey) : null
  ]
    .filter(Boolean)
    .join('\n')

  const sourceType = SOURCE_TYPES.find((type) => type === board.sourceType)

  return (
    <NodeShell id={id} board={board} selected={selected} className="nd-source">
      <div className="nd-source-head">
        <span className="nd-source-ico" style={{ background: withAlpha(hex, 0.14), color: hex }}>
          <FileText size={13} />
        </span>
        <InlineTitle nodeId={id} value={board.title} fallback={t('nodeType.source')} />
        {(reliability || credibility) && (
          <span className="nd-source-badge cm-mono" title={ratingTitle}>
            {rating}
          </span>
        )}
      </div>
      {url !== '' ? (
        <button
          type="button"
          className="nodrag nd-source-url"
          disabled={normalizeExternalUrl(url) === null}
          title={url}
          onClick={() => openExternal(url)}
        >
          <ExternalLink size={11} />
          <span className="nd-source-url-text cm-mono">{url}</span>
        </button>
      ) : (
        <div className="nd-source-url-empty">{t('node.linkUrlPlaceholder')}</div>
      )}
      {sourceType && <div className="nd-source-type">{t(`sourceType.${sourceType}`)}</div>}
    </NodeShell>
  )
})
