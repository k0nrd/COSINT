/**
 * §1 v1.9 (copie d'image) — SORTIE d'une image du tableau, côté processus principal.
 *
 *  - `app:copy-image` (enregistré par ipc.ts, délègue à `copyImagePayload`) : pose le
 *    BITMAP sur le presse-papiers système PUIS VÉRIFIE qu'il y est (relecture des
 *    dimensions). Sous Windows, le presse-papiers est une ressource VERROUILLÉE
 *    (OpenClipboard) : un moniteur de presse-papiers (historique Win+V, synchronisation
 *    cloud, bureau à distance, suite bureautique…) qui le lit au même instant fait
 *    échouer l'écriture EN SILENCE (Chromium abandonne après quelques millisecondes).
 *    La relecture compare dimensions ET pixels (vignette) : une image précédente de même
 *    taille restée en place ne passe pas pour un succès. On réessaie brièvement avant de
 *    déclarer l'échec, et le renderer affiche le VRAI résultat (plus jamais « copié »
 *    quand rien ne l'a été).
 *  - `app:start-image-drag` : écrit un PNG dans un dossier temporaire propre à la
 *    session puis lance `webContents.startDrag` → glisser l'image vers le bureau,
 *    l'explorateur ou un autre logiciel. Dossier supprimé à la fermeture ; les restes
 *    d'une session interrompue (plantage) sont purgés au démarrage suivant.
 *
 * Entrées NON fiables (renderer sous sandbox) : type déclaré, alphabet base64,
 * signature binaire réelle, taille et dimensions sont vérifiés (`shared/imageData`) ;
 * aucun chemin n'est accepté du renderer (seul un NOM, assaini, l'est).
 */
import { app, clipboard, ipcMain, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyReadback,
  EXPORTABLE_IMAGE_TYPES,
  MAX_IMAGE_SIDE,
  parseImageDataUrl,
  safeImageFileName,
  sniffImageMime,
  VERIFY_SAMPLE_SIDE,
  writeVerified
} from '../shared/imageData'
import type { ImageProbe, ReadbackVerdict } from '../shared/imageData'

/** Longueur maximale du texte optionnel posé avec l'image (1 Mo, comme `app:copy-text`). */
const MAX_CLIPBOARD_TEXT = 1024 * 1024

/** Nombre de glisser-déposer dont le fichier temporaire est conservé (les plus récents). */
const MAX_DRAG_FILES = 12

/** Côté maximal (px) de la vignette affichée sous le curseur pendant le glisser. */
const DRAG_ICON_SIDE = 128

/** Préfixe du dossier temporaire des glisser-déposer (purge des sessions interrompues). */
const DRAG_DIR_PREFIX = 'cosint-drag-'

/** Âge (ms) au-delà duquel un dossier de glisser d'une AUTRE session est purgé. */
const STALE_DRAG_DIR_MS = 24 * 60 * 60 * 1000

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface DecodedImage {
  image: NativeImage
  bytes: Buffer
  mime: string
}

/**
 * Décode et valide une data-URL image venue du renderer. `null` si : pas une data-URL
 * image base64 d'un type accepté, trop grande, signature binaire ≠ type déclaré (un
 * « PNG » qui n'en est pas un), image indécodable ou dimensions hors bornes.
 */
export function decodeImagePayload(
  dataUrl: unknown,
  allowed: readonly string[] = EXPORTABLE_IMAGE_TYPES
): DecodedImage | null {
  const parsed = parseImageDataUrl(dataUrl, allowed)
  if (!parsed) return null
  const bytes = Buffer.from(parsed.base64, 'base64')
  if (bytes.length === 0 || sniffImageMime(bytes) !== parsed.mime) return null
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  if (width < 1 || height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) return null
  return { image, bytes, mime: parsed.mime }
}

/**
 * Relevé d'une image : dimensions réelles + vignette VERIFY_SAMPLE_SIDE² en BGRA
 * PRÉMULTIPLIÉ (format natif de `toBitmap`) — base de la vérification par relecture.
 */
function probeImage(image: NativeImage): ImageProbe {
  const { width, height } = image.getSize()
  const sample = image
    .resize({ width: VERIFY_SAMPLE_SIDE, height: VERIFY_SAMPLE_SIDE, quality: 'good' })
    .toBitmap()
  return { width, height, sample }
}

/**
 * Le presse-papiers ANNONCE-t-il une image ? Sous Windows, cette question
 * (IsClipboardFormatAvailable) n'ouvre pas le presse-papiers : elle reste fiable même
 * quand un autre programme le tient verrouillé — contrairement à `readImage`.
 */
function clipboardAnnouncesImage(): boolean {
  try {
    return clipboard.availableFormats().some((format) => format.startsWith('image/'))
  } catch {
    return false
  }
}

/** Relit le presse-papiers et le juge (voir `classifyReadback`). */
function readbackVerdict(expected: ImageProbe): ReadbackVerdict {
  const announced = clipboardAnnouncesImage()
  const current = clipboard.readImage()
  return classifyReadback(expected, current.isEmpty() ? null : probeImage(current), announced)
}

/**
 * Écrit l'image (et, en option, un texte) dans le presse-papiers système PUIS vérifie
 * par relecture qu'elle y est (mêmes dimensions ET mêmes couleurs : une image
 * précédente de même taille restée en place ne passe pas pour un succès). Reprises
 * bornées (`writeVerified`) : presse-papiers Windows momentanément verrouillé par un
 * autre programme (historique Win+V, synchronisation, bureau à distance…). En temps
 * normal : UNE écriture + UNE relecture. true = l'image y est bien.
 */
