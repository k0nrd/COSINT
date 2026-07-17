/**
 * Traitement des images collées, déposées ou choisies comme avatar (§1 v1.4).
 *
 * Compression SYSTÉMATIQUE à l'import (§1.3) : toute image est redimensionnée
 * (dimension max selon le profil) et réencodée en WebP (repli JPEG) avant d'être
 * insérée. Deux profils avec des LIMITES STRICTES après compression :
 *  - tableau  : ≤ 1600 px, ≤ 1,5 Mo — au-delà, refus poli expliquant la limite ;
 *  - avatar   : ≤ 256 px,  ≤ 200 Ko — idem.
 *
 * La compression borne la taille des images AVANT le découpage en chunks
 * (sync/files.ts), ce qui garde le document léger et la synchro P2P robuste.
 */

/** Profil de compression selon la destination de l'image. */
export interface ImageProfile {
  /** Dimension maximale (px) du plus grand côté. */
  maxDim: number
  /** Taille cible maximale de la data-URL produite (octets ≈ caractères). */
  targetBytes: number
  /** Taille maximale acceptée à la source (avant toute compression). */
  hardLimitBytes: number
}

/** Profil « image de tableau » (§1.3). */
export const BOARD_IMAGE_PROFILE: ImageProfile = {
  maxDim: 1600,
  targetBytes: Math.round(1.5 * 1024 * 1024),
  hardLimitBytes: 25 * 1024 * 1024
}

/** Profil « avatar » (§1.3). */
export const AVATAR_IMAGE_PROFILE: ImageProfile = {
  maxDim: 256,
  targetBytes: 200 * 1024,
  hardLimitBytes: 25 * 1024 * 1024
}

export type ProcessedImage =
  | { ok: true; dataUrl: string; width: number; height: number; compressed: boolean }
  | { ok: false; reason: 'too-large' | 'incompressible' | 'unreadable'; sizeBytes?: number }

const ACCEPTED_TYPES = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode'))
    img.src = dataUrl
  })
}

/**
 * Redessine l'image à l'échelle donnée et réencode en WebP (repli JPEG si le
 * moteur ne produit pas de WebP). WebP préserve la transparence, contrairement
 * au JPEG (voir DECISIONS.md n°96).
 */
function reencode(img: HTMLImageElement, scale: number, quality: number): string | null {
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, width, height)
  const webp = canvas.toDataURL('image/webp', quality)
  if (webp.startsWith('data:image/webp')) return webp
  // Repli JPEG : fond blanc car le JPEG ne gère pas la transparence.
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Valide et compresse une image pour le stockage. `profile` fixe la dimension
 * max et la taille cible (tableau vs avatar). Toujours réencodée (§1.3).
 */
export async function processImage(
  blob: Blob,
  profile: ImageProfile = BOARD_IMAGE_PROFILE
): Promise<ProcessedImage> {
  if (blob.size > profile.hardLimitBytes) {
    return { ok: false, reason: 'too-large', sizeBytes: blob.size }
  }
  if (!ACCEPTED_TYPES.test(blob.type)) {
    return { ok: false, reason: 'unreadable' }
  }

  let original: string
  let img: HTMLImageElement
  try {
    original = await blobToDataUrl(blob)
    img = await loadImage(original)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }

  // Échelle initiale : ramène le plus grand côté à la dimension max du profil.
  const maxDim = Math.max(img.naturalWidth, img.naturalHeight)
  const baseScale = Math.min(1, profile.maxDim / maxDim)
  // Échelles décroissantes à partir de la dimension max, puis qualités décroissantes.
  const scales = [baseScale, baseScale * 0.8, baseScale * 0.65, baseScale * 0.5]
  const qualities = [0.82, 0.7, 0.55, 0.42]

  let best: string | null = null
  for (const scale of scales) {
    for (const quality of qualities) {
      const candidate = reencode(img, scale, quality)
      if (candidate === null) continue
      // Retient la plus petite version obtenue (dernier recours si rien ne passe).
      if (best === null || candidate.length < best.length) best = candidate
      if (candidate.length <= profile.targetBytes) {
        const finalImg = await loadImage(candidate)
        return {
          ok: true,
          dataUrl: candidate,
          width: finalImg.naturalWidth,
          height: finalImg.naturalHeight,
          compressed: true
        }
      }
    }
  }

  // Impossible de descendre sous la cible : refus poli (§1.3), jamais d'insertion
  // d'une image qui saturerait la synchro.
  return { ok: false, reason: 'incompressible', sizeBytes: best?.length }
}

/** Taille d'affichage initiale d'un nœud image (bornée), à partir des pixels réels. */
export function initialImageNodeSize(width: number, height: number): { width: number; height: number } {
  const MAX = 420
  const scale = Math.min(1, MAX / Math.max(width, height))
  return { width: Math.max(80, Math.round(width * scale)), height: Math.max(60, Math.round(height * scale)) }
}
