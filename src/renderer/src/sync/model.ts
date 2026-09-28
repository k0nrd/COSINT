/**
 * Représentation CRDT du modèle de données (v1.1).
 *
 * Chaque nœud/connexion est un Y.Map imbriqué (fusion champ par champ entre pairs).
 * Les champs de fiche (`fields`) sont stockés comme un tableau JSON simple sur le
 * Y.Map du nœud : les éditions concurrentes d'une même fiche se résolvent en
 * dernier-écrivain-gagne à l'échelle du tableau de champs (voir DECISIONS.md).
 * La lecture est défensive et migre au vol les anciennes valeurs v1
 * (couleurs nommées → hex, champs absents → valeurs par défaut).
 */
import * as Y from 'yjs'
import type {
  AccessLogEntry,
  AccessMode,
  BoardComment,
  BoardEdgeData,
  BoardMeta,
  BoardNodeData,
  BoardRole,
  CustomEntityType,
  CustomTypeField,
  EdgeAnchor,
  EdgeDirection,
  EdgePathType,
  EdgeStyle,
  EdgeWaypoint,
  EdgeWidth,
  EntityField,
  EntityStyle,
  EventMark,
  FieldKind,
  NodeKind,
  NodeTextSize
} from '@/types'
import { DEFAULT_PARTICIPANT_LIMIT, DEFAULT_ROLE, MAX_PARTICIPANT_LIMIT, MIN_PARTICIPANT_LIMIT } from '@/types'
import { colorHex, DEFAULT_EDGE_COLOR, DEFAULT_NODE_COLOR } from '@/lib/colors'
import { normalizeEntityType } from '@/lib/taxonomy'
import { sanitizeEventMarks } from '@/lib/timeline'
import { asStatus, hasStatusBadge } from '@/lib/status'
import { cloneEntityImages, readEntityImages } from '@/lib/entityImages'

export type YNodeMap = Y.Map<unknown>
export type YEdgeMap = Y.Map<unknown>

export function getNodesMap(doc: Y.Doc): Y.Map<YNodeMap> {
  return doc.getMap<YNodeMap>('nodes')
}

export function getEdgesMap(doc: Y.Doc): Y.Map<YEdgeMap> {
  return doc.getMap<YEdgeMap>('edges')
}

export function getCommentsMap(doc: Y.Doc): Y.Map<BoardComment> {
  return doc.getMap<BoardComment>('comments')
}

export function getMetaMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta')
}

/** Y.Map des fichiers transférés en chunks (§1 v1.4) : voir sync/files.ts.
 * Clés `m:<hash>` (métadonnées) et `c:<hash>:<index>` (chunks base64). */
export function getFilesMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('files')
}

/** Y.Map des types d'entité personnalisés du tableau (§2 v1.8) : `id → définition`.
 * Structure par clé → les créations concurrentes fusionnent. Synchronisée et
 * exportée dans le `.trace`. Réservée à l'admin/éditeur (roleGuard). */
export function getCustomTypesMap(doc: Y.Doc): Y.Map<CustomEntityType> {
  return doc.getMap<CustomEntityType>('customTypes')
}

/** Y.Map des rôles explicites (§6 v1.4) : `userId → 'visitor' | 'editor'`.
 * L'admin est identifié par `meta.adminId` ; un userId absent = rôle par défaut
 * (éditeur). Structure par clé → les attributions concurrentes fusionnent. */
export function getRolesMap(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>('roles')
}

const BOARD_ROLES: BoardRole[] = ['admin', 'editor', 'visitor']

function asRole(value: unknown): BoardRole | null {
  return typeof value === 'string' && (BOARD_ROLES as string[]).includes(value)
    ? (value as BoardRole)
    : null
}

/**
 * Rôle effectif d'un participant (§6) : admin si c'est l'admin déclaré, sinon
 * l'attribution explicite de la Y.Map `roles`, sinon éditeur (défaut à l'arrivée).
 */
