/**
 * §2 v1.9 (galerie) — actions sur les images d'une ENTITÉ, partagées par tous les
 * points d'entrée : panneau Détails (bouton, dépôt, Ctrl+V), clic droit sur le nœud
 * (« Ajouter une image… »), bouton de la barre contextuelle, dépôt de fichiers image
 * directement SUR le nœud entité dans le tableau, et visionneuse (copier/enregistrer).
 *
 * Même pipeline que les nœuds image (§1 v1.4) : compression systématique
 * (`processImage`, profil ENTITY_IMAGE_PROFILE), puis découpage en chunks dans `files`
 * (`registerFile`, transactions bornées) ; seule la LISTE de références est écrite sur
 * le nœud, en UNE transaction annulable (`addEntityImages`).
 */
import type { BoardHandle } from '@/sync/BoardDoc'
import { hashPayload, parseDataUrl, readFileStatus, registerFile } from '@/sync/files'
import { getNodesMap, yMapToNode } from '@/sync/model'
import { addEntityImages } from '@/sync/boardOps'
import { processImage, toPngDataUrl } from '@/lib/image'
import { copyImageToClipboard } from '@/lib/imageClipboard'
import {
  ENTITY_IMAGE_PROFILE,
  MAX_ENTITY_IMAGES,
  isDisplayableImage,
  isInlineImageRef
} from '@/lib/entityImages'
import { useToasts } from '@/store/toasts'
import { formatNumber, t } from '@/i18n'
import type { EntityImage } from '@/types'

/** true si le fichier/blob annonce un type image (filtrage avant compression). */
export function isImageBlob(blob: Blob): boolean {
  return blob.type.startsWith('image/')
}

/** Hashes de la galerie actuelle de l'entité (null si le nœud est absent / pas une entité). */
function currentGalleryHashes(handle: BoardHandle, nodeId: string): Set<string> | null {
  const map = getNodesMap(handle.doc).get(nodeId)
  if (!map) return null
  const node = yMapToNode(nodeId, map)
  if (node.kind !== 'entity') return null
  return new Set((node.images ?? []).map((image) => image.hash))
}

/** Nombre d'images déjà attachées à l'entité (null si le nœud est absent / pas une entité). */
function currentImageCount(handle: BoardHandle, nodeId: string): number | null {
  return currentGalleryHashes(handle, nodeId)?.size ?? null
}

/** Hash (identique à celui de registerFile) d'une data-URL, SANS rien écrire. */
async function dataUrlHash(dataUrl: string): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl)
  return parsed ? hashPayload(parsed.payload) : null
}

/**
 * Compresse, enregistre puis attache des images à la galerie d'une entité. Les
 * fichiers non-image sont ignorés ; au-delà de la place restante, les images en trop
 * ne sont même pas compressées (toast explicite). L'appelant garantit le droit
 * d'édition (BoardContext neutralise l'action pour un visiteur).
 */
export async function attachEntityImageFiles(
  handle: BoardHandle,
  nodeId: string,
  blobs: Blob[],
  author: string
): Promise<void> {
  const push = useToasts.getState().push
  const images = blobs.filter(isImageBlob)
  if (images.length === 0) {
    push(t('entity.imagesNone'), 'info')
    return
  }
  const count = currentImageCount(handle, nodeId)
  if (count === null) return
  const room = MAX_ENTITY_IMAGES - count
  if (room <= 0) {
    push(t('entity.imagesFull', { max: MAX_ENTITY_IMAGES }), 'error')
    return
  }
  const accepted = images.slice(0, room)
  let skipped = images.length - accepted.length
  if (accepted.length > 1) push(t('entity.imagesProcessing', { count: accepted.length }), 'info')

  const additions: EntityImage[] = []
  for (const blob of accepted) {
    const result = await processImage(blob, ENTITY_IMAGE_PROFILE)
    if (!result.ok) {
      if (result.reason === 'too-large') {
        push(t('image.tooLarge', { size: formatNumber((result.sizeBytes ?? 0) / 1024 / 1024) }), 'error')
      } else if (result.reason === 'incompressible') {
        push(t('image.incompressible'), 'error')
      } else {
        push(t('image.readError'), 'error')
      }
      continue
    }
    // §2 v1.9 : les octets partagés (`files`, hors annulation, répliqués chez tous
    // les pairs, jamais ramassés) ne s'écrivent QUE si l'image sera bien attachée :
    // on revérifie juste avant l'écriture que l'entité existe encore et qu'il reste
    // de la place (galerie remplie entre-temps par un pair) — sinon aucun orphelin.
    const gallery = currentGalleryHashes(handle, nodeId)
    if (!gallery) return // entité supprimée pendant la compression : on abandonne
    const expected = await dataUrlHash(result.dataUrl)
    const known =
      expected !== null &&
      (gallery.has(expected) || additions.some((image) => image.hash === expected))
    const pending = new Set(additions.map((image) => image.hash).filter((h) => !gallery.has(h))).size
    if (!known && gallery.size + pending >= MAX_ENTITY_IMAGES) {
      skipped += 1 // galerie pleine : pas d'écriture d'octets
      continue
    }
    const hash = await registerFile(handle, result.dataUrl, { width: result.width, height: result.height })
    if (!hash) {
      push(t('image.readError'), 'error')
      continue
    }
    additions.push({ hash, width: result.width, height: result.height })
  }
  if (additions.length === 0) return

  // Une seule transaction (un seul pas d'annulation) pour tout le lot.
  const outcome = addEntityImages(handle, nodeId, additions, author)
  if (!outcome) return
  skipped += outcome.overflow
  if (outcome.added > 0) push(t('entity.imagesAdded', { count: outcome.added }), 'success')
  if (outcome.duplicates > 0 && outcome.added === 0) push(t('entity.imagesDuplicate'), 'info')
  if (skipped > 0) push(t('entity.imagesOverflow', { count: skipped, max: MAX_ENTITY_IMAGES }), 'error')
}

