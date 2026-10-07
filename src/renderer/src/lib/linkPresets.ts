/**
 * Préréglages de lien (§7 v1.9) : configurations NOMMÉES définies par l'utilisateur
 * (ex. « source principale » = gros trait gris fléché ; « source secondaire » =
 * pointillés fins rouges, relation « source de »). Mémorisés dans les PARAMÈTRES
 * LOCAUX (comme les plateformes personnalisées) : ce sont des raccourcis PERSONNELS.
 *
 * Un préréglage peut capturer CHAQUE réglage réutilisable d'un lien : type de relation
 * (prédéfini OU libre « Autre »), libellé, couleur, épaisseur, style de trait,
 * extrémités (flèches), tracé, badge de statut et côtés d'ancrage. Chaque réglage est
 * soit DÉFINI, soit ABSENT (= « inchangé ») : appliquer un préréglage n'écrit QUE ses
 * réglages définis, le reste du lien est conservé. Les points de passage (waypoints)
 * sont de la géométrie propre à un lien : jamais dans un préréglage.
 *
 * Les valeurs RÉSOLUES sont copiées sur le lien (clés Yjs existantes) — donc visibles
 * des pairs, même en 1.8.9, même s'ils n'ont pas ce préréglage.
 *
 * §7 v1.9 (reprise) : la première version ne gérait que couleur/épaisseur/style, avec
 * `label` = NOM du préréglage à plat. `sanitizeLinkPresets` migre ce format (reconnu à
 * l'absence de `props`) et nettoie tout réglage local malformé (localStorage modifié à
 * la main, version future…) : valeurs hors énumération ignorées, textes bornés, nombre
 * de préréglages plafonné.
 *
 * Module PUR (aucune dépendance React/Yjs) → testable sous Node.
 */
import type {
  BoardEdgeData,
  EdgeAnchor,
  EdgeDirection,
  EdgePathType,
  EdgeStyle,
  EdgeWidth,
  ElementStatus
} from '@/types'
import type { MessageKey } from '@/i18n'
import { DEFAULT_EDGE_COLOR, colorHex, normalizeHex } from '@/lib/colors'
import { STATUS_DEFS } from '@/lib/status'
import { RELATION_TYPES, relationLabelKey } from '@/lib/relations'

// ——— Bornes (réglages locaux : on reste raisonnable) ———

/** Nombre maximal de préréglages mémorisés sur le poste. */
export const LINK_PRESETS_MAX = 50
/** Longueur maximale du NOM d'un préréglage. */
export const LINK_PRESET_NAME_MAX = 60
/** Longueur maximale d'un texte de lien (libellé, relation libre « Autre »). */
export const LINK_PRESET_TEXT_MAX = 120
/** Longueur maximale d'un identifiant de préréglage. */
const LINK_PRESET_ID_MAX = 64

// ——— Valeurs admises (miroir des énumérés de types.ts / sync/model.ts) ———

export const PRESET_STYLES: EdgeStyle[] = ['solid', 'dashed', 'dotted']
export const PRESET_WIDTHS: EdgeWidth[] = ['thin', 'normal', 'thick']
export const PRESET_DIRECTIONS: EdgeDirection[] = ['none', 'single', 'double']
export const PRESET_PATHS: EdgePathType[] = ['bezier', 'straight', 'step']
/** Côté d'ancrage d'un préréglage : un côté fixe, ou `auto` (= retour à l'ancrage
 *  automatique — la clé est alors SUPPRIMÉE du lien). */
export type PresetAnchor = EdgeAnchor | 'auto'
export const PRESET_ANCHORS: PresetAnchor[] = ['auto', 't', 'b', 'l', 'r']
const STATUS_IDS: ElementStatus[] = STATUS_DEFS.map((def) => def.id)

/**
 * Réglages d'un préréglage. Chaque clé est OPTIONNELLE : absente = « inchangé ».
 *  - `relationType` : '' = « Sans type », un id de RELATION_TYPES, ou un texte libre
 *    (choix « Autre… ») ;
 *  - `label` : texte affiché sur le lien ('' = aucun libellé) ;
 *  - `status` : 'none' = retirer le badge ;
 *  - `sourceAnchor`/`targetAnchor` : 'auto' = ancrage automatique.
 */
export interface LinkPresetProps {
  relationType?: string
  label?: string
  color?: string
  width?: EdgeWidth
  style?: EdgeStyle
  direction?: EdgeDirection
  pathType?: EdgePathType
  status?: ElementStatus
  sourceAnchor?: PresetAnchor
  targetAnchor?: PresetAnchor
}