export async function writeImageToClipboard(image: NativeImage, text?: string): Promise<boolean> {
  const expected = probeImage(image)
  const result = await writeVerified({
    write: () => {
      if (text) clipboard.write({ text, image })
      else clipboard.writeImage(image)
    },
    check: () => readbackVerdict(expected),
    sleep
  })
  return result.ok
}

/**
 * Corps du canal `app:copy-image` : `{ dataUrl, text? }` → bitmap (PNG/JPEG) posé et
 * vérifié. `text` optionnel = fragment posé EN PLUS (compatibilité §2 v1.8.1 ; le
 * tableau n'en pose plus pour une image seule). Retour neutre (false) sur toute
 * entrée invalide — jamais de throw.
 */
export async function copyImagePayload(payload: unknown): Promise<boolean> {
  if (typeof payload !== 'object' || payload === null) return false
  const { dataUrl, text } = payload as { dataUrl?: unknown; text?: unknown }
  const decoded = decodeImagePayload(dataUrl)
  if (!decoded) return false
  const extra =
    typeof text === 'string' && text.length > 0 && text.length <= MAX_CLIPBOARD_TEXT ? text : undefined
  try {
    return await writeImageToClipboard(decoded.image, extra)
  } catch {
    return false
  }
}

// ——— Glisser l'image hors de l'application ———

/** Dossier temporaire de la session (créé au premier glisser). */
let dragRoot: string | null = null
/** Sous-dossiers des derniers glisser (un par glisser : deux titres identiques ne se
 *  marchent pas dessus). */
const dragDirs: string[] = []

/**
 * §x v1.9 : le dossier racine porte le PID (`cosint-drag-<pid>-XXXX`) — la purge d'une
 * autre instance ne supprime jamais le dossier d'une instance vivante — et il est
 * recréé s'il a disparu (nettoyage externe du dossier temporaire), sinon tout glisser
 * suivant échouerait jusqu'au redémarrage.
 */
function dragRootDir(): string {
  if (!dragRoot || !existsSync(dragRoot)) {
    dragRoot = mkdtempSync(join(app.getPath('temp'), `${DRAG_DIR_PREFIX}${process.pid}-`))
    dragDirs.length = 0
  }
  return dragRoot
}

/** PID encore vivant ? (`kill(pid, 0)` : EPERM = vivant mais d'un autre utilisateur). */
function pidAlive(pid: number): boolean {
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

/** Supprime le dossier temporaire de la session (fermeture de l'application). */
export function cleanupDragFiles(): void {
  const root = dragRoot
  dragRoot = null
  dragDirs.length = 0
  if (!root) return
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    // Fichier encore ouvert par l'application cible : purgé au prochain démarrage.
  }
}

/** Purge les dossiers de glisser laissés par une session interrompue (> 24 h). */
function purgeStaleDragDirs(): void {
  try {
    const temp = app.getPath('temp')
    const now = Date.now()
    for (const name of readdirSync(temp)) {
      if (!name.startsWith(DRAG_DIR_PREFIX)) continue
      const path = join(temp, name)
      // Dossier d'une instance encore en cours d'exécution : jamais purgé.
      const pid = /^(\d{1,10})-/.exec(name.slice(DRAG_DIR_PREFIX.length))
      if (pid && pidAlive(Number(pid[1]))) continue
      try {
        if (now - statSync(path).mtimeMs > STALE_DRAG_DIR_MS) rmSync(path, { recursive: true, force: true })
      } catch {
        // Dossier disparu ou verrouillé : ignoré.
      }
    }
  } catch {
    // Dossier temporaire illisible : rien à purger.
  }
}

/** Vignette affichée sous le curseur pendant le glisser (proportions conservées). */
function dragIcon(image: NativeImage): NativeImage {
  const { width, height } = image.getSize()
  if (width <= DRAG_ICON_SIDE && height <= DRAG_ICON_SIDE) return image
  return image.resize(width >= height ? { width: DRAG_ICON_SIDE } : { height: DRAG_ICON_SIDE })
}

/** Enregistre le canal de glisser-déposer sortant + le nettoyage du dossier temporaire. */
export function setupImageExport(): void {
  purgeStaleDragDirs()
  app.on('will-quit', cleanupDragFiles)

  ipcMain.handle('app:start-image-drag', (event, payload: unknown): boolean => {
    if (typeof payload !== 'object' || payload === null) return false
    const { dataUrl, name } = payload as { dataUrl?: unknown; name?: unknown }
    // PNG uniquement : le renderer convertit toujours avant d'appeler.
    const decoded = decodeImagePayload(dataUrl, ['image/png'])
    if (!decoded) return false
    try {
      const dir = mkdtempSync(join(dragRootDir(), 'd-'))
      dragDirs.push(dir)
      while (dragDirs.length > MAX_DRAG_FILES) {
        const old = dragDirs.shift()
        // §1 v1.9 : un ancien fichier encore ouvert ailleurs (EBUSY/EPERM sous Windows)
        // ne doit JAMAIS faire échouer le glisser en cours — la purge au démarrage
        // (> 24 h) et `will-quit` le nettoieront plus tard.
        try {
          if (old) rmSync(old, { recursive: true, force: true })
        } catch {
          /* ignoré */
        }
      }
      const file = join(dir, safeImageFileName(name))
      writeFileSync(file, decoded.bytes)
      event.sender.startDrag({ file, icon: dragIcon(decoded.image) })
      return true
    } catch {
      return false
    }
  })
}
