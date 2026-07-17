/**
 * Génération du « Rapport des sources » en Markdown (§4).
 * Liste structurée : pour chaque source, sa fiabilité/crédibilité, sa date, son
 * URL et les éléments du tableau qui lui sont rattachés (liens « source de »).
 */
import type { BoardEdgeData, BoardMeta, BoardNodeData } from '@/types'
import { resolveSourceAttachments } from '@/lib/entities'
import { hasStatusBadge, statusDef } from '@/lib/status'
import { t, formatDateTime, type MessageKey } from '@/i18n'

function nodeLabel(node: BoardNodeData): string {
  if (node.title.trim() !== '') return node.title
  if (node.kind === 'entity' && node.entityType) {
    return t(`entityType.${node.entityType}` as MessageKey)
  }
  if (node.kind === 'text' || node.kind === 'timestamped') {
    const firstLine = node.content.split('\n')[0].trim()
    if (firstLine) return firstLine.slice(0, 80)
  }
  return `(${node.id.slice(0, 8)})`
}

/** Suffixe « (Statut : …) » d'un élément, ou '' si aucun badge (§3 v1.5). */
function statusSuffix(node: BoardNodeData): string {
  if (!hasStatusBadge(node.status)) return ''
  return ` — ${t('status.badge.label')} : ${t(statusDef(node.status).labelKey)}`
}

function fieldValue(node: BoardNodeData, labelKey: Parameters<typeof t>[0]): string {
  const label = t(labelKey)
  return node.fields.find((field) => field.label === label)?.value ?? ''
}

/** Construit le rapport Markdown des sources d'un tableau. */
export function buildSourceReport(
  nodes: BoardNodeData[],
  edges: BoardEdgeData[],
  meta: BoardMeta,
  generatedAt: number = Date.now()
): string {
  const sources = nodes.filter((node) => node.kind === 'source')
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const lines: string[] = []
  lines.push(`# ${t('report.title')}`)
  lines.push('')
  lines.push(`**${t('report.board')} :** ${meta.title || t('board.untitled')}`)
  lines.push(`**${t('report.generatedAt')} :** ${formatDateTime(generatedAt)}`)
  lines.push('')

  // Rattachements robustes à l'orientation + dédoublonnés (partagé avec le panneau).
  const attachments = resolveSourceAttachments(nodes, edges)

  // Tri : fiabilité (A→F) puis date.
  const sorted = [...sources].sort((a, b) => {
    const ra = a.reliability || 'Z'
    const rb = b.reliability || 'Z'
    if (ra !== rb) return ra < rb ? -1 : 1
    return a.createdAt - b.createdAt
  })

  for (const source of sorted) {
    lines.push(`## ${nodeLabel(source)}`)
    lines.push('')
    const type = source.sourceType ? t(`sourceType.${source.sourceType}` as Parameters<typeof t>[0]) : ''
    if (type) lines.push(`- **${t('source.type')} :** ${type}`)
    // Badge de statut de la source (§3 v1.5).
    if (hasStatusBadge(source.status)) {
      lines.push(`- **${t('status.badge.label')} :** ${t(statusDef(source.status).labelKey)}`)
    }
    lines.push(
      `- **${t('report.reliability')} :** ${source.reliability || t('report.unset')}` +
        (source.credibility ? ` / ${t('report.credibility')} ${source.credibility}` : '')
    )
    const consulted = fieldValue(source, 'field.consultedAt')
    if (consulted) lines.push(`- **${t('report.date')} :** ${consulted}`)
    if (source.content.trim() !== '') lines.push(`- **${t('report.url')} :** ${source.content}`)

    // Éléments rattachés à cette source (quelle que soit l'orientation du lien).
    const attached = (attachments.get(source.id) ?? [])
      .map((nodeId) => byId.get(nodeId))
      .filter((node): node is BoardNodeData => node !== undefined)

    lines.push('')
    lines.push(`**${t('report.attachedItems')} :**`)
    if (attached.length === 0) {
      lines.push(`- _${t('report.noAttached')}_`)
    } else {
      for (const node of attached) lines.push(`- ${nodeLabel(node)}${statusSuffix(node)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
