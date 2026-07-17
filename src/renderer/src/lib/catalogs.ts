/**
 * Catalogues de valeurs pré-listées par NATURE de champ (§2 v1.8.1).
 *
 * Sur le modèle du sélecteur de plateforme des réseaux sociaux (lib/links.ts), on
 * propose des listes RICHES et cherchables pour certaines natures de champ propres
 * à des entités (banque, cryptomonnaie, marque, opérateur, pays, réseau de carte,
 * algorithme de hachage…). RÈGLE ABSOLUE : ces listes ne sont JAMAIS limitantes —
 * le sélecteur offre toujours une saisie libre « Autre » (le picker gère ce cas),
 * car les listes réelles sont gigantesques et évolutives.
 *
 * La valeur STOCKÉE reste une simple chaîne (le libellé choisi, ou le texte libre) :
 * un champ « catalogue » est donc parfaitement portable (export/import, CSV, rendu
 * sur le nœud) et rétro-compatible avec un champ texte ordinaire.
 *
 * Module PUR (aucune dépendance React) : le rendu se fait dans CatalogPicker.
 */
import type { FieldKind } from '@/types'

/** Natures de champ adossées à un catalogue (sous-ensemble de FieldKind, §2 v1.8.1). */
export const CATALOG_KINDS = ['bank', 'crypto', 'brand', 'operator', 'country', 'card', 'hash_algo'] as const
export type CatalogKind = (typeof CATALOG_KINDS)[number]

export interface CatalogOption {
  /** Libellé affiché ET valeur stockée. */
  value: string
  /** Nom d'icône lucide (résolu par EntityIcon) ; à défaut, l'icône du catalogue. */
  icon?: string
  /** Regroupement optionnel dans le sélecteur (sinon liste à plat). */
  group?: string
  /** Termes de recherche supplémentaires (ex. ticker, ancien nom). */
  aliases?: string[]
}

export interface Catalog {
  /** Icône par défaut des options (nom lucide). */
  icon: string
  options: CatalogOption[]
}

/** Fabrique un lot d'options depuis une liste de libellés (icône/groupe partagés). */
function opts(values: string[], group?: string): CatalogOption[] {
  return values.map((value) => (group ? { value, group } : { value }))
}

// ——— Banques (§2 v1.8.1) ———
const BANKS: string[] = [
  'BNP Paribas', 'Société Générale', 'Crédit Agricole', 'Crédit Mutuel', 'Banque Populaire',
  "Caisse d'Épargne", 'La Banque Postale', 'LCL', 'CIC', 'Crédit du Nord', 'AXA Banque',
  'Boursorama Banque', 'Fortuneo', 'Hello bank!', 'Monabanq', 'BforBank', 'Nickel', 'Qonto',
  'Shine', 'Lydia', 'Revolut', 'N26', 'bunq', 'Wise', 'HSBC', 'Barclays', 'Lloyds Bank',
  'NatWest', 'Standard Chartered', 'Deutsche Bank', 'Commerzbank', 'ING', 'ABN AMRO', 'Rabobank',
  'KBC', 'Belfius', 'Santander', 'BBVA', 'CaixaBank', 'UniCredit', 'Intesa Sanpaolo', 'UBS',
  'Credit Suisse', 'Julius Baer', 'Raiffeisen', 'Nordea', 'Danske Bank', 'DNB', 'SEB', 'Swedbank',
  'JPMorgan Chase', 'Bank of America', 'Citibank', 'Wells Fargo', 'Goldman Sachs', 'Morgan Stanley',
  'Capital One', 'American Express', 'Bank of China', 'ICBC', 'China Construction Bank',
  'Mitsubishi UFJ (MUFG)', 'Mizuho', 'Sumitomo Mitsui', 'DBS', 'OCBC', 'UOB', 'Emirates NBD',
  'Qatar National Bank', 'Attijariwafa Bank', 'Ecobank', 'Sberbank', 'VTB', 'Tinkoff'
]

