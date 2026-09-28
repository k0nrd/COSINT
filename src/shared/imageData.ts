/**
 * §1 v1.9 (copie d'image) — validation PURE des images qui sortent du tableau
 * (presse-papiers système, glisser vers une autre application).
 *
 * Partagé par le processus principal (garde des canaux IPC `app:copy-image` et
 * `app:start-image-drag`) et par les tests. Les data-URL viennent du renderer — zone
 * NON fiable sous sandbox — : on vérifie le type déclaré, l'alphabet base64, la taille,
 * puis la SIGNATURE binaire réelle (un « PNG » qui n'en est pas un est refusé). Aucune
 * dépendance DOM ni Node : uniquement des chaînes et des octets.
 */

/**
 * Longueur maximale (caractères) d'une data-URL image acceptée par le main. Une image
 * du tableau fait ≤ 1600 px (§1.3 v1.4) : même convertie en PNG sans perte elle reste
 * sous ~12 Mo (≈ 16 Mo en base64). 48 Mo laissent une large marge sans ouvrir la porte
 * à un renderer compromis qui saturerait la mémoire du main.
 */
export const MAX_IMAGE_DATA_URL_LENGTH = 48 * 1024 * 1024

/** Côté maximal (px) d'une image posée dans le presse-papiers / glissée. */
export const MAX_IMAGE_SIDE = 16384

/** Types acceptés par défaut : ceux que `nativeImage` sait réellement décoder. */
export const EXPORTABLE_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const

export interface ParsedImageDataUrl {
  /** Type MIME déclaré (normalisé en minuscules ; `image/jpg` → `image/jpeg`). */
  mime: string
  /** Charge utile base64 (sans le préfixe). */
  base64: string
}

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,/i
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Découpe et valide une data-URL image base64. Retourne `null` si la valeur n'est pas
 * une chaîne, dépasse `maxLength`, déclare un type hors `allowed`, ou si la charge
 * utile n'est pas du base64 canonique (alphabet standard, longueur multiple de 4).
 */
export function parseImageDataUrl(
  value: unknown,
  allowed: readonly string[] = EXPORTABLE_IMAGE_TYPES,
  maxLength: number = MAX_IMAGE_DATA_URL_LENGTH
): ParsedImageDataUrl | null {
  if (typeof value !== 'string' || value.length > maxLength) return null
  const match = DATA_URL_RE.exec(value)
  if (!match) return null
  let mime = match[1].toLowerCase()
  if (mime === 'image/jpg') mime = 'image/jpeg'
  if (!allowed.includes(mime)) return null
  const base64 = value.slice(match[0].length)
  if (base64.length === 0 || base64.length % 4 !== 0 || !BASE64_RE.test(base64)) return null
  return { mime, base64 }
}

/**
 * Type réel d'une image d'après sa signature binaire (« magic bytes »), ou `null`.
 * Couvre les formats que COSINT manipule : PNG, JPEG, WebP, GIF, BMP.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const at = (index: number): number => (index < bytes.length ? bytes[index] : -1)
  if (
    at(0) === 0x89 &&
    at(1) === 0x50 &&
    at(2) === 0x4e &&
    at(3) === 0x47 &&
    at(4) === 0x0d &&
    at(5) === 0x0a &&
    at(6) === 0x1a &&
    at(7) === 0x0a
  ) {
    return 'image/png'
  }
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (
    at(0) === 0x52 && // R
    at(1) === 0x49 && // I
    at(2) === 0x46 && // F
    at(3) === 0x46 && // F
    at(8) === 0x57 && // W
    at(9) === 0x45 && // E
    at(10) === 0x42 && // B
    at(11) === 0x50 // P
  ) {
    return 'image/webp'
  }
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return 'image/gif'
  if (at(0) === 0x42 && at(1) === 0x4d) return 'image/bmp'
  return null
}

/**
 * Côté (px) de la vignette comparée lors de la RELECTURE du presse-papiers : l'image
 * relue doit être la NÔTRE, pas une image précédente de mêmes dimensions restée en place
 * parce que l'écriture a échoué en silence (presse-papiers Windows verrouillé).
 */
export const VERIFY_SAMPLE_SIDE = 16

/**
 * Écart moyen toléré par canal de couleur (0-255) entre la vignette écrite et la
 * vignette relue : absorbe les arrondis d'un aller-retour par le presse-papiers
 * (PNG/DIB, alpha rendu opaque) mais écarte une autre image de mêmes dimensions.
 */
export const VERIFY_TOLERANCE = 6

/**
 * Écart moyen par canal entre deux échantillons de pixels de même longueur (RGBA/BGRA,
 * 0-255), ou `Infinity` si les longueurs diffèrent ou sont nulles. Pur → testable.
 */
export function meanChannelDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = a.length
  if (length === 0 || length !== b.length) return Infinity
  let total = 0
  for (let index = 0; index < length; index++) total += Math.abs(a[index] - b[index])
  return total / length
}

/**
 * Écart moyen par canal de COULEUR (alpha ignoré) entre deux échantillons de 4 octets
 * par pixel (RGBA/BGRA), ou `Infinity` si les longueurs diffèrent, sont nulles ou ne
 * sont pas multiples de 4. Sur des pixels PRÉMULTIPLIÉS, ignorer l'alpha rend la
 * comparaison insensible au presse-papiers Windows : à la relecture, Chromium rend
 * OPAQUE une image dont il juge le canal alpha douteux, mais les couleurs
 * prémultipliées, elles, sont conservées telles quelles. Pur → testable.
 */
