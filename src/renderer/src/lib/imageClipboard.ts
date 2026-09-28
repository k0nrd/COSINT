/**
 * §1 v1.9 (copie d'image) — SORTIR une image du tableau vers le reste du système :
 *  - presse-papiers SYSTÈME (bitmap PNG) : Ctrl+C, clic droit « Copier l'image »,
 *    bouton du nœud, galerie des entités ;
 *  - « Enregistrer l'image sous… » (dialogue natif, IPC `savePng`) ;
 *  - glisser l'image HORS de l'application (bureau, explorateur, messagerie…) : le main
 *    écrit un PNG temporaire puis lance `webContents.startDrag` ;
 *  - reconnaissance de NOTRE image au recollage dans COSINT (empreinte) pour recréer le
 *    nœud en pleine fidélité (titre, tags, taille) au lieu d'un nœud image nu.
 *
 * Cause racine des copies « vides » (≤ 1.8.9 et build PORTABLE Windows 1.9.0, antérieur
 * à la conversion PNG) : l'image était transmise telle quelle — en WebP, format de
 * STOCKAGE de COSINT — à `nativeImage.createFromDataURL`, qui NE DÉCODE PAS le WebP
 * (vérifié : image vide) → rien n'était écrit, sans erreur visible (Ctrl+C affichait
 * « 1 élément copié » sans attendre le résultat). Tout passe donc par une conversion PNG
 * (canvas : Chromium décode le WebP côté renderer), UNE écriture côté main vérifiée par
 * relecture (avec quelques nouvelles tentatives : presse-papiers Windows verrouillé par
 * un autre programme), et le résultat RÉEL pilote le toast. Ctrl+C sur une image annule
 * la touche : aucun évènement `copy` du DOM n'écrit quoi que ce soit en parallèle.
 *
 * Point d'entrée unique, partagé par le nœud image et la galerie d'images des entités.
 */
import { meanColorDistance, safeImageFileName } from '@shared/imageData'
import { toPngDataUrl } from '@/lib/image'
import { useToasts } from '@/store/toasts'
import { t } from '@/i18n'

// ——— Conversion PNG (mise en cache) ———

/** Nombre de conversions gardées en mémoire (copie puis glisser de la même image). */
const PNG_CACHE_MAX = 3
const pngCache = new Map<string, Promise<string | null>>()

/**
 * Data-URL PNG équivalente à `dataUrl` (WebP/JPEG/PNG), ou `null` si le décodage
 * échoue. Les dernières conversions sont mises en cache : le glisser-déposer doit
 * pouvoir démarrer sans attendre, et une copie répétée ne reconvertit pas. Un échec
 * n'est jamais mis en cache (nouvel essai possible).
 */
export function pngFor(dataUrl: string): Promise<string | null> {
  const cached = pngCache.get(dataUrl)
  if (cached) {
    // Rafraîchit l'ordre LRU (Map = ordre d'insertion).
    pngCache.delete(dataUrl)
    pngCache.set(dataUrl, cached)
    return cached
  }
  const pending = toPngDataUrl(dataUrl).catch(() => null)
  pngCache.set(dataUrl, pending)
  while (pngCache.size > PNG_CACHE_MAX) {
    const oldest = pngCache.keys().next().value
    if (oldest === undefined) break
    pngCache.delete(oldest)
  }
  void pending.then((png) => {
    if (png === null && pngCache.get(dataUrl) === pending) pngCache.delete(dataUrl)
  })
  return pending
}

/** Lance la conversion PNG en tâche de fond (survol/pression de la poignée de glisser). */
export function warmImagePng(dataUrl: string | null): void {
  if (dataUrl && dataUrl.startsWith('data:image/')) void pngFor(dataUrl)
}

// ——— Empreinte d'image (reconnaissance au recollage) ———

