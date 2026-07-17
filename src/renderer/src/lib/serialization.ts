/**
 * Export / import de fichiers `.trace` (§7) : JSON complet du tableau,
 * images base64 incluses.
 *
 * v1.1 : le format passe en version 2 (entités, sources, connexions enrichies,
 * couleurs libres, mode d'accès). Les fichiers v1 (version 1) restent importables :
 * `parseTrace` les migre au vol (couleurs nommées → hex, champs manquants →
 * valeurs par défaut, nœuds anciens conservés comme nœuds libres).
 */
import * as Y from 'yjs'
import type {
  AccessLogEntry,
  BoardComment,
  BoardEdgeData,
  BoardMeta,
  BoardNodeData,
  CustomEntityType
} from '@/types'
import { DEFAULT_PARTICIPANT_LIMIT } from '@/types'
import { colorHex, DEFAULT_EDGE_COLOR, DEFAULT_NODE_COLOR } from '@/lib/colors'
import { normalizeEntityType } from '@/lib/taxonomy'
import { asStatus, hasStatusBadge } from '@/lib/status'
import { readFileStatus } from '@/sync/files'
import {
  asEdgeAnchor,
  edgeToYMap,
  getCommentsMap,
  getCustomTypesMap,
  getEdgesMap,
  getNodesMap,
  isNodeKind,
  nodeToYMap,
  readAllComments,
  readAllEdges,
  readAllNodes,
  readCustomTypes,
  readMeta,
  sanitizeCustomType,
  sanitizeEntityStyle,
  sanitizeField,
  sanitizeWaypoints,
  writeMeta
} from '@/sync/model'

export const TRACE_FORMAT = 'cosint-trace'
/**
 * Version courante du format. Les versions 1 (v1), 2 (v1.1) et 3 (v1.2–v1.5)
 * restent lues. La version 4 (v1.6) ajoute le routage manuel des liens (points de
 * passage + ancrages) et le bloc de code (langage). La version 5 (v1.7) ajoute la
 * date d'événement (`eventDate`) d'un nœud pour la Chronologie. La version 6 (v1.8)
 * ajoute la datation d'événement étendue (fenêtre au plus tôt/tard, drapeau heure)
 * et les types d'entité personnalisés du tableau (`customTypes`) — tous ces champs
 * sont OPTIONNELS, donc un fichier plus ancien s'ouvre sans erreur (champs absents
 * → valeurs par défaut / undefined), et un fichier v6 s'ouvre dans une version
 * antérieure en ignorant simplement les champs inconnus.
 */
export const TRACE_VERSION = 6
const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5, 6]

export interface TraceFile {
  format: typeof TRACE_FORMAT
  version: number
  exportedAt: number
  meta: BoardMeta
  nodes: BoardNodeData[]
  edges: BoardEdgeData[]
  comments: BoardComment[]
  /** Types d'entité personnalisés du tableau (§2 v1.8). Absent = aucun. */
  customTypes?: CustomEntityType[]
}

/**
 * Capture l'état complet d'un document Yjs en structure exportable. Les nœuds
 * image référencent un hash de fichier (§1 v1.4) ; pour que le `.trace` reste
 * PORTABLE et auto-suffisant, on réintègre la data-URL inline (réassemblée depuis
 * `files`). Un fichier incomplet donne un nœud image vide plutôt qu'une référence
 * pendante. À l'import, ces data-URLs sont re-converties en chunks (migration).
 */
export function exportBoardData(doc: Y.Doc, exportedAt: number = Date.now()): TraceFile {
  const nodes = readAllNodes(doc).map((node) => {
    if (node.kind !== 'image') return node
    // Déjà inline (import non encore migré) : conservé tel quel.
    if (node.content.startsWith('data:image/')) return node
    if (node.content === '') return node
    const file = readFileStatus(doc, node.content)
    return { ...node, content: file.status === 'complete' ? file.dataUrl : '' }
  })
  const customTypes = readCustomTypes(doc)
  return {
    format: TRACE_FORMAT,
    version: TRACE_VERSION,
    exportedAt,
    meta: readMeta(doc),
    nodes,
    edges: readAllEdges(doc),
    comments: readAllComments(doc),
    ...(customTypes.length > 0 ? { customTypes } : {})
  }
}

/** Sérialise en JSON (contenu du fichier .trace). */
export function serializeTrace(trace: TraceFile): string {
  return JSON.stringify(trace, null, 2)
}

class TraceError extends Error {}

function fail(message: string): never {
  throw new TraceError(message)
}

function asString(value: unknown, fallback: string | null = null): string {
  if (typeof value === 'string') return value
  if (fallback !== null) return fallback
  fail('champ texte manquant')
}

function asNumber(value: unknown, fallback: number | null = null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (fallback !== null) return fallback
  fail('champ numérique manquant')
}

/** Assainit un nœud brut (réutilisé par le presse-papiers §2 v1.7). Exporté pour
 *  éviter de dupliquer la logique défensive (migrations, couleurs, statut, style). */