export function effectiveRole(doc: Y.Doc, userId: string): BoardRole {
  if (userId === '' ) return DEFAULT_ROLE
  const adminId = str(getMetaMap(doc), 'adminId')
  if (adminId !== '' && userId === adminId) return 'admin'
  const raw = getRolesMap(doc).get(userId)
  // Un participant exclu est traité en LECTURE SEULE (ses écritures sont révoquées
  // à la réception) — pas comme un éditeur par défaut, sinon un client exclu mais
  // modifié continuerait d'éditer jusqu'à la régénération du code.
  if (raw === 'excluded') return 'visitor'
  const explicit = asRole(raw)
  // Une attribution « admin » dans la map roles est ignorée (l'admin passe par
  // meta.adminId uniquement) : empêche un pair de se hisser admin via roles.
  if (explicit === 'editor' || explicit === 'visitor') return explicit
  return DEFAULT_ROLE
}

/** true si le participant a été exclu par l'admin (§6) : il doit se déconnecter. */
export function isExcluded(doc: Y.Doc, userId: string): boolean {
  return userId !== '' && getRolesMap(doc).get(userId) === 'excluded'
}

// ——— Lecture typée et défensive des champs d'un Y.Map ———

function str(map: Y.Map<unknown>, key: string, fallback = ''): string {
  const value = map.get(key)
  return typeof value === 'string' ? value : fallback
}

function num(map: Y.Map<unknown>, key: string, fallback = 0): number {
  const value = map.get(key)
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function strArray(map: Y.Map<unknown>, key: string): string[] {
  const value = map.get(key)
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const NODE_KINDS: NodeKind[] = [
  'text',
  'link',
  'image',
  'timestamped',
  'group',
  'entity',
  'source',
  'code',
  'file'
]

/** §6 v1.9 : nom d'icône lucide valide — même contrainte que `sanitizeCustomType`.
 *  (§2 v1.9 : les références d'images d'entité sont validées par lib/entityImages.) */
const ICON_NAME_RE = /^[A-Za-z0-9]{1,40}$/
const FIELD_KINDS: FieldKind[] = [
  'text',
  'longtext',
  'url',
  'email',
  'phone',
  'date',
  'social',
  // §2 v1.8.1 : natures « catalogue » (banque, crypto, marque, opérateur, pays,
  // carte, hash). Doivent figurer ici, sinon un champ chargé retomberait sur « text ».
  'bank',
  'crypto',
  'brand',
  'operator',
  'country',
  'card',
  'hash_algo'
]
const ACCESS_MODES: AccessMode[] = ['open', 'approval', 'private']
const DIRECTIONS: EdgeDirection[] = ['none', 'single', 'double']
const EDGE_STYLES: EdgeStyle[] = ['solid', 'dashed', 'dotted']
const EDGE_WIDTHS: EdgeWidth[] = ['thin', 'normal', 'thick']
const EDGE_PATHS: EdgePathType[] = ['bezier', 'straight', 'step']
const EDGE_ANCHORS: EdgeAnchor[] = ['t', 'b', 'l', 'r']

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === 'string' && (NODE_KINDS as string[]).includes(value)
}

function asFieldKind(value: unknown): FieldKind {
  return typeof value === 'string' && (FIELD_KINDS as string[]).includes(value)
    ? (value as FieldKind)
    : 'text'
}

function asAccessMode(value: unknown): AccessMode {
  return typeof value === 'string' && (ACCESS_MODES as string[]).includes(value)
    ? (value as AccessMode)
    : 'open'
}

function asDirection(value: unknown): EdgeDirection {
  return typeof value === 'string' && (DIRECTIONS as string[]).includes(value)
    ? (value as EdgeDirection)
    : 'none'
}

function asEdgeStyle(value: unknown): EdgeStyle {
  return typeof value === 'string' && (EDGE_STYLES as string[]).includes(value)
    ? (value as EdgeStyle)
    : 'solid'
}

function asEdgeWidth(value: unknown): EdgeWidth {
  return typeof value === 'string' && (EDGE_WIDTHS as string[]).includes(value)
    ? (value as EdgeWidth)
    : 'normal'
}

function asPathType(value: unknown): EdgePathType {
  return typeof value === 'string' && (EDGE_PATHS as string[]).includes(value)
    ? (value as EdgePathType)
    : 'bezier'
}

/** Valide un côté d'ancrage de lien (§1 v1.6) ; null si absent/invalide. */
export function asEdgeAnchor(value: unknown): EdgeAnchor | null {
  return typeof value === 'string' && (EDGE_ANCHORS as string[]).includes(value)
    ? (value as EdgeAnchor)
    : null
}

/**
 * Nettoie une liste de points de passage (§1 v1.6) : chaque point doit porter des
 * coordonnées x/y finies. Les points malformés sont ignorés ; une liste vide ou
 * sans point valide renvoie null (routage automatique).
 */
export function sanitizeWaypoints(raw: unknown): EdgeWaypoint[] | null {
  if (!Array.isArray(raw)) return null
  const points: EdgeWaypoint[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if (
      typeof record.x === 'number' &&
      Number.isFinite(record.x) &&
      typeof record.y === 'number' &&
      Number.isFinite(record.y)
    ) {
      points.push({ x: record.x, y: record.y })
    }
  }
  return points.length > 0 ? points : null
}

/** Nettoie un champ de fiche lu depuis le document. */
export function sanitizeField(raw: unknown): EntityField | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return null
  const field: EntityField = {
    id: record.id,
    label: typeof record.label === 'string' ? record.label : '',
    kind: asFieldKind(record.kind),
    value: typeof record.value === 'string' ? record.value : '',
    updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : '?',
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0
  }
  // Affichage explicite sur le nœud (§6bis) — absent = mode par défaut.
  if (typeof record.shown === 'boolean') field.shown = record.shown
  return field
}

