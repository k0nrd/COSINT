/**
 * §2 v1.9 (galerie) — images ATTACHÉES à une entité.
 *
 * Une entité peut porter une GALERIE ordonnée d'images (au plus MAX_ENTITY_IMAGES) ;
 * la première est la « couverture » affichée sur le nœud du tableau (avec un badge
 * « +N » s'il y en a d'autres). Chaque entrée ne référence qu'un HASH de fichier : les
 * octets (compressés par lib/image.ts) sont découpés en chunks dans la Y.Map `files`
 * (sync/files.ts), jamais stockés en data-URL dans la Y.Map du nœud — sauf
 * TRANSITOIREMENT après l'import d'un `.trace` portable (data-URL inline), le temps que
 * `migrateInlineImages` les re-découpe en chunks.
 *
 * Stockage : tableau JSON simple `images` sur la Y.Map du nœud, comme `fields`, `tags`
 * ou `eventMarks` (dernier-écrivain-gagne à l'échelle de la liste, cf. DECISIONS.md).
 * Rétro-compatibilité : l'image UNIQUE du build de travail 1.9.0 (`imageHash` +
 * `imageWidth`/`imageHeight`) est relue comme PREMIÈRE image de la galerie ; la
 * première écriture de galerie matérialise la liste et retire ces clés héritées.
 * Un pair 1.8.9 ignore simplement la clé `images` (inconnue) sans erreur.
 *
 * Module PUR (ni DOM ni Yjs) → testable sous Node (tests/entityImages.test.ts).
 */
import type { BoardNodeData, EntityImage } from '@/types'
import type { ImageProfile } from '@/lib/image'

/** Nombre maximal d'images par entité (garde le document et la synchro P2P sains). */
export const MAX_ENTITY_IMAGES = 12

/**
 * Profil de compression des images d'entité : même définition que les nœuds image
 * (1600 px — une capture d'écran reste lisible dans la visionneuse) mais une cible
 * plus serrée, car une entité peut en porter jusqu'à 12 : la galerie complète reste
 * ainsi transférable en P2P et tient le plus souvent dans le budget d'une copie.
 */
export const ENTITY_IMAGE_PROFILE: ImageProfile = {
  maxDim: 1600,
  targetBytes: 700 * 1024,
  hardLimitBytes: 25 * 1024 * 1024
}

/** Référence par hash — mêmes contraintes que `isFileHash` (sync/files.ts), inlinée
 *  pour éviter une dépendance lib → sync. */
const FILE_HASH_RE = /^[A-Za-z0-9_-]{16,64}$/
/** Data-URL IMAGE inline (`.trace` portable / fragment collé avant migration). */
const INLINE_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i
/** Borne des dimensions acceptées (px) — une valeur absurde est ignorée. */
const MAX_DIMENSION = 100_000
/** Taille maximale d'une data-URL inline acceptée (caractères) : une image compressée
 *  pèse ≤ 1,5 Mo ; au-delà, la valeur est rejetée (donnée non fiable, cf. model.ts). */
export const MAX_INLINE_IMAGE_CHARS = 8 * 1024 * 1024

/** true si `value` est une référence d'image valide (hash de fichier OU data-URL image). */
export function isEntityImageRef(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (FILE_HASH_RE.test(value) ||
      (value.length <= MAX_INLINE_IMAGE_CHARS && INLINE_IMAGE_RE.test(value)))
  )
}

/** true si la référence est une data-URL inline (et non un hash de fichier). */
export function isInlineImageRef(ref: string): boolean {
  return ref.startsWith('data:')
}

/**
 * true si une data-URL RÉSOLUE (fichier réassemblé) est bien une image affichable.
 * Le stockage en chunks accepte tout type MIME depuis la v1.9 (nœuds fichier) : un
 * pair pourrait référencer, dans une galerie, le hash d'un PDF ou d'un texte — il est
 * alors traité comme une image illisible, jamais passé tel quel à `<img>`/presse-papiers.
 */
export function isDisplayableImage(dataUrl: string | null | undefined): dataUrl is string {
  return typeof dataUrl === 'string' && INLINE_IMAGE_RE.test(dataUrl)
}

function dimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_DIMENSION
    ? Math.round(value)
    : undefined
}

/** Nettoie UNE entrée de galerie (donnée distante non fiable) ; null si inexploitable. */
export function sanitizeEntityImage(raw: unknown): EntityImage | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (!isEntityImageRef(record.hash)) return null
  const image: EntityImage = { hash: record.hash }
  const width = dimension(record.width)
  if (width !== undefined) image.width = width
  const height = dimension(record.height)
  if (height !== undefined) image.height = height
  return image
}

/**
 * Nettoie une galerie : entrées malformées ignorées, doublons (même hash) retirés
 * — le premier gagne, l'ordre est conservé — et liste bornée à MAX_ENTITY_IMAGES.
 */
export function sanitizeEntityImages(raw: unknown): EntityImage[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const images: EntityImage[] = []
  for (const item of raw) {
    if (images.length >= MAX_ENTITY_IMAGES) break
    const image = sanitizeEntityImage(item)
    if (!image || seen.has(image.hash)) continue
    seen.add(image.hash)
    images.push(image)
  }
  return images
}