export function sanitizeNode(raw: unknown): BoardNodeData | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  if (!isNodeKind(record.kind)) return null
  const fields = Array.isArray(record.fields)
    ? record.fields.map(sanitizeField).filter((field): field is NonNullable<typeof field> => field !== null)
    : []
  const node: BoardNodeData = {
    id: record.id,
    kind: record.kind,
    x: asNumber(record.x, 0),
    y: asNumber(record.y, 0),
    width: asNumber(record.width, 240),
    height: asNumber(record.height, 140),
    content: asString(record.content, ''),
    title: asString(record.title, ''),
    color: colorHex(asString(record.color, DEFAULT_NODE_COLOR)),
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    fields,
    createdBy: asString(record.createdBy, '?'),
    createdAt: asNumber(record.createdAt, 0),
    updatedBy: asString(record.updatedBy, '?'),
    updatedAt: asNumber(record.updatedAt, 0)
  }
  // Migration v1.1 → id de taxonomie v1.2 (person, domain→domain_name, …).
  if (record.kind === 'entity') node.entityType = normalizeEntityType(record.entityType)
  if (record.kind === 'source') {
    node.sourceType = asString(record.sourceType, 'other')
    node.reliability = asString(record.reliability, '')
    node.credibility = asString(record.credibility, '')
  }
  // Bloc de code (§5 v1.6) : langage (défaut « texte brut »).
  if (record.kind === 'code') node.language = asString(record.language, 'plaintext')
  // Personnalisation visuelle (§4 v1.4).
  if (record.kind === 'entity' || record.kind === 'source') {
    const style = sanitizeEntityStyle(record.style)
    if (style) node.style = style
  }
  // Badge de statut (§3 v1.5).
  const status = asStatus(record.status)
  if (hasStatusBadge(status)) node.status = status
  // Datation d'événement (§4 v1.7 + §1 v1.8) — champs optionnels, bornés à la plage
  // Date valide (±8,64e15 ms) pour éviter une Date invalide plus tard (frise/panneau).
  const eventMs = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8.64e15
      ? value
      : undefined
  const eventDate = eventMs(record.eventDate)
  if (eventDate !== undefined) node.eventDate = eventDate
  const eventEarliest = eventMs(record.eventEarliest)
  if (eventEarliest !== undefined) node.eventEarliest = eventEarliest
  const eventLatest = eventMs(record.eventLatest)
  if (eventLatest !== undefined) node.eventLatest = eventLatest
  if (record.eventHasTime === true) node.eventHasTime = true
  return node
}

/** Assainit un lien brut (réutilisé par le presse-papiers §2 v1.7). Rejette un lien
 *  dont une extrémité n'est pas dans `nodeIds`. */
export function sanitizeEdge(raw: unknown, nodeIds: Set<string>): BoardEdgeData | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  if (typeof record.source !== 'string' || typeof record.target !== 'string') return null
  // Une connexion vers un nœud inexistant est ignorée silencieusement.
  if (!nodeIds.has(record.source) || !nodeIds.has(record.target)) return null
  const direction = record.direction
  const style = record.style
  const width = record.width
  const pathType = record.pathType
  const edge: BoardEdgeData = {
    id: record.id,
    source: record.source,
    target: record.target,
    label: asString(record.label, ''),
    relationType: asString(record.relationType, ''),
    style: style === 'dashed' || style === 'dotted' ? style : 'solid',
    direction:
      direction === 'single' || direction === 'double' || direction === 'none' ? direction : 'none',
    width: width === 'thin' || width === 'thick' ? width : 'normal',
    pathType: pathType === 'straight' || pathType === 'step' ? pathType : 'bezier',
    color: colorHex(asString(record.color, DEFAULT_EDGE_COLOR)),
    createdBy: asString(record.createdBy, '?'),
    createdAt: asNumber(record.createdAt, 0),
    updatedBy: asString(record.updatedBy, '?'),
    updatedAt: asNumber(record.updatedAt, 0)
  }
  // Routage manuel (§1 v1.6) — assaini défensivement, sinon silencieusement ignoré.
  const waypoints = sanitizeWaypoints(record.waypoints)
  if (waypoints) edge.waypoints = waypoints
  const sourceAnchor = asEdgeAnchor(record.sourceAnchor)
  if (sourceAnchor) edge.sourceAnchor = sourceAnchor
  const targetAnchor = asEdgeAnchor(record.targetAnchor)
  if (targetAnchor) edge.targetAnchor = targetAnchor
  // Badge de statut (§3 v1.5).
  const status = asStatus(record.status)
  if (hasStatusBadge(status)) edge.status = status
  return edge
}

function sanitizeComment(raw: unknown, nodeIds: Set<string>): BoardComment | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  if (typeof record.nodeId !== 'string' || !nodeIds.has(record.nodeId)) return null
  if (typeof record.text !== 'string') return null
  return {
    id: record.id,
    nodeId: record.nodeId,
    author: asString(record.author, '?'),
    text: record.text,
    createdAt: asNumber(record.createdAt, 0)
  }
}