function readFields(map: Y.Map<unknown>): EntityField[] {
  const value = map.get('fields')
  if (!Array.isArray(value)) return []
  return value.map(sanitizeField).filter((field): field is EntityField => field !== null)
}

/** Nettoie un gabarit de champ personnalisé (label + kind). */
function sanitizeCustomField(raw: unknown): CustomTypeField | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const label = typeof record.label === 'string' ? record.label.slice(0, 80) : ''
  if (label.trim() === '') return null
  return { label, kind: asFieldKind(record.kind) }
}

/**
 * Nettoie un type d'entité personnalisé lu du document (§2 v1.8). Défensif : un
 * type malformé (écrit par un pair modifié) est ignoré, jamais fatal. La couleur
 * est normalisée en #rrggbb, l'icône bornée à un nom court, les champs assainis.
 */
export function sanitizeCustomType(id: string, raw: unknown): CustomEntityType | null {
  if (!id.startsWith('custom:')) return null
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.slice(0, 60).trim() : ''
  if (name === '') return null
  const icon = typeof record.icon === 'string' && /^[A-Za-z0-9]{1,40}$/.test(record.icon)
    ? record.icon
    : 'Circle'
  const fields = Array.isArray(record.fields)
    ? record.fields
        .map(sanitizeCustomField)
        .filter((field): field is CustomTypeField => field !== null)
        .slice(0, 40)
    : []
  return {
    id,
    name,
    icon,
    color: colorHex(typeof record.color === 'string' ? record.color : '#8b5cf6'),
    fields,
    createdBy: typeof record.createdBy === 'string' ? record.createdBy : '?',
    createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : 0
  }
}

/** Lit tous les types personnalisés du tableau (entrées malformées ignorées). */
export function readCustomTypes(doc: Y.Doc): CustomEntityType[] {
  const result: CustomEntityType[] = []
  getCustomTypesMap(doc).forEach((raw, id) => {
    const type = sanitizeCustomType(id, raw)
    if (type) result.push(type)
  })
  return result.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/** Borne une date d'événement lue (§1 v1.8) : nombre fini dans la plage Date valide. */
function readEventMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8.64e15
    ? value
    : undefined
}

/** §1 v1.8.3/§1 v1.8.4 : repères lus défensivement (objets titre/couleur/tags, ou nombres
 *  hérités v1.8.3). `undefined` si rien d'exploitable (pour ne jamais poser une clé vide). */
function readEventMarks(value: unknown): EventMark[] | undefined {
  const marks = sanitizeEventMarks(value)
  return marks.length > 0 ? marks : undefined
}

const TEXT_SIZES: NodeTextSize[] = ['small', 'normal', 'large']

/** Nettoie une personnalisation visuelle d'entité/source (§4). null si vide.
 * La forme n'est plus personnalisable (rectangle arrondi) : un éventuel `shape`
 * hérité est simplement ignoré. */