export type LinkPresetProp = keyof LinkPresetProps

/** Ordre canonique des réglages (formulaire, résumé, tests). */
export const LINK_PRESET_PROPS: LinkPresetProp[] = [
  'relationType',
  'label',
  'color',
  'width',
  'style',
  'direction',
  'pathType',
  'status',
  'sourceAnchor',
  'targetAnchor'
]

/** Réglages capturés PAR DÉFAUT quand on enregistre un lien comme préréglage :
 *  l'apparence + la relation. Le libellé (souvent propre à un lien), le statut et les
 *  côtés (liés à la position des nœuds) sont proposés mais décochés. */
export const DEFAULT_CAPTURED_PROPS: LinkPresetProp[] = [
  'relationType',
  'color',
  'width',
  'style',
  'direction',
  'pathType'
]

export interface LinkPresetDef {
  /** Id stable local. */
  id: string
  /** Nom affiché dans les sélecteurs (ex. « Source principale »). */
  name: string
  /** Réglages DÉFINIS du préréglage (les absents restent inchangés à l'application). */
  props: LinkPresetProps
}

/**
 * Modification RÉSOLUE à écrire sur un ou plusieurs liens (voir `applyEdgePreset`
 * dans sync/boardOps). Ne contient QUE les réglages définis du préréglage.
 *  - `status: 'none'` → la clé `status` est supprimée (plus de badge) ;
 *  - ancre `null` → la clé est supprimée (ancrage automatique).
 */
export interface LinkPresetPatch {
  relationType?: string
  label?: string
  color?: string
  width?: EdgeWidth
  style?: EdgeStyle
  direction?: EdgeDirection
  pathType?: EdgePathType
  status?: ElementStatus
  sourceAnchor?: EdgeAnchor | null
  targetAnchor?: EdgeAnchor | null
}

// ——— Nettoyage ———

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

/**
 * Texte d'une ligne : caractères de contrôle retirés (retours à la ligne compris),
 * espaces de bord retirés, longueur bornée SANS couper une paire de substitution
 * (émoji). `undefined` si la valeur n'est pas une chaîne.
 */
export function cleanPresetText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length > max ? chars.slice(0, max).join('').trim() : flat
}

/** Nettoie les réglages d'un préréglage : toute valeur invalide devient « inchangé ». */
export function sanitizeLinkPresetProps(raw: unknown): LinkPresetProps {
  const props: LinkPresetProps = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return props
  const record = raw as Record<string, unknown>
  const relationType = cleanPresetText(record.relationType, LINK_PRESET_TEXT_MAX)
  if (relationType !== undefined) props.relationType = relationType
  const label = cleanPresetText(record.label, LINK_PRESET_TEXT_MAX)
  if (label !== undefined) props.label = label
  const color = normalizeHex(record.color)
  if (color) props.color = color
  const width = oneOf(record.width, PRESET_WIDTHS)
  if (width) props.width = width
  const style = oneOf(record.style, PRESET_STYLES)
  if (style) props.style = style
  const direction = oneOf(record.direction, PRESET_DIRECTIONS)
  if (direction) props.direction = direction
  const pathType = oneOf(record.pathType, PRESET_PATHS)
  if (pathType) props.pathType = pathType
  const status = oneOf(record.status, STATUS_IDS)
  if (status) props.status = status
  const sourceAnchor = oneOf(record.sourceAnchor, PRESET_ANCHORS)
  if (sourceAnchor) props.sourceAnchor = sourceAnchor
  const targetAnchor = oneOf(record.targetAnchor, PRESET_ANCHORS)
  if (targetAnchor) props.targetAnchor = targetAnchor
  return props
}

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (id === '' || id.length > LINK_PRESET_ID_MAX || !/^[\w-]+$/.test(id)) return null
  return id
}

/**
 * Nettoie UN préréglage. Deux formats reconnus :
 *  - actuel : `{ id, name, props: {...} }` ;
 *  - hérité (première 1.9.0) : `{ id, label, color, width, style }` à plat, où `label`
 *    était le NOM du préréglage (reconnu à l'absence de `props`).
 * `null` si l'entrée est inexploitable (pas un objet, nom vide) ou ne définit AUCUN
 * réglage valide (donnée locale corrompue : l'éditeur interdit ce cas, et un tel
 * préréglage apparaîtrait dans chaque liste sans rien faire).
 */
