/**
 * Modèle de données central de COSINT (v1.1).
 * Ces types décrivent la forme « plate » (JS pur) des données ; leur représentation
 * CRDT (Y.Map imbriquées) est gérée dans sync/model.ts.
 *
 * Évolutions v1.1 :
 *  - couleurs libres : `color` est désormais un hex (#rrggbb), plus un énuméré ;
 *  - nouveaux types de nœuds « entity » (fiches structurées) et « source » ;
 *  - connexions enrichies : direction, type de relation ;
 *  - contrôle d'accès au tableau (ouvert / sur approbation / privé) ;
 *  - profils enrichis (avatar, rôle, statut).
 */

/** Types de nœuds (v1 + entités/sources en v1.1 + bloc de code en v1.6). */
export type NodeKind =
  | 'text'
  | 'link'
  | 'image'
  | 'timestamped'
  | 'group'
  | 'entity'
  | 'source'
  | 'code'

/**
 * Badge de statut d'un élément (§3 v1.5), posable sur les entités, nœuds libres
 * ET liens. Repris de la référence : sept valeurs (dont « aucun »). `none` (ou
 * absent) = pas de badge.
 */
export type ElementStatus =
  | 'none'
  | 'confirmed'
  | 'issue'
  | 'false_positive'
  | 'question'
  | 'stop'
  | 'onhold'

/** Style de trait d'une connexion (§1 v1.2 : ajout des tirets longs). */
export type EdgeStyle = 'solid' | 'dashed' | 'dotted'

/** Direction d'une connexion. */
export type EdgeDirection = 'none' | 'single' | 'double'

/** Épaisseur de trait d'une connexion (§1 v1.2). */
export type EdgeWidth = 'thin' | 'normal' | 'thick'

/** Tracé d'une connexion (§1 v1.2). */
export type EdgePathType = 'bezier' | 'straight' | 'step'

/**
 * Côté d'ancrage d'une extrémité de lien sur le bord d'un nœud (§1 v1.6) :
 * haut / bas / gauche / droite. Correspond aux ids des poignées de connexion
 * (`t`/`b`/`l`/`r`). Absent = ancrage automatique (côté tourné vers l'autre nœud,
 * ou vers le premier/dernier point de passage s'il y en a).
 */
export type EdgeAnchor = 't' | 'b' | 'l' | 'r'

/** Point de passage (waypoint) d'un lien, en coordonnées ABSOLUES du tableau
 * (§1 v1.6) : reste fixe quand un nœud relié est déplacé (le tracé ne « saute »
 * pas). Ordonnés de la source vers la cible. */
export interface EdgeWaypoint {
  x: number
  y: number
}

/**
 * Type d'entité (§2 v1.2) : identifiant de la taxonomie (id interne anglais,
 * ex. 'person', 'wallet', 'domain_name'). L'ensemble des types valides et leurs
 * catégories/icônes/gabarits est défini dans lib/taxonomy.ts. On garde un type
 * `string` plutôt qu'un énuméré strict car la taxonomie compte ~90 types et peut
 * évoluer ; la validité est vérifiée au runtime contre le registre.
 */
export type EntityType = string

/**
 * Nature d'un champ de fiche entité/source (contrôle l'affichage et les actions).
 * `social` (§3 v1.4) : identifiant de réseau social → URL construite selon la
 * plateforme (la valeur stockée reste une URL http(s) normale, donc portable).
 *
 * §2 v1.8.1 — natures « catalogue » : `bank`, `crypto`, `brand`, `operator`,
 * `country`, `card`, `hash_algo` proposent une liste RICHE et cherchable propre à
 * l'entité (banque, cryptomonnaie, marque, opérateur, pays, réseau de carte,
 * algorithme de hachage), TOUJOURS complétée d'une saisie libre « Autre » (les
 * listes réelles sont gigantesques). La valeur stockée reste une simple chaîne :
 * le champ est portable et rétro-compatible avec un champ texte ordinaire.
 */
export type FieldKind =
  | 'text'
  | 'longtext'
  | 'url'
  | 'email'
  | 'phone'
  | 'date'
  | 'social'
  | 'bank'
  | 'crypto'
  | 'brand'
  | 'operator'
  | 'country'
  | 'card'
  | 'hash_algo'

