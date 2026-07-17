/**
 * Catalogue des fiches structurées (§3 entités, §4 sources).
 *
 * Chaque gabarit d'entité liste ses champs dans l'ordre de priorité : le nœud
 * affiche le titre + les premiers champs non vides ; le reste va dans le panneau
 * « Détails ». Les libellés passent par i18n (clés `field.*`, `entityType.*`).
 * Ce module reste sans dépendance React : l'icône est un identifiant résolu par
 * le composant (registre lucide).
 */
import type { BoardEdgeData, BoardNodeData, EntityField, FieldKind } from '@/types'
import type { MessageKey } from '@/i18n'

/**
 * Champs à afficher sur le nœud du canvas (§6bis v1.4). Si l'utilisateur a
 * explicitement choisi des champs (au moins un `shown` défini), on affiche
 * exactement les `shown === true`, dans l'ordre du tableau (réordonnable). Sinon,
 * par défaut on affiche TOUS les champs renseignés (aucune limite) — le nœud
 * grandit en hauteur pour tout montrer ; l'œil permet ensuite d'en masquer.
 */
export function visibleNodeFields(fields: EntityField[]): EntityField[] {
  const explicit = fields.some((field) => field.shown !== undefined)
  if (explicit) return fields.filter((field) => field.shown === true)
  return fields.filter((field) => field.value.trim() !== '')
}

export interface FieldTemplate {
  /** Clé i18n du libellé. */
  labelKey: MessageKey
  kind: FieldKind
}

const F = (labelKey: MessageKey, kind: FieldKind): FieldTemplate => ({ labelKey, kind })

/**
 * Gabarits de champs RICHES, hérités de la v1.1 et re-clés vers les identifiants
 * de la taxonomie v1.2 (§2). Ces types conservent leur fiche détaillée ; les
 * ~80 autres types utilisent le gabarit par défaut (valeur principale = titre +
 * un champ notes + champs personnalisés).
 */
export const RICH_FIELD_TEMPLATES: Record<string, FieldTemplate[]> = {
  person: [
    F('field.alias', 'text'),
    F('field.photo', 'url'),
    F('field.dob', 'date'),
    F('field.nationality', 'country'),
    F('field.phone', 'phone'),
    F('field.email', 'email'),
    F('field.address', 'text'),
    F('field.social', 'social'),
    F('field.profession', 'text'),
    F('field.employer', 'text'),
    F('field.notes', 'longtext')
  ],
  company: [
    F('field.acronym', 'text'),
    F('field.registration', 'text'),
    F('field.country', 'country'),
    F('field.address', 'text'),
    F('field.website', 'url'),
    F('field.phone', 'phone'),
    F('field.email', 'email'),
    F('field.directors', 'text'),
    F('field.sector', 'text'),
    F('field.notes', 'longtext')
  ],
  // §2 v1.8.1 — modules propres aux entités : sélecteurs riches + « Autre ».
  bank: [
    F('field.bankName', 'bank'),
    F('field.accountHolder', 'text'),
    F('field.iban', 'text'),
    F('field.bic', 'text'),
    F('field.country', 'country'),
    F('field.notes', 'longtext')
  ],
  bank_account: [
    F('field.bankName', 'bank'),
    F('field.iban', 'text'),
    F('field.bic', 'text'),
    F('field.accountHolder', 'text'),
    F('field.notes', 'longtext')
  ],
  brand: [
    F('field.brandName', 'brand'),
    F('field.parentCompany', 'text'),
    F('field.website', 'url'),
    F('field.sector', 'text'),
    F('field.notes', 'longtext')
  ],
  credit_card: [
    F('field.cardNetwork', 'card'),
    F('field.cardNumber', 'text'),
    F('field.cardHolder', 'text'),
    F('field.cardExpiry', 'text'),
    F('field.bankName', 'bank'),
    F('field.notes', 'longtext')
  ],
  wallet: [
    F('field.crypto', 'crypto'),
    F('field.walletAddress', 'text'),
    F('field.chain', 'text'),
    F('field.walletType', 'text'),
    F('field.notes', 'longtext')
  ],
  crypto_transaction: [
    F('field.crypto', 'crypto'),
    F('field.txHash', 'text'),
    F('field.fromAddress', 'text'),
    F('field.toAddress', 'text'),
    F('field.amount', 'text'),
    F('field.notes', 'longtext')
  ],
  crypto_fees: [
    F('field.crypto', 'crypto'),
    F('field.amount', 'text'),
    F('field.notes', 'longtext')
  ],
  mixer: [
    F('field.crypto', 'crypto'),
    F('field.mixerName', 'text'),
    F('field.notes', 'longtext')
  ],
  hash: [
    F('field.hashAlgo', 'hash_algo'),
    F('field.hashValue', 'text'),
    F('field.notes', 'longtext')
  ],
  domain_name: [
    F('field.url', 'url'),
    F('field.registrar', 'text'),
    F('field.creationDate', 'date'),
    F('field.ip', 'text'),
    F('field.technologies', 'text'),
    F('field.notes', 'longtext')
  ],
  phone_number: [
    F('field.number', 'phone'),
    F('field.country', 'country'),
    F('field.operator', 'operator'),
    F('field.phoneType', 'text'),
    F('field.notes', 'longtext')
  ],
  email_address: [
    F('field.emailAddress', 'email'),
    F('field.provider', 'text'),
    F('field.leaks', 'longtext'),
    F('field.notes', 'longtext')
  ],
  address: [
    F('field.fullAddress', 'longtext'),
    F('field.city', 'text'),
    F('field.country', 'country'),
    F('field.gps', 'text'),
    F('field.addressType', 'text'),
    F('field.notes', 'longtext')
  ],
  account_profile: [
    F('field.platform', 'text'),
    F('field.handle', 'text'),
    F('field.url', 'social'),
    F('field.displayName', 'text'),
    F('field.notes', 'longtext')
  ],
  ground_vehicle: [
    F('field.plate', 'text'),
    F('field.makeModel', 'text'),
    F('field.vehicleColor', 'text'),
    F('field.country', 'text'),
    F('field.notes', 'longtext')
  ],
  // §1 v1.8 : l'entité « Événement » date un FAIT (sa datation précise/fenêtre se
  // règle dans le panneau, section dédiée) ; ses champs situent le fait.
  event: [
    F('field.eventPlace', 'text'),
    F('field.eventParticipants', 'text'),
    F('field.notes', 'longtext')
  ]
}

