/**
 * §5 v1.9 (aperçu) — rendu PDF avec pdf.js, CHARGÉ À LA DEMANDE (import dynamique :
 * le démarrage du tableau n'en paie jamais le coût tant qu'aucun PDF n'est affiché).
 *
 *  - Miniature de la 1re page d'un nœud fichier : rendue en canvas puis convertie en
 *    image (data-URL WebP/PNG, compatible avec l'export PNG du tableau), mise en cache
 *    en mémoire (LRU, clé = hash de contenu). Chaque pair calcule ses miniatures
 *    localement : RIEN n'est ajouté au document Yjs.
 *  - Session de visionneuse : un document ouvert, rendu page par page à la demande.
 *
 * Worker : fichier `pdf.worker.min.mjs` émis tel quel par Vite dans out/renderer/assets
 * (`?url`), instancié par NOUS (`new Worker(url, { type: 'module' })`) et confié à
 * pdf.js via un port explicite. Pourquoi : chargée depuis file://, la page a une
 * origine opaque ; pdf.js jugerait alors le worker « cross-origin » et l'envelopperait
 * dans un blob important un module file:// — détour inutile. Un worker de module
 * `'self'` est autorisé tel quel par la CSP de production (`worker-src 'self' blob:`),
 * qui n'a donc PAS besoin d'être assouplie.
 *
 * Sécurité (PDF de pairs NON FIABLES) : `isEvalSupported: false` (aucun `new Function`),
 * pas de XFA, aucun script (pdf.js n'exécute le JavaScript des PDF que via la
 * visionneuse complète + sandbox, jamais chargées ici), aucune ressource externe
 * (ni cMapUrl, ni standardFontDataUrl, ni fetch dans le worker), pas de calque
 * d'annotations (liens non cliquables), images bornées (`maxImageSize`), canvas bornés,
 * travail borné dans le temps (délais + worker tué s'il ne répond plus), une seule
 * miniature rendue à la fois.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFWorker } from 'pdfjs-dist'
import {
  LruCache,
  PDF_THUMB_BOUNDS,
  PDF_VIEWER_BOUNDS,
  PreviewTimeoutError,
  classifyPdfError,
  decodeBase64,
  fitScale,
  hasPdfSignature,
  type PdfFailure
} from './filePreview'

type PdfJs = typeof import('pdfjs-dist')

/** Délai max d'ouverture d'un document (analyse de la structure). */
const LOAD_TIMEOUT_MS = 20_000
/** Délai max du rendu d'une page. */
const RENDER_TIMEOUT_MS = 20_000
/** Taille max (pixels) d'une image intégrée décodée ; au-delà elle n'est pas rendue. */
const MAX_IMAGE_PIXELS = 4096 * 4096
/** 100 % dans la visionneuse = taille imprimée (1 pt PDF = 96/72 px CSS). */
export const PDF_TO_CSS = 96 / 72

let libPromise: Promise<PdfJs> | null = null

/** Charge pdf.js (une seule fois, à la première demande). */
function loadPdfJs(): Promise<PdfJs> {
  if (!libPromise) {
    libPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })
    // Échec de chargement (rare) : on autorise une nouvelle tentative plus tard.
    libPromise.catch(() => {
      libPromise = null
    })
  }
  return libPromise
}

/** Paramètres d'ouverture durcis (voir en-tête). */
function safeParams(lib: PdfJs, data: Uint8Array, worker: PDFWorker): Parameters<PdfJs['getDocument']>[0] {
  return {
    data,
    worker,
    isEvalSupported: false,
    enableXfa: false,
    useWorkerFetch: false,
    useSystemFonts: true,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    maxImageSize: MAX_IMAGE_PIXELS,
    verbosity: lib.VerbosityLevel.ERRORS
  }
}

/** Worker dédié : le Worker DOM (que l'on peut tuer) + son enveloppe pdf.js. */
interface WorkerSlot {
  worker: Worker
  pdfWorker: PDFWorker
  /** Rejetée si le script du worker échoue (chargement, CSP…) : échec rapide. */
  failed: Promise<never>
}

function createWorkerSlot(lib: PdfJs, name: string): WorkerSlot {
  const worker = new Worker(workerUrl, { type: 'module', name })
  const failed = new Promise<never>((_resolve, reject) => {
    worker.addEventListener('error', (event) => {
      event.preventDefault()
      reject(new Error('pdf-worker-error'))
    })
  })
  failed.catch(() => undefined)
  const pdfWorker = lib.PDFWorker.fromPort({
    port: worker,
    verbosity: lib.VerbosityLevel.ERRORS
  }) as PDFWorker
  return { worker, pdfWorker, failed }
}

function destroySlot(slot: WorkerSlot | null): void {
  if (!slot) return
  try {
    slot.pdfWorker.destroy()
  } catch {
    // déjà détruit
  }
  slot.worker.terminate()
}

/** Course contre la montre : rejette en PreviewTimeoutError après `ms` (et appelle
 * `onTimeout`, ex. annuler un rendu). */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      onTimeout?.()
      reject(new PreviewTimeoutError())
    }, ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/** Convertit un canvas en data-URL (WebP compact, repli PNG). */