/**
 * Un champ d'une fiche entité/source. Chaque champ conserve l'auteur et
 * l'horodatage de sa dernière modification (§3).
 */
export interface EntityField {
  id: string
  /** Libellé affiché (issu d'un gabarit ou saisi pour un champ personnalisé). */
  label: string
  kind: FieldKind
  value: string
  /**
   * Affichage sur le nœud du canvas (§6bis v1.4). `undefined` = mode par défaut
   * (les 2 premiers champs non vides). Une fois qu'au moins un champ porte une
   * valeur explicite, seuls les champs `shown === true` s'affichent, dans l'ordre
   * du tableau (réordonnable par glisser-déposer dans le panneau Détails).
   */
  shown?: boolean
  updatedBy: string
  updatedAt: number
}

/** Taille de texte d'un nœud entité/source (§4 v1.4). */
export type NodeTextSize = 'small' | 'normal' | 'large'

/**
 * Personnalisation visuelle d'un nœud entité/source (§4 v1.4). Tous les champs
 * sont optionnels : absent = valeur par défaut du type (couleur de catégorie,
 * bordure pleine normale, texte normal). La FORME reste un rectangle arrondi
 * (choix produit v1.4 : les autres formes n'apportaient rien).
 */
export interface EntityStyle {
  /** Style de bordure (réutilise l'énuméré des liens). */
  borderStyle?: EdgeStyle
  /** Épaisseur de bordure (réutilise l'énuméré des liens). */
  borderWidth?: EdgeWidth
  /** Couleur de bordure (#rrggbb) ; vide = couleur du nœud. */
  borderColor?: string
  /** Couleur de fond (#rrggbb) ; vide = fond par défaut du thème. */
  fillColor?: string
  /** Opacité du fond 0..1. */
  fillOpacity?: number
  /** Fond transparent (bordure seule). */
  transparentFill?: boolean
  textSize?: NodeTextSize
}

/**
 * Un nœud du tableau. Les champs `entityType`, `sourceType`, `reliability`,
 * `credibility`, `fields` et `style` ne concernent que les nœuds
 * « entity »/« source ».
 */
export interface BoardNodeData {
  id: string
  kind: NodeKind
  x: number
  y: number
  width: number
  height: number
  /**
   * Contenu principal, selon le type :
   * - text / timestamped : markdown simple
   * - link : l'URL
   * - image : data-URL base64
   * - group : inutilisé ('')
   * - entity : inutilisé (les données sont dans `fields`)
   * - source : l'URL de la source
   * - code : le code source brut (indentation préservée) — §5 v1.6
   */
  content: string
  /** Titre éditable (liens, entités, sources) ou libellé (groupes). */
  title: string
  /** Langage du bloc de code (§5 v1.6) — id de lib/prism.ts. Nœuds « code » seuls. */
  language?: string
  /** Couleur d'accent au format #rrggbb (§5). */
  color: string
  tags: string[]
  /** Sous-type pour les nœuds « entity ». */
  entityType?: EntityType
  /** Type de source pour les nœuds « source » (clé i18n `sourceType.*`). */
  sourceType?: string
  /** Fiabilité de la source sur l'échelle Amirauté (A–F). */
  reliability?: string
  /** Crédibilité de l'information (1–6). */
  credibility?: string
  /** Champs structurés (entités et sources). Vide pour les autres types. */
  fields: EntityField[]
  /** Personnalisation visuelle (§4 v1.4) — entités/sources uniquement. */
  style?: EntityStyle
  /** Badge de statut (§3 v1.5). Absent/`none` = aucun badge. */
  status?: ElementStatus
  /**
   * Date de l'ÉVÉNEMENT (§4 v1.7) — epoch ms, optionnelle et distincte de la date de
   * CRÉATION (`createdAt`). En OSINT elle date le FAIT observé (ex. un post publié le
   * 3 mars), pas la saisie. Si renseignée, la Chronologie l'utilise en priorité ;
   * sinon elle retombe sur `createdAt`. Champ optionnel → migration transparente.
   *
   * §1 v1.8 : `eventDate` est la DATE EXACTE (instant connu). Quand l'instant est
   * incertain, on renseigne plutôt une FENÊTRE `eventEarliest`/`eventLatest` (« au
   * plus tôt » / « au plus tard ») — le fait s'est produit quelque part entre les
   * deux. Les trois sont optionnels et indépendants ; tout nœud peut en porter, mais
   * ils sont surtout destinés aux entités « Événement ». `eventHasTime` indique que
   * l'heure (et non seulement le jour) est significative, pour l'affichage.
   */
  eventDate?: number
  /** §1 v1.8 : borne « au plus tôt » d'un événement à l'instant incertain (epoch ms). */
  eventEarliest?: number
  /** §1 v1.8 : borne « au plus tard » d'un événement à l'instant incertain (epoch ms). */
  eventLatest?: number
  /**
   * §1 v1.8.2 : DÉBUT d'une DURÉE précise (de/à). À la différence de la fenêtre
   * d'incertitude (`eventEarliest`/`eventLatest`, un instant unique mal connu), une
   * durée décrit un fait qui S'ÉTEND réellement de `eventFrom` à `eventTo` (ex. un
   * séjour, une campagne). Instant/durée sont mutuellement exclusifs côté éditeur.
   * Epoch ms.
   */
  eventFrom?: number
  /** §1 v1.8.2 : FIN d'une durée précise (de/à). Epoch ms. */
  eventTo?: number
  /** §1 v1.8 : true si l'heure des dates d'événement est significative (sinon jour seul). */
  eventHasTime?: boolean
  /** Traçabilité (§3) : pseudo de l'auteur + horodatages (epoch ms). */
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
}

