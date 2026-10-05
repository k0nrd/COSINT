/**
 * Toutes les mutations du tableau passent par ici : chaque opération est une
 * transaction Yjs avec `localOrigin` (→ undo par utilisateur, §5) et met à jour
 * la traçabilité auteur/horodatage (§3). v1.1 : entités, sources, champs de fiche,
 * connexions enrichies (relation, direction), mode d'accès.
 */
import * as Y from 'yjs'
import type {
  AccessMode,
  BoardEdgeData,
  BoardNodeData,
  BoardRole,
  CustomEntityType,
  EdgeAnchor,
  EdgeDirection,
  EdgeWaypoint,
  ElementStatus,
  EntityField,
  EntityImage,
  EntityStyle,
  EntityType,
  EventMark,
  NodeKind
} from '@/types'
import { hasStatusBadge } from '@/lib/status'
import { sanitizeEventMarks } from '@/lib/timeline'
import { DEFAULT_PARTICIPANT_LIMIT } from '@/types'
import { newId } from '@/lib/id'
import {
  DEFAULT_EDGE_COLOR,
  DEFAULT_GROUP_COLOR,
  DEFAULT_NODE_COLOR,
  colorHex
} from '@/lib/colors'
import {
  entityFieldTemplate,
  SOURCE_COLOR,
  SOURCE_FIELDS,
  SOURCE_RELATION,
  visibleNodeFields
} from '@/lib/entities'
import { typeColor } from '@/lib/taxonomy'
// §7 v1.9 : préréglages de lien (application en lot).
import {
  resolvePresetPatch,
  sanitizeEdgePatch,
  type LinkPresetDef,
  type LinkPresetProps
} from '@/lib/linkPresets'
import {
  appendEntityImages,
  applyEntityImageAction,
  cloneEntityImages,
  readEntityImages,
  type AppendResult,
  type EntityImageAction
} from '@/lib/entityImages'
import { t } from '@/i18n'
import type { BoardHandle } from './BoardDoc'
import {
  clampParticipantLimit,
  edgeToYMap,
  getCommentsMap,
  getCustomTypesMap,
  getEdgesMap,
  getMetaMap,
  getNodesMap,
  getRolesMap,
  nodeToYMap,
  readMeta,
  sanitizeField,
  yMapToEdge,
  yMapToNode
} from './model'

/** Dimensions initiales par type de nœud. */
export const DEFAULT_SIZES: Record<NodeKind, { width: number; height: number }> = {
  text: { width: 260, height: 150 },
  link: { width: 280, height: 120 },
  image: { width: 320, height: 240 },
  timestamped: { width: 280, height: 170 },
  group: { width: 420, height: 300 },
  // Refonte UI : fiches compactes — la hauteur est un MINIMUM, le nœud grandit avec
  // son contenu (AUTO_HEIGHT_KINDS). Les nœuds existants gardent leur taille stockée.
  entity: { width: 260, height: 96 },
  source: { width: 280, height: 110 },
  code: { width: 380, height: 240 },
  file: { width: 260, height: 96 }
}

export interface NodeInit {
  kind: NodeKind
  x: number
  y: number
  width?: number
  height?: number
  content?: string
  title?: string
  color?: string
  tags?: string[]
  entityType?: EntityType
  sourceType?: string
  reliability?: string
  credibility?: string
  fields?: EntityField[]
  /** Langage d'un bloc de code (§5 v1.6). */
  language?: string
  /** Date d'événement (§4 v1.7) — epoch ms. */
  eventDate?: number
}

/** Champs modifiables d'un nœud existant. */
export type NodePatch = Partial<
  Pick<
    BoardNodeData,
    | 'x'
    | 'y'
    | 'width'
    | 'height'
    | 'content'
    | 'title'
    | 'color'
    | 'tags'
    | 'sourceType'
    | 'reliability'
    | 'credibility'
    | 'language'
    | 'eventDate'
  >
>

export type EdgePatch = Partial<
  Pick<
    BoardEdgeData,
    | 'label'
    | 'relationType'
    | 'style'
    | 'direction'
    | 'width'
    | 'pathType'
    | 'color'
    | 'waypoints'
    | 'sourceAnchor'
    | 'targetAnchor'
    | 'status'
  >
>

function transact(handle: BoardHandle, fn: () => void): void {
  handle.doc.transact(fn, handle.localOrigin)
}

/** Crée un champ de fiche vierge. */
export function makeField(label: string, kind: EntityField['kind'], author: string): EntityField {
  return { id: newId(), label, kind, value: '', updatedBy: author, updatedAt: Date.now() }
}

/** Construit les champs initiaux d'une entité à partir de son gabarit (§2). */
export function entityTemplateFields(entityType: EntityType, author: string): EntityField[] {
  return entityFieldTemplate(entityType).map((template) =>
    makeField(t(template.labelKey), template.kind, author)
  )
}

/**
 * Champs initiaux d'une entité, TYPES PERSONNALISÉS INCLUS (§2 v1.8) : pour un id
 * `custom:*`, on lit le gabarit défini dans le document ; sinon on retombe sur le
 * gabarit de taxonomie. Utilisé à la création d'entité pour pré-remplir la fiche.
 */
export function templateFieldsFor(
  handle: BoardHandle,
  entityType: EntityType,
  author: string
): EntityField[] {
  if (entityType.startsWith('custom:')) {
    const raw = getCustomTypesMap(handle.doc).get(entityType) as CustomEntityType | undefined
    const fields = Array.isArray(raw?.fields) ? raw!.fields : []
    return fields
      .filter((field) => typeof field?.label === 'string' && field.label.trim() !== '')
      .map((field) => makeField(field.label, field.kind, author))
  }
  return entityTemplateFields(entityType, author)
}

