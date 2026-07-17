/**
 * Export CSV des données du tableau (§1b v1.7) — pur, testable.
 *
 * Deux fichiers :
 *  - ENTITÉS : une ligne par entité ; colonnes `type`, `titre`, puis un champ par
 *    libellé présent (les valeurs multiples d'un même libellé sont jointes par `;`).
 *  - LIENS : colonnes `source`, `cible`, `relation`, `label` (source/cible = titre des
 *    nœuds pour une relecture humaine ; ré-importables en « liste de liens »).
 *
 * Réimporter l'export ENTITÉS reconstruit un schéma cohérent : la colonne `type` fixe
 * le type d'entité, `titre` le nom, les autres colonnes deviennent des champs.
 */
import type { BoardEdgeData, BoardNodeData } from '@/types'
import { relationLabelKey } from '@/lib/relations'
import { stringifyCsv, type CsvDelimiter } from '@/lib/csv'
import { statusDef } from '@/lib/status'
import { t } from '@/i18n'

export interface CsvExportOptions {
  delimiter?: CsvDelimiter
  /** BOM UTF-8 pour Excel (activé par défaut). */
  bom?: boolean
}

// ——— Sélection de colonnes (§4 v1.8) ———

/**
 * Colonne exportable : un id stable (pour la sélection), un en-tête et une
 * fonction d'extraction. `fixed` = colonnes structurelles proposées cochées par
 * défaut ; `field` = colonnes issues des libellés de champ présents.
 */
export interface CsvColumn<T> {
  id: string
  header: string
  group: 'fixed' | 'field'
  get: (item: T) => string
}

/** Formate un epoch ms en ISO 8601, ou chaîne vide si absent. */
function iso(ms: number | undefined): string {
  return ms !== undefined ? new Date(ms).toISOString() : ''
}

/**
 * Colonnes disponibles pour l'export des ENTITÉS (§4 v1.8) : structurelles
 * (type, titre, statut, tags, datation d'événement, traçabilité) + une par
 * libellé de champ présent. L'id `type`/`titre` reproduit l'export historique
 * (ré-importable) ; les colonnes de datation sortent en ISO.
 */
export function entityColumns(nodes: BoardNodeData[]): Array<CsvColumn<BoardNodeData>> {
  const columns: Array<CsvColumn<BoardNodeData>> = [
    { id: 'type', header: 'type', group: 'fixed', get: (n) => n.entityType ?? 'generic_other' },
    { id: 'titre', header: 'titre', group: 'fixed', get: (n) => n.title },
    { id: 'statut', header: 'statut', group: 'fixed', get: (n) => (n.status && n.status !== 'none' ? t(statusDef(n.status).labelKey) : '') },
    { id: 'tags', header: 'tags', group: 'fixed', get: (n) => n.tags.join(';') },
    { id: 'event_exact', header: 'evenement_date_exacte', group: 'fixed', get: (n) => iso(n.eventDate) },
    { id: 'event_earliest', header: 'evenement_au_plus_tot', group: 'fixed', get: (n) => iso(n.eventEarliest) },
    { id: 'event_latest', header: 'evenement_au_plus_tard', group: 'fixed', get: (n) => iso(n.eventLatest) },
    { id: 'created_at', header: 'cree_le', group: 'fixed', get: (n) => iso(n.createdAt || undefined) },
    { id: 'created_by', header: 'cree_par', group: 'fixed', get: (n) => n.createdBy }
  ]
  // Colonnes de champ, dans l'ordre de première apparition (comme l'export v1.7).
  const seen = new Set<string>()
  const entities = nodes.filter((node) => node.kind === 'entity')
  for (const node of entities) {
    for (const field of node.fields) {
      if (seen.has(field.label)) continue
      seen.add(field.label)
      const label = field.label
      columns.push({
        id: `field:${label}`,
        header: label,
        group: 'field',
        get: (n) => {
          const values = n.fields.filter((f) => f.label === label && f.value.trim() !== '').map((f) => f.value)
          return values.join(';')
        }
      })
    }
  }
  return columns
}