export function sanitizeEntityStyle(raw: unknown): EntityStyle | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const style: EntityStyle = {}
  if ((EDGE_STYLES as string[]).includes(record.borderStyle as string)) style.borderStyle = record.borderStyle as EdgeStyle
  if ((EDGE_WIDTHS as string[]).includes(record.borderWidth as string)) style.borderWidth = record.borderWidth as EdgeWidth
  if (typeof record.borderColor === 'string') style.borderColor = colorHex(record.borderColor)
  if (typeof record.fillColor === 'string') style.fillColor = colorHex(record.fillColor)
  if (typeof record.fillOpacity === 'number' && Number.isFinite(record.fillOpacity)) {
    style.fillOpacity = Math.min(1, Math.max(0, record.fillOpacity))
  }
  if (typeof record.transparentFill === 'boolean') style.transparentFill = record.transparentFill
  if ((TEXT_SIZES as string[]).includes(record.textSize as string)) style.textSize = record.textSize as NodeTextSize
  return Object.keys(style).length > 0 ? style : null
}

// ——— Conversions Y.Map ↔ objets plats ———

export function yMapToNode(id: string, map: YNodeMap): BoardNodeData {
  const kind = isNodeKind(map.get('kind')) ? (map.get('kind') as NodeKind) : 'text'
  const entityType = map.get('entityType')
  const node: BoardNodeData = {
    id,
    kind,
    x: num(map, 'x'),
    y: num(map, 'y'),
    width: num(map, 'width', 240),
    height: num(map, 'height', 140),
    content: str(map, 'content'),
    title: str(map, 'title'),
    color: colorHex(str(map, 'color', DEFAULT_NODE_COLOR)),
    tags: strArray(map, 'tags'),
    fields: readFields(map),
    createdBy: str(map, 'createdBy', '?'),
    createdAt: num(map, 'createdAt'),
    updatedBy: str(map, 'updatedBy', '?'),
    updatedAt: num(map, 'updatedAt')
  }
  // Le type d'entité est normalisé (migration v1.1 → id de taxonomie v1.2).
  if (kind === 'entity') node.entityType = normalizeEntityType(entityType)
  if (kind === 'source') {
    node.sourceType = str(map, 'sourceType', 'other')
    node.reliability = str(map, 'reliability', '')
    node.credibility = str(map, 'credibility', '')
  }
  // Bloc de code (§5 v1.6) : langage (défaut « texte brut »).
  if (kind === 'code') node.language = str(map, 'language', 'plaintext')
  // Personnalisation visuelle (§4) — entités/sources.
  if (kind === 'entity' || kind === 'source') {
    const style = sanitizeEntityStyle(map.get('style'))
    if (style) node.style = style
  }
  // §6/§2 v1.9 — icône propre au nœud + image attachée (entités uniquement).
  if (kind === 'entity') {
    const icon = str(map, 'icon')
    if (ICON_NAME_RE.test(icon)) node.icon = icon
    // §2 v1.9 (galerie) : liste `images` validée (hash de fichier ou data-URL image
    // transitoire, doublons retirés, bornée) ; à défaut, l'image UNIQUE héritée du
    // build de travail (`imageHash`) devient la première image — rien n'est perdu.
    const images = readEntityImages({
      images: map.get('images'),
      imageHash: map.get('imageHash'),
      imageWidth: map.get('imageWidth'),
      imageHeight: map.get('imageHeight')
    })
    if (images.length > 0) node.images = images
  }
  // Badge de statut (§3 v1.5) — tous types de nœuds.
  const status = asStatus(map.get('status'))
  if (hasStatusBadge(status)) node.status = status
  // Datation d'événement — optionnelle, lue défensivement, bornée à la plage Date
  // valide (§4 v1.7 + §1 v1.8 : fenêtre au plus tôt/tard + drapeau heure).
  const eventDate = readEventMs(map.get('eventDate'))
  if (eventDate !== undefined) node.eventDate = eventDate
  const eventEarliest = readEventMs(map.get('eventEarliest'))
  if (eventEarliest !== undefined) node.eventEarliest = eventEarliest
  const eventLatest = readEventMs(map.get('eventLatest'))
  if (eventLatest !== undefined) node.eventLatest = eventLatest
  // Durée précise de/à (§1 v1.8.2) — indépendante de la fenêtre d'incertitude.
  const eventFrom = readEventMs(map.get('eventFrom'))
  if (eventFrom !== undefined) node.eventFrom = eventFrom
  const eventTo = readEventMs(map.get('eventTo'))
  if (eventTo !== undefined) node.eventTo = eventTo
  const eventMarks = readEventMarks(map.get('eventMarks'))
  if (eventMarks !== undefined) node.eventMarks = eventMarks
  if (map.get('eventHasTime') === true) node.eventHasTime = true
  return node
}