/** Une connexion entre deux nœuds. */
export interface BoardEdgeData {
  id: string
  source: string
  target: string
  label: string
  /** Type de relation prédéfini ou libre (§1), ex. « travaille pour ». */
  relationType: string
  style: EdgeStyle
  direction: EdgeDirection
  width: EdgeWidth
  pathType: EdgePathType
  color: string
  /**
   * Routage manuel (§1 v1.6) — tous optionnels ; absents = tracé automatique.
   * Les waypoints sont en coordonnées absolues et le fil les suit dans l'ordre
   * (source → cible). Les ancres fixent le côté de départ/arrivée sur le nœud.
   */
  waypoints?: EdgeWaypoint[]
  sourceAnchor?: EdgeAnchor
  targetAnchor?: EdgeAnchor
  /** Badge de statut (§3 v1.5). Absent/`none` = aucun badge. */
  status?: ElementStatus
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
}

/**
 * Type d'entité PERSONNALISÉ défini au niveau du tableau (§2 v1.8). Stocké dans le
 * document Yjs (`customTypes`) → synchronisé avec tous les participants et inclus
 * dans les exports `.trace`. Chaque tableau a donc SES types propres, en plus de la
 * taxonomie intégrée. L'`id` porte le préfixe `custom:` pour ne jamais entrer en
 * collision avec un id de taxonomie et être reconnu sans consulter le document.
 */
export interface CustomTypeField {
  label: string
  kind: FieldKind
}

export interface CustomEntityType {
  /** Id stable, préfixé `custom:` (ex. `custom:a1b2c3`). */
  id: string
  /** Nom affiché (libellé du type). */
  name: string
  /** Nom d'icône lucide (PascalCase), résolu par le registre EntityIcon. */
  icon: string
  /** Couleur d'accent #rrggbb. */
  color: string
  /** Gabarit de champs pré-créés sur chaque nouvelle entité de ce type. */
  fields: CustomTypeField[]
  createdBy: string
  createdAt: number
}

/** Un commentaire rattaché à un nœud (immuable une fois créé). */
export interface BoardComment {
  id: string
  nodeId: string
  author: string
  text: string
  createdAt: number
}

/** Mode d'accès au tableau (§6). */
export type AccessMode = 'open' | 'approval' | 'private'

/** Rôle d'un participant (§6 v1.4). */
export type BoardRole = 'admin' | 'editor' | 'visitor'