function sanitizeAccessLog(raw: unknown): AccessLogEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is AccessLogEntry => {
      if (typeof entry !== 'object' || entry === null) return false
      const record = entry as Record<string, unknown>
      return (
        (record.mode === 'open' || record.mode === 'approval' || record.mode === 'private') &&
        typeof record.by === 'string' &&
        typeof record.at === 'number'
      )
    })
    .map((entry) => ({ mode: entry.mode, by: entry.by, at: entry.at }))
}

/**
 * Analyse et valide le contenu d'un fichier .trace (v1 ou v1.1).
 * Lève une erreur avec message français si le fichier est invalide ;
 * les éléments individuellement corrompus sont ignorés (import au mieux).
 */
export function parseTrace(json: string): TraceFile {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    fail('le fichier ne contient pas de JSON valide')
  }
  if (typeof raw !== 'object' || raw === null) fail('structure inattendue')
  const record = raw as Record<string, unknown>
  if (record.format !== TRACE_FORMAT) fail('ce fichier n’est pas un fichier .trace COSINT')
  if (typeof record.version !== 'number' || !SUPPORTED_VERSIONS.includes(record.version)) {
    fail(`version de fichier non supportée (${String(record.version)})`)
  }
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
    fail('sections nodes/edges manquantes')
  }

  const nodes = (record.nodes as unknown[])
    .map(sanitizeNode)
    .filter((node): node is BoardNodeData => node !== null)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = (record.edges as unknown[])
    .map((edge) => sanitizeEdge(edge, nodeIds))
    .filter((edge): edge is BoardEdgeData => edge !== null)
  const comments = (Array.isArray(record.comments) ? (record.comments as unknown[]) : [])
    .map((comment) => sanitizeComment(comment, nodeIds))
    .filter((comment): comment is BoardComment => comment !== null)

  // Types d'entité personnalisés (§2 v1.8) — présents seulement à partir de la v6 ;
  // assainis (id `custom:` requis), les entrées malformées sont ignorées.
  const customTypes = (Array.isArray(record.customTypes) ? (record.customTypes as unknown[]) : [])
    .map((raw) => {
      const rec = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const id = typeof rec.id === 'string' ? rec.id : ''
      return sanitizeCustomType(id, rec)
    })
    .filter((type): type is CustomEntityType => type !== null)

  const metaRaw = (
    typeof record.meta === 'object' && record.meta !== null ? record.meta : {}
  ) as Record<string, unknown>

  const accessMode =
    metaRaw.accessMode === 'approval' || metaRaw.accessMode === 'private'
      ? metaRaw.accessMode
      : 'open' // Les tableaux v1 (sans mode) deviennent « ouverts ».

  return {
    format: TRACE_FORMAT,
    version: TRACE_VERSION,
    exportedAt: asNumber(record.exportedAt, 0),
    meta: {
      title: asString(metaRaw.title, ''),
      createdAt: asNumber(metaRaw.createdAt, 0),
      createdBy: asString(metaRaw.createdBy, ''),
      accessMode,
      accessLog: sanitizeAccessLog(metaRaw.accessLog),
      // §6 v1.4 : l'adminId d'origine n'est pas repris (l'importateur devient
      // admin) ; la limite de participants est conservée si présente.
      adminId: asString(metaRaw.adminId, ''),
      participantLimit:
        typeof metaRaw.participantLimit === 'number'
          ? metaRaw.participantLimit
          : DEFAULT_PARTICIPANT_LIMIT,
      shareRevocation: ''
    },
    nodes,
    edges,
    comments,
    ...(customTypes.length > 0 ? { customTypes } : {})
  }
}

/**
 * Recrée le contenu d'un .trace dans un document Yjs (idéalement vierge).
 * L'appelant fournit l'origine de transaction (pour l'undo et la traçabilité).
 */
export function importTraceIntoDoc(trace: TraceFile, doc: Y.Doc, origin?: unknown): void {
  doc.transact(() => {
    const nodes = getNodesMap(doc)
    const edges = getEdgesMap(doc)
    const comments = getCommentsMap(doc)
    for (const node of trace.nodes) nodes.set(node.id, nodeToYMap(node))
    for (const edge of trace.edges) edges.set(edge.id, edgeToYMap(edge))
    for (const comment of trace.comments) comments.set(comment.id, comment)
    // Types personnalisés (§2 v1.8) : recréés à l'identique (id `custom:` conservé →
    // les entités importées qui les référencent restent correctement typées).
    if (trace.customTypes && trace.customTypes.length > 0) {
      const customTypes = getCustomTypesMap(doc)
      for (const type of trace.customTypes) customTypes.set(type.id, { ...type })
    }
    writeMeta(doc, trace.meta)
  }, origin)
}