/** Couleur par défaut d'un type d'entité, TYPES PERSONNALISÉS INCLUS (§2 v1.8). */
function entityDefaultColor(handle: BoardHandle, entityType: EntityType): string {
  if (entityType.startsWith('custom:')) {
    const raw = getCustomTypesMap(handle.doc).get(entityType) as CustomEntityType | undefined
    return colorHex(typeof raw?.color === 'string' ? raw.color : '#8b5cf6')
  }
  return typeColor(entityType)
}

/** Construit les champs initiaux d'une source (§4). */
export function sourceTemplateFields(author: string): EntityField[] {
  return SOURCE_FIELDS.map((template) => {
    const field = makeField(t(template.labelKey), template.kind, author)
    // La date de consultation est pré-remplie à aujourd'hui.
    if (template.labelKey === 'field.consultedAt') field.value = new Date().toISOString().slice(0, 10)
    return field
  })
}

function defaultColor(init: NodeInit): string {
  if (init.color) return colorHex(init.color)
  if (init.kind === 'group') return DEFAULT_GROUP_COLOR
  if (init.kind === 'entity' && init.entityType) return typeColor(init.entityType)
  if (init.kind === 'source') return SOURCE_COLOR
  return DEFAULT_NODE_COLOR
}

/** Crée un nœud et retourne son id. `author` = pseudo de l'utilisateur local. */
export function createNode(handle: BoardHandle, init: NodeInit, author: string): string {
  const id = newId()
  const now = Date.now()
  const size = DEFAULT_SIZES[init.kind]
  const node: BoardNodeData = {
    id,
    kind: init.kind,
    x: init.x,
    y: init.y,
    width: init.width ?? size.width,
    height: init.height ?? size.height,
    content: init.content ?? '',
    title: init.title ?? '',
    color: defaultColor(init),
    tags: init.tags ?? [],
    fields: init.fields ?? [],
    createdBy: author,
    createdAt: now,
    updatedBy: author,
    updatedAt: now
  }
  if (init.kind === 'entity' && init.entityType) node.entityType = init.entityType
  if (init.kind === 'source') {
    node.sourceType = init.sourceType ?? 'other'
    node.reliability = init.reliability ?? ''
    node.credibility = init.credibility ?? ''
  }
  // Bloc de code (§5 v1.6) : langage par défaut « texte brut ».
  if (init.kind === 'code') node.language = init.language ?? 'plaintext'
  // Date d'événement (§4 v1.7) — optionnelle.
  if (init.eventDate !== undefined) node.eventDate = init.eventDate
  transact(handle, () => {
    getNodesMap(handle.doc).set(id, nodeToYMap(node))
  })
  return id
}

/** Crée une entité pré-remplie du gabarit de son type (§3 ; types personnalisés §2 v1.8). */
export function createEntity(
  handle: BoardHandle,
  entityType: EntityType,
  position: { x: number; y: number },
  author: string,
  title = ''
): string {
  return createNode(
    handle,
    {
      kind: 'entity',
      x: position.x,
      y: position.y,
      title,
      entityType,
      color: entityDefaultColor(handle, entityType),
      fields: templateFieldsFor(handle, entityType, author)
    },
    author
  )
}

/** Crée une source pré-remplie (§4). */
export function createSource(
  handle: BoardHandle,
  position: { x: number; y: number },
  author: string
): string {
  return createNode(
    handle,
    {
      kind: 'source',
      x: position.x,
      y: position.y,
      fields: sourceTemplateFields(author)
    },
    author
  )
}