/** Rôle par défaut d'un participant sans attribution explicite (§6). */
export const DEFAULT_ROLE: BoardRole = 'editor'

/** Limites de participants réglables (§6 v1.4). */
export const MIN_PARTICIPANT_LIMIT = 2
export const MAX_PARTICIPANT_LIMIT = 10
export const DEFAULT_PARTICIPANT_LIMIT = 5

/** Entrée du journal des changements de mode d'accès (§6). */
export interface AccessLogEntry {
  mode: AccessMode
  by: string
  at: number
}

/** Métadonnées du tableau. */
export interface BoardMeta {
  title: string
  createdAt: number
  createdBy: string
  /** Mode d'accès courant (défaut des nouveaux tableaux : « approval »). */
  accessMode: AccessMode
  /** Journal des changements de mode d'accès (auteur + horodatage). */
  accessLog: AccessLogEntry[]
  /** userId de l'admin (créateur du tableau) — §6 v1.4. Vide = tableau v1.3. */
  adminId: string
  /** Limite de participants réglable 2..10 (§6 v1.4). */
  participantLimit: number
  /**
   * Jeton de révocation du partage (§5 v1.4). Change à chaque « Révoquer » : les
   * participants qui l'avaient snapshotté à une autre valeur se déconnectent.
   * Comparé par ÉGALITÉ (pas d'horloge) → robuste aux postes désynchronisés.
   */
  shareRevocation: string
}

/** Type d'avatar d'un utilisateur (§7). */
export type AvatarType = 'initials' | 'emoji' | 'image'

/** Statut de disponibilité d'un utilisateur (§7). */
export type UserStatus = 'available' | 'busy' | 'away'

/** Profil local de l'utilisateur (pas de compte — stocké sur le poste, §4/§7). */
export interface UserProfile {
  userId: string
  pseudo: string
  colorHex: string
  /** Type d'avatar ; « initials » par défaut. */
  avatarType: AvatarType
  /** Emoji (avatarType 'emoji') ou data-URL image (avatarType 'image'). */
  avatarValue: string
  /** Rôle/fonction affichée (ex. « Analyste »). */
  role: string
  status: UserStatus
}

/** Avatar diffusé aux pairs (repris de UserProfile, sans données superflues). */
export interface PresenceAvatar {
  type: AvatarType
  value: string
}

/** Identité diffusée aux pairs via Yjs Awareness (§5/§7). */
export interface PresenceUser {
  id: string
  name: string
  color: string
  avatar: PresenceAvatar
  role: string
  status: UserStatus
}

/** État de présence d'un participant (curseur en coordonnées du canvas). */
export interface PresenceState {
  user: PresenceUser
  cursor: { x: number; y: number } | null
  selection: string[]
}

/** Limite v1 de participants simultanés par tableau (§4). Conservée comme valeur
 * de repli ; la limite effective est réglable par tableau (voir BoardMeta). */
export const MAX_PARTICIPANTS = 5

/**
 * Entrée du registre local des tableaux récents.
 *
 * §5 v1.4 : l'identifiant de STOCKAGE local (`boardId`) est désormais découplé du
 * code de partage. Un tableau naît SOLO (`shareCode: null`, aucune connexion) ;
 * générer un code ouvre le partage sans changer `boardId`. Révoquer/régénérer
 * change le code et le secret sans toucher au stockage local.
 */
export interface BoardRegistryEntry {
  /** Clé de stockage local stable (`cosint-<boardId>`). Ex-`roomId` en v1.3. */
  boardId: string
  /** Code de partage courant, ou null si le tableau est solo (jamais partagé /
   * partage révoqué). */
  shareCode: string | null
  title: string
  createdAt: number
  lastOpenedAt: number
  /**
   * Secret de session (mot de passe du salon de document, §6). Détenu localement
   * par les membres ; jamais dérivable du code. Absent = tableau v1 (accès par
   * clé dérivée du code) ou tableau solo.
   */
  sessionSecret?: string
  /** Mon rôle mémorisé sur ce tableau (pour la reconnexion) — §6. */
  role?: BoardRole
}
