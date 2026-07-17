/**
 * Génération de schéma à partir d'un CSV (§1 v1.7) — pur, testable.
 *
 * Rôle : à partir des colonnes d'un CSV, DEVINER le type d'entité et le type de champ
 * de chaque colonne (heuristiques sur le nom d'en-tête et le contenu), construire une
 * entité par ligne, créer les liens (colonnes source/cible ou valeurs clés partagées),
 * et disposer le tout LISIBLEMENT (grille aérée ou graphe force-directed léger).
 *
 * Heuristiques de nom de colonne (insensibles aux accents/casse) :
 *   email / mail / courriel                     → champ email,   entité « email_address »
 *   phone / tel / téléphone / mobile / portable → champ phone,   entité « phone_number »
 *   url / site / web / lien / http / domaine    → champ url,     entité « website »/« domain_name »
 *   nom / name / prénom / fullname              → champ text,    entité « person »
 *   société / company / entreprise / org        → champ text,    entité « company »
 *   ip / adresse ip                             → champ text,    entité « ip »
 *   adresse / address / rue / ville / pays       → champ text,    entité « address »
 *   pseudo / username / login / handle / alias  → champ text,    entité « username »
 *   date / créé / événement                     → champ date
 *   sinon                                        → champ text,    entité déterminée par la ligne
 * Le CONTENU affine : une valeur avec « @ » ⇒ email ; une suite de chiffres au format
 * tel ⇒ téléphone ; « http » ⇒ url. Type indéterminé ⇒ « generic_other » (repli).
 */
import type { BoardEdgeData, BoardNodeData, FieldKind } from '@/types'
import { newId } from '@/lib/id'
import { fold } from '@/lib/search'
import { typeColor, isValidEntityType, normalizeEntityType } from '@/lib/taxonomy'
import { RELATION_TYPES, relationLabelKey } from '@/lib/relations'
import { t } from '@/i18n'
import type { CsvDelimiter, ParsedCsv } from '@/lib/csv'

/** Taille par défaut d'une entité (miroir de DEFAULT_SIZES.entity de boardOps). */
const ENTITY_W = 260
const ENTITY_H = 190

/** Cible d'une colonne à l'import. */
export type ColumnTarget = 'field' | 'title' | 'type' | 'ignore' | 'source' | 'target' | 'relation' | 'label'

export interface ColumnPlan {
  index: number
  header: string
  target: ColumnTarget
  fieldKind: FieldKind
  /** Type d'entité suggéré par la colonne (person, email_address, …), si applicable. */
  entityHint?: string
}

interface HeaderRule {
  keywords: string[]
  fieldKind: FieldKind
  entityHint?: string
}

/** Règles de nom d'en-tête → type de champ + type d'entité. Premier match retenu. */
const HEADER_RULES: HeaderRule[] = [
  { keywords: ['email', 'mail', 'courriel', 'e-mail', 'emailaddress'], fieldKind: 'email', entityHint: 'email_address' },
  { keywords: ['telephone', 'tel', 'phone', 'mobile', 'portable', 'gsm', 'numero', 'fax'], fieldKind: 'phone', entityHint: 'phone_number' },
  { keywords: ['domaine', 'domain', 'hostname'], fieldKind: 'url', entityHint: 'domain_name' },
  { keywords: ['url', 'site', 'website', 'web', 'lien', 'http', 'link'], fieldKind: 'url', entityHint: 'website' },
  { keywords: ['ip', 'ipv4', 'ipv6', 'adresseip'], fieldKind: 'text', entityHint: 'ip' },
  { keywords: ['adresse', 'address', 'rue', 'ville', 'city', 'pays', 'country', 'localisation', 'location'], fieldKind: 'text', entityHint: 'address' },
  { keywords: ['societe', 'company', 'entreprise', 'organisation', 'organization', 'org', 'employeur', 'employer'], fieldKind: 'text', entityHint: 'company' },
  { keywords: ['pseudo', 'username', 'login', 'handle', 'alias', 'compte', 'account'], fieldKind: 'text', entityHint: 'username' },
  { keywords: ['prenom', 'firstname', 'nom', 'name', 'fullname', 'nomcomplet', 'personne', 'person', 'contact', 'auteur', 'author'], fieldKind: 'text', entityHint: 'person' },
  { keywords: ['date', 'cree', 'created', 'evenement', 'event', 'dateevenement', 'jour', 'quand'], fieldKind: 'date' }
]