export function nodeToYMap(node: BoardNodeData): YNodeMap {
  const map = new Y.Map<unknown>()
  map.set('kind', node.kind)
  map.set('x', node.x)
  map.set('y', node.y)
  map.set('width', node.width)
  map.set('height', node.height)
  map.set('content', node.content)
  map.set('title', node.title)
  map.set('color', colorHex(node.color))
  map.set('tags', [...node.tags])
  map.set('fields', node.fields.map((field) => ({ ...field })))
  if (node.style) map.set('style', { ...node.style })
  // §6/§2 v1.9 — icône propre + image attachée (écrites seulement si présentes).
  if (node.icon) map.set('icon', node.icon)
  // §2 v1.9 (galerie) : copie profonde, clé écrite seulement si non vide.
  if (node.kind === 'entity' && node.images && node.images.length > 0) {
    map.set('images', cloneEntityImages(node.images))
  }
  if (hasStatusBadge(node.status)) map.set('status', node.status)
  // Datation d'événement — écrite seulement si présente (§4 v1.7 + §1 v1.8).
  if (node.eventDate !== undefined) map.set('eventDate', node.eventDate)
  if (node.eventEarliest !== undefined) map.set('eventEarliest', node.eventEarliest)
  if (node.eventLatest !== undefined) map.set('eventLatest', node.eventLatest)
  if (node.eventFrom !== undefined) map.set('eventFrom', node.eventFrom)
  if (node.eventTo !== undefined) map.set('eventTo', node.eventTo)
  if (node.eventMarks && node.eventMarks.length > 0)
    map.set('eventMarks', node.eventMarks.map((mark) => ({ ...mark })))
  if (node.eventHasTime) map.set('eventHasTime', true)
  if (node.entityType) map.set('entityType', node.entityType)
  if (node.kind === 'source') {
    map.set('sourceType', node.sourceType ?? 'other')
    map.set('reliability', node.reliability ?? '')
    map.set('credibility', node.credibility ?? '')
  }
  // Bloc de code (§5 v1.6) : langage persisté.
  if (node.kind === 'code') map.set('language', node.language ?? 'plaintext')
  map.set('createdBy', node.createdBy)
  map.set('createdAt', node.createdAt)
  map.set('updatedBy', node.updatedBy)
  map.set('updatedAt', node.updatedAt)
  return map
}

export function yMapToEdge(id: string, map: YEdgeMap): BoardEdgeData {
  const edge: BoardEdgeData = {
    id,
    source: str(map, 'source'),
    target: str(map, 'target'),
    label: str(map, 'label'),
    relationType: str(map, 'relationType'),
    style: asEdgeStyle(map.get('style')),
    direction: asDirection(map.get('direction')),
    width: asEdgeWidth(map.get('width')),
    pathType: asPathType(map.get('pathType')),
    color: colorHex(str(map, 'color', DEFAULT_EDGE_COLOR)),
    createdBy: str(map, 'createdBy', '?'),
    createdAt: num(map, 'createdAt'),
    updatedBy: str(map, 'updatedBy', '?'),
    updatedAt: num(map, 'updatedAt')
  }
  // Routage manuel (§1 v1.6) — champs optionnels, lus défensivement.
  const waypoints = sanitizeWaypoints(map.get('waypoints'))
  if (waypoints) edge.waypoints = waypoints
  const sourceAnchor = asEdgeAnchor(map.get('sourceAnchor'))
  if (sourceAnchor) edge.sourceAnchor = sourceAnchor
  const targetAnchor = asEdgeAnchor(map.get('targetAnchor'))
  if (targetAnchor) edge.targetAnchor = targetAnchor
  // Badge de statut (§3 v1.5) — liens aussi.
  const status = asStatus(map.get('status'))
  if (hasStatusBadge(status)) edge.status = status
  return edge
}