export function sanitizeLinkPreset(raw: unknown, fallbackId: string): LinkPresetDef | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const legacy = !('props' in record)
  const name = cleanPresetText(legacy ? (record.name ?? record.label) : record.name, LINK_PRESET_NAME_MAX)
  if (!name) return null
  let props: LinkPresetProps
  if (legacy) {
    // Format hérité : seuls couleur/épaisseur/style existaient (le `label` à plat est
    // le NOM, surtout pas le libellé du lien).
    props = sanitizeLinkPresetProps({ color: record.color, width: record.width, style: record.style })
  } else {
    props = sanitizeLinkPresetProps(record.props)
  }
  if (isPresetEmpty(props)) return null
  return { id: cleanId(record.id) ?? fallbackId, name, props }
}

/**
 * Nettoie la liste des préréglages lue des paramètres locaux : entrées malformées
 * ignorées, ids dédoublonnés, nombre plafonné à `LINK_PRESETS_MAX`. Ne jette jamais.
 */
export function sanitizeLinkPresets(raw: unknown): LinkPresetDef[] {
  if (!Array.isArray(raw)) return []
  const out: LinkPresetDef[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length && out.length < LINK_PRESETS_MAX; i++) {
    const preset = sanitizeLinkPreset(raw[i], `lp-${i}`)
    if (!preset) continue
    let id = preset.id
    for (let n = 2; seen.has(id); n++) id = `${preset.id}-${n}`
    seen.add(id)
    out.push(id === preset.id ? preset : { ...preset, id })
  }
  return out
}

// ——— Application ———

/** true si le préréglage ne définit aucun réglage (il ne changerait rien). */
export function isPresetEmpty(props: LinkPresetProps): boolean {
  return LINK_PRESET_PROPS.every((key) => props[key] === undefined)
}

/**
 * Modification résolue d'un préréglage : UNIQUEMENT ses réglages définis (re-validés),
 * `auto` → `null` pour les ancres. Un objet vide = rien à écrire.
 */
export function resolvePresetPatch(preset: LinkPresetDef | LinkPresetProps): LinkPresetPatch {
  const props = sanitizeLinkPresetProps('props' in preset && typeof preset.props === 'object' ? preset.props : preset)
  const patch: LinkPresetPatch = {}
  if (props.relationType !== undefined) patch.relationType = props.relationType
  if (props.label !== undefined) patch.label = props.label
  if (props.color !== undefined) patch.color = props.color
  if (props.width !== undefined) patch.width = props.width
  if (props.style !== undefined) patch.style = props.style
  if (props.direction !== undefined) patch.direction = props.direction
  if (props.pathType !== undefined) patch.pathType = props.pathType
  if (props.status !== undefined) patch.status = props.status
  if (props.sourceAnchor !== undefined) {
    patch.sourceAnchor = props.sourceAnchor === 'auto' ? null : props.sourceAnchor
  }
  if (props.targetAnchor !== undefined) {
    patch.targetAnchor = props.targetAnchor === 'auto' ? null : props.targetAnchor
  }
  return patch
}

/** Lien tel qu'il apparaîtrait APRÈS application du patch (aperçu, tests). Pur. */
export function applyPatchToEdge<E extends BoardEdgeData>(edge: E, patch: LinkPresetPatch): E {
  const next: E = { ...edge }
  if (patch.relationType !== undefined) next.relationType = patch.relationType
  if (patch.label !== undefined) next.label = patch.label
  if (patch.color !== undefined) next.color = patch.color
  if (patch.width !== undefined) next.width = patch.width
  if (patch.style !== undefined) next.style = patch.style
  if (patch.direction !== undefined) next.direction = patch.direction
  if (patch.pathType !== undefined) next.pathType = patch.pathType
  if (patch.status !== undefined) {
    if (patch.status === 'none') delete next.status
    else next.status = patch.status
  }
  if (patch.sourceAnchor !== undefined) {
    if (patch.sourceAnchor === null) delete next.sourceAnchor
    else next.sourceAnchor = patch.sourceAnchor
  }
  if (patch.targetAnchor !== undefined) {
    if (patch.targetAnchor === null) delete next.targetAnchor
    else next.targetAnchor = patch.targetAnchor
  }
  return next
}

// ——— Validation des écritures directes sur un lien (§ préréglages v1.9) ———

/** Longueur max. d'un libellé / type de relation saisi sur un lien (hors préréglage). */
export const EDGE_TEXT_MAX = 500
/** Nombre max. de points de passage d'un lien. */
export const EDGE_WAYPOINTS_MAX = 200