/** Colonnes de liaison (edge-list) reconnues par leur nom. */
const SOURCE_KEYS = ['source', 'from', 'de', 'expediteur', 'src']
const TARGET_KEYS = ['target', 'cible', 'to', 'vers', 'destinataire', 'dst', 'liea', 'lieavec', 'linkedto']
const RELATION_KEYS = ['relation', 'type', 'typedelien', 'lien', 'role', 'rel']
const LABEL_KEYS = ['label', 'libelle', 'titre', 'title', 'nom', 'name']
const TYPE_KEYS = ['type', 'entitytype', 'typeentite', 'categorie', 'category']

/** Priorité des types d'entité pour choisir le type d'une ligne (fort → faible). */
const TYPE_PRIORITY = ['person', 'company', 'email_address', 'phone_number', 'domain_name', 'website', 'ip', 'address', 'username']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const URL_RE = /^(https?:\/\/|www\.)\S+/i
const PHONE_RE = /^[+(]?\d[\d\s().-]{6,}$/

/** Classe le contenu d'une cellule (affine la détection par en-tête). */
function classifyValue(value: string): { fieldKind: FieldKind; entityHint?: string } | null {
  const v = value.trim()
  if (v === '') return null
  if (EMAIL_RE.test(v)) return { fieldKind: 'email', entityHint: 'email_address' }
  if (URL_RE.test(v)) return { fieldKind: 'url', entityHint: 'website' }
  if (PHONE_RE.test(v) && v.replace(/\D/g, '').length >= 7) return { fieldKind: 'phone', entityHint: 'phone_number' }
  return null
}

/** Décompose un en-tête en forme pliée compacte + jetons (mots). */
function headerTokens(header: string): { folded: string; tokens: string[] } {
  const foldedRaw = fold(header)
  const tokens = foldedRaw.split(/[^a-z0-9]+/).filter((token) => token !== '')
  return { folded: foldedRaw.replace(/[\s_-]/g, ''), tokens }
}

/**
 * Une clé COURTE (≤ 3 lettres : 'de', 'to', 'ip', 'tel', 'rel', 'src'…) ne correspond
 * que si elle est un MOT entier de l'en-tête — sinon 'description'/'total'/'zip' se
 * feraient piéger par sous-chaîne. Une clé LONGUE correspond par sous-chaîne ou mot.
 */
function matchKeys(folded: string, tokens: string[], keys: string[]): boolean {
  return keys.some((key) =>
    key.length <= 3 ? tokens.includes(key) : folded.includes(key) || tokens.includes(key)
  )
}

/**
 * Classe une colonne à partir de son en-tête et d'un échantillon de valeurs.
 * Retourne le type de champ, un éventuel type d'entité suggéré et un rôle de liaison.
 */
export function classifyColumn(header: string, sampleValues: string[]): {
  fieldKind: FieldKind
  entityHint?: string
  role?: 'source' | 'target' | 'relation' | 'label' | 'type'
} {
  const { folded, tokens } = headerTokens(header)
  // Rôles de liaison / type (repérés par le nom d'en-tête).
  if (matchKeys(folded, tokens, TYPE_KEYS) && folded !== 'typedelien') return { fieldKind: 'text', role: 'type' }
  if (matchKeys(folded, tokens, SOURCE_KEYS)) return { fieldKind: 'text', role: 'source' }
  if (matchKeys(folded, tokens, TARGET_KEYS)) return { fieldKind: 'text', role: 'target' }
  if (matchKeys(folded, tokens, RELATION_KEYS)) return { fieldKind: 'text', role: 'relation' }
  // Type de champ par nom d'en-tête.
  for (const rule of HEADER_RULES) {
    if (matchKeys(folded, tokens, rule.keywords)) {
      return { fieldKind: rule.fieldKind, entityHint: rule.entityHint }
    }
  }
  // Repli sur le contenu (échantillon des premières valeurs non vides).
  for (const value of sampleValues) {
    const byValue = classifyValue(value)
    if (byValue) return byValue
  }
  return { fieldKind: 'text' }
}

export interface ImportMapping {
  hasHeader: boolean
  delimiter: CsvDelimiter
  columns: ColumnPlan[]
  /** Détermination du type d'entité. */
  typeMode: 'single' | 'column' | 'auto'
  singleType: string
  typeColumn: number | null
  /** Liaison edge-list (chaque ligne = un lien). */
  sourceColumn: number | null
  targetColumn: number | null
  relationColumn: number | null
  labelColumn: number | null
  /** Liaison par valeur clé partagée (entity-list). */
  linkSharedValues: boolean
  sharedKeyColumns: number[]
  layout: 'grid' | 'graph'
}

/** Nom d'affichage d'une colonne (en-tête réel ou « Colonne n »). */
export function columnLabel(header: string[] | null, index: number): string {
  const name = header?.[index]?.trim()
  return name && name !== '' ? name : `${t('csv.column')} ${index + 1}`
}

/** Échantillonne les premières valeurs non vides d'une colonne (détection de type). */
function sampleColumn(rows: string[][], index: number, limit = 20): string[] {
  const out: string[] = []
  for (const row of rows) {
    const value = row[index]
    if (value && value.trim() !== '') out.push(value)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Construit une proposition de mapping automatique à partir d'un CSV analysé :
 * classe chaque colonne, repère les colonnes de type/liaison, choisit une colonne de
 * titre, et bascule en mode « edge-list » si des colonnes source ET cible existent.
 */
export function inferMapping(parsed: ParsedCsv): ImportMapping {
  const width = parsed.header?.length ?? parsed.rows.reduce((max, row) => Math.max(max, row.length), 0)
  const columns: ColumnPlan[] = []
  let typeColumn: number | null = null
  let sourceColumn: number | null = null
  let targetColumn: number | null = null
  let relationColumn: number | null = null
  let labelColumn: number | null = null

  for (let i = 0; i < width; i += 1) {
    const header = columnLabel(parsed.header, i)
    const info = classifyColumn(parsed.header?.[i] ?? '', sampleColumn(parsed.rows, i))
    if (info.role === 'type' && typeColumn === null) typeColumn = i
    if (info.role === 'source' && sourceColumn === null) sourceColumn = i
    if (info.role === 'target' && targetColumn === null) targetColumn = i
    if (info.role === 'relation' && relationColumn === null) relationColumn = i
    columns.push({
      index: i,
      header,
      target: 'field',
      fieldKind: info.fieldKind,
      entityHint: info.entityHint
    })
  }

  const isEdgeList = sourceColumn !== null && targetColumn !== null
  // En liste de liens, une colonne « type » sert de RELATION (format `from,to,type`
  // de Gephi/NetworkX) : sinon toutes les relations retomberaient sur « associated ».
  if (isEdgeList && relationColumn === null && typeColumn !== null) {
    relationColumn = typeColumn
    typeColumn = null
  }
  // Colonne de titre : « titre »/« nom » explicite, sinon 1re colonne « person ».
  let titleColumn: number | null = null
  for (let i = 0; i < width && titleColumn === null; i += 1) {
    if (i === sourceColumn || i === targetColumn || i === typeColumn || i === relationColumn) continue
    const { folded, tokens } = headerTokens(parsed.header?.[i] ?? '')
    if (matchKeys(folded, tokens, LABEL_KEYS)) titleColumn = i
  }
  if (titleColumn === null) {
    const person = columns.find((c) => c.entityHint === 'person' && c.index !== sourceColumn && c.index !== targetColumn)
    if (person) titleColumn = person.index
  }
  // En liste de liens, une colonne « label »/« libellé » (hors source/cible/relation)
  // nomme le lien (§1b : aller-retour fidèle des labels de liens).
  if (isEdgeList) {
    for (let i = 0; i < width && labelColumn === null; i += 1) {
      if (i === sourceColumn || i === targetColumn || i === relationColumn) continue
      const { folded, tokens } = headerTokens(parsed.header?.[i] ?? '')
      if (matchKeys(folded, tokens, ['label', 'libelle', 'titre', 'title'])) labelColumn = i
    }
  }

  // Étiquette les colonnes selon leur rôle.
  for (const column of columns) {
    if (isEdgeList) {
      if (column.index === sourceColumn) column.target = 'source'
      else if (column.index === targetColumn) column.target = 'target'
      else if (column.index === relationColumn) column.target = 'relation'
      else if (column.index === labelColumn) column.target = 'label'
      else column.target = 'field'
    } else {
      if (column.index === typeColumn) column.target = 'type'
      else if (column.index === titleColumn) column.target = 'title'
      else column.target = 'field'
    }
  }

  return {
    hasHeader: parsed.hasHeader,
    delimiter: parsed.delimiter,
    columns,
    typeMode: typeColumn !== null ? 'column' : 'auto',
    singleType: 'generic_other',
    typeColumn,
    sourceColumn: isEdgeList ? sourceColumn : null,
    targetColumn: isEdgeList ? targetColumn : null,
    relationColumn: isEdgeList ? relationColumn : null,
    labelColumn,
    linkSharedValues: false,
    sharedKeyColumns: [],
    layout: isEdgeList ? 'graph' : 'grid'
  }
}

/** Map « libellé de relation plié » → id de relation (pour reconnaître un type FR). */
function relationIdByLabel(): Map<string, string> {
  const map = new Map<string, string>()
  for (const relation of RELATION_TYPES) map.set(fold(t(relation.labelKey)), relation.id)
  return map
}

/** Résout un type de relation depuis une valeur CSV (id connu, libellé FR, ou brut). */
function resolveRelation(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (relationLabelKey(trimmed) !== null) return trimmed // déjà un id connu
  const byLabel = relationIdByLabel().get(fold(trimmed))
  return byLabel ?? trimmed // sinon relation personnalisée (texte libre)
}

/** Résout un type d'entité depuis une valeur (id de taxonomie valide, sinon repli). */
function resolveEntityType(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return 'generic_other'
  if (isValidEntityType(trimmed)) return trimmed
  return normalizeEntityType(trimmed)
}

/** Choisit le type d'une ligne en mode « auto » (priorité person > company > …). */
function guessRowType(mapping: ImportMapping, row: string[]): string {
  let best: string | null = null
  let bestRank = Infinity
  for (const column of mapping.columns) {
    if (column.target !== 'field' && column.target !== 'title') continue
    const hint = column.entityHint
    if (!hint) continue
    const value = (row[column.index] ?? '').trim()
    if (value === '') continue
    const rank = TYPE_PRIORITY.indexOf(hint)
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank
      best = hint
    }
  }
  return best ?? 'generic_other'
}

function makeCsvField(label: string, kind: FieldKind, value: string, author: string, now: number): BoardNodeData['fields'][number] {
  return { id: newId(), label, kind, value, updatedBy: author, updatedAt: now }
}

function makeEntity(entityType: string, title: string, fields: BoardNodeData['fields'], author: string, now: number): BoardNodeData {
  return {
    id: newId(),
    kind: 'entity',
    x: 0,
    y: 0,
    width: ENTITY_W,
    height: ENTITY_H,
    content: '',
    title,
    color: typeColor(entityType),
    tags: [],
    entityType,
    fields,
    createdBy: author,
    createdAt: now,
    updatedBy: author,
    updatedAt: now
  }
}

function makeCsvEdge(source: string, target: string, relationType: string, label: string, author: string, now: number): BoardEdgeData {
  return {
    id: newId(),
    source,
    target,
    label,
    relationType,
    style: 'solid',
    direction: 'single',
    width: 'normal',
    pathType: 'bezier',
    color: '#8a94a6',
    createdBy: author,
    createdAt: now,
    updatedBy: author,
    updatedAt: now
  }
}

export interface BuildResult {
  nodes: BoardNodeData[]
  edges: BoardEdgeData[]
}

/**
 * Construit le graphe (entités + liens) à partir des lignes et du mapping. Les champs
 * multi-valeurs (cellule contenant des valeurs séparées par `;`) deviennent plusieurs
 * champs frères. La disposition finale est appliquée par `layoutGraph`.
 */
export function buildGraph(
  parsed: ParsedCsv,
  mapping: ImportMapping,
  author: string,
  origin: { x: number; y: number } = { x: 0, y: 0 },
  now: number = Date.now()
): BuildResult {
  const nodes: BoardNodeData[] = []
  const edges: BoardEdgeData[] = []

  if (mapping.sourceColumn !== null && mapping.targetColumn !== null) {
    // ——— Mode « liste de liens » : chaque ligne relie deux entités nommées. ———
    const byValue = new Map<string, string>() // valeur pliée → id de nœud
    const ensureEntity = (rawValue: string): string | null => {
      const value = rawValue.trim()
      if (value === '') return null
      const key = fold(value)
      const existing = byValue.get(key)
      if (existing) return existing
      const node = makeEntity('generic_other', value, [], author, now)
      byValue.set(key, node.id)
      nodes.push(node)
      return node.id
    }
    for (const row of parsed.rows) {
      const source = ensureEntity(row[mapping.sourceColumn] ?? '')
      const target = ensureEntity(row[mapping.targetColumn] ?? '')
      if (!source || !target || source === target) continue
      const relation =
        mapping.relationColumn !== null ? resolveRelation(row[mapping.relationColumn] ?? '') : 'associated'
      const label = mapping.labelColumn !== null ? (row[mapping.labelColumn] ?? '').trim() : ''
      edges.push(makeCsvEdge(source, target, relation === '' ? 'associated' : relation, label, author, now))
    }
  } else {
    // ——— Mode « liste d'entités » : une entité par ligne. ———
    const rowNodes: Array<BoardNodeData | null> = []
    for (const row of parsed.rows) {
      // Ignore les lignes entièrement vides (ex. « ,, ») → pas d'entité fantôme.
      if (row.every((cell) => (cell ?? '').trim() === '')) {
        rowNodes.push(null)
        continue
      }
      const entityType =
        mapping.typeMode === 'single'
          ? resolveEntityType(mapping.singleType)
          : mapping.typeMode === 'column' && mapping.typeColumn !== null
            ? resolveEntityType(row[mapping.typeColumn] ?? '')
            : guessRowType(mapping, row)
      const fields: BoardNodeData['fields'] = []
      let title = ''
      for (const column of mapping.columns) {
        const raw = (row[column.index] ?? '').trim()
        if (column.target === 'title') {
          if (raw !== '') title = raw
          continue
        }
        if (column.target !== 'field') continue
        if (raw === '') continue
        // Valeurs multiples séparées par « ; » → champs frères de même libellé/type.
        for (const piece of raw.split(';').map((p) => p.trim()).filter((p) => p !== '')) {
          fields.push(makeCsvField(column.header, column.fieldKind, piece, author, now))
        }
      }
      // Titre de repli : première valeur de champ renseignée.
      if (title === '' && fields.length > 0) title = fields[0].value
      const node = makeEntity(entityType, title, fields, author, now)
      rowNodes.push(node)
      nodes.push(node)
    }

    // Liens par valeur clé partagée (option) : étoile depuis la 1re entité du groupe.
    if (mapping.linkSharedValues && mapping.sharedKeyColumns.length > 0) {
      for (const keyIndex of mapping.sharedKeyColumns) {
        const groups = new Map<string, string[]>()
        parsed.rows.forEach((row, rowIndex) => {
          const rowNode = rowNodes[rowIndex]
          if (!rowNode) return
          const value = fold((row[keyIndex] ?? '').trim())
          if (value === '') return
          const list = groups.get(value) ?? []
          list.push(rowNode.id)
          groups.set(value, list)
        })
        const label = columnLabel(parsed.header, keyIndex)
        for (const ids of groups.values()) {
          if (ids.length < 2) continue
          for (let i = 1; i < ids.length; i += 1) {
            edges.push(makeCsvEdge(ids[0], ids[i], 'associated', label, author, now))
          }
        }
      }
    }
  }

  layoutGraph(nodes, edges, mapping.layout, origin)
  return { nodes, edges }
}

/** Dispose les nœuds : grille aérée ou graphe force-directed léger. */
export function layoutGraph(
  nodes: BoardNodeData[],
  edges: BoardEdgeData[],
  layout: 'grid' | 'graph',
  origin: { x: number; y: number }
): void {
  if (nodes.length === 0) return
  gridLayout(nodes, origin)
  if (layout === 'graph' && nodes.length > 1) forceLayout(nodes, edges, origin)
}

/** Grille aérée : colonnes ≈ √n, espacement confortable. */
function gridLayout(nodes: BoardNodeData[], origin: { x: number; y: number }): void {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const cellW = ENTITY_W + 90
  const cellH = ENTITY_H + 80
  nodes.forEach((node, i) => {
    node.x = origin.x + (i % cols) * cellW
    node.y = origin.y + Math.floor(i / cols) * cellH
  })
}

/**
 * Force-directed léger et DÉTERMINISTE (aucune aléa) : à partir de la grille, quelques
 * itérations de répulsion entre nœuds + attraction le long des liens. Suffisant pour
 * dénouer un petit graphe sans chevauchement, sans dépendance externe.
 */
function forceLayout(nodes: BoardNodeData[], edges: BoardEdgeData[], origin: { x: number; y: number }): void {
  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const pos = nodes.map((node) => ({ x: node.x, y: node.y }))
  const ITER = 120
  const REPULSION = 260 * 260 * 12
  const SPRING = 0.02
  const REST = ENTITY_W + 120
  for (let step = 0; step < ITER; step += 1) {
    const disp = pos.map(() => ({ x: 0, y: 0 }))
    // Répulsion entre toutes les paires.
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = i + 1; j < pos.length; j += 1) {
        let dx = pos[i].x - pos[j].x
        let dy = pos[i].y - pos[j].y
        let distSq = dx * dx + dy * dy
        if (distSq < 1) {
          dx = (i - j) || 1
          dy = 1
          distSq = 2
        }
        const force = REPULSION / distSq
        const dist = Math.sqrt(distSq)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        disp[i].x += fx
        disp[i].y += fy
        disp[j].x -= fx
        disp[j].y -= fy
      }
    }
    // Attraction le long des liens.
    for (const edge of edges) {
      const a = index.get(edge.source)
      const b = index.get(edge.target)
      if (a === undefined || b === undefined) continue
      const dx = pos[b].x - pos[a].x
      const dy = pos[b].y - pos[a].y
      const dist = Math.hypot(dx, dy) || 1
      const force = SPRING * (dist - REST)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      disp[a].x += fx
      disp[a].y += fy
      disp[b].x -= fx
      disp[b].y -= fy
    }
    const damping = 0.85
    for (let i = 0; i < pos.length; i += 1) {
      const len = Math.hypot(disp[i].x, disp[i].y) || 1
      const cap = Math.min(len, 40) // limite le pas par itération
      pos[i].x += (disp[i].x / len) * cap * damping
      pos[i].y += (disp[i].y / len) * cap * damping
    }
  }
  // Recadre au voisinage de l'origine (coin haut-gauche = origin).
  let minX = Infinity
  let minY = Infinity
  for (const p of pos) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
  }
  nodes.forEach((node, i) => {
    node.x = pos[i].x - minX + origin.x
    node.y = pos[i].y - minY + origin.y
  })
}