/** Côté de la vignette d'empreinte (16 × 16 px RGBA = 1024 valeurs). */
export const FINGERPRINT_SIDE = 16
/**
 * Écart moyen toléré par canal (0-255) entre deux empreintes « identiques » : absorbe
 * les arrondis d'un aller-retour par le presse-papiers système (alpha prémultiplié,
 * DIB Windows), mais distingue deux images différentes de mêmes dimensions.
 */
export const FINGERPRINT_TOLERANCE = 4

export interface ImageFingerprint {
  /** Dimensions RÉELLES de l'image (px). */
  width: number
  height: number
  /** Vignette FINGERPRINT_SIDE² en RGBA (non prémultiplié). */
  samples: ArrayLike<number>
}

/**
 * Échantillons RGBA non prémultipliés → couleurs PRÉMULTIPLIÉES (alpha conservé mais
 * ignoré ensuite par `meanColorDistance`). §1 v1.9 : un aller-retour par le
 * presse-papiers Windows rend l'image OPAQUE en gardant les couleurs prémultipliées ;
 * comparer ainsi reconnaît une image à transparence recollée (sinon : nœud nu).
 */
function premultiplied(samples: ArrayLike<number>): number[] {
  const out = new Array<number>(samples.length)
  for (let index = 0; index < samples.length; index++) {
    const alpha = samples[index - (index % 4) + 3] ?? 255
    out[index] = index % 4 === 3 ? alpha : Math.round((samples[index] * alpha) / 255)
  }
  return out
}

/**
 * Deux empreintes désignent-elles la même image ? Dimensions strictement égales ET
 * écart moyen par canal de couleur prémultipliée ≤ `tolerance` (alpha ignoré : il
 * ne survit pas au presse-papiers Windows). Pur → testable sans DOM.
 */
export function fingerprintsMatch(
  a: ImageFingerprint,
  b: ImageFingerprint,
  tolerance: number = FINGERPRINT_TOLERANCE
): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  return meanColorDistance(premultiplied(a.samples), premultiplied(b.samples)) <= tolerance
}

/** Décode une data-URL base64 en Blob, sans `fetch` (la CSP interdit `connect-src data:`). */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, comma)
  if (comma < 0 || !/;base64$/i.test(header)) return null
  const mime = header.slice(5, header.length - ';base64'.length) || 'application/octet-stream'
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

/**
 * Empreinte d'une image (data-URL ou Blob collé). Les DEUX côtés (copie et collage)
 * passent par le même décodage (`createImageBitmap`) et la même réduction, pour que
 * seule une vraie différence de pixels écarte la correspondance. `null` si indécodable.
 */