/** Valeurs BRUTES d'une entité d'où relire la galerie (Y.Map ou JSON importé/collé). */
export interface RawEntityImageSource {
  images?: unknown
  /** Héritage du build de travail 1.9.0 : image unique. */
  imageHash?: unknown
  imageWidth?: unknown
  imageHeight?: unknown
}

/**
 * Relit la galerie d'une entité : la clé `images` si elle existe (même vide — la
 * galerie a alors été explicitement vidée), sinon l'image unique héritée
 * (`imageHash`) promue première image. Migration transparente, rien n'est perdu.
 */
export function readEntityImages(source: RawEntityImageSource): EntityImage[] {
  if (Array.isArray(source.images)) return sanitizeEntityImages(source.images)
  if (isEntityImageRef(source.imageHash)) {
    return sanitizeEntityImages([
      { hash: source.imageHash, width: source.imageWidth, height: source.imageHeight }
    ])
  }
  return []
}

/** Copie profonde (les objets de galerie ne sont jamais partagés entre nœuds). */
export function cloneEntityImages(images: EntityImage[]): EntityImage[] {
  return images.map((image) => ({ ...image }))
}

/** Résultat d'un ajout à la galerie. */
export interface AppendResult {
  images: EntityImage[]
  /** Images réellement ajoutées. */
  added: number
  /** Images ignorées car déjà présentes (même contenu → même hash). */
  duplicates: number
  /** Images ignorées faute de place (limite MAX_ENTITY_IMAGES). */
  overflow: number
}

/** Ajoute des images EN FIN de galerie (doublons ignorés, limite respectée). */
export function appendEntityImages(current: EntityImage[], additions: EntityImage[]): AppendResult {
  const images = cloneEntityImages(sanitizeEntityImages(current))
  const seen = new Set(images.map((image) => image.hash))
  let added = 0
  let duplicates = 0
  let overflow = 0
  for (const raw of additions) {
    const image = sanitizeEntityImage(raw)
    if (!image) continue
    if (seen.has(image.hash)) {
      duplicates++
      continue
    }
    if (images.length >= MAX_ENTITY_IMAGES) {
      overflow++
      continue
    }
    seen.add(image.hash)
    images.push(image)
    added++
  }
  return { images, added, duplicates, overflow }
}

/** Action d'édition d'une galerie (panneau Détails / visionneuse). */
export type EntityImageAction =
  | { type: 'remove'; hash: string }
  /** Déplace d'un cran (delta −1 = vers la gauche/le début, +1 = vers la droite). */
  | { type: 'move'; hash: string; delta: number }
  /** Place l'image en tête : elle devient la couverture du nœud. */
  | { type: 'cover'; hash: string }

/** Applique une action à une galerie (pur, ne mute pas l'entrée). Hash inconnu = inchangé. */
export function applyEntityImageAction(current: EntityImage[], action: EntityImageAction): EntityImage[] {
  const images = cloneEntityImages(sanitizeEntityImages(current))
  const index = images.findIndex((image) => image.hash === action.hash)
  if (index < 0) return images
  if (action.type === 'remove') {
    images.splice(index, 1)
    return images
  }
  const target =
    action.type === 'cover'
      ? 0
      : Math.max(0, Math.min(images.length - 1, index + Math.sign(action.delta)))
  if (target === index) return images
  const [moved] = images.splice(index, 1)
  images.splice(target, 0, moved)
  return images
}

/** Couverture (première image) d'une galerie, ou null. */
export function entityCover(images: EntityImage[] | undefined): EntityImage | null {
  return images && images.length > 0 ? images[0] : null
}

/**
 * §2 v1.9 (galerie) — état d'affichage d'une image de galerie, à partir de sa référence
 * (data-URL inline OU hash) et de l'état du fichier en chunks (forme structurelle de
 * sync/files FileStatus, pour rester pur). `failed` = transfert en erreur OU fichier
 * complet qui n'est pas une image (hash de pair désignant un PDF…) : jamais « réception… »
 * indéfiniment. Une data-URL inline non-image est aussi un échec.
 */
export function resolveEntityImageSrc(
  ref: string | null,
  file: { status: string; dataUrl?: string }
): { src: string | null; failed: boolean } {
  if (!ref) return { src: null, failed: false }
  if (isInlineImageRef(ref)) {
    return isDisplayableImage(ref) ? { src: ref, failed: false } : { src: null, failed: true }
  }
  if (file.status === 'complete') {
    return isDisplayableImage(file.dataUrl) ? { src: file.dataUrl, failed: false } : { src: null, failed: true }
  }
  return { src: null, failed: file.status === 'error' }
}

/**
 * §2 v1.9 (visionneuse) — progression de réception d'une image en chunks, en pourcentage
 * entier [0, 100], ou null si rien à afficher (pas en cours, total invalide). Les
 * compteurs viennent du document partagé (pairs) : bornés, jamais NaN ni > 100.
 */