function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.86)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png')
}

/** Libère la mémoire d'un canvas hors DOM. */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

/** Ouvre un document sur un worker, borné dans le temps. */
async function openDocument(
  lib: PdfJs,
  slot: WorkerSlot,
  bytes: Uint8Array
): Promise<{ doc: PDFDocumentProxy; destroy: () => void }> {
  const task = lib.getDocument(safeParams(lib, bytes, slot.pdfWorker))
  const destroy = (): void => {
    void task.destroy().catch(() => undefined)
  }
  try {
    const doc = await withTimeout(Promise.race([task.promise, slot.failed]), LOAD_TIMEOUT_MS)
    return { doc, destroy }
  } catch (error) {
    destroy()
    throw error
  }
}

// ——— Miniatures (nœud fichier) ———

export interface PdfThumbnail {
  /** data-URL de l'image de la 1re page. */
  url: string
  width: number
  height: number
  pageCount: number
}

export type PdfThumbnailResult = { ok: true; thumb: PdfThumbnail } | { ok: false; failure: PdfFailure }

/** Cache des miniatures (et des échecs, pour ne pas relancer en boucle un PDF
 * illisible à chaque rendu) — vidé entrée par entrée par « Réessayer ». */
const thumbCache = new LruCache<string, PdfThumbnailResult>(64)
const inflight = new Map<string, Promise<PdfThumbnailResult>>()
/** File d'attente : une seule miniature rendue à la fois (ouverture d'un tableau
 * contenant beaucoup de PDF sans pic de CPU/mémoire). */
let queue: Promise<unknown> = Promise.resolve()
let thumbSlot: WorkerSlot | null = null

/** Miniature déjà calculée (synchrone, pour le premier rendu). */
export function peekPdfThumbnail(hash: string): PdfThumbnailResult | undefined {
  return thumbCache.get(hash)
}

/** Oublie la miniature (ou l'échec) d'un fichier — bouton « Réessayer ». */
export function forgetPdfThumbnail(hash: string): void {
  thumbCache.delete(hash)
}

async function renderThumbnail(payload: string): Promise<PdfThumbnailResult> {
  const bytes = decodeBase64(payload)
  if (!hasPdfSignature(bytes)) return { ok: false, failure: 'corrupt' }
  const lib = await loadPdfJs()
  thumbSlot ??= createWorkerSlot(lib, 'cosint-pdf-thumbnails')
  const slot = thumbSlot
  let opened: { doc: PDFDocumentProxy; destroy: () => void } | null = null
  const canvas = document.createElement('canvas')
  try {
    opened = await openDocument(lib, slot, bytes)
    const { doc } = opened
    const page = await withTimeout(doc.getPage(1), LOAD_TIMEOUT_MS)
    const base = page.getViewport({ scale: 1 })
    const scale = fitScale(
      base.width,
      base.height,
      PDF_THUMB_BOUNDS.width,
      PDF_THUMB_BOUNDS.height,
      PDF_THUMB_BOUNDS.pixels
    )
    const viewport = page.getViewport({ scale })
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('canvas-unavailable')
    const task = page.render({ canvasContext: context, viewport, background: '#ffffff' })
    await withTimeout(task.promise, RENDER_TIMEOUT_MS, () => task.cancel())
    const thumb: PdfThumbnail = {
      url: canvasToDataUrl(canvas),
      width: canvas.width,
      height: canvas.height,
      pageCount: doc.numPages
    }
    page.cleanup()
    return { ok: true, thumb }
  } catch (error) {
    // Délai dépassé ou worker en échec : il est peut-être bloqué sur un PDF piégé →
    // on le tue ; le prochain rendu en recrée un neuf.
    const failure = classifyPdfError(error)
    if (failure === 'timeout' || failure === 'unavailable') {
      destroySlot(slot)
      if (thumbSlot === slot) thumbSlot = null
    }
    return { ok: false, failure }
  } finally {
    releaseCanvas(canvas)
    opened?.destroy()
  }
}

/**
 * Miniature de la 1re page d'un PDF (hash de contenu → résultat). Dédoublonnée
 * (un même fichier affiché par plusieurs nœuds n'est rendu qu'une fois), mise en
 * file d'attente et en cache. `getPayload` n'est appelée qu'au moment du rendu.
 */
export function requestPdfThumbnail(hash: string, getPayload: () => string): Promise<PdfThumbnailResult> {
  const cached = thumbCache.get(hash)
  if (cached) return Promise.resolve(cached)
  const pending = inflight.get(hash)
  if (pending) return pending
  // Octets indisponibles au moment du rendu (nœud supprimé / fichier retiré pendant
  // l'attente) : échec PASSAGER, jamais mis en cache (sinon « illisible » à tort).
  let cacheable = true
  const job = queue
    .then(() => {
      const payload = getPayload()
      if (payload === '') {
        cacheable = false
        return { ok: false, failure: 'unavailable' } as PdfThumbnailResult
      }
      return renderThumbnail(payload)
    })
    .catch((error: unknown): PdfThumbnailResult => ({ ok: false, failure: classifyPdfError(error) }))
    .then((result) => {
      if (cacheable) thumbCache.set(hash, result)
      inflight.delete(hash)
      return result
    })
  queue = job
  inflight.set(hash, job)
  return job
}