// ——— Cryptomonnaies (§2 v1.8.1) — groupées ———
const CRYPTO_STABLE = ['Tether (USDT)', 'USD Coin (USDC)', 'Dai (DAI)', 'First Digital USD (FDUSD)', 'TrueUSD (TUSD)', 'PayPal USD (PYUSD)', 'Binance USD (BUSD)']
const CRYPTO_PRIVACY = ['Monero (XMR)', 'Zcash (ZEC)', 'Dash (DASH)', 'Verge (XVG)', 'Grin (GRIN)', 'Beam (BEAM)', 'Secret (SCRT)', 'Horizen (ZEN)']
const CRYPTO_MAIN = [
  'Bitcoin (BTC)', 'Ethereum (ETH)', 'BNB (BNB)', 'XRP (XRP)', 'Solana (SOL)', 'Cardano (ADA)',
  'Dogecoin (DOGE)', 'TRON (TRX)', 'Toncoin (TON)', 'Polkadot (DOT)', 'Polygon (POL)',
  'Litecoin (LTC)', 'Shiba Inu (SHIB)', 'Avalanche (AVAX)', 'Chainlink (LINK)', 'Bitcoin Cash (BCH)',
  'Stellar (XLM)', 'Ethereum Classic (ETC)', 'Cosmos (ATOM)', 'Uniswap (UNI)', 'Aave (AAVE)',
  'Tezos (XTZ)', 'Algorand (ALGO)', 'NEAR Protocol (NEAR)', 'Filecoin (FIL)', 'Hedera (HBAR)',
  'VeChain (VET)', 'Maker (MKR)', 'EOS (EOS)', 'Fantom (FTM)', 'THORChain (RUNE)', 'Arbitrum (ARB)',
  'Optimism (OP)', 'Sui (SUI)', 'Aptos (APT)', 'Pepe (PEPE)', 'Wrapped Bitcoin (WBTC)',
  'Kaspa (KAS)', 'Render (RENDER)', 'Injective (INJ)', 'Lido DAO (LDO)', 'Curve (CRV)',
  'PancakeSwap (CAKE)', 'Bitcoin SV (BSV)', 'Nano (XNO)', 'Ravencoin (RVN)', 'Decred (DCR)',
  'DigiByte (DGB)', 'Bitcoin Gold (BTG)', 'IOTA (IOTA)', 'Chia (XCH)'
]

// ——— Marques (§2 v1.8.1) ———
const BRANDS: string[] = [
  'Apple', 'Samsung', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Sony', 'LG', 'Huawei', 'Xiaomi',
  'OnePlus', 'Oppo', 'Vivo', 'Nokia', 'Motorola', 'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance',
  'Under Armour', 'Zara', 'H&M', 'Uniqlo', 'Gucci', 'Louis Vuitton', 'Chanel', 'Dior', 'Hermès',
  'Prada', 'Balenciaga', 'Rolex', 'Omega', 'Cartier', 'Coca-Cola', 'Pepsi', 'Nestlé', 'Danone',
  "McDonald's", 'Burger King', 'KFC', 'Starbucks', 'Toyota', 'Volkswagen', 'Mercedes-Benz', 'BMW',
  'Audi', 'Ford', 'Tesla', 'Renault', 'Peugeot', 'Citroën', 'Ferrari', 'Porsche', 'Honda',
  'Hyundai', 'Kia', 'Nissan', 'IKEA', 'Philips', 'Bosch', 'Siemens', 'Dyson', 'GoPro', 'DJI',
  'Canon', 'Nikon', 'Intel', 'AMD', 'Nvidia', 'Qualcomm', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer',
  'Razer', 'Logitech', 'Netflix', 'Disney', 'Spotify', 'Uber', 'Airbnb', 'PayPal', 'Red Bull',
  'Heineken', 'L’Oréal', 'Gillette', 'Rolls-Royce', 'Lego', 'Rossignol', 'Decathlon'
]

