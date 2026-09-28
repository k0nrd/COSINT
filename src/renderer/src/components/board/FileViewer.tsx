/**
 * §5 v1.9 (aperçu) — visionneuse d'un fichier du tableau (double-clic sur un nœud
 * fichier, ou bouton « Aperçu ») :
 *  - PDF : une page à la fois, rendue À LA DEMANDE (seule la page affichée est
 *    calculée), navigation précédente / suivante / n° de page, zoom (ajuster à la
 *    largeur, paliers, Ctrl + molette) ;
 *  - texte : contenu complet mais BORNÉ (1 Mo), toujours affiché comme du texte brut
 *    (un .html n'est jamais interprété), encodage détecté ;
 *  - image : grand format, zoom ; autres types : invitation à enregistrer le fichier.
 * Clavier : Échap ferme, ←/→ (PageUp/PageDown, Début/Fin) changent de page, + / −
 * zooment, 0 ajuste. Bouton « Enregistrer » conservé.
 *
 * Le nœud est relu EN DIRECT depuis le document (renommage par un pair) ; la
 * visionneuse se ferme d'elle-même s'il disparaît. Posée en `.cm-modal-overlay` :
 * les raccourcis et le copier-coller du canvas se mettent en retrait.
 * Lecture seule : ouverte aussi aux visiteurs (rien n'est écrit dans le tableau).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  LoaderCircle,
  Lock,
  MoveHorizontal,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { formatNumber, t } from '@/i18n'
import type { BoardHandle } from '@/sync/BoardDoc'
import { getNodesMap, yMapToNode } from '@/sync/model'
import { useBoardContext } from '@/flow/BoardContext'
import { useFilePreview } from '@/store/filePreview'
import { useToasts } from '@/store/toasts'
import {
  VIEWER_TEXT_LIMITS,
  ZOOM_STEPS,
  classifyPdfError,
  clampPage,
  nextFocusIndex,
  dataUrlPayload,
  detectPreviewKind,
  fileTypeLabel,
  previewExtension,
  stepZoom,
  type PdfFailure,
  type TextEncodingName
} from '@/lib/filePreview'
import { openPdfSession, type PdfPageRender, type PdfSession } from '@/lib/pdfPreview'
import { formatFileSize, formatPageCount } from '@/lib/fileFormat'
import { fileIconFor, pdfFailureMessage } from '@/components/nodes/FileNode'
import { imageDisplayUrl, useFileSource, useTextExcerpt } from '@/components/nodes/fileSource'
import { OfficeViewerBody } from './viewer/OfficeViewerBody'
import { MediaViewerBody } from './viewer/MediaViewerBody'
import { CodeViewerBody } from './viewer/CodeViewerBody'
import type { ViewerBodyProps } from '@/components/nodes/preview/types'
import './fileViewer.css'

/** Éléments focalisables au clavier dans la visionneuse (piège à focus). */
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Zoom demandé : « ajuster » (largeur pour un PDF, cadre pour une image) ou facteur. */
type ZoomMode = 'fit' | number

/** Refuse un dépôt de fichier sur la visionneuse (curseur « interdit », aucune
 * navigation d'Electron vers le fichier, aucun import sur le tableau). */
function blockDrop(event: DragEvent): void {
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer.dropEffect = 'none'
}

const MIN_ZOOM = ZOOM_STEPS[0]
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1]

/** Nœud fichier relu en direct (titre + contenu) ; null s'il a disparu. */
function useLiveFileNode(handle: BoardHandle, nodeId: string): { title: string; content: string } | null {
  const read = useCallback((): { title: string; content: string } | null => {
    const map = getNodesMap(handle.doc).get(nodeId)
    if (!map) return null
    const node = yMapToNode(nodeId, map)
    return node.kind === 'file' ? { title: node.title, content: node.content } : null
  }, [handle, nodeId])
  const [state, setState] = useState(read)
  useEffect(() => {
    const nodes = getNodesMap(handle.doc)
    const onChange = (): void =>
      setState((previous) => {
        const next = read()
        return previous && next && previous.title === next.title && previous.content === next.content
          ? previous
          : next
      })
    onChange()
    nodes.observeDeep(onChange)
    return () => nodes.unobserveDeep(onChange)
  }, [handle, read])
  return state
}