/** Colonnes disponibles pour l'export des LIENS (§4 v1.8). */
export function edgeColumns(nodes: BoardNodeData[]): Array<CsvColumn<BoardEdgeData>> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return [
    { id: 'source', header: 'source', group: 'fixed', get: (e) => nodeLabel(byId.get(e.source), e.source) },
    { id: 'cible', header: 'cible', group: 'fixed', get: (e) => nodeLabel(byId.get(e.target), e.target) },
    {
      id: 'relation',
      header: 'relation',
      group: 'fixed',
      get: (e) => {
        const relKey = e.relationType !== '' ? relationLabelKey(e.relationType) : null
        return relKey ? t(relKey) : e.relationType
      }
    },
    { id: 'label', header: 'label', group: 'fixed', get: (e) => e.label },
    { id: 'statut', header: 'statut', group: 'fixed', get: (e) => (e.status && e.status !== 'none' ? t(statusDef(e.status).labelKey) : '') }
  ]
}

/** Matrice (en-tête + lignes) à partir d'items et d'une sélection de colonnes. */
export function rowsFromColumns<T>(items: T[], columns: Array<CsvColumn<T>>): string[][] {
  const rows: string[][] = [columns.map((column) => column.header)]
  for (const item of items) rows.push(columns.map((column) => column.get(item)))
  return rows
}

/** CSV des entités selon des colonnes choisies (§4 v1.8). */
export function exportEntitiesCsvColumns(
  nodes: BoardNodeData[],
  columns: Array<CsvColumn<BoardNodeData>>,
  options: CsvExportOptions = {}
): string {
  const entities = nodes.filter((node) => node.kind === 'entity')
  return stringifyCsv(rowsFromColumns(entities, columns), { delimiter: options.delimiter, bom: options.bom ?? true })
}

/** CSV des liens selon des colonnes choisies (§4 v1.8). */
export function exportEdgesCsvColumns(
  edges: BoardEdgeData[],
  columns: Array<CsvColumn<BoardEdgeData>>,
  options: CsvExportOptions = {}
): string {
  return stringifyCsv(rowsFromColumns(edges, columns), { delimiter: options.delimiter, bom: options.bom ?? true })
}

/** Libellé humain d'un nœud pour l'export des liens (titre, sinon 1er champ, sinon id). */
function nodeLabel(node: BoardNodeData | undefined, id: string): string {
  if (!node) return id
  if (node.title.trim() !== '') return node.title
  const firstValue = node.fields.find((field) => field.value.trim() !== '')?.value
  return firstValue ?? id
}

/** Matrice (en-tête + lignes) de l'export des entités. */
export function entitiesToRows(nodes: BoardNodeData[]): string[][] {
  const entities = nodes.filter((node) => node.kind === 'entity')
  // Libellés de champ dans l'ordre de première apparition.
  const labels: string[] = []
  const seen = new Set<string>()
  for (const node of entities) {
    for (const field of node.fields) {
      if (!seen.has(field.label)) {
        seen.add(field.label)
        labels.push(field.label)
      }
    }
  }
  const header = ['type', 'titre', ...labels]
  const rows: string[][] = [header]
  for (const node of entities) {
    const byLabel = new Map<string, string[]>()
    for (const field of node.fields) {
      if (field.value.trim() === '') continue
      const list = byLabel.get(field.label) ?? []
      list.push(field.value)
      byLabel.set(field.label, list)
    }
    rows.push([
      node.entityType ?? 'generic_other',
      node.title,
      ...labels.map((label) => (byLabel.get(label) ?? []).join(';'))
    ])
  }
  return rows
}

/** Matrice (en-tête + lignes) de l'export des liens. */
export function edgesToRows(nodes: BoardNodeData[], edges: BoardEdgeData[]): string[][] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const header = ['source', 'cible', 'relation', 'label']
  const rows: string[][] = [header]
  for (const edge of edges) {
    const relKey = edge.relationType !== '' ? relationLabelKey(edge.relationType) : null
    const relation = relKey ? t(relKey) : edge.relationType
    rows.push([
      nodeLabel(byId.get(edge.source), edge.source),
      nodeLabel(byId.get(edge.target), edge.target),
      relation,
      edge.label
    ])
  }
  return rows
}

/** CSV des entités (chaîne prête à écrire). */
export function exportEntitiesCsv(nodes: BoardNodeData[], options: CsvExportOptions = {}): string {
  return stringifyCsv(entitiesToRows(nodes), { delimiter: options.delimiter, bom: options.bom ?? true })
}

/** CSV des liens (chaîne prête à écrire). */
export function exportEdgesCsv(
  nodes: BoardNodeData[],
  edges: BoardEdgeData[],
  options: CsvExportOptions = {}
): string {
  return stringifyCsv(edgesToRows(nodes, edges), { delimiter: options.delimiter, bom: options.bom ?? true })
}