// ——— Visionneuse ———

export interface PdfPageRender {
  promise: Promise<{ cssWidth: number; cssHeight: number }>
  cancel: () => void
}

export interface PdfSession {
  pageCount: number
  /** Rend la page `pageNumber` (1…pageCount) dans `canvas` au zoom `zoom`
   * (1 = 100 %), à la densité de pixels `dpr` — canvas borné en taille. */
  renderPage: (pageNumber: number, zoom: number, dpr: number, canvas: HTMLCanvasElement) => PdfPageRender
  /** Dimensions CSS d'une page à 100 % (pour « ajuster à la largeur »). */
  pageSize: (pageNumber: number) => Promise<{ width: number; height: number }>
  destroy: () => void
}

/** Ouvre un PDF pour la visionneuse, sur un worker DÉDIÉ (tué à la fermeture). */
export async function openPdfSession(payload: string): Promise<PdfSession> {
  const bytes = decodeBase64(payload)
  if (!hasPdfSignature(bytes)) {
    const error = new Error('not-a-pdf')
    error.name = 'InvalidPDFException'
    throw error
  }
  const lib = await loadPdfJs()
  const slot = createWorkerSlot(lib, 'cosint-pdf-viewer')
  let opened: { doc: PDFDocumentProxy; destroy: () => void }
  try {
    opened = await openDocument(lib, slot, bytes)
  } catch (error) {
    destroySlot(slot)
    throw error
  }
  const { doc } = opened
  let destroyed = false
  /** Délai dépassé sur une page (§D1 v1.9) : le worker est peut-être
   * bloqué sur un PDF piégé → on le tue TOUT DE SUITE et la session devient
   * inutilisable (la visionneuse bascule sur l'écran d'échec, dont « Réessayer »
   * rouvre une session neuve sur un nouveau worker). */
  const guard = <T>(work: Promise<T>): Promise<T> =>
    work.catch((error: unknown) => {
      // Seul le délai dépassé tue le worker : une annulation (changement de page) ou
      // une erreur ordinaire classée « unavailable » ne doit pas casser la session.
      if (classifyPdfError(error) === 'timeout' && !destroyed) {
        destroyed = true
        try {
          opened.destroy()
        } finally {
          destroySlot(slot)
        }
      }
      throw error
    })

  const renderPage = (
    pageNumber: number,
    zoom: number,
    dpr: number,
    canvas: HTMLCanvasElement
  ): PdfPageRender => {
    let cancelled = false
    let cancelTask: (() => void) | null = null
    const promise = guard((async () => {
      const page = await withTimeout(doc.getPage(pageNumber), LOAD_TIMEOUT_MS)
      if (cancelled || destroyed) throw new Error('cancelled')
      const base = page.getViewport({ scale: 1 })
      const cssScale = zoom * PDF_TO_CSS
      const cssWidth = base.width * cssScale
      const cssHeight = base.height * cssScale
      // Densité de rendu = zoom × dpr, plafonnée (côté ≤ 8192, ≈ 16 Mpx) : au-delà,
      // la page reste nette à l'écran mais n'est plus sur-échantillonnée.
      const wanted = cssScale * Math.max(1, dpr)
      const cap = fitScale(
        base.width,
        base.height,
        PDF_VIEWER_BOUNDS.side,
        PDF_VIEWER_BOUNDS.side,
        PDF_VIEWER_BOUNDS.pixels
      )
      const viewport = page.getViewport({ scale: Math.min(wanted, cap) })
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      canvas.style.width = `${Math.round(cssWidth)}px`
      canvas.style.height = `${Math.round(cssHeight)}px`
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('canvas-unavailable')
      const task = page.render({ canvasContext: context, viewport, background: '#ffffff' })
      cancelTask = () => task.cancel()
      if (cancelled) task.cancel()
      await withTimeout(task.promise, RENDER_TIMEOUT_MS, () => task.cancel())
      return { cssWidth, cssHeight }
    })())
    return {
      promise,
      cancel: () => {
        cancelled = true
        cancelTask?.()
      }
    }
  }

  const pageSize = async (pageNumber: number): Promise<{ width: number; height: number }> => {
    const page = await guard(withTimeout(doc.getPage(pageNumber), LOAD_TIMEOUT_MS))
    const base = page.getViewport({ scale: 1 })
    return { width: base.width * PDF_TO_CSS, height: base.height * PDF_TO_CSS }
  }

  return {
    pageCount: doc.numPages,
    renderPage,
    pageSize,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      opened.destroy()
      // Laisse la destruction propre se faire, puis tue le worker quoi qu'il arrive.
      window.setTimeout(() => destroySlot(slot), 1000)
    }
  }
}