export function FileViewer(): JSX.Element | null {
  const nodeId = useFilePreview((state) => state.nodeId)
  const close = useFilePreview((state) => state.close)
  // Changement de tableau : la visionneuse ne survit pas au démontage.
  useEffect(() => () => useFilePreview.getState().close(), [])
  if (!nodeId) return null
  return <FileViewerDialog key={nodeId} nodeId={nodeId} onClose={close} />
}

function FileViewerDialog({ nodeId, onClose }: { nodeId: string; onClose: () => void }): JSX.Element | null {
  const { handle } = useBoardContext()
  const pushToast = useToasts((state) => state.push)
  const node = useLiveFileNode(handle, nodeId)
  const source = useFileSource(handle, node?.content ?? '')
  const filename = node ? node.title.trim() || t('file.untitled') : ''
  const ready = source.phase === 'ready'
  const kind = ready ? detectPreviewKind(source.mime, filename) : 'none'

  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState<ZoomMode>('fit')
  const [resolvedZoom, setResolvedZoom] = useState(1)
  const [encoding, setEncoding] = useState<TextEncodingName | null>(null)
  // §R2 v1.9 — complément de méta remonté par un corps dédié (feuilles, durée, encodage…).
  const [bodyMeta, setBodyMeta] = useState<string | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  // Nœud supprimé (localement, par un pair, ou annulé) → fermeture.
  useEffect(() => {
    if (!node) onClose()
  }, [node, onClose])

  // §5 v1.9 — focus : on mémorise l'élément actif à l'ouverture et on le lui
  // rend à la fermeture (s'il est encore dans le document).
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    frameRef.current?.focus()
    return () => {
      if (previous && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  const zoomable =
    ready && (kind === 'pdf' || kind === 'image' || kind === 'text' || kind === 'office' || kind === 'code')
  const zoomBy = useCallback(
    (direction: 1 | -1) => setZoom(stepZoom(resolvedZoom, direction)),
    [resolvedZoom]
  )
  const goTo = useCallback((target: number) => setPage(clampPage(target, pageCount)), [pageCount])

  const save = (): void => {
    if (!source.dataUrl) return
    void window.cosint.saveAttachment(filename, source.dataUrl).then((result) => {
      if (result.saved) pushToast(t('file.saved'), 'success')
      else if (result.error) pushToast(t('file.saveError'), 'error')
    })
  }

  // Clavier (phase de capture : prioritaire sur les raccourcis du tableau).
  const keys = useRef({ page, kind, zoomable, goTo, zoomBy, pageCount })
  keys.current = { page, kind, zoomable, goTo, zoomBy, pageCount }
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const current = keys.current
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      // §5 v1.9 — piège à focus : Tab / Maj+Tab restent dans le cadre.
      if (event.key === 'Tab') {
        const frame = frameRef.current
        if (!frame) return
        const focusables = Array.from(
          frame.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0)
        event.preventDefault()
        event.stopPropagation()
        const active = document.activeElement as HTMLElement | null
        const index = nextFocusIndex(
          focusables.length,
          active ? focusables.indexOf(active) : -1,
          event.shiftKey
        )
        if (index >= 0) focusables[index].focus()
        else frame.focus()
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select')) return
      let handled = true
      if (current.kind === 'pdf' && (event.key === 'ArrowLeft' || event.key === 'PageUp')) {
        current.goTo(current.page - 1)
      } else if (current.kind === 'pdf' && (event.key === 'ArrowRight' || event.key === 'PageDown')) {
        current.goTo(current.page + 1)
      } else if (current.kind === 'pdf' && event.key === 'Home') {
        current.goTo(1)
      } else if (current.kind === 'pdf' && event.key === 'End') {
        current.goTo(current.pageCount)
      } else if (current.zoomable && (event.key === '+' || event.key === '=')) {
        current.zoomBy(1)
      } else if (current.zoomable && (event.key === '-' || event.key === '_')) {
        current.zoomBy(-1)
      } else if (current.zoomable && event.key === '0') {
        setZoom('fit')
      } else {
        handled = false
      }
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Ctrl + molette : zoom (comme dans un lecteur PDF). Écouteur NATIF non passif :
  // React enregistre `wheel` en passif, son preventDefault() serait ignoré — et
  // Chromium zoomerait alors toute la fenêtre au lieu du document.
  const bodyRef = useRef<HTMLDivElement>(null)
  const wheel = useRef({ zoomable, zoomBy })
  wheel.current = { zoomable, zoomBy }
  const mounted = node !== null
  useEffect(() => {
    const element = bodyRef.current
    if (!element) return
    const onWheel = (event: WheelEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      if (wheel.current.zoomable) wheel.current.zoomBy(event.deltaY < 0 ? 1 : -1)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [mounted])

  // Image : data-URL au MIME affichable, recalculée seulement si le fichier change.
  const imageKey = kind === 'image' ? (source.key ?? source.dataUrl) : null
  const imageSrc = useMemo(
    () => (kind === 'image' ? imageDisplayUrl(source.dataUrl, source.mime, filename) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageKey, source.mime, filename]
  )

  if (!node) return null

  const Icon = fileIconFor(source.mime, filename, kind)
  const typeLabel = ready ? fileTypeLabel(source.mime, filename) : ''
  const meta = [
    typeLabel,
    kind === 'pdf' && pageCount > 0 ? formatPageCount(pageCount) : '',
    source.bytes > 0 ? formatFileSize(source.bytes) : '',
    kind === 'text' && encoding ? t('file.encoding', { encoding }) : '',
    bodyMeta ?? ''
  ]
    .filter(Boolean)
    .join(' · ')

  let stage: JSX.Element
  if (source.phase === 'loading' || source.phase === 'empty') {
    stage = (
      <div className="bd-fileviewer__status">
        <LoaderCircle size={22} className="nd-file-spin" />
        <span>{t('file.receiving')}</span>
      </div>
    )
  } else if (source.phase === 'missing') {
    stage = (
      <div className="bd-fileviewer__status">
        {source.stalled ? <FileWarning size={22} /> : <LoaderCircle size={22} className="nd-file-spin" />}
        <span>{source.stalled ? t('file.missing') : t('file.waiting')}</span>
        {source.stalled && (
          <button type="button" className="cm-btn cm-btn--sm" onClick={source.retry}>
            <RotateCw size={13} />
            {t('common.retry')}
          </button>
        )}
      </div>
    )
  } else if (source.phase === 'error') {
    stage = (
      <div className="bd-fileviewer__status">
        <FileWarning size={22} />
        <span>{t('file.transferError')}</span>
        <button type="button" className="cm-btn cm-btn--sm" onClick={source.retry}>
          <RotateCw size={13} />
          {t('common.retry')}
        </button>
      </div>
    )
  } else if (kind === 'pdf') {
    stage = (
      <PdfStage
        fileKey={source.key ?? node.content}
        dataUrl={source.dataUrl}
        page={clampPage(page, Math.max(1, pageCount))}
        zoom={zoom}
        onPageCount={setPageCount}
        onZoomResolved={setResolvedZoom}
        onSave={save}
      />
    )
  } else if (kind === 'text') {
    stage = (
      <TextStage
        fileKey={source.key}
        dataUrl={source.dataUrl}
        zoom={zoom}
        onZoomResolved={setResolvedZoom}
        onEncoding={setEncoding}
        onSave={save}
      />
    )
  } else if (kind === 'image') {
    stage = <ImageStage src={imageSrc} zoom={zoom} onZoomResolved={setResolvedZoom} />
  } else if (
    source.dataUrl &&
    (kind === 'office' || kind === 'audio' || kind === 'video' || kind === 'code')
  ) {
    // §R2 v1.9 — corps dédiés (components/board/viewer) : un seul point de branchement.
    const props: ViewerBodyProps = {
      kind,
      cacheKey: source.key,
      dataUrl: source.dataUrl,
      name: filename,
      ext: previewExtension(filename),
      mime: source.mime,
      bytes: source.bytes,
      zoom,
      onZoomResolved: setResolvedZoom,
      onMeta: setBodyMeta,
      onSave: save,
      fallback: (
        <div className="bd-fileviewer__status">
          <Icon size={40} strokeWidth={1.4} />
          <span>{t('file.previewNone')}</span>
          <span className="bd-fileviewer__muted">{t('file.previewSaveHint')}</span>
          <button type="button" className="cm-btn cm-btn--sm" onClick={save}>
            <Download size={13} />
            {t('file.save')}
          </button>
        </div>
      )
    }
    stage =
      kind === 'office' ? (
        <OfficeViewerBody {...props} />
      ) : kind === 'code' ? (
        <CodeViewerBody {...props} />
      ) : (
        <MediaViewerBody {...props} />
      )
  } else {
    stage = (
      <div className="bd-fileviewer__status">
        <Icon size={40} strokeWidth={1.4} />
        <span>{t('file.previewNone')}</span>
        <span className="bd-fileviewer__muted">{t('file.previewSaveHint')}</span>
        <button type="button" className="cm-btn cm-btn--sm" onClick={save}>
          <Download size={13} />
          {t('file.save')}
        </button>
      </div>
    )
  }

  return (
    <div
      className="cm-modal-overlay bd-fileviewer"
      role="dialog"
      aria-modal="true"
      aria-label={filename}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      // La visionneuse est posée DANS le conteneur du canvas : un fichier glissé
      // dessus ne doit pas être importé sur le tableau caché dessous.
      onDragOver={blockDrop}
      onDrop={blockDrop}
    >
      <div className="bd-fileviewer__frame" ref={frameRef} tabIndex={-1}>
        <header className="bd-fileviewer__head">
          <span className="bd-fileviewer__icon">
            <Icon size={18} />
          </span>
          <div className="bd-fileviewer__titles">
            <span className="bd-fileviewer__title" title={filename}>
              {filename}
            </span>
            <span className="bd-fileviewer__meta">{meta}</span>
          </div>
          {zoomable && (
            <div className="bd-fileviewer__group" role="group" aria-label={t('file.zoomFit')}>
              <button
                type="button"
                className="cm-btn cm-btn--ghost cm-btn--icon"
                onClick={() => zoomBy(-1)}
                disabled={resolvedZoom <= MIN_ZOOM + 1e-6}
                title={t('file.zoomOut')}
                aria-label={t('file.zoomOut')}
              >
                <ZoomOut size={16} />
              </button>
              <span className="bd-fileviewer__zoom">{formatNumber(Math.round(resolvedZoom * 100), 0)} %</span>
              <button
                type="button"
                className="cm-btn cm-btn--ghost cm-btn--icon"
                onClick={() => zoomBy(1)}
                disabled={resolvedZoom >= MAX_ZOOM - 1e-6}
                title={t('file.zoomIn')}
                aria-label={t('file.zoomIn')}
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                className={`cm-btn cm-btn--ghost cm-btn--icon${zoom === 'fit' ? ' bd-fileviewer__active' : ''}`}
                onClick={() => setZoom('fit')}
                title={t('file.zoomFit')}
                aria-label={t('file.zoomFit')}
                aria-pressed={zoom === 'fit'}
              >
                <MoveHorizontal size={16} />
              </button>
            </div>
          )}
          <button
            type="button"
            className="cm-btn cm-btn--sm"
            onClick={save}
            disabled={!source.dataUrl}
            title={t('file.save')}
          >
            <Download size={14} />
            {t('file.save')}
          </button>
          <button
            type="button"
            className="cm-btn cm-btn--ghost cm-btn--icon"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </header>

        <div className="bd-fileviewer__body" ref={bodyRef}>
          {stage}
        </div>

        <footer className="bd-fileviewer__foot">
          {kind === 'pdf' && pageCount > 0 ? (
            <div className="bd-fileviewer__pager">
              <button
                type="button"
                className="cm-btn cm-btn--ghost cm-btn--icon"
                onClick={() => goTo(page - 1)}
                disabled={page <= 1}
                title={t('file.prevPage')}
                aria-label={t('file.prevPage')}
              >
                <ChevronLeft size={18} />
              </button>
              <PageInput page={page} pageCount={pageCount} onCommit={goTo} />
              <button
                type="button"
                className="cm-btn cm-btn--ghost cm-btn--icon"
                onClick={() => goTo(page + 1)}
                disabled={page >= pageCount}
                title={t('file.nextPage')}
                aria-label={t('file.nextPage')}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <span />
          )}
          <span className="bd-fileviewer__keys">
            {kind === 'pdf' ? t('file.viewerKeys') : zoomable ? t('file.viewerKeysZoom') : t('file.viewerKeysClose')}
          </span>
        </footer>
      </div>
    </div>
  )
}

/** Champ « page x / y » : saisie libre, validée à Entrée ou à la perte du focus. */
function PageInput({
  page,
  pageCount,
  onCommit
}: {
  page: number
  pageCount: number
  onCommit: (page: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(String(page))
  useEffect(() => setDraft(String(page)), [page])
  const commit = (): void => {
    const value = Number.parseInt(draft, 10)
    // §5 v1.9 : toujours resynchroniser le champ sur la page bornée (99 sur la
    // dernière page, 0 sur la première : `page` ne change pas, l'effet ne joue pas).
    if (Number.isFinite(value)) {
      onCommit(value)
      setDraft(String(clampPage(value, Math.max(1, pageCount))))
    } else setDraft(String(page))
  }
  return (
    <span className="bd-fileviewer__pageof" title={t('file.pageOf', { page, count: pageCount })}>
      <span>{t('file.page')}</span>
      <input
        className="cm-input bd-fileviewer__pageinput"
        value={draft}
        inputMode="numeric"
        aria-label={t('file.pageInput')}
        onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            ;(event.target as HTMLInputElement).blur()
          }
        }}
      />
      <span className="bd-fileviewer__pagecount">/ {formatNumber(pageCount, 0)}</span>
    </span>
  )
}

/** Message d'échec d'un PDF, avec réessai si l'échec peut être passager. */
function PdfFailureView({
  failure,
  onRetry,
  onSave
}: {
  failure: PdfFailure
  onRetry: () => void
  onSave: () => void
}): JSX.Element {
  const retryable = failure === 'timeout' || failure === 'unavailable'
  return (
    <div className="bd-fileviewer__status">
      {failure === 'encrypted' ? <Lock size={22} /> : <FileWarning size={22} />}
      <span>{pdfFailureMessage(failure)}</span>
      <span className="bd-fileviewer__muted">{t('file.previewSaveHint')}</span>
      <div className="bd-fileviewer__row">
        {retryable && (
          <button type="button" className="cm-btn cm-btn--sm" onClick={onRetry}>
            <RotateCw size={13} />
            {t('common.retry')}
          </button>
        )}
        <button type="button" className="cm-btn cm-btn--sm" onClick={onSave}>
          <Download size={13} />
          {t('file.save')}
        </button>
      </div>
    </div>
  )
}

/** Marge intérieure (px) autour d'une page en mode « ajuster à la largeur ». */
const FIT_MARGIN = 32

function PdfStage({
  fileKey,
  dataUrl,
  page,
  zoom,
  onPageCount,
  onZoomResolved,
  onSave
}: {
  fileKey: string
  dataUrl: string | null
  page: number
  zoom: ZoomMode
  onPageCount: (count: number) => void
  onZoomResolved: (zoom: number) => void
  onSave: () => void
}): JSX.Element {
  const dataRef = useRef(dataUrl)
  dataRef.current = dataUrl
  const scrollRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<PdfSession | null>(null)
  const [failure, setFailure] = useState<PdfFailure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [width, setWidth] = useState(0)
  const [pageState, setPageState] = useState<'rendering' | 'done' | 'error'>('rendering')
  const [pageAttempt, setPageAttempt] = useState(0)

  // Ouverture du document (worker dédié, détruit à la fermeture).
  useEffect(() => {
    let alive = true
    let opened: PdfSession | null = null
    setSession(null)
    setFailure(null)
    openPdfSession(dataUrlPayload(dataRef.current ?? '')).then(
      (value) => {
        if (!alive) {
          value.destroy()
          return
        }
        opened = value
        setSession(value)
        onPageCount(value.pageCount)
      },
      (error: unknown) => {
        if (alive) setFailure(classifyPdfError(error))
      }
    )
    return () => {
      alive = false
      opened?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey, attempt])

  // Largeur disponible (pour « ajuster à la largeur »).
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  // Nouvelle page : retour en haut.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [page])

  // Rendu paresseux : SEULE la page affichée est rendue, dans un canvas neuf qui ne
  // remplace l'ancien qu'une fois prêt (pas de page blanche pendant le calcul).
  const fitWidth = zoom === 'fit' ? width : 0
  useEffect(() => {
    if (!session || (zoom === 'fit' && fitWidth <= 0)) return
    let alive = true
    let render: PdfPageRender | null = null
    setPageState('rendering')
    const run = async (): Promise<void> => {
      let value: number
      if (zoom === 'fit') {
        const size = await session.pageSize(page)
        value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (fitWidth - FIT_MARGIN) / size.width))
      } else {
        value = zoom
      }
      if (!alive) return
      onZoomResolved(value)
      const canvas = document.createElement('canvas')
      canvas.className = 'bd-fileviewer__page'
      render = session.renderPage(page, value, window.devicePixelRatio || 1, canvas)
      await render.promise
      if (!alive) {
        canvas.width = 0
        canvas.height = 0
        return
      }
      const host = hostRef.current
      if (!host) return
      const previous = [...host.querySelectorAll('canvas')]
      host.replaceChildren(canvas)
      for (const old of previous) {
        old.width = 0
        old.height = 0
      }
      setPageState('done')
    }
    run().catch((error: unknown) => {
      if (!alive) return
      // Délai dépassé (§D1 v1.9) : le worker a été tué, la session est morte → écran
      // d'échec, dont « Réessayer » rouvre le document sur un worker neuf.
      if (classifyPdfError(error) === 'timeout') setFailure('timeout')
      else setPageState('error')
    })
    return () => {
      alive = false
      render?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, page, zoom, fitWidth, pageAttempt])

  if (failure) {
    return (
      <PdfFailureView
        failure={failure}
        onSave={onSave}
        onRetry={() => {
          setFailure(null)
          setAttempt((value) => value + 1)
        }}
      />
    )
  }

  return (
    <div className="bd-fileviewer__scroll bd-fileviewer__scroll--pdf" ref={scrollRef}>
      <div className="bd-fileviewer__pagehost" ref={hostRef} />
      {(!session || pageState === 'rendering') && (
        <div className="bd-fileviewer__busy" aria-live="polite">
          <LoaderCircle size={16} className="nd-file-spin" />
          <span>{t('file.previewLoading')}</span>
        </div>
      )}
      {pageState === 'error' && (
        <div className="bd-fileviewer__status bd-fileviewer__status--overlay">
          <FileWarning size={22} />
          <span>{t('file.pageError')}</span>
          <button type="button" className="cm-btn cm-btn--sm" onClick={() => setPageAttempt((value) => value + 1)}>
            <RotateCw size={13} />
            {t('common.retry')}
          </button>
        </div>
      )}
    </div>
  )
}

function TextStage({
  fileKey,
  dataUrl,
  zoom,
  onZoomResolved,
  onEncoding,
  onSave
}: {
  fileKey: string | null
  dataUrl: string | null
  zoom: ZoomMode
  onZoomResolved: (zoom: number) => void
  onEncoding: (encoding: TextEncodingName | null) => void
  onSave: () => void
}): JSX.Element {
  const text = useTextExcerpt(fileKey, dataUrl, true, VIEWER_TEXT_LIMITS, 'viewer')
  const value = zoom === 'fit' ? 1 : zoom
  useEffect(() => onZoomResolved(value), [value, onZoomResolved])
  useEffect(() => onEncoding(text && !text.binary ? text.encoding : null), [text, onEncoding])

  if (!text || text.binary) {
    return (
      <div className="bd-fileviewer__status">
        <FileWarning size={22} />
        <span>{text?.binary ? t('file.previewBinary') : t('file.previewCorrupt')}</span>
        <button type="button" className="cm-btn cm-btn--sm" onClick={onSave}>
          <Download size={13} />
          {t('file.save')}
        </button>
      </div>
    )
  }
  return (
    <div className="bd-fileviewer__scroll">
      {text.truncated && <div className="bd-fileviewer__notice">{t('file.previewTruncated')}</div>}
      <pre className="bd-fileviewer__text" style={{ fontSize: `${12.5 * value}px` }}>
        {text.text}
      </pre>
    </div>
  )
}

function ImageStage({
  src,
  zoom,
  onZoomResolved
}: {
  src: string | null
  zoom: ZoomMode
  onZoomResolved: (zoom: number) => void
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [box, setBox] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = (): void => setBox({ width: element.clientWidth, height: element.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  // « Ajuster » : l'image entière dans le cadre, jamais agrandie au-delà de 100 %.
  const fitValue =
    natural && box.width > 0 && box.height > 0
      ? Math.min(1, (box.width - FIT_MARGIN) / natural.width, (box.height - FIT_MARGIN) / natural.height)
      : 1
  const value = zoom === 'fit' ? Math.max(0.01, fitValue) : zoom
  useEffect(() => onZoomResolved(value), [value, onZoomResolved])

  if (!src || failed) {
    return (
      <div className="bd-fileviewer__status">
        <FileWarning size={22} />
        <span>{t('file.previewCorrupt')}</span>
      </div>
    )
  }
  return (
    <div className="bd-fileviewer__scroll bd-fileviewer__scroll--center" ref={scrollRef}>
      <img
        className="bd-fileviewer__image"
        src={src}
        alt=""
        draggable={false}
        style={natural ? { width: `${Math.round(natural.width * value)}px` } : undefined}
        onLoad={(event) => {
          const image = event.currentTarget
          setNatural({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
        }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