// ——— Opérateurs télécom / FAI (§2 v1.8.1) ———
const OPERATORS: string[] = [
  'Orange', 'SFR', 'Bouygues Telecom', 'Free', 'Free Mobile', 'Sosh', 'RED by SFR', 'B&You',
  'La Poste Mobile', 'NRJ Mobile', 'Prixtel', 'Lebara', 'Lycamobile', 'Coriolis Telecom',
  'Auchan Telecom', 'Cdiscount Mobile', 'Syma Mobile', 'YouPrice', 'Vodafone', 'O2',
  'Deutsche Telekom', 'T-Mobile', 'Telefónica', 'Movistar', 'TIM', 'WindTre', 'Swisscom', 'Salt',
  'Sunrise', 'Proximus', 'Telenet', 'KPN', 'EE', 'Three', 'Verizon', 'AT&T', 'Sprint', 'Rogers',
  'Bell', 'Telus', 'Telstra', 'Optus', 'Airtel', 'Jio', 'MTN', 'Vodacom', 'Etisalat', 'Ooredoo',
  'Turkcell', 'China Mobile', 'China Unicom', 'NTT Docomo', 'SoftBank', 'SK Telecom'
]

// ——— Réseaux de carte (§2 v1.8.1) ———
const CARD_NETWORKS: string[] = [
  'Visa', 'Mastercard', 'American Express', 'Discover', 'Diners Club', 'JCB', 'UnionPay', 'Maestro',
  'Carte Bancaire (CB)', 'Cirrus', 'RuPay', 'Mir', 'Troy', 'Verve', 'Bancontact', 'Interac',
  'Apple Pay', 'Google Pay', 'Samsung Pay', 'PayPal'
]

// ——— Algorithmes de hachage (§2 v1.8.1, forensique) ———
const HASH_ALGOS: string[] = [
  'MD5', 'SHA-1', 'SHA-224', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA-3', 'Keccak-256', 'RIPEMD-160',
  'Whirlpool', 'BLAKE2', 'BLAKE3', 'CRC32', 'Adler-32', 'NTLM', 'LM', 'bcrypt', 'scrypt', 'Argon2',
  'PBKDF2', 'Tiger', 'xxHash', 'MurmurHash', 'ssdeep', 'TLSH', 'SHA-512/256'
]