/** Gabarit par défaut d'un type sans fiche riche : valeur principale (= titre) + notes. */
export const DEFAULT_FIELD_TEMPLATE: FieldTemplate[] = [F('field.notes', 'longtext')]

/** Gabarit de champs d'un type d'entité : riche si disponible, défaut sinon (§2). */
export function entityFieldTemplate(typeId: string): FieldTemplate[] {
  return RICH_FIELD_TEMPLATES[typeId] ?? DEFAULT_FIELD_TEMPLATE
}

// ——— Sources (§4) ———

export const SOURCE_COLOR = '#10b981'

/** Types de source proposés (clé i18n `sourceType.*`). */
export const SOURCE_TYPES = [
  'website',
  'article',
  'social',
  'document',
  'database',
  'human',
  'other'
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

/** Champs d'une fiche source (au-delà du titre + URL + fiabilité). */
export const SOURCE_FIELDS: FieldTemplate[] = [
  F('field.consultedAt', 'date'),
  F('field.description', 'longtext')
]

/**
 * Échelle Amirauté simplifiée (§4) — fiabilité de la source (A–F).
 * Libellés affichés au survol.
 */
export const RELIABILITY_SCALE: { code: string; labelKey: MessageKey }[] = [
  { code: 'A', labelKey: 'reliability.A' },
  { code: 'B', labelKey: 'reliability.B' },
  { code: 'C', labelKey: 'reliability.C' },
  { code: 'D', labelKey: 'reliability.D' },
  { code: 'E', labelKey: 'reliability.E' },
  { code: 'F', labelKey: 'reliability.F' }
]

/** Crédibilité de l'information (1–6). */
export const CREDIBILITY_SCALE: { code: string; labelKey: MessageKey }[] = [
  { code: '1', labelKey: 'credibility.1' },
  { code: '2', labelKey: 'credibility.2' },
  { code: '3', labelKey: 'credibility.3' },
  { code: '4', labelKey: 'credibility.4' },
  { code: '5', labelKey: 'credibility.5' },
  { code: '6', labelKey: 'credibility.6' }
]

/**
 * Type de relation automatiquement porté par un lien vers une source (§4).
 * Valeur = l'id de la relation « source de » dans RELATION_TYPES (lib/relations.ts),
 * pour qu'un lien créé automatiquement et un lien typé à la main via le panneau
 * Détails soient STRICTEMENT identiques (compteur de sources et rapport cohérents).
 */
export const SOURCE_RELATION = 'source'

/**
 * Résout les éléments rattachés à chaque source (§4), robuste à l'orientation du
 * lien (la source est l'extrémité de type « source », quel que soit le sens) et
 * dédoublonné (deux liens identiques issus d'une concurrence P2P comptent une
 * fois). Retourne, par id de source, la liste des ids d'éléments rattachés.
 * Utilisé à la fois par le compteur du panneau Sources et par le rapport Markdown.
 */
export function resolveSourceAttachments(
  nodes: BoardNodeData[],
  edges: BoardEdgeData[]
): Map<string, string[]> {
  const kindById = new Map(nodes.map((node) => [node.id, node.kind]))
  const result = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (edge.relationType !== SOURCE_RELATION) continue
    let sourceId: string | null = null
    let itemId: string | null = null
    if (kindById.get(edge.source) === 'source') {
      sourceId = edge.source
      itemId = edge.target
    } else if (kindById.get(edge.target) === 'source') {
      sourceId = edge.target
      itemId = edge.source
    }
    if (!sourceId || !itemId) continue
    // Ignore un lien pendant vers un nœud disparu (course P2P) : sinon le compteur
    // et le rapport divergeraient (le rapport n'affiche que les nœuds existants).
    if (!kindById.has(itemId)) continue
    const set = result.get(sourceId) ?? new Set<string>()
    set.add(itemId)
    result.set(sourceId, set)
  }
  return new Map([...result].map(([id, set]) => [id, [...set]]))
}