/** Met à jour des champs d'un nœud (fusion champ par champ côté CRDT). */
export function updateNode(
  handle: BoardHandle,
  id: string,
  patch: NodePatch,
  author: string
): void {
  const map = getNodesMap(handle.doc).get(id)
  if (!map) return
  transact(handle, () => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      if (key === 'tags') map.set(key, [...(value as string[])])
      else if (key === 'color') map.set(key, colorHex(value as string))
      else map.set(key, value)
    }
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/**
 * Pose ou EFFACE la date d'événement d'un nœud (§4 v1.7). `updateNode` ne peut pas
 * retirer une clé (il ignore `undefined`) : passer `null` supprime la clé → la
 * Chronologie retombe alors sur la date de création.
 */
export function setEventDate(
  handle: BoardHandle,
  id: string,
  eventDate: number | null,
  author: string
): void {
  const map = getNodesMap(handle.doc).get(id)
  if (!map) return
  transact(handle, () => {
    if (eventDate === null) map.delete('eventDate')
    else map.set('eventDate', eventDate)
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/**
 * Datation d'événement complète (§1 v1.8) : date exacte + fenêtre au plus tôt/tard
 * + drapeau « heure significative », appliquée en UNE transaction. Chaque champ
 * `null` SUPPRIME la clé correspondante (retour à « non renseigné »). Permet de
 * régler tout ou partie de la datation d'un coup (une seule étape d'annulation).
 */
export interface EventTimingPatch {
  exact?: number | null
  earliest?: number | null
  latest?: number | null
  /** Début de durée de/à (§1 v1.8.2). `null` supprime la clé. */
  from?: number | null
  /** Fin de durée de/à (§1 v1.8.2). `null` supprime la clé. */
  to?: number | null
  /** Repères sur une plage (§1 v1.8.3/§1 v1.8.4). Liste = remplace ; `null`/`[]` = supprime. */
  marks?: EventMark[] | null
  hasTime?: boolean
}

export function setEventTiming(
  handle: BoardHandle,
  id: string,
  patch: EventTimingPatch,
  author: string
): void {
  const map = getNodesMap(handle.doc).get(id)
  if (!map) return
  const applyDate = (key: string, value: number | null | undefined): void => {
    if (value === undefined) return
    if (value === null) map.delete(key)
    else map.set(key, value)
  }
  transact(handle, () => {
    applyDate('eventDate', patch.exact)
    applyDate('eventEarliest', patch.earliest)
    applyDate('eventLatest', patch.latest)
    applyDate('eventFrom', patch.from)
    applyDate('eventTo', patch.to)
    if (patch.marks !== undefined) {
      const marks = patch.marks ? sanitizeEventMarks(patch.marks) : []
      if (marks.length > 0) map.set('eventMarks', marks.map((mark) => ({ ...mark })))
      else map.delete('eventMarks')
    }
    if (patch.hasTime !== undefined) {
      if (patch.hasTime) map.set('eventHasTime', true)
      else map.delete('eventHasTime')
    }
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/**
 * §6 v1.9 : fixe (ou EFFACE avec `null`/'') l'icône PROPRE d'un nœud entité — elle
 * prime sur l'icône du type. Comme `setEventDate`, un op dédié est nécessaire car
 * `updateNode` ne sait pas SUPPRIMER une clé (il ignore `undefined`) : effacer =
 * revenir à l'icône par défaut du type.
 */
export function setNodeIcon(handle: BoardHandle, id: string, icon: string | null, author: string): void {
  const map = getNodesMap(handle.doc).get(id)
  if (!map) return
  transact(handle, () => {
    if (icon === null || icon === '') map.delete('icon')
    else map.set('icon', icon)
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

// ——— §2 v1.9 (galerie) : images attachées à une entité ———
// Les OCTETS sont déjà enregistrés dans `files` (via `registerFile`, transactions
// FILE_ORIGIN séparées, bornées) : ces ops n'écrivent que la LISTE de références
// (`images`) via `localOrigin` → annulables, filtrées par rôle à la réception. La liste
// est relue DANS la transaction (état CRDT le plus récent) puis réécrite en entier,
// comme `fields`. La première écriture retire les clés héritées de l'image unique.

/** Galerie courante d'un nœud, relue depuis sa Y.Map (clé `images` ou héritage). */
function readNodeImages(map: Y.Map<unknown>): EntityImage[] {
  return readEntityImages({
    images: map.get('images'),
    imageHash: map.get('imageHash'),
    imageWidth: map.get('imageWidth'),
    imageHeight: map.get('imageHeight')
  })
}

/** Écrit la galerie (clé retirée si vide) et purge les clés de l'image unique héritée. */
function writeNodeImages(map: Y.Map<unknown>, images: EntityImage[], author: string): void {
  if (images.length > 0) map.set('images', cloneEntityImages(images))
  else if (map.has('images')) map.delete('images')
  for (const legacy of ['imageHash', 'imageWidth', 'imageHeight']) {
    if (map.has(legacy)) map.delete(legacy)
  }
  map.set('updatedBy', author)
  map.set('updatedAt', Date.now())
}

/**
 * Ajoute des images (déjà enregistrées dans `files`) en fin de galerie d'une entité.
 * Doublons ignorés, limite MAX_ENTITY_IMAGES respectée. Un seul pas d'annulation.
 * Retourne le bilan (null si le nœud n'existe pas ou n'est pas une entité).
 */
export function addEntityImages(
  handle: BoardHandle,
  id: string,
  additions: EntityImage[],
  author: string
): AppendResult | null {
  const map = getNodesMap(handle.doc).get(id)
  if (!(map instanceof Y.Map) || map.get('kind') !== 'entity') return null
  let result: AppendResult | null = null
  transact(handle, () => {
    const outcome = appendEntityImages(readNodeImages(map), additions)
    result = outcome
    if (outcome.added > 0) writeNodeImages(map, outcome.images, author)
  })
  return result
}

/** Retire / déplace / passe en couverture une image de la galerie d'une entité. */
export function editEntityImages(
  handle: BoardHandle,
  id: string,
  action: EntityImageAction,
  author: string
): void {
  const map = getNodesMap(handle.doc).get(id)
  if (!(map instanceof Y.Map) || map.get('kind') !== 'entity') return
  transact(handle, () => {
    const before = readNodeImages(map)
    const after = applyEntityImageAction(before, action)
    const unchanged =
      after.length === before.length && after.every((image, i) => image.hash === before[i].hash)
    if (!unchanged) writeNodeImages(map, after, author)
  })
}

// ——— Types d'entité personnalisés du tableau (§2 v1.8) ———

/** Génère un id de type personnalisé (préfixe réservé `custom:`). */
export function newCustomTypeId(): string {
  return `custom:${newId()}`
}

/**
 * Crée (ou remplace, même id) un type d'entité personnalisé dans le tableau
 * (§2 v1.8). Synchronisé avec tous les participants et exporté dans le `.trace`.
 * Réservé aux éditeurs/admin (garde de rôle : cible `customTypes`). Retourne l'id.
 */
export function upsertCustomType(
  handle: BoardHandle,
  type: Omit<CustomEntityType, 'createdBy' | 'createdAt'> & { createdBy?: string; createdAt?: number },
  author: string
): string {
  const now = Date.now()
  const record: CustomEntityType = {
    id: type.id,
    name: type.name.slice(0, 60),
    icon: type.icon,
    color: colorHex(type.color),
    fields: type.fields.map((field) => ({ label: field.label.slice(0, 80), kind: field.kind })),
    createdBy: type.createdBy ?? author,
    createdAt: type.createdAt ?? now
  }
  transact(handle, () => {
    getCustomTypesMap(handle.doc).set(record.id, record)
  })
  return record.id
}

/**
 * Supprime un type personnalisé (§2 v1.8). Les entités existantes de ce type ne
 * sont PAS modifiées : elles conservent leur `entityType` et s'affichent en repli
 * neutre (« type personnalisé (supprimé) ») — on ne réécrit jamais des nœuds à
 * l'insu des pairs. Réservé aux éditeurs/admin.
 */
export function deleteCustomType(handle: BoardHandle, id: string): void {
  transact(handle, () => {
    getCustomTypesMap(handle.doc).delete(id)
  })
}

// ——— Personnalisation visuelle des entités (§4 v1.4) ———

/** Applique un correctif de style à un nœud entité/source (fusionné). */
export function setNodeStyle(
  handle: BoardHandle,
  id: string,
  patch: Partial<EntityStyle>,
  author: string
): void {
  const map = getNodesMap(handle.doc).get(id)
  if (!map) return
  const current = yMapToNode(id, map).style ?? {}
  const next = { ...current, ...patch }
  transact(handle, () => {
    map.set('style', { ...next })
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/** Remplace intégralement le style d'un nœud (pipette : appliquer un style copié). */
export function applyNodeStyle(
  handle: BoardHandle,
  id: string,
  style: EntityStyle,
  author: string
): void {
  const map = getNodesMap(handle.doc).get(id)
  if (!map) return
  transact(handle, () => {
    map.set('style', { ...style })
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

// ——— Badges de statut (§3 v1.5) ———

/**
 * Pose (ou retire, si `none`) le badge de statut d'un ou plusieurs nœuds — tous
 * types confondus (entités, nœuds libres). Une transaction unique pour tout le lot.
 */
export function setNodesStatus(
  handle: BoardHandle,
  ids: string[],
  status: ElementStatus,
  author: string
): void {
  if (ids.length === 0) return
  const nodes = getNodesMap(handle.doc)
  transact(handle, () => {
    const now = Date.now()
    for (const id of ids) {
      const map = nodes.get(id)
      if (!map) continue
      if (hasStatusBadge(status)) map.set('status', status)
      else map.delete('status')
      map.set('updatedBy', author)
      map.set('updatedAt', now)
    }
  })
}

/** Pose (ou retire) le badge de statut d'un ou plusieurs liens (§3). */
export function setEdgesStatus(
  handle: BoardHandle,
  ids: string[],
  status: ElementStatus,
  author: string
): void {
  if (ids.length === 0) return
  const edges = getEdgesMap(handle.doc)
  transact(handle, () => {
    const now = Date.now()
    for (const id of ids) {
      const map = edges.get(id)
      if (!map) continue
      if (hasStatusBadge(status)) map.set('status', status)
      else map.delete('status')
      map.set('updatedBy', author)
      map.set('updatedAt', now)
    }
  })
}

/** Réinitialise le style d'un nœud au style par défaut de son type (§4). */
export function resetNodeStyle(handle: BoardHandle, id: string, author: string): void {
  const map = getNodesMap(handle.doc).get(id)
  if (!map) return
  transact(handle, () => {
    map.delete('style')
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

// ——— Champs de fiche entité/source (§3) ———

function readNodeFields(handle: BoardHandle, nodeId: string): EntityField[] | null {
  const map = getNodesMap(handle.doc).get(nodeId)
  if (!map) return null
  const raw = map.get('fields')
  if (!Array.isArray(raw)) return []
  return raw.map(sanitizeField).filter((field): field is EntityField => field !== null)
}

function writeNodeFields(
  handle: BoardHandle,
  nodeId: string,
  fields: EntityField[],
  author: string
): void {
  const map = getNodesMap(handle.doc).get(nodeId)
  if (!map) return
  transact(handle, () => {
    map.set('fields', fields.map((field) => ({ ...field })))
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/** Ajoute un champ personnalisé à une fiche ; retourne son id. */
export function addEntityField(
  handle: BoardHandle,
  nodeId: string,
  label: string,
  kind: EntityField['kind'],
  author: string
): string | null {
  const fields = readNodeFields(handle, nodeId)
  if (!fields) return null
  const field = makeField(label, kind, author)
  writeNodeFields(handle, nodeId, [...fields, field], author)
  return field.id
}

/** Modifie la valeur d'un champ (met à jour son auteur/horodatage propres). */
export function updateEntityFieldValue(
  handle: BoardHandle,
  nodeId: string,
  fieldId: string,
  value: string,
  author: string
): void {
  const fields = readNodeFields(handle, nodeId)
  if (!fields) return
  const now = Date.now()
  writeNodeFields(
    handle,
    nodeId,
    fields.map((field) =>
      field.id === fieldId ? { ...field, value, updatedBy: author, updatedAt: now } : field
    ),
    author
  )
}

/** Renomme le libellé d'un champ. */
export function updateEntityFieldLabel(
  handle: BoardHandle,
  nodeId: string,
  fieldId: string,
  label: string,
  author: string
): void {
  const fields = readNodeFields(handle, nodeId)
  if (!fields) return
  const now = Date.now()
  writeNodeFields(
    handle,
    nodeId,
    fields.map((field) =>
      field.id === fieldId ? { ...field, label, updatedBy: author, updatedAt: now } : field
    ),
    author
  )
}

/** Supprime un champ d'une fiche. */
export function removeEntityField(
  handle: BoardHandle,
  nodeId: string,
  fieldId: string,
  author: string
): void {
  const fields = readNodeFields(handle, nodeId)
  if (!fields) return
  writeNodeFields(
    handle,
    nodeId,
    fields.filter((field) => field.id !== fieldId),
    author
  )
}

/**
 * Ajoute une VALEUR supplémentaire à un champ (§6bis) : insère juste après lui un
 * champ frère de même libellé/type (valeur vide). Permet des valeurs illimitées
 * (téléphones, emails, adresses, alias, profils sociaux…). Retourne le nouvel id.
 */
export function addFieldValue(
  handle: BoardHandle,
  nodeId: string,
  afterFieldId: string,
  author: string
): string | null {
  const fields = readNodeFields(handle, nodeId)
  if (!fields) return null
  const index = fields.findIndex((field) => field.id === afterFieldId)
  if (index === -1) return null
  const source = fields[index]
  const sibling = makeField(source.label, source.kind, author)
  const next = [...fields.slice(0, index + 1), sibling, ...fields.slice(index + 1)]
  writeNodeFields(handle, nodeId, next, author)
  return sibling.id
}

/**
 * Bascule l'affichage d'un champ sur le nœud (§6bis). Au premier basculement, on
 * fige explicitement (`shown`) l'ensemble actuellement visible, puis on inverse
 * le champ ciblé — la transition ne fait donc jamais disparaître les autres.
 */
export function toggleFieldShown(
  handle: BoardHandle,
  nodeId: string,
  fieldId: string,
  author: string
): void {
  const fields = readNodeFields(handle, nodeId)
  if (!fields) return
  const explicit = fields.some((field) => field.shown === true)
  const visible = new Set(visibleNodeFields(fields).map((field) => field.id))
  const next = fields.map((field) => {
    const current = explicit ? field.shown === true : visible.has(field.id)
    return { ...field, shown: field.id === fieldId ? !current : current }
  })
  writeNodeFields(handle, nodeId, next, author)
}

/** Réordonne les champs d'une fiche selon `orderedIds` (§6bis, glisser-déposer). */
export function reorderFields(
  handle: BoardHandle,
  nodeId: string,
  orderedIds: string[],
  author: string
): void {
  const fields = readNodeFields(handle, nodeId)
  if (!fields) return
  const byId = new Map(fields.map((field) => [field.id, field]))
  const reordered: EntityField[] = []
  for (const id of orderedIds) {
    const field = byId.get(id)
    if (field) {
      reordered.push(field)
      byId.delete(id)
    }
  }
  // Champs non cités (course P2P) conservés à la fin, ordre d'origine.
  for (const field of fields) if (byId.has(field.id)) reordered.push(field)
  writeNodeFields(handle, nodeId, reordered, author)
}

/**
 * Convertit une note texte en fiche entité pré-remplie (§3) : le contenu de la
 * note devient le titre (ou un champ « notes »), le type est appliqué.
 */
export function convertNoteToEntity(
  handle: BoardHandle,
  nodeId: string,
  entityType: EntityType,
  author: string
): void {
  const map = getNodesMap(handle.doc).get(nodeId)
  if (!map) return
  const node = yMapToNode(nodeId, map)
  const fields = entityTemplateFields(entityType, author)
  // Le texte existant alimente le premier champ « notes » si présent, sinon le titre.
  const notesField = fields.find((field) => field.label === t('field.notes'))
  const title = node.title || node.content.split('\n')[0].slice(0, 80)
  if (notesField && node.content) notesField.value = node.content
  transact(handle, () => {
    map.set('kind', 'entity')
    map.set('entityType', entityType)
    map.set('title', title)
    map.set('content', '')
    map.set('color', typeColor(entityType))
    map.set('fields', fields.map((field) => ({ ...field })))
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/** Déplacement (éventuellement groupé) de nœuds — pendant et après le drag. */
export function moveNodes(
  handle: BoardHandle,
  moves: Array<{ id: string; x: number; y: number }>,
  author: string
): void {
  if (moves.length === 0) return
  const nodes = getNodesMap(handle.doc)
  transact(handle, () => {
    const now = Date.now()
    for (const move of moves) {
      const map = nodes.get(move.id)
      if (!map) continue
      map.set('x', move.x)
      map.set('y', move.y)
      map.set('updatedBy', author)
      map.set('updatedAt', now)
    }
  })
}

/**
 * Supprime des nœuds avec cascade : les connexions qui les touchent et les
 * commentaires qui leur sont rattachés disparaissent aussi.
 */
export function deleteNodes(handle: BoardHandle, ids: string[]): void {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  const nodes = getNodesMap(handle.doc)
  const edges = getEdgesMap(handle.doc)
  const comments = getCommentsMap(handle.doc)
  transact(handle, () => {
    const edgesToDelete: string[] = []
    edges.forEach((map, edgeId) => {
      if (!(map instanceof Y.Map)) return
      const edge = yMapToEdge(edgeId, map)
      if (idSet.has(edge.source) || idSet.has(edge.target)) edgesToDelete.push(edgeId)
    })
    const commentsToDelete: string[] = []
    comments.forEach((comment, commentId) => {
      if (idSet.has(comment.nodeId)) commentsToDelete.push(commentId)
    })
    for (const edgeId of edgesToDelete) edges.delete(edgeId)
    for (const commentId of commentsToDelete) comments.delete(commentId)
    for (const id of ids) nodes.delete(id)
  })
}

/** Duplique des nœuds (Ctrl+D) avec un léger décalage ; retourne les nouveaux ids. */
export function duplicateNodes(handle: BoardHandle, ids: string[], author: string): string[] {
  const nodes = getNodesMap(handle.doc)
  const created: string[] = []
  transact(handle, () => {
    const now = Date.now()
    for (const id of ids) {
      const map = nodes.get(id)
      if (!map) continue
      const source = yMapToNode(id, map)
      const copy: BoardNodeData = {
        ...source,
        id: newId(),
        x: source.x + 32,
        y: source.y + 32,
        tags: [...source.tags],
        fields: source.fields.map((field) => ({ ...field, id: newId() })),
        createdBy: author,
        createdAt: now,
        updatedBy: author,
        updatedAt: now
      }
      nodes.set(copy.id, nodeToYMap(copy))
      created.push(copy.id)
    }
  })
  return created
}

/**
 * Construit (sans écrire) un nœud entité prêt à insérer : id neuf, taille et couleur
 * par défaut du type, champs = ceux fournis ou le gabarit du type. Réutilisé par
 * l'import CSV (§1) et le collage de texte typé (§2) — bâtir puis écrire en lot via
 * `createGraph` garantit un undo unique.
 */
export function makeEntityNode(
  init: {
    entityType: EntityType
    x: number
    y: number
    title?: string
    fields?: EntityField[]
    tags?: string[]
    eventDate?: number
  },
  author: string
): BoardNodeData {
  const now = Date.now()
  const size = DEFAULT_SIZES.entity
  const node: BoardNodeData = {
    id: newId(),
    kind: 'entity',
    x: init.x,
    y: init.y,
    width: size.width,
    height: size.height,
    content: '',
    title: init.title ?? '',
    color: typeColor(init.entityType),
    tags: init.tags ?? [],
    entityType: init.entityType,
    fields: init.fields ?? entityTemplateFields(init.entityType, author),
    createdBy: author,
    createdAt: now,
    updatedBy: author,
    updatedAt: now
  }
  if (init.eventDate !== undefined) node.eventDate = init.eventDate
  return node
}

/**
 * Écrit un LOT de nœuds et de liens déjà formés dans le document, en UNE seule
 * transaction Yjs (§1 import CSV, §2 collage) → un seul pas d'annulation (Ctrl+Z).
 * Les liens dont une extrémité n'existe pas (ni dans le lot, ni déjà présente) ou en
 * auto-boucle sont ignorés.
 */
export function createGraph(
  handle: BoardHandle,
  nodes: BoardNodeData[],
  edges: BoardEdgeData[]
): void {
  if (nodes.length === 0 && edges.length === 0) return
  const nodesMap = getNodesMap(handle.doc)
  const edgesMap = getEdgesMap(handle.doc)
  transact(handle, () => {
    for (const node of nodes) nodesMap.set(node.id, nodeToYMap(node))
    for (const edge of edges) {
      if (edge.source === edge.target) continue
      if (nodesMap.has(edge.source) && nodesMap.has(edge.target)) {
        edgesMap.set(edge.id, edgeToYMap(edge))
      }
    }
  })
}

export interface EdgeInit {
  source: string
  target: string
  relationType?: string
  label?: string
  style?: BoardEdgeData['style']
  direction?: EdgeDirection
  width?: BoardEdgeData['width']
  pathType?: BoardEdgeData['pathType']
  color?: string
  /** § préréglages v1.9 : badge de statut et ancres (absents = aucun / automatique). */
  status?: BoardEdgeData['status']
  sourceAnchor?: EdgeAnchor
  targetAnchor?: EdgeAnchor
}

/** Crée une connexion entre deux nœuds ; retourne son id (null si invalide). */
export function createEdge(handle: BoardHandle, init: EdgeInit, author: string): string | null {
  const nodes = getNodesMap(handle.doc)
  if (!nodes.has(init.source) || !nodes.has(init.target)) return null
  if (init.source === init.target) return null
  const id = newId()
  const now = Date.now()
  // § préréglages v1.9 : chaque réglage est validé ; une valeur invalide → défaut.
  const valid = sanitizeEdgePatch(init)
  const edge: BoardEdgeData = {
    id,
    source: init.source,
    target: init.target,
    label: valid.label ?? '',
    relationType: valid.relationType ?? '',
    style: valid.style ?? 'solid',
    direction: valid.direction ?? 'single',
    width: valid.width ?? 'normal',
    pathType: valid.pathType ?? 'bezier',
    color: valid.color ? colorHex(valid.color) : DEFAULT_EDGE_COLOR,
    createdBy: author,
    createdAt: now,
    updatedBy: author,
    updatedAt: now
  }
  if (hasStatusBadge(valid.status)) edge.status = valid.status
  if (valid.sourceAnchor) edge.sourceAnchor = valid.sourceAnchor
  if (valid.targetAnchor) edge.targetAnchor = valid.targetAnchor
  transact(handle, () => {
    getEdgesMap(handle.doc).set(id, edgeToYMap(edge))
  })
  return id
}

/** Inverse le sens d'une connexion (§1 : « inverser la direction »). */
export function reverseEdge(handle: BoardHandle, id: string, author: string): void {
  const map = getEdgesMap(handle.doc).get(id)
  if (!map) return
  const source = map.get('source')
  const target = map.get('target')
  if (typeof source !== 'string' || typeof target !== 'string') return
  // §1 v1.6 : le routage est orienté source → cible ; on l'inverse aussi, sinon
  // ancrages et waypoints se retrouveraient sur la mauvaise extrémité / à l'envers.
  const edge = yMapToEdge(id, map)
  transact(handle, () => {
    map.set('source', target)
    map.set('target', source)
    if (edge.sourceAnchor) map.set('targetAnchor', edge.sourceAnchor)
    else map.delete('targetAnchor')
    if (edge.targetAnchor) map.set('sourceAnchor', edge.targetAnchor)
    else map.delete('sourceAnchor')
    if (edge.waypoints && edge.waypoints.length > 0) {
      map.set('waypoints', [...edge.waypoints].reverse().map((point) => ({ x: point.x, y: point.y })))
    }
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/**
 * Relie un nœud à une source : lien automatique de type « source de », en
 * pointillé (§4). Retourne l'id du lien (celui d'un lien identique déjà présent
 * si le nœud est déjà relié à cette source ; null si invalide).
 */
export function linkToSource(
  handle: BoardHandle,
  nodeId: string,
  sourceId: string,
  author: string
): string | null {
  // Déduplication : ne pas empiler deux liens « source de » identiques.
  let existing: string | null = null
  getEdgesMap(handle.doc).forEach((map, edgeId) => {
    if (existing) return
    const edge = yMapToEdge(edgeId, map)
    if (edge.source === sourceId && edge.target === nodeId && edge.relationType === SOURCE_RELATION) {
      existing = edgeId
    }
  })
  if (existing) return existing
  return createEdge(
    handle,
    { source: sourceId, target: nodeId, relationType: SOURCE_RELATION, style: 'dashed' },
    author
  )
}

export function updateEdge(
  handle: BoardHandle,
  id: string,
  patch: EdgePatch,
  author: string
): void {
  const map = getEdgesMap(handle.doc).get(id)
  if (!map) return
  // § préréglages v1.9 : toute valeur invalide (hors énumération, mal typée) est
  // abandonnée ; `status: 'none'` et une ancre `null` suppriment la clé.
  const valid = sanitizeEdgePatch(patch)
  transact(handle, () => {
    for (const [key, value] of Object.entries(valid)) {
      if (value === undefined) continue
      if (key === 'color') map.set(key, colorHex(value as string))
      // Waypoints (§1 v1.6) : liste déjà clonée par la validation.
      else if (key === 'waypoints') map.set(key, value)
      else if (key === 'status') {
        if (hasStatusBadge(value as ElementStatus)) map.set(key, value)
        else map.delete(key)
      } else if (key === 'sourceAnchor' || key === 'targetAnchor') {
        if (value) map.set(key, value)
        else map.delete(key)
      } else map.set(key, value)
    }
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/**
 * Fixe le côté d'ancrage d'une extrémité de lien (§1 v1.6), ou le libère (retour
 * à l'ancrage automatique) avec `anchor = null`.
 */
export function setEdgeAnchor(
  handle: BoardHandle,
  id: string,
  which: 'source' | 'target',
  anchor: EdgeAnchor | null,
  author: string
): void {
  const map = getEdgesMap(handle.doc).get(id)
  if (!map) return
  const key = which === 'source' ? 'sourceAnchor' : 'targetAnchor'
  transact(handle, () => {
    if (anchor) map.set(key, anchor)
    else map.delete(key)
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/**
 * Routage complet d'un lien, appliqué en UNE transaction (§1 v1.7.1, mode
 * « Dessiner le tracé ») : points de passage + côtés d'ancrage des deux
 * extrémités. `null` (ancre) ou liste vide (waypoints) SUPPRIME la clé → retour
 * à l'automatique pour cette partie. Une seule transaction = une seule étape
 * d'annulation : Ctrl+Z restaure l'ancien tracé en entier.
 */
export interface EdgeRoutingPatch {
  waypoints: EdgeWaypoint[]
  sourceAnchor: EdgeAnchor | null
  targetAnchor: EdgeAnchor | null
}

export function setEdgeRouting(
  handle: BoardHandle,
  id: string,
  routing: EdgeRoutingPatch,
  author: string
): void {
  const map = getEdgesMap(handle.doc).get(id)
  if (!map) return
  transact(handle, () => {
    if (routing.waypoints.length > 0) {
      map.set('waypoints', routing.waypoints.map((point) => ({ x: point.x, y: point.y })))
    } else map.delete('waypoints')
    if (routing.sourceAnchor) map.set('sourceAnchor', routing.sourceAnchor)
    else map.delete('sourceAnchor')
    if (routing.targetAnchor) map.set('targetAnchor', routing.targetAnchor)
    else map.delete('targetAnchor')
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

/**
 * Réinitialise le routage manuel d'un lien (§1 v1.6) : efface les points de
 * passage et les ancrages → retour au tracé automatique. On SUPPRIME les clés
 * (updateEdge ignore `undefined`, il ne peut donc pas retirer une clé).
 */
export function resetEdgeRouting(handle: BoardHandle, id: string, author: string): void {
  const map = getEdgesMap(handle.doc).get(id)
  if (!map) return
  transact(handle, () => {
    map.delete('waypoints')
    map.delete('sourceAnchor')
    map.delete('targetAnchor')
    map.set('updatedBy', author)
    map.set('updatedAt', Date.now())
  })
}

// ——— §7 v1.9 : préréglages de lien ———

/**
 * Applique un préréglage de lien à un LOT de liens, en UNE transaction (un seul pas
 * d'annulation Ctrl+Z). N'écrit QUE les réglages DÉFINIS du préréglage
 * (`resolvePresetPatch`) : tout le reste de chaque lien — dont ses points de passage —
 * est conservé. Les valeurs sont re-validées (défense en profondeur : la source est un
 * réglage LOCAL, éventuellement modifié à la main) et n'utilisent que des clés Yjs
 * EXISTANTES (compatibles 1.8.9). `status: 'none'` et une ancre `null` SUPPRIMENT la
 * clé, comme `setEdgesStatus` / `setEdgeAnchor`. Renvoie le nombre de liens modifiés.
 */
export function applyEdgePreset(
  handle: BoardHandle,
  ids: string[],
  preset: LinkPresetDef | LinkPresetProps,
  author: string
): number {
  const patch = resolvePresetPatch(preset)
  if (ids.length === 0 || Object.keys(patch).length === 0) return 0
  const edges = getEdgesMap(handle.doc)
  let count = 0
  transact(handle, () => {
    const now = Date.now()
    // §7 v1.9 — `changed` : un lien déjà conforme n'est ni horodaté ni compté (pas de
    // faux toast « appliqué », pas d'étape d'annulation qui ne défait rien de visible).
    let changed = false
    const put = (map: Y.Map<unknown>, key: string, value: unknown): void => {
      if (map.get(key) !== value) {
        map.set(key, value)
        changed = true
      }
    }
    const drop = (map: Y.Map<unknown>, key: string): void => {
      if (map.has(key)) {
        map.delete(key)
        changed = true
      }
    }
    for (const id of new Set(ids)) {
      const map = edges.get(id)
      if (!map) continue
      changed = false
      if (patch.relationType !== undefined) put(map, 'relationType', patch.relationType)
      if (patch.label !== undefined) put(map, 'label', patch.label)
      if (patch.color !== undefined) put(map, 'color', colorHex(patch.color))
      if (patch.width !== undefined) put(map, 'width', patch.width)
      if (patch.style !== undefined) put(map, 'style', patch.style)
      if (patch.direction !== undefined) put(map, 'direction', patch.direction)
      if (patch.pathType !== undefined) put(map, 'pathType', patch.pathType)
      if (patch.status !== undefined) {
        if (hasStatusBadge(patch.status)) put(map, 'status', patch.status)
        else drop(map, 'status')
      }
      if (patch.sourceAnchor !== undefined) {
        if (patch.sourceAnchor) put(map, 'sourceAnchor', patch.sourceAnchor)
        else drop(map, 'sourceAnchor')
      }
      if (patch.targetAnchor !== undefined) {
        if (patch.targetAnchor) put(map, 'targetAnchor', patch.targetAnchor)
        else drop(map, 'targetAnchor')
      }
      if (!changed) continue
      map.set('updatedBy', author)
      map.set('updatedAt', now)
      count++
    }
  })
  return count
}

export function deleteEdges(handle: BoardHandle, ids: string[]): void {
  if (ids.length === 0) return
  const edges = getEdgesMap(handle.doc)
  transact(handle, () => {
    for (const id of ids) edges.delete(id)
  })
}

/** Ajoute un commentaire au fil d'un nœud (§3). */
export function addComment(
  handle: BoardHandle,
  nodeId: string,
  text: string,
  author: string
): string | null {
  const trimmed = text.trim()
  if (trimmed === '' || !getNodesMap(handle.doc).has(nodeId)) return null
  const comment = { id: newId(), nodeId, author, text: trimmed, createdAt: Date.now() }
  transact(handle, () => {
    getCommentsMap(handle.doc).set(comment.id, comment)
  })
  return comment.id
}

export function deleteComment(handle: BoardHandle, commentId: string): void {
  transact(handle, () => {
    getCommentsMap(handle.doc).delete(commentId)
  })
}

/**
 * Initialise les métadonnées d'un tableau nouvellement créé (§6). `adminId` =
 * userId du créateur, qui devient admin (§6 v1.4). Un tableau naît solo : le
 * mode d'accès sert dès qu'un code est généré.
 */
export function initBoardMeta(
  handle: BoardHandle,
  title: string,
  author: string,
  accessMode: AccessMode,
  adminId = ''
): void {
  const now = Date.now()
  transact(handle, () => {
    const meta = getMetaMap(handle.doc)
    meta.set('title', title)
    meta.set('createdAt', now)
    meta.set('createdBy', author)
    meta.set('accessMode', accessMode)
    meta.set('accessLog', [{ mode: accessMode, by: author, at: now }])
    meta.set('adminId', adminId)
    meta.set('participantLimit', DEFAULT_PARTICIPANT_LIMIT)
    meta.set('shareRevocation', '')
  })
}

/** Renomme le tableau. */
export function setBoardTitle(handle: BoardHandle, title: string): void {
  transact(handle, () => {
    getMetaMap(handle.doc).set('title', title)
  })
}

/** Change le mode d'accès et journalise le changement (§6). Réservé à l'admin. */
export function setAccessMode(handle: BoardHandle, mode: AccessMode, author: string): void {
  const current = readMeta(handle.doc)
  if (current.accessMode === mode) return
  transact(handle, () => {
    const meta = getMetaMap(handle.doc)
    meta.set('accessMode', mode)
    meta.set('accessLog', [...current.accessLog, { mode, by: author, at: Date.now() }])
  })
}

/** Change la limite de participants (2..10), réservé à l'admin (§6). */
export function setParticipantLimit(handle: BoardHandle, limit: number): void {
  transact(handle, () => {
    getMetaMap(handle.doc).set('participantLimit', clampParticipantLimit(limit))
  })
}

/**
 * Attribue un rôle explicite (éditeur/visiteur) à un participant, réservé à
 * l'admin (§6). Le rôle est attaché à l'identité stable (userId), pas au pseudo.
 */
export function setParticipantRole(handle: BoardHandle, userId: string, role: BoardRole): void {
  if (userId === '' || role === 'admin') return
  transact(handle, () => {
    getRolesMap(handle.doc).set(userId, role)
  })
}

/** Exclut un participant : marqué « exclu » → il se déconnecte (§6). À combiner
 * avec la régénération du code pour l'empêcher de revenir (client modifié). */
export function excludeParticipant(handle: BoardHandle, userId: string): void {
  if (userId === '') return
  transact(handle, () => {
    getRolesMap(handle.doc).set(userId, 'excluded')
  })
}

/**
 * Transfère le rôle d'admin à un autre participant (§6). L'ancien admin
 * redevient éditeur (par défaut, plus d'entrée dans la map roles).
 */
export function transferAdmin(handle: BoardHandle, newAdminId: string): void {
  if (newAdminId === '') return
  const previous = readMeta(handle.doc).adminId
  transact(handle, () => {
    getMetaMap(handle.doc).set('adminId', newAdminId)
    const roles = getRolesMap(handle.doc)
    // Le nouvel admin n'a plus besoin d'une entrée explicite ; l'ancien redevient
    // éditeur (défaut) → on retire son entrée s'il en avait une.
    roles.delete(newAdminId)
    if (previous !== '') roles.delete(previous)
  })
}

/**
 * Révoque le partage (§5) : pose un nouveau jeton de révocation. Tous les
 * participants qui l'avaient snapshotté à une autre valeur se déconnectent
 * (comparaison par ÉGALITÉ, robuste aux horloges désynchronisées).
 */
export function revokeShare(handle: BoardHandle, token: string): void {
  transact(handle, () => {
    getMetaMap(handle.doc).set('shareRevocation', token)
  })
}