/** Texte de lien : chaîne bornée (SANS rognage : la saisie en cours garde ses espaces). */
function cleanEdgeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const chars = Array.from(value)
  return chars.length > EDGE_TEXT_MAX ? chars.slice(0, EDGE_TEXT_MAX).join('') : value
}

/** Modification validée d'un lien (`updateEdge`) : seules les clés valides survivent. */
export interface EdgeFieldsPatch extends LinkPresetPatch {
  waypoints?: { x: number; y: number }[]
}

/**
 * Valide une modification de lien venue de l'interface (ou d'un appel quelconque) :
 * toute valeur hors énumération / mal typée est ABANDONNÉE (la clé reste inchangée).
 * `status: 'none'` et une ancre `null`/`'auto'` signifient « supprimer la clé ».
 * Clés inconnues ignorées. Pur.
 */
export function sanitizeEdgePatch(raw: unknown): EdgeFieldsPatch {
  const patch: EdgeFieldsPatch = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return patch
  const record = raw as Record<string, unknown>
  const relationType = cleanEdgeText(record.relationType)
  if (relationType !== undefined) patch.relationType = relationType
  const label = cleanEdgeText(record.label)
  if (label !== undefined) patch.label = label
  const color = normalizeHex(record.color)
  if (color) patch.color = color
  const width = oneOf(record.width, PRESET_WIDTHS)
  if (width) patch.width = width
  const style = oneOf(record.style, PRESET_STYLES)
  if (style) patch.style = style
  const direction = oneOf(record.direction, PRESET_DIRECTIONS)
  if (direction) patch.direction = direction
  const pathType = oneOf(record.pathType, PRESET_PATHS)
  if (pathType) patch.pathType = pathType
  const status = oneOf(record.status, STATUS_IDS)
  if (status) patch.status = status
  for (const key of ['sourceAnchor', 'targetAnchor'] as const) {
    if (record[key] === null) patch[key] = null
    else {
      const anchor = oneOf(record[key], PRESET_ANCHORS)
      if (anchor) patch[key] = anchor === 'auto' ? null : anchor
    }
  }
  if (Array.isArray(record.waypoints)) {
    const points: { x: number; y: number }[] = []
    for (const point of record.waypoints.slice(0, EDGE_WAYPOINTS_MAX)) {
      if (typeof point !== 'object' || point === null) continue
      const { x, y } = point as Record<string, unknown>
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        points.push({ x, y })
      }
    }
    patch.waypoints = points
  }
  return patch
}

// ——— Capture depuis un lien existant (« Enregistrer comme préréglage ») ———

/** Valeur COMPLÈTE de chaque réglage (formulaire : un réglage décoché garde sa valeur). */
export type LinkPresetValues = Required<LinkPresetProps>

/** Valeurs par défaut d'un lien neuf — miroir de `createEdge` (sync/boardOps). */
export const DEFAULT_PRESET_VALUES: LinkPresetValues = {
  relationType: '',
  label: '',
  color: DEFAULT_EDGE_COLOR,
  width: 'normal',
  style: 'solid',
  direction: 'single',
  pathType: 'bezier',
  status: 'none',
  sourceAnchor: 'auto',
  targetAnchor: 'auto'
}

/** Valeurs actuelles d'un lien, sous forme de réglages de préréglage. */
export function edgePresetValues(edge: BoardEdgeData): LinkPresetValues {
  return sanitizeValues({
    relationType: edge.relationType,
    label: edge.label,
    // Couleur telle qu'AFFICHÉE (un ancien nom v1 « red »… est traduit en hex, comme
    // dans CosintEdge) — sinon elle retomberait sur le gris par défaut.
    color: colorHex(edge.color),
    width: edge.width,
    style: edge.style,
    direction: edge.direction,
    pathType: edge.pathType,
    status: edge.status ?? 'none',
    sourceAnchor: edge.sourceAnchor ?? 'auto',
    targetAnchor: edge.targetAnchor ?? 'auto'
  })
}

/** Complète des réglages partiels avec des valeurs de repli (défaut : lien neuf). */
export function sanitizeValues(
  raw: Partial<LinkPresetProps>,
  base: LinkPresetValues = DEFAULT_PRESET_VALUES
): LinkPresetValues {
  return { ...base, ...sanitizeLinkPresetProps(raw) }
}

/** Ne garde que les réglages `include` parmi des valeurs complètes. */
export function pickPresetProps(
  values: LinkPresetValues,
  include: Iterable<LinkPresetProp>
): LinkPresetProps {
  const picked: Record<string, unknown> = {}
  for (const key of include) picked[key] = values[key]
  return sanitizeLinkPresetProps(picked)
}