/**
 * Ouvre le sélecteur de fichiers natif (plusieurs images) et résout la liste choisie
 * (vide si annulé). Champ `<input type=file>` éphémère : utilisable depuis n'importe
 * quel bouton / menu sans élément caché à monter. Doit être appelé dans un geste
 * utilisateur (clic).
 */
export function pickImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.style.display = 'none'
    let settled = false
    const finish = (files: File[]): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish([...(input.files ?? [])]))
    input.addEventListener('cancel', () => finish([]))
    document.body.appendChild(input)
    input.click()
  })
}

/** Ouvre le sélecteur puis attache les images choisies à l'entité. */
export function pickAndAttachEntityImages(handle: BoardHandle, nodeId: string, author: string): void {
  void pickImageFiles().then((files) => {
    if (files.length > 0) void attachEntityImageFiles(handle, nodeId, files, author)
  })
}

/**
 * Id du nœud ENTITÉ situé sous un point écran (dépôt de fichiers sur le tableau), ou
 * null. On prend l'élément le PLUS HAUT au point : un panneau posé par-dessus le
 * canvas masque donc le nœud (pas d'attache involontaire).
 */
export function entityIdAtPoint(clientX: number, clientY: number): string | null {
  const top = document.elementFromPoint(clientX, clientY)
  const nodeEl = top instanceof Element ? top.closest('.react-flow__node-entity') : null
  const id = nodeEl?.getAttribute('data-id')
  return id && id !== '' ? id : null
}

/** Images d'un presse-papiers / d'un glisser-déposer (Blob), dans l'ordre. */
export function imageFilesOf(transfer: DataTransfer | null): File[] {
  if (!transfer) return []
  const files = [...transfer.files].filter(isImageBlob)
  if (files.length > 0) return files
  // Collage d'une capture d'écran : pas de `files`, mais un item image.
  return [...transfer.items]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
}

/** true si un glisser en cours transporte (au moins) un fichier image — `dragenter`/
 *  `dragover` n'exposent que les types, pas les octets. */
export function dragCarriesImages(transfer: DataTransfer | null): boolean {
  if (!transfer) return false
  const items = [...transfer.items]
  if (items.some((item) => item.kind === 'file' && item.type.startsWith('image/'))) return true
  // Certains systèmes ne révèlent pas le type pendant le survol : on accepte « Files ».
  return items.length === 0 && [...transfer.types].includes('Files')
}

/** Data-URL d'une image de galerie (inline, ou fichier complet) ; null si pas encore
 *  reçue — ou si le fichier désigné n'est pas une image (donnée de pair incohérente). */
export function resolveEntityImage(handle: BoardHandle, hash: string): string | null {
  if (isInlineImageRef(hash)) return isDisplayableImage(hash) ? hash : null
  const status = readFileStatus(handle.doc, hash)
  return status.status === 'complete' && isDisplayableImage(status.dataUrl) ? status.dataUrl : null
}

/** « Copier l'image » : bitmap PNG posé sur le presse-papiers système (+ toast). */
export async function copyEntityImage(handle: BoardHandle, hash: string): Promise<void> {
  const push = useToasts.getState().push
  const dataUrl = resolveEntityImage(handle, hash)
  if (!dataUrl) {
    push(t('image.copyEmpty'), 'info')
    return
  }
  const ok = await copyImageToClipboard(dataUrl)
  push(ok ? t('image.copied') : t('image.copyError'), ok ? 'success' : 'error')
}

/** « Enregistrer l'image sous… » : conversion PNG puis dialogue natif (IPC savePng). */
export async function saveEntityImage(handle: BoardHandle, hash: string, fileName: string): Promise<void> {
  const push = useToasts.getState().push
  const dataUrl = resolveEntityImage(handle, hash)
  if (!dataUrl) {
    push(t('image.copyEmpty'), 'info')
    return
  }
  const png = await toPngDataUrl(dataUrl)
  if (!png) {
    push(t('entity.imageSaveError'), 'error')
    return
  }
  try {
    const result = await window.cosint.savePng(fileName, png)
    if (result.saved) push(t('entity.imageSaved'), 'success')
    else if (result.error) push(t('entity.imageSaveError'), 'error')
  } catch {
    push(t('entity.imageSaveError'), 'error')
  }
}