export function entityImageProgress(file: {
  status: string
  received?: number
  total?: number
}): number | null {
  if (file.status !== 'loading') return null
  const { received, total } = file
  if (typeof received !== 'number' || typeof total !== 'number') return null
  if (!Number.isFinite(received) || !Number.isFinite(total) || total <= 0) return null
  return Math.max(0, Math.min(100, Math.floor((received / total) * 100)))
}

/** Nombre d'images EN PLUS de la couverture (badge « +N » du nœud ; 0 = pas de badge). */
export function extraImageCount(images: EntityImage[] | undefined): number {
  return images && images.length > 1 ? images.length - 1 : 0
}

/** Ramène un index de visionneuse dans [0, count-1] (0 si la galerie est vide). */
export function clampImageIndex(index: number, count: number): number {
  if (count <= 0 || !Number.isFinite(index)) return 0
  return Math.max(0, Math.min(count - 1, Math.floor(index)))
}

/** §2 v1.9 — galerie affichable par la visionneuse (vide si le nœud n'est pas une entité). */
export function lightboxImages(node: BoardNodeData | null | undefined): EntityImage[] {
  return node && node.kind === 'entity' ? node.images ?? [] : []
}

/**
 * §2 v1.9 — la visionneuse ouverte sur `nodeId` doit-elle se fermer ? Oui si le nœud
 * relu POUR CET id a disparu ou n'a plus d'image. Un nœud lu pour un autre id (état
 * en retard d'un rendu) n'est jamais un motif de fermeture.
 */
export function lightboxShouldClose(
  nodeId: string | null,
  node: BoardNodeData | null | undefined
): boolean {
  if (!nodeId) return false
  if (node && node.id !== nodeId) return false
  return lightboxImages(node).length === 0
}

/** Index voisin avec bouclage (visionneuse : précédent/suivant). */
export function wrapImageIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return (((clampImageIndex(index, count) + delta) % count) + count) % count
}

/**
 * Nom de fichier proposé pour « Enregistrer l'image sous… » : titre de l'entité
 * nettoyé (caractères interdits sous Windows retirés, longueur bornée) + rang dans la
 * galerie, extension .png (l'export passe toujours par une conversion PNG). Le
 * processus principal ré-assainit de toute façon le chemin (`safeDefaultPath`).
 */
export function entityImageFileName(title: string, index: number, fallback: string): string {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
      .trim() || fallback
  return `${base}-${Math.max(0, Math.floor(index)) + 1}.png`
}

/**
 * Collage d'un fragment dans un AUTRE tableau : retire les images dont les octets ne
 * sont ni embarqués dans le fragment ni déjà connus du document cible (budget de copie
 * dépassé) — plutôt qu'une vignette « réception… » qui n'aboutirait jamais. Les
 * data-URL inline sont conservées (migrées ensuite). Pur (prédicat fourni).
 */
export function pruneUnavailableImages(
  images: EntityImage[] | undefined,
  isAvailable: (hash: string) => boolean
): EntityImage[] | undefined {
  if (!images || images.length === 0) return images
  const kept = images.filter((image) => isInlineImageRef(image.hash) || isAvailable(image.hash))
  return kept.length > 0 ? kept.map((image) => ({ ...image })) : undefined
}

/** Hashes de FICHIERS référencés par une galerie (les data-URL inline sont exclues) —
 *  pour embarquer les octets dans une copie ou vérifier leur présence. */
export function entityImageFileRefs(images: EntityImage[] | undefined): string[] {
  if (!images) return []
  return images.map((image) => image.hash).filter((hash) => !isInlineImageRef(hash))
}

/**
 * Export `.trace` portable : remplace chaque hash par sa data-URL réassemblée
 * (`resolve` → null si le fichier est incomplet). Une image introuvable est RETIRÉE
 * (jamais de référence pendante dans un fichier autonome) ; une data-URL déjà inline
 * est conservée telle quelle.
 */
export function inlineEntityImages(
  images: EntityImage[],
  resolve: (hash: string) => string | null
): EntityImage[] {
  const out: EntityImage[] = []
  for (const image of images) {
    if (isInlineImageRef(image.hash)) {
      out.push({ ...image })
      continue
    }
    const dataUrl = resolve(image.hash)
    if (dataUrl !== null && INLINE_IMAGE_RE.test(dataUrl)) out.push({ ...image, hash: dataUrl })
  }
  return out
}

/**
 * Migration : remplace une référence inline (`from`, data-URL) par son hash de
 * fichier (`to`), en conservant l'ordre ; si `to` figure déjà dans la galerie,
 * l'entrée inline est simplement retirée (pas de doublon).
 */
export function replaceEntityImageRef(images: EntityImage[], from: string, to: string): EntityImage[] {
  const already = images.some((image) => image.hash === to)
  const out: EntityImage[] = []
  for (const image of images) {
    if (image.hash !== from) out.push({ ...image })
    else if (!already) out.push({ ...image, hash: to })
  }
  return sanitizeEntityImages(out)
}