export function meanColorDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = a.length
  if (length === 0 || length !== b.length || length % 4 !== 0) return Infinity
  let total = 0
  for (let index = 0; index < length; index++) {
    if (index % 4 === 3) continue
    total += Math.abs(a[index] - b[index])
  }
  return total / ((length / 4) * 3)
}

// ——— Écriture VÉRIFIÉE du presse-papiers (logique pure, pilotée par le main) ———

/** Relevé d'une image : dimensions réelles + vignette VERIFY_SAMPLE_SIDE² prémultipliée. */
export interface ImageProbe {
  width: number
  height: number
  sample: ArrayLike<number>
}

/**
 * Verdict d'une RELECTURE du presse-papiers juste après l'écriture de `expected` :
 *  - `ours`       : mêmes dimensions ET mêmes couleurs → l'image est bien posée ;
 *  - `foreign`    : autre contenu (aucune image, autres dimensions, autres pixels) →
 *                   l'écriture a échoué (presse-papiers Windows verrouillé) : réécrire ;
 *  - `unreadable` : une image est annoncée mais n'a pas pu être lue (la LECTURE est
 *                   tombée sur un verrou : historique Win+V, synchronisation… en train
 *                   de lire NOTRE image) → relire un peu plus tard, SANS réécrire (une
 *                   réécriture relancerait ces lecteurs).
 */
export type ReadbackVerdict = 'ours' | 'foreign' | 'unreadable'

export function classifyReadback(
  expected: ImageProbe,
  current: ImageProbe | null,
  hasImageFormat: boolean,
  tolerance: number = VERIFY_TOLERANCE
): ReadbackVerdict {
  if (!current) return hasImageFormat ? 'unreadable' : 'foreign'
  if (current.width !== expected.width || current.height !== expected.height) return 'foreign'
  return meanColorDistance(current.sample, expected.sample) <= tolerance ? 'ours' : 'foreign'
}

/** Délais (ms) avant chaque ÉCRITURE : une seule en temps normal, deux reprises au plus. */
export const WRITE_RETRY_DELAYS_MS: readonly number[] = [0, 60, 200]
/** Délais (ms) avant chaque RELECTURE d'une même écriture (verrou de lecture passager). */
export const READBACK_DELAYS_MS: readonly number[] = [0, 25, 60, 120]

export interface VerifiedWriteSteps {
  /** Écrit dans le presse-papiers (peut lever : compté comme un échec d'écriture). */
  write: () => void
  /** Relit et juge le presse-papiers (une levée compte comme `unreadable`). */
  check: () => ReadbackVerdict
  sleep: (ms: number) => Promise<void>
}

export interface VerifiedWriteResult {
  ok: boolean
  writes: number
  checks: number
}

/**
 * Écrit puis VÉRIFIE par relecture, avec reprises bornées : `ours` → succès immédiat ;
 * `foreign` → nouvelle écriture (après le délai suivant) ; `unreadable` → nouvelle
 * relecture seulement. En temps normal : UNE écriture + UNE relecture. Jamais de
 * boucle infinie : au plus `writeDelays.length` écritures. Pur (effets injectés) →
 * testable sans Electron.
 */
export async function writeVerified(
  steps: VerifiedWriteSteps,
  writeDelays: readonly number[] = WRITE_RETRY_DELAYS_MS,
  readDelays: readonly number[] = READBACK_DELAYS_MS
): Promise<VerifiedWriteResult> {
  let writes = 0
  let checks = 0
  for (const delay of writeDelays) {
    if (delay > 0) await steps.sleep(delay)
    writes++
    try {
      steps.write()
    } catch {
      continue
    }
    for (const readDelay of readDelays) {
      if (readDelay > 0) await steps.sleep(readDelay)
      let verdict: ReadbackVerdict
      try {
        verdict = steps.check()
      } catch {
        verdict = 'unreadable'
      }
      checks++
      if (verdict === 'ours') return { ok: true, writes, checks }
      if (verdict === 'foreign') break
    }
  }
  return { ok: false, writes, checks }
}

/**
 * Noms de périphériques Windows réservés (CON, PRN, NUL, COM1…, LPT1…). §x v1.9 :
 * testé sur la partie AVANT le premier point — sous Windows « con.1 », « NUL.tar.gz »
 * ou « COM1.png » désignent encore le périphérique (le fichier ne serait jamais créé).
 */
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\..*)?$/i

/**
 * Nom de fichier PNG SÛR pour une image exportée (glisser vers le bureau / une autre
 * application, « Enregistrer sous… »), dérivé du titre du nœud. Retire tout séparateur
 * de chemin (un titre « ../../x » ne sort jamais du dossier), les caractères interdits
 * sous Windows, les caractères de contrôle et de contrôle bidirectionnel (usurpation
 * d'extension « gpj.exe »), les points/espaces finaux (refusés par Windows), une
 * extension image déjà présente, puis borne la longueur et ajoute `.png`.
 */
export function safeImageFileName(name: unknown, fallback = 'image'): string {
  const clean = (raw: string): string =>
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.(png|jpe?g|webp|gif|bmp)$/i, '')
      .slice(0, 80)
      .replace(/[. ]+$/g, '')
      .replace(/^[. ]+/g, '')
  const safeFallback = clean(fallback) || 'image'
  let base = typeof name === 'string' ? clean(name) : ''
  if (base === '') base = safeFallback
  if (RESERVED_WINDOWS_NAME.test(base)) base = `${safeFallback}-${base}`
  return `${base}.png`
}
