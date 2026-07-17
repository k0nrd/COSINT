/**
 * Presse-papiers du canvas (§2 v1.7) : sérialisation/désérialisation d'une SÉLECTION
 * (nœuds + liens entre nœuds copiés + data-URL des images référencées) dans un format
 * texte portable, et remappage au collage (nouveaux ids, décalage, nouvel auteur).
 *
 * Le format est distinct du `.trace` (pas de meta ni de commentaires) : c'est un
 * fragment de graphe autoportant. On réutilise les assainisseurs défensifs de
 * lib/serialization pour valider un fragment collé (qui peut venir de l'extérieur).
 */
import type { BoardEdgeData, BoardNodeData } from '@/types'
import { newId } from '@/lib/id'
import { sanitizeEdge, sanitizeNode } from '@/lib/serialization'

export const CLIP_FORMAT = 'cosint-clip'
export const CLIP_VERSION = 1

/** Data-URL d'une image référencée par un nœud copié (portabilité inter-tableaux). */
export interface ClipFile {
  hash: string
  dataUrl: string
}

export interface ClipData {
  format: typeof CLIP_FORMAT
  version: number
  /** Identifiant unique de l'opération de copie (rapprochement presse-papiers ↔
   *  copie interne pleine fidélité, cf. BoardView). */
  nonce: string
  nodes: BoardNodeData[]
  edges: BoardEdgeData[]
  files: ClipFile[]
}

/** Construit un fragment de presse-papiers depuis une sélection. */
export function buildClip(
  nodes: BoardNodeData[],
  edges: BoardEdgeData[],
  files: ClipFile[],
  nonce: string
): ClipData {
  return { format: CLIP_FORMAT, version: CLIP_VERSION, nonce, nodes, edges, files }
}

/** Sérialise un fragment en JSON (contenu du presse-papiers). */
export function serializeClip(clip: ClipData): string {
  return JSON.stringify(clip)
}

/** Assainit une liste de fichiers de presse-papiers. */
function sanitizeFiles(raw: unknown): ClipFile[] {
  if (!Array.isArray(raw)) return []
  const files: ClipFile[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    if (
      typeof record.hash === 'string' &&
      record.hash !== '' &&
      typeof record.dataUrl === 'string' &&
      record.dataUrl.startsWith('data:image/')
    ) {
      files.push({ hash: record.hash, dataUrl: record.dataUrl })
    }
  }
  return files
}

/**
 * Analyse un texte de presse-papiers. Retourne `null` si ce n'est pas un fragment
 * COSINT valide (texte externe quelconque → géré autrement par l'appelant). Les
 * nœuds/liens individuellement corrompus sont ignorés (collage au mieux). Les liens
 * dont une extrémité n'est pas dans la sélection sont écartés.
 */
export function parseClip(text: string): ClipData | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (record.format !== CLIP_FORMAT) return null
  if (!Array.isArray(record.nodes)) return null
  const nodes = (record.nodes as unknown[])
    .map(sanitizeNode)
    .filter((node): node is BoardNodeData => node !== null)
  if (nodes.length === 0) return null
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = (Array.isArray(record.edges) ? (record.edges as unknown[]) : [])
    .map((edge) => sanitizeEdge(edge, nodeIds))
    .filter((edge): edge is BoardEdgeData => edge !== null)
  return {
    format: CLIP_FORMAT,
    version: typeof record.version === 'number' ? record.version : CLIP_VERSION,
    nonce: typeof record.nonce === 'string' ? record.nonce : '',
    nodes,
    edges,
    files: sanitizeFiles(record.files)
  }
}

/** Boîte englobante (coin haut-gauche) d'un ensemble de nœuds. */
export function clipBounds(nodes: BoardNodeData[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

/**
 * Recrée un fragment prêt à insérer : nouveaux ids (nœuds ET champs), positions
 * décalées de (dx, dy), waypoints translatés du même offset, liens remappés vers les
 * nouveaux ids (ceux dont une extrémité manque sont écartés), auteur/horodatage
 * remis à l'auteur local. Ne mute pas le fragment source.
 */
export function remapClip(
  clip: Pick<ClipData, 'nodes' | 'edges'>,
  offset: { dx: number; dy: number },
  author: string,
  now: number
): { nodes: BoardNodeData[]; edges: BoardEdgeData[] } {
  const idMap = new Map<string, string>()
  const nodes: BoardNodeData[] = clip.nodes.map((node) => {
    const id = newId()
    idMap.set(node.id, id)
    return {
      ...node,
      id,
      x: node.x + offset.dx,
      y: node.y + offset.dy,
      tags: [...node.tags],
      fields: node.fields.map((field) => ({ ...field, id: newId() })),
      style: node.style ? { ...node.style } : undefined,
      createdBy: author,
      createdAt: now,
      updatedBy: author,
      updatedAt: now
    }
  })
  const edges: BoardEdgeData[] = []
  for (const edge of clip.edges) {
    const source = idMap.get(edge.source)
    const target = idMap.get(edge.target)
    if (!source || !target) continue
    edges.push({
      ...edge,
      id: newId(),
      source,
      target,
      waypoints: edge.waypoints?.map((point) => ({ x: point.x + offset.dx, y: point.y + offset.dy })),
      createdBy: author,
      createdAt: now,
      updatedBy: author,
      updatedAt: now
    })
  }
  return { nodes, edges }
}

/** Nature détectée d'un texte collé depuis l'extérieur (§2). */
export type PastedTextKind =
  | { kind: 'link'; value: string }
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'text'; value: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i
const PHONE_RE = /^[+(]?[\d][\d\s().-]{6,}$/
/** Exclusions : une IPv4 ou une date ISO ne sont pas des téléphones. */
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/

/**
 * Devine le type d'un texte collé : e-mail / téléphone → entité typée ; URL → nœud
 * lien ; sinon note texte. La détection porte sur le texte trimé d'une seule ligne
 * (un texte multi-lignes reste une note).
 */
export function detectPastedText(text: string): PastedTextKind {
  const trimmed = text.trim()
  const singleLine = !/[\r\n]/.test(trimmed)
  if (singleLine && trimmed !== '') {
    if (EMAIL_RE.test(trimmed)) return { kind: 'email', value: trimmed }
    if (URL_RE.test(trimmed)) return { kind: 'link', value: trimmed }
    // Téléphone : au moins 7 chiffres au total, mais NI une IPv4 NI une date ISO
    // (« 192.168.1.1 », « 2024-01-15 » ne sont pas des numéros).
    if (
      PHONE_RE.test(trimmed) &&
      !IPV4_RE.test(trimmed) &&
      !ISO_DATE_RE.test(trimmed) &&
      trimmed.replace(/\D/g, '').length >= 7
    ) {
      return { kind: 'phone', value: trimmed }
    }
  }
  return { kind: 'text', value: text }
}
