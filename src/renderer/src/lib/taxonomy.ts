/**
 * Taxonomie des types d'entité (§2 v1.2), organisée par catégories façon
 * OSINTracker. Chaque type est une simple étiquette de catégorisation de données
 * (icône + libellé + champs texte) — aucun contenu opérationnel.
 *
 * `id` = identifiant interne anglais (stable, stocké dans le document) ;
 * le libellé affiché vient de i18n (`entityType.<id>`), la catégorie de
 * `category.<cat>`. L'icône est un nom résolu par components/nodes/entityIcons.
 */
import type { MessageKey } from '@/i18n'

export type CategoryId =
  | 'business'
  | 'crypto'
  | 'forensics'
  | 'generic'
  | 'group'
  | 'internet'
  | 'location'
  | 'hardware'

export interface TaxonomyCategory {
  id: CategoryId
  nameKey: MessageKey
  /** Couleur d'accent de la catégorie (lisible sur fond sombre). */
  color: string
}

export interface TaxonomyType {
  id: string
  category: CategoryId
  /** Nom d'icône (résolu par le registre EntityIcon). */
  icon: string
  /**
   * true si le type conserve une fiche riche héritée de la v1.1 (gabarit de
   * champs détaillé). Les autres types utilisent la structure par défaut
   * (valeur principale = titre + champ notes + champs personnalisés).
   */
  rich?: boolean
}

export const TAXONOMY_CATEGORIES: TaxonomyCategory[] = [
  { id: 'business', nameKey: 'category.business', color: '#6366f1' },
  { id: 'crypto', nameKey: 'category.crypto', color: '#f59e0b' },
  { id: 'forensics', nameKey: 'category.forensics', color: '#14b8a6' },
  { id: 'generic', nameKey: 'category.generic', color: '#3b82f6' },
  { id: 'group', nameKey: 'category.group', color: '#a855f7' },
  { id: 'internet', nameKey: 'category.internet', color: '#06b6d4' },
  { id: 'location', nameKey: 'category.location', color: '#ec4899' },
  { id: 'hardware', nameKey: 'category.hardware', color: '#ef4444' }
]

const T = (id: string, category: CategoryId, icon: string, rich?: boolean): TaxonomyType => ({
  id,
  category,
  icon,
  ...(rich ? { rich: true } : {})
})

/** Liste ordonnée de tous les types (l'ordre pilote l'affichage du sélecteur). */
export const TAXONOMY_TYPES: TaxonomyType[] = [
  // ——— Business ———
  T('bank', 'business', 'Landmark'),
  T('bank_account', 'business', 'Banknote'),
  T('brand', 'business', 'Tag'),
  T('credit_card', 'business', 'CreditCard'),
  T('finance', 'business', 'TrendingUp'),
  T('logo', 'business', 'Shapes'),
  T('patent', 'business', 'ScrollText'),
  T('property_record', 'business', 'FileText'),
  T('trade', 'business', 'ArrowLeftRight'),
  T('transaction', 'business', 'ArrowRightLeft'),
  T('business_other', 'business', 'Circle'),

  // ——— Cryptomonnaie ———
  T('crypto_fees', 'crypto', 'Coins'),
  T('mixer', 'crypto', 'Shuffle'),
  T('crypto_transaction', 'crypto', 'ArrowRightLeft'),
  T('wallet', 'crypto', 'Wallet'),
  T('crypto_other', 'crypto', 'Circle'),

  // ——— Forensique ———
  T('apk', 'forensics', 'Package'),
  T('audio', 'forensics', 'FileAudio'),
  T('exe', 'forensics', 'FileCode'),
  T('file', 'forensics', 'File'),
  T('hash', 'forensics', 'Hash'),
  T('image', 'forensics', 'Image'),
  T('imei', 'forensics', 'Smartphone'),
  T('imsi', 'forensics', 'Nfc'),
  T('mac_address', 'forensics', 'Network'),
  T('text_file', 'forensics', 'FileText'),
  T('video', 'forensics', 'Video'),
  T('forensic_other', 'forensics', 'Circle'),

  // ——— Générique ———
  T('alias', 'generic', 'Drama'),
  T('animal', 'generic', 'PawPrint'),
  T('company', 'generic', 'Building2', true),
  T('ctf_flag', 'generic', 'Flag'),
  T('email_address', 'generic', 'Mail', true),
  T('event', 'generic', 'Calendar', true),
  T('institution', 'generic', 'Landmark'),
  T('password', 'generic', 'KeyRound'),
  T('person', 'generic', 'User', true),
  T('phone_number', 'generic', 'Phone', true),
  T('public_record', 'generic', 'ScrollText'),
  T('text_message', 'generic', 'MessageSquare'),
  T('unique_identifier', 'generic', 'Fingerprint'),
  T('user_id', 'generic', 'Contact'),
  T('username', 'generic', 'AtSign'),
  T('generic_other', 'generic', 'Circle'),

  // ——— Groupe ———
  T('association', 'group', 'Users'),
  T('criminal', 'group', 'UserX'),
  T('military_unit', 'group', 'Shield'),
  T('ngo', 'group', 'HeartHandshake'),
  T('political', 'group', 'Vote'),
  T('religious', 'group', 'Church'),
  T('terrorist', 'group', 'TriangleAlert'),
  T('group_other', 'group', 'Circle'),

  // ——— Internet ———
  T('account_profile', 'internet', 'UserCircle', true),
  T('archive', 'internet', 'Archive'),
  T('backlink', 'internet', 'Link2'),
  T('certificate', 'internet', 'ShieldCheck'),
  T('dns', 'internet', 'Server'),
  T('domain_name', 'internet', 'Globe', true),
  T('favicon', 'internet', 'Image'),
  T('ip', 'internet', 'Network'),
  T('page_content', 'internet', 'FileText'),
  T('registrar', 'internet', 'Building'),
  T('source_code', 'internet', 'Code'),
  T('tracking_code', 'internet', 'Activity'),
  T('url', 'internet', 'Link'),
  T('website', 'internet', 'AppWindow'),
  T('internet_other', 'internet', 'Circle'),

  // ——— Localisation ———
  T('address', 'location', 'MapPin', true),
  T('city', 'location', 'MapPinned'),
  T('country', 'location', 'Map'),
  T('gps_coordinates', 'location', 'LocateFixed'),
  T('location', 'location', 'MapPinHouse'),
  T('satellite_imagery', 'location', 'Satellite'),
  T('location_other', 'location', 'Circle'),

  // ——— Matériel ———
  T('aircraft', 'hardware', 'Plane'),
  T('ammunition', 'hardware', 'Package'),
  T('camera', 'hardware', 'Camera'),
  T('device', 'hardware', 'Cpu'),
  T('document', 'hardware', 'FileText'),
  T('drone', 'hardware', 'PlaneTakeoff'),
  T('explosive', 'hardware', 'Bomb'),
  T('ground_vehicle', 'hardware', 'Car', true),
  T('heavy_weapon', 'hardware', 'Target'),
  T('light_weapon', 'hardware', 'Crosshair'),
  T('telecom', 'hardware', 'RadioTower'),
  T('train', 'hardware', 'TramFront'),
  T('hardware_other', 'hardware', 'Circle')
]