export async function fingerprintImage(source: string | Blob): Promise<ImageFingerprint | null> {
  try {
    const blob = typeof source === 'string' ? dataUrlToBlob(source) : source
    if (!blob) return null
    const bitmap = await createImageBitmap(blob)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = FINGERPRINT_SIDE
      canvas.height = FINGERPRINT_SIDE
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'medium'
      ctx.drawImage(bitmap, 0, 0, FINGERPRINT_SIDE, FINGERPRINT_SIDE)
      const samples = ctx.getImageData(0, 0, FINGERPRINT_SIDE, FINGERPRINT_SIDE).data
      return { width: bitmap.width, height: bitmap.height, samples }
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

// ——— Presse-papiers système ———

/** Numéro de la dernière copie d'image RÉUSSIE (0 = aucune) et son empreinte. */
let copySeq = 0
let lastCopy: { id: number; fingerprint: Promise<ImageFingerprint | null> } | null = null

/**
 * Pose l'image (data-URL WebP/JPEG/PNG) comme BITMAP sur le presse-papiers système,
 * pour la coller dans un autre logiciel (document, messagerie, e-mail, Paint…).
 * Conversion PNG préalable, écriture ET vérification côté main. Retourne true si
 * l'image est bien sur le presse-papiers. N'affiche rien (voir `copyImageWithToast`).
 */
export async function copyImageToClipboard(dataUrl: string): Promise<boolean> {
  if (!dataUrl.startsWith('data:image/')) return false
  const png = await pngFor(dataUrl)
  if (!png) return false
  let ok = false
  try {
    ok = await window.cosint.copyImage(png)
  } catch {
    ok = false
  }
  if (ok) {
    copySeq += 1
    lastCopy = { id: copySeq, fingerprint: fingerprintImage(png) }
  }
  return ok
}

/** Identifiant de la dernière copie d'image réussie (0 si aucune). */
export function lastImageCopyId(): number {
  return lastCopy?.id ?? 0
}

/**
 * L'image collée (`blob`, lue depuis le presse-papiers) est-elle celle posée par la
 * copie `copyId` ? Faux si une autre copie d'image a eu lieu depuis, ou si les pixels
 * diffèrent (l'utilisateur a copié autre chose ailleurs entre-temps).
 */
export async function isLastCopiedImage(blob: Blob, copyId: number): Promise<boolean> {
  const current = lastCopy
  if (!current || current.id !== copyId || copyId === 0) return false
  const [copied, pasted] = await Promise.all([current.fingerprint, fingerprintImage(blob)])
  if (!copied || !pasted) return false
  return fingerprintsMatch(copied, pasted)
}

/**
 * Copie + toast de résultat (succès / échec / image pas encore reçue). Retourne le
 * résultat pour que l'appelant enchaîne (ex. couper = supprimer SEULEMENT si la copie
 * a réussi).
 */
export async function copyImageWithToast(dataUrl: string | null): Promise<boolean> {
  const push = useToasts.getState().push
  if (!dataUrl) {
    push(t('image.copyEmpty'), 'info')
    return false
  }
  const ok = await copyImageToClipboard(dataUrl)
  push(ok ? t('image.copied') : t('image.copyError'), ok ? 'success' : 'error')
  return ok
}

// ——— Raccourcis clavier ———

export type ClipboardChord = 'copy' | 'cut'

/**
 * Raccourci presse-papiers porté par un évènement clavier : Ctrl/Cmd+C ou Ctrl+Inser
 * → 'copy' ; Ctrl/Cmd+X → 'cut' ; sinon null. Tolère les dispositions clavier non
 * latines (touche physique `KeyC`/`KeyX` quand `key` n'est pas une lettre latine).
 * Alt/AltGr ou Maj présents → null (autres raccourcis). Pur → testable.
 */
export function clipboardChordOf(event: {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}): ClipboardChord | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return null
  if (event.key === 'Insert') return event.ctrlKey ? 'copy' : null
  const key = event.key.length === 1 ? event.key.toLowerCase() : ''
  let letter = /^[a-z]$/.test(key) ? key : ''
  if (letter === '' && key !== '') {
    if (event.code === 'KeyC') letter = 'c'
    else if (event.code === 'KeyX') letter = 'x'
  }
  if (letter === 'c') return 'copy'
  if (letter === 'x') return 'cut'
  return null
}

// ——— Décision : la sélection est-elle UNE image à poser en bitmap ? ———

/**
 * Cible d'une copie d'image pour la sélection courante :
 *  - `image`   : exactement UN nœud image dont les octets sont complets → bitmap ;
 *  - `pending` : UN nœud image dont l'image est encore en réception (chunks, pair
 *                absent) → rien n'est copié, un toast l'explique ;
 *  - `null`    : autre sélection (plusieurs nœuds, nœud non image, image vide) → copie
 *                du fragment COSINT habituelle (collage interne, entre tableaux).
 */
export type ImageCopyTarget = { kind: 'image'; dataUrl: string } | { kind: 'pending' } | null

/**
 * Décide la cible d'une copie d'image. `resolveHash` rend la data-URL COMPLÈTE d'un
 * fichier, `null` tant que tous les chunks ne sont pas là (réception en cours), ou
 * `false` si l'image est définitivement indisponible (§1 v1.9 : fichier manquant ou
 * corrompu) — la cible est alors `null` pour que la copie/coupe NORMALE du fragment
 * COSINT s'applique (le hash pourra être résolu plus tard sur un autre tableau). Une data-URL inline
 * héritée (`data:image/…`, avant migration v1.4) est prise telle quelle. Une valeur
 * résolue qui n'est pas une image (donnée de pair incohérente) n'est jamais posée
 * comme bitmap. Pur → testable sans Yjs ni DOM.
 */
export function imageCopyTarget(
  nodes: ReadonlyArray<{ kind: string; content: string }>,
  resolveHash: (hash: string) => string | null | false
): ImageCopyTarget {
  if (nodes.length !== 1) return null
  const node = nodes[0]
  if (node.kind !== 'image' || node.content === '') return null
  if (node.content.startsWith('data:image/')) return { kind: 'image', dataUrl: node.content }
  const dataUrl = resolveHash(node.content)
  if (dataUrl === false) return null
  if (dataUrl === null) return { kind: 'pending' }
  return dataUrl.startsWith('data:image/') ? { kind: 'image', dataUrl } : null
}

/** Action d'un raccourci presse-papiers sur une image (voir `imageKeyAction`). */
export type ImageKeyAction =
  | { action: 'copy' | 'cut'; dataUrl: string }
  | { action: 'pending' }
  | null

/**
 * Faut-il INTERCEPTER ce raccourci (keydown annulé, phase de capture) ? Oui seulement
 * pour Ctrl/Cmd+C, Ctrl+X ou Ctrl+Inser, hors champ de saisie / modale / panneau, et
 * quand la sélection est UNE image (complète → copie/coupe ; en réception → toast).
 * Sinon `null` : le navigateur et les évènements copy/cut gardent la main (texte d'un
 * champ, fragment COSINT d'une sélection multiple). Pur → testable.
 */
export function imageKeyAction(
  chord: ClipboardChord | null,
  inEditableField: boolean,
  target: ImageCopyTarget
): ImageKeyAction {
  if (!chord || inEditableField || !target) return null
  if (target.kind === 'pending') return { action: 'pending' }
  return { action: chord, dataUrl: target.dataUrl }
}

// ——— Enregistrer sous / glisser hors de l'application ———

/** Nom de fichier PNG proposé pour une image (titre du nœud assaini, repli traduit). */
export function imageFileName(title: string): string {
  return safeImageFileName(title, t('image.fileName'))
}

/** « Enregistrer l'image sous… » : conversion PNG puis dialogue natif, avec toasts. */
export async function saveImageAs(dataUrl: string | null, title: string): Promise<boolean> {
  const push = useToasts.getState().push
  if (!dataUrl) {
    push(t('image.notReady'), 'info')
    return false
  }
  const png = await pngFor(dataUrl)
  if (!png) {
    push(t('image.saveError'), 'error')
    return false
  }
  try {
    const result = await window.cosint.savePng(imageFileName(title), png)
    if (result.saved) {
      push(t('image.saved'), 'success')
      return true
    }
    if (result.error) push(t('image.saveError'), 'error')
    return false
  } catch {
    push(t('image.saveError'), 'error')
    return false
  }
}

/**
 * Glisser l'image HORS de l'application : le main écrit un PNG temporaire (nom assaini,
 * dossier temporaire nettoyé à la fermeture) puis lance le glisser natif du système.
 * À appeler depuis un `dragstart` annulé (bouton souris encore enfoncé).
 */
export async function startImageDrag(dataUrl: string | null, title: string): Promise<boolean> {
  if (!dataUrl) {
    useToasts.getState().push(t('image.notReady'), 'info')
    return false
  }
  const png = await pngFor(dataUrl)
  let ok = false
  if (png) {
    try {
      ok = await window.cosint.startImageDrag(png, imageFileName(title))
    } catch {
      ok = false
    }
  }
  if (!ok) useToasts.getState().push(t('image.dragError'), 'error')
  return ok
}