/** Réglages capturés sur un lien (par défaut : `DEFAULT_CAPTURED_PROPS`). */
export function captureEdgePreset(
  edge: BoardEdgeData,
  include: Iterable<LinkPresetProp> = DEFAULT_CAPTURED_PROPS
): LinkPresetProps {
  return pickPresetProps(edgePresetValues(edge), include)
}

// ——— Type de relation : prédéfini / sans type / « Autre » (texte libre) ———

export type RelationChoice =
  | { kind: 'none' }
  | { kind: 'known'; id: string }
  | { kind: 'other'; text: string }

/** Classe une valeur `relationType` pour le sélecteur (liste + « Autre… » libre). */
export function relationChoice(relationType: string): RelationChoice {
  const value = relationType.trim()
  if (value === '') return { kind: 'none' }
  if (RELATION_TYPES.some((relation) => relation.id === value)) return { kind: 'known', id: value }
  return { kind: 'other', text: value }
}

/**
 * Texte affiché sur le lien pour ces réglages — miroir de CosintEdge : le libellé
 * libre prime, sinon le type de relation (clé i18n si prédéfini, texte brut si libre).
 * `null` si rien ne s'affiche.
 */
export function presetDisplayText(
  values: Pick<LinkPresetProps, 'label' | 'relationType'>
): { text: string } | { key: MessageKey } | null {
  const label = (values.label ?? '').trim()
  if (label !== '') return { text: label }
  const relation = (values.relationType ?? '').trim()
  if (relation === '') return null
  const key = relationLabelKey(relation)
  return key ? { key } : { text: relation }
}

// ——— Opérations sur la liste (gestionnaire) — toutes PURES et bornées ———

/** Ajoute (en fin de liste) ou remplace EN PLACE un préréglage de même id. Liste
 *  pleine : un NOUVEAU préréglage est refusé (liste renvoyée inchangée). */
export function upsertLinkPreset(list: LinkPresetDef[], preset: LinkPresetDef): LinkPresetDef[] {
  const index = list.findIndex((item) => item.id === preset.id)
  if (index >= 0) return list.map((item, i) => (i === index ? preset : item))
  if (list.length >= LINK_PRESETS_MAX) return list
  return [...list, preset]
}

export function removeLinkPresetFrom(list: LinkPresetDef[], id: string): LinkPresetDef[] {
  return list.filter((item) => item.id !== id)
}

/** Déplace un préréglage de `delta` rangs (bornes respectées). */
export function moveLinkPreset(list: LinkPresetDef[], id: string, delta: number): LinkPresetDef[] {
  const from = list.findIndex((item) => item.id === id)
  if (from < 0) return list
  const to = Math.max(0, Math.min(list.length - 1, from + delta))
  if (to === from) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Duplique un préréglage juste après l'original (nouvel id, nom fourni). */
export function duplicateLinkPreset(
  list: LinkPresetDef[],
  id: string,
  newId: string,
  name: string
): LinkPresetDef[] {
  const index = list.findIndex((item) => item.id === id)
  if (index < 0 || list.length >= LINK_PRESETS_MAX) return list
  const copy: LinkPresetDef = {
    id: newId,
    name: cleanPresetText(name, LINK_PRESET_NAME_MAX) || list[index].name,
    props: { ...list[index].props }
  }
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]
}

// ——— Aperçu (partagé avec CosintEdge) ———

/**
 * Chaîne `stroke-dasharray` d'un style de trait — DOIT rester identique à
 * `CosintEdge` (tirets « 8 5 », pointillés « 1.5 5 »).
 */
export function edgeDashArray(style: EdgeStyle): string | undefined {
  return style === 'dashed' ? '8 5' : style === 'dotted' ? '1.5 5' : undefined
}

/** Largeur (px) d'un style de trait — miroir de `WIDTH_PX` de CosintEdge. */
export function edgeWidthPx(width: EdgeWidth): number {
  return width === 'thin' ? 1.25 : width === 'thick' ? 3.5 : 1.75
}

/**
 * Tracé SVG d'aperçu entre deux points selon le type de tracé (courbe / droite /
 * coudé) — version simplifiée de `buildEdgePath`, pour les vignettes.
 */
export function previewPath(
  pathType: EdgePathType,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  if (pathType === 'straight') return `M ${x1} ${y1} L ${x2} ${y2}`
  const mid = (x1 + x2) / 2
  if (pathType === 'step') return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}