const TYPE_BY_ID = new Map(TAXONOMY_TYPES.map((type) => [type.id, type]))
const CATEGORY_BY_ID = new Map(TAXONOMY_CATEGORIES.map((cat) => [cat.id, cat]))

export function isValidEntityType(id: unknown): id is string {
  return typeof id === 'string' && TYPE_BY_ID.has(id)
}

export function taxonomyType(id: string): TaxonomyType | undefined {
  return TYPE_BY_ID.get(id)
}

export function taxonomyCategory(id: CategoryId): TaxonomyCategory | undefined {
  return CATEGORY_BY_ID.get(id)
}

/** Couleur d'accent par défaut d'un type (celle de sa catégorie). */
export function typeColor(id: string): string {
  const type = TYPE_BY_ID.get(id)
  const cat = type ? CATEGORY_BY_ID.get(type.category) : undefined
  return cat?.color ?? '#3b82f6'
}

/** Nom d'icône d'un type (fallback « Circle »). */
export function typeIcon(id: string): string {
  return TYPE_BY_ID.get(id)?.icon ?? 'Circle'
}

/** Types d'une catégorie, dans l'ordre de la taxonomie. */
export function typesOfCategory(category: CategoryId): TaxonomyType[] {
  return TAXONOMY_TYPES.filter((type) => type.category === category)
}

/** Ensemble des ids de types dotés d'une fiche riche (gabarit v1.1). */
export const RICH_TYPE_IDS = new Set(
  TAXONOMY_TYPES.filter((type) => type.rich).map((type) => type.id)
)

/**
 * Migration des anciens `entityType` v1.1 vers les ids de taxonomie v1.2.
 * Les types déjà valides (person, company, address) restent inchangés.
 */
export const V11_ENTITY_TYPE_MAP: Record<string, string> = {
  person: 'person',
  company: 'company',
  domain: 'domain_name',
  phone: 'phone_number',
  email: 'email_address',
  address: 'address',
  social: 'account_profile',
  vehicle: 'ground_vehicle'
}

/** Résout un entityType stocké (v1.1 ou v1.2) vers un id de taxonomie valide.
 * §2 v1.8 : les ids personnalisés (préfixe `custom:`) sont CONSERVÉS tels quels —
 * ils sont validés au rendu contre les types définis dans le tableau (un custom
 * inconnu retombe alors sur un affichage neutre, jamais sur `generic_other`). */
export function normalizeEntityType(raw: unknown): string {
  if (typeof raw !== 'string') return 'generic_other'
  if (raw.startsWith('custom:')) return raw
  if (TYPE_BY_ID.has(raw)) return raw
  // hasOwnProperty : sinon 'toString'/'constructor'/'__proto__' remonteraient la
  // chaîne de prototypes et renverraient une fonction (crash Yjs en aval).
  const migrated = Object.prototype.hasOwnProperty.call(V11_ENTITY_TYPE_MAP, raw)
    ? V11_ENTITY_TYPE_MAP[raw]
    : undefined
  if (typeof migrated === 'string' && TYPE_BY_ID.has(migrated)) return migrated
  return 'generic_other'
}