export function edgeToYMap(edge: BoardEdgeData): YEdgeMap {
  const map = new Y.Map<unknown>()
  map.set('source', edge.source)
  map.set('target', edge.target)
  map.set('label', edge.label)
  map.set('relationType', edge.relationType)
  map.set('style', edge.style)
  map.set('direction', edge.direction)
  map.set('width', edge.width)
  map.set('pathType', edge.pathType)
  map.set('color', colorHex(edge.color))
  // Routage manuel (§1 v1.6) — écrit seulement si présent (comme le statut).
  if (edge.waypoints && edge.waypoints.length > 0) {
    map.set('waypoints', edge.waypoints.map((point) => ({ x: point.x, y: point.y })))
  }
  if (edge.sourceAnchor) map.set('sourceAnchor', edge.sourceAnchor)
  if (edge.targetAnchor) map.set('targetAnchor', edge.targetAnchor)
  if (hasStatusBadge(edge.status)) map.set('status', edge.status)
  map.set('createdBy', edge.createdBy)
  map.set('createdAt', edge.createdAt)
  map.set('updatedBy', edge.updatedBy)
  map.set('updatedAt', edge.updatedAt)
  return map
}

/** Lit tous les nœuds du document (ordre non significatif). Les entrées
 * malformées (non-Y.Map, écrites par un pair modifié) sont ignorées, jamais
 * fatales — sinon une seule écriture corrompue rendrait le tableau inouvrable. */
export function readAllNodes(doc: Y.Doc): BoardNodeData[] {
  const result: BoardNodeData[] = []
  getNodesMap(doc).forEach((map, id) => {
    if (map instanceof Y.Map) result.push(yMapToNode(id, map))
  })
  return result
}

/** Lit toutes les connexions du document (entrées malformées ignorées). */
export function readAllEdges(doc: Y.Doc): BoardEdgeData[] {
  const result: BoardEdgeData[] = []
  getEdgesMap(doc).forEach((map, id) => {
    if (map instanceof Y.Map) result.push(yMapToEdge(id, map))
  })
  return result
}

/** Lit tous les commentaires, triés par date croissante (entrées assainies). */
export function readAllComments(doc: Y.Doc): BoardComment[] {
  const result: BoardComment[] = []
  getCommentsMap(doc).forEach((raw, id) => {
    if (typeof raw !== 'object' || raw === null) return
    const record = raw as unknown as Record<string, unknown>
    if (typeof record.nodeId !== 'string' || typeof record.text !== 'string') return
    result.push({
      id,
      nodeId: record.nodeId,
      author: typeof record.author === 'string' ? record.author : '?',
      text: record.text,
      createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : 0
    })
  })
  return result.sort((a, b) => a.createdAt - b.createdAt)
}

function readAccessLog(meta: Y.Map<unknown>): AccessLogEntry[] {
  const value = meta.get('accessLog')
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is AccessLogEntry => {
      if (typeof entry !== 'object' || entry === null) return false
      const record = entry as Record<string, unknown>
      return (
        (ACCESS_MODES as string[]).includes(record.mode as string) &&
        typeof record.by === 'string' &&
        typeof record.at === 'number'
      )
    })
    .map((entry) => ({ mode: entry.mode, by: entry.by, at: entry.at }))
}

/** Borne la limite de participants dans [MIN, MAX], repli sur le défaut. */
export function clampParticipantLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PARTICIPANT_LIMIT
  return Math.min(MAX_PARTICIPANT_LIMIT, Math.max(MIN_PARTICIPANT_LIMIT, Math.round(value)))
}

export function readMeta(doc: Y.Doc): BoardMeta {
  const meta = getMetaMap(doc)
  const raw = meta.get('participantLimit')
  return {
    title: str(meta, 'title'),
    createdAt: num(meta, 'createdAt'),
    createdBy: str(meta, 'createdBy'),
    accessMode: asAccessMode(meta.get('accessMode')),
    accessLog: readAccessLog(meta),
    adminId: str(meta, 'adminId'),
    // Un tableau v1.3 sans limite explicite retombe sur le défaut.
    participantLimit: typeof raw === 'number' ? clampParticipantLimit(raw) : DEFAULT_PARTICIPANT_LIMIT,
    shareRevocation: str(meta, 'shareRevocation')
  }
}

export function writeMeta(doc: Y.Doc, meta: BoardMeta): void {
  const map = getMetaMap(doc)
  map.set('title', meta.title)
  map.set('createdAt', meta.createdAt)
  map.set('createdBy', meta.createdBy)
  map.set('accessMode', meta.accessMode)
  map.set('accessLog', meta.accessLog.map((entry) => ({ ...entry })))
  map.set('adminId', meta.adminId)
  map.set('participantLimit', clampParticipantLimit(meta.participantLimit))
  map.set('shareRevocation', meta.shareRevocation)
}