// ——— Pays (§2 v1.8.1) — liste large façon ISO 3166 (libellés FR) ———
const COUNTRIES: string[] = [
  'Afghanistan', 'Afrique du Sud', 'Albanie', 'Algérie', 'Allemagne', 'Andorre', 'Angola',
  'Arabie saoudite', 'Argentine', 'Arménie', 'Australie', 'Autriche', 'Azerbaïdjan', 'Bahamas',
  'Bahreïn', 'Bangladesh', 'Barbade', 'Belgique', 'Belize', 'Bénin', 'Bhoutan', 'Biélorussie',
  'Birmanie (Myanmar)', 'Bolivie', 'Bosnie-Herzégovine', 'Botswana', 'Brésil', 'Brunei', 'Bulgarie',
  'Burkina Faso', 'Burundi', 'Cambodge', 'Cameroun', 'Canada', 'Cap-Vert', 'Chili', 'Chine',
  'Chypre', 'Colombie', 'Comores', 'Congo (Brazzaville)', 'Congo (RDC)', 'Corée du Nord',
  'Corée du Sud', 'Costa Rica', "Côte d'Ivoire", 'Croatie', 'Cuba', 'Danemark', 'Djibouti',
  'Dominique', 'Égypte', 'Émirats arabes unis', 'Équateur', 'Érythrée', 'Espagne', 'Estonie',
  'Eswatini', 'États-Unis', 'Éthiopie', 'Fidji', 'Finlande', 'France', 'Gabon', 'Gambie', 'Géorgie',
  'Ghana', 'Grèce', 'Grenade', 'Guatemala', 'Guinée', 'Guinée équatoriale', 'Guinée-Bissau',
  'Guyana', 'Haïti', 'Honduras', 'Hongrie', 'Inde', 'Indonésie', 'Irak', 'Iran', 'Irlande',
  'Islande', 'Israël', 'Italie', 'Jamaïque', 'Japon', 'Jordanie', 'Kazakhstan', 'Kenya',
  'Kirghizistan', 'Kiribati', 'Koweït', 'Laos', 'Lesotho', 'Lettonie', 'Liban', 'Liberia', 'Libye',
  'Liechtenstein', 'Lituanie', 'Luxembourg', 'Macédoine du Nord', 'Madagascar', 'Malaisie', 'Malawi',
  'Maldives', 'Mali', 'Malte', 'Maroc', 'Îles Marshall', 'Maurice', 'Mauritanie', 'Mexique',
  'Micronésie', 'Moldavie', 'Monaco', 'Mongolie', 'Monténégro', 'Mozambique', 'Namibie', 'Nauru',
  'Népal', 'Nicaragua', 'Niger', 'Nigeria', 'Norvège', 'Nouvelle-Zélande', 'Oman', 'Ouganda',
  'Ouzbékistan', 'Pakistan', 'Palaos', 'Palestine', 'Panama', 'Papouasie-Nouvelle-Guinée',
  'Paraguay', 'Pays-Bas', 'Pérou', 'Philippines', 'Pologne', 'Portugal', 'Qatar',
  'République centrafricaine', 'République dominicaine', 'République tchèque', 'Roumanie',
  'Royaume-Uni', 'Russie', 'Rwanda', 'Saint-Christophe-et-Niévès', 'Saint-Marin',
  'Saint-Vincent-et-les-Grenadines', 'Sainte-Lucie', 'Salomon', 'Salvador', 'Samoa',
  'Sao Tomé-et-Principe', 'Sénégal', 'Serbie', 'Seychelles', 'Sierra Leone', 'Singapour',
  'Slovaquie', 'Slovénie', 'Somalie', 'Soudan', 'Soudan du Sud', 'Sri Lanka', 'Suède', 'Suisse',
  'Suriname', 'Syrie', 'Tadjikistan', 'Tanzanie', 'Tchad', 'Thaïlande', 'Timor oriental', 'Togo',
  'Tonga', 'Trinité-et-Tobago', 'Tunisie', 'Turkménistan', 'Turquie', 'Tuvalu', 'Ukraine',
  'Uruguay', 'Vanuatu', 'Vatican', 'Venezuela', 'Viêt Nam', 'Yémen', 'Zambie', 'Zimbabwe'
]

/** Table nature de champ → catalogue (§2 v1.8.1). */
export const CATALOG_BY_KIND: Record<CatalogKind, Catalog> = {
  bank: { icon: 'Landmark', options: opts(BANKS) },
  crypto: {
    icon: 'Coins',
    options: [
      ...opts(CRYPTO_MAIN, 'Cryptomonnaies'),
      ...opts(CRYPTO_STABLE, 'Stablecoins'),
      ...opts(CRYPTO_PRIVACY, 'Confidentialité')
    ]
  },
  brand: { icon: 'Tag', options: opts(BRANDS) },
  operator: { icon: 'RadioTower', options: opts(OPERATORS) },
  country: { icon: 'Flag', options: opts(COUNTRIES) },
  card: { icon: 'CreditCard', options: opts(CARD_NETWORKS) },
  hash_algo: { icon: 'Hash', options: opts(HASH_ALGOS) }
}

/** true si la nature de champ est adossée à un catalogue (§2 v1.8.1). */
export function isCatalogKind(kind: FieldKind): kind is CatalogKind {
  return (CATALOG_KINDS as readonly string[]).includes(kind)
}

/** Catalogue d'une nature de champ, ou undefined si elle n'en a pas. */
export function catalogForKind(kind: FieldKind): Catalog | undefined {
  return isCatalogKind(kind) ? CATALOG_BY_KIND[kind] : undefined
}

/** Marques diacritiques combinantes (U+0300–U+036F), retirées pour la recherche.
 * Construite par échappement Unicode explicite (aucun caractère combinant dans la
 * source → aucun risque de transformation par le bundler). */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/** Normalise un texte pour la recherche : minuscules + accents retirés. */
export function foldSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').trim()
}
