/**
 * Nœud fichier (§5 v1.9) : un fichier importé (.pdf, .txt, .zip…) stocké en chunks
 * (sync/files.ts), exactement comme une image — `content` est le HASH de contenu,
 * le nom du fichier est dans `title`, le type MIME et la taille dans les métadonnées.
 * Le rendu suit l'état du transfert P2P (complet / en cours / erreur), comme ImageNode.
 * Un bouton « Enregistrer » écrit le fichier sur le disque via un dialogue natif.
 *
 * §5 v1.9 (aperçu) : le nœud montre ce que contient le fichier —
 *  - PDF : miniature de la 1re page (pdf.js chargé à la demande, rendu local chez
 *    chaque pair, cache LRU par hash) + nombre de pages ;
 *  - texte (txt, md, csv, json, log, xml, yaml, html…) : premières lignes en
 *    monospace, TOUJOURS affichées comme du texte (jamais interprétées) ;
 *  - image : vignette ; autres types : carte avec icône.
 * Double-clic (ou bouton « Aperçu ») : visionneuse plein écran (FileViewer).
 * Nœud bas (< 150 px, ex. créé avant l'aperçu) : carte compacte, la miniature
 * remplace l'icône.
 */
import { memo, useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  AlertTriangle,
  Download,
  Eye,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FileWarning,
  LoaderCircle,
  Lock,
  RotateCw,
  type LucideIcon
} from 'lucide-react'
import { t } from '@/i18n'
import type { CosintNodeProps } from '@/flow/flowTypes'
import { useBoardContext } from '@/flow/BoardContext'
import { useToasts } from '@/store/toasts'
import { useFilePreview } from '@/store/filePreview'
import {
  FILE_NODE_COMPACT_HEIGHT,
  NODE_TEXT_LIMITS,
  detectPreviewKind,
  fileExtension,
  fileTypeLabel,
  previewExtension,
  type FilePreviewKind,
  type PdfFailure
} from '@/lib/filePreview'
import { formatFileSize, formatPageCount } from '@/lib/fileFormat'
import { NodeShell } from './NodeShell'
import { imageDisplayUrl, useFileSource, usePdfThumbnail, useTextExcerpt } from './fileSource'
import { OfficeNodePreview } from './preview/OfficeNodePreview'
import { MediaNodePreview } from './preview/MediaNodePreview'
import { CodeNodePreview } from './preview/CodeNodePreview'
import type { NodePreviewInfo, NodePreviewProps } from './preview/types'
import './filePreview.css'

/** §R2 v1.9 — types rendus par les composants d'aperçu dédiés (components/nodes/preview). */
const DEDICATED_PREVIEW = new Set<FilePreviewKind>(['office', 'audio', 'video', 'code'])

/** Icône selon le type MIME et l'extension (repli : fichier générique). */
export function fileIconFor(mime: string, filename: string, kind: FilePreviewKind): LucideIcon {
  const ext = fileExtension(filename)
  if (kind === 'image' || mime.startsWith('image/')) return FileImage
  if (kind === 'pdf') return FileText
  // §R2 v1.9 — nouveaux types d'aperçu.
  if (kind === 'audio') return FileAudio
  if (kind === 'video') return FileVideo
  if (kind === 'code') return FileCode
  if (kind === 'office') {
    return /^(xls|xlsx|xlsm|xlt|xltx|xltm|ods|ots|fods|numbers)$/.test(ext) ? FileSpreadsheet : FileText
  }
  if (ext === 'csv' || ext === 'tsv' || /(csv|excel|spreadsheet)/.test(mime)) return FileSpreadsheet
  if (/^(json|jsonl|ndjson|xml|html|htm|yaml|yml)$/.test(ext) || /(json|xml|javascript|x-sh|html|yaml)/.test(mime)) {
    return FileCode
  }
  if (kind === 'text' || mime.startsWith('text/')) return FileText
  if (/(zip|x-tar|x-7z|x-rar|gzip|compress)/.test(mime)) return FileArchive
  if (mime.startsWith('audio/')) return FileAudio
  if (mime.startsWith('video/')) return FileVideo
  return FileIcon
}

/** Message utilisateur d'un échec d'aperçu PDF. */
export function pdfFailureMessage(failure: PdfFailure): string {
  switch (failure) {
    case 'encrypted':
      return t('file.previewEncrypted')
    case 'corrupt':
      return t('file.previewCorrupt')
    case 'timeout':
      return t('file.previewTimeout')
    default:
      return t('file.previewUnavailable')
  }
}

export const FileNode = memo(function FileNode({ id, data, selected }: CosintNodeProps): JSX.Element {
  const board = data.board
  const { handle } = useBoardContext()
  const pushToast = useToasts((state) => state.push)
  const openPreview = useFilePreview((state) => state.open)
  const source = useFileSource(handle, board.content)
  const filename = board.title.trim() || t('file.untitled')
  const ready = source.phase === 'ready'
  const kind: FilePreviewKind = ready ? detectPreviewKind(source.mime, filename) : 'none'
  const compact = board.height < FILE_NODE_COMPACT_HEIGHT

  const pdf = usePdfThumbnail(source.key, source.dataUrl, kind === 'pdf')
  const text = useTextExcerpt(source.key, source.dataUrl, kind === 'text' && !compact, NODE_TEXT_LIMITS, 'node')
  // Image : data-URL au MIME affichable, recalculée seulement si le fichier change.
  const imageKey = kind === 'image' ? (source.key ?? source.dataUrl) : null
  const imageSrc = useMemo(
    () => (kind === 'image' ? imageDisplayUrl(source.dataUrl, source.mime, filename) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageKey, source.mime, filename]
  )
  const [imageFailedKey, setImageFailedKey] = useState<string | null>(null)
  const imageFailed = imageKey !== null && imageFailedKey === imageKey

  // §R2 v1.9 — méta/vignette remontées par l'aperçu dédié, valables pour CE fichier seulement.
  const infoOwner = `${kind}|${source.key ?? source.dataUrl?.length ?? ''}|${filename}`
  const [previewInfo, setPreviewInfo] = useState<{ owner: string; info: NodePreviewInfo } | null>(null)
  const infoOwnerRef = useRef(infoOwner)
  infoOwnerRef.current = infoOwner
  const onPreviewInfo = useCallback((info: NodePreviewInfo | null) => {
    setPreviewInfo(info ? { owner: infoOwnerRef.current, info } : null)
  }, [])
  const extraInfo = previewInfo && previewInfo.owner === infoOwner ? previewInfo.info : null

  const Icon = fileIconFor(source.mime, filename, kind)
  const typeLabel = ready ? fileTypeLabel(source.mime, filename) : ''
  const pageCount = pdf.result?.ok ? pdf.result.thumb.pageCount : 0
  const meta = [
    typeLabel,
    pageCount > 0 ? formatPageCount(pageCount) : '',
    extraInfo?.meta ?? '',
    source.bytes > 0 ? formatFileSize(source.bytes) : ''
  ]
    .filter(Boolean)
    .join(' · ')

  const save = (): void => {
    if (!source.dataUrl) return
    void window.cosint.saveAttachment(filename, source.dataUrl).then((result) => {
      if (result.saved) pushToast(t('file.saved'), 'success')
      else if (result.error) pushToast(t('file.saveError'), 'error')
    })
  }

  const onOpen = (event: MouseEvent): void => {
    event.stopPropagation()
    openPreview(id)
  }
  // Double-clic n'importe où sur le nœud (aperçu, nom, icône) — sauf sur ses boutons
  // (un double-clic sur « Enregistrer » ne doit pas ouvrir la visionneuse en plus).
  const onDoubleOpen = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest('button')) return
    onOpen(event)
  }

  const actions = selected && ready && (
    <div className="nd-file-actions">
      <button
        type="button"
        className="nd-file-open nodrag"
        title={t('file.preview')}
        aria-label={t('file.preview')}
        onClick={onOpen}
      >
        <Eye size={14} />
      </button>
      <button
        type="button"
        className="nd-file-open nodrag"
        title={t('file.save')}
        aria-label={t('file.save')}
        onClick={(event) => {
          event.stopPropagation()
          save()
        }}
      >
        <Download size={14} />
      </button>
    </div>
  )

  // §R2 v1.9 — aperçu dédié (bureautique, audio/vidéo, code) : un seul point de branchement.
  const renderDedicated = (isCompact: boolean, fallback: JSX.Element): JSX.Element | null => {
    if (!ready || !source.dataUrl || !DEDICATED_PREVIEW.has(kind)) return null
    const props: NodePreviewProps = {
      kind,
      cacheKey: source.key,
      dataUrl: source.dataUrl,
      name: filename,
      ext: previewExtension(filename),
      mime: source.mime,
      bytes: source.bytes,
      compact: isCompact,
      fallback,
      onInfo: onPreviewInfo
    }
    if (kind === 'office') return <OfficeNodePreview {...props} />
    if (kind === 'code') return <CodeNodePreview {...props} />
    return <MediaNodePreview {...props} />
  }

  let body: JSX.Element
  if (source.phase === 'empty') {
    body = (
      <div className="nd-file-empty">
        <FileIcon size={20} />
        <span>{t('file.empty')}</span>
      </div>
    )
  } else if (source.phase === 'error') {
    body = (
      <div className="nd-file-error">
        <AlertTriangle size={18} />
        <span>{t('file.transferError')}</span>
        <button type="button" className="cm-btn cm-btn--sm nodrag" onClick={source.retry}>
          <RotateCw size={13} />
          {t('common.retry')}
        </button>
      </div>
    )
  } else if (source.phase === 'loading') {
    body = (
      <div className="nd-file-loading">
        <FileIcon size={18} />
        <span>{t('file.receiving')}</span>
        <div className="nd-image-progress" role="progressbar" aria-valuenow={source.percent}>
          <div className="nd-image-progress__bar" style={{ width: `${source.percent}%` }} />
        </div>
      </div>
    )
  } else if (source.phase === 'missing') {
    // §5 v1.9 (aperçu) : fichier encore inconnu de ce poste (aucun pair connecté ne
    // l'a transmis) — attente, puis « indisponible » + réessai après le délai.
    body = (
      <div className="nd-file-loading">
        {source.stalled ? <FileWarning size={18} /> : <LoaderCircle size={18} className="nd-file-spin" />}
        <span>{source.stalled ? t('file.missing') : t('file.waiting')}</span>
        {source.stalled && (
          <button type="button" className="cm-btn cm-btn--sm nodrag" onClick={source.retry}>
            <RotateCw size={13} />
            {t('common.retry')}
          </button>
        )}
      </div>
    )
  } else if (compact) {
    // Carte compacte : la miniature (PDF/image) remplace l'icône quand elle existe.
    const mini =
      kind === 'pdf' && pdf.result?.ok
        ? pdf.result.thumb.url
        : kind === 'image' && !imageFailed
          ? imageSrc
          : (extraInfo?.thumbnail ?? null)
    body = (
      <div className="nd-file-card" onDoubleClick={onDoubleOpen} title={t('file.previewHint')}>
        {renderDedicated(true, <></>)}
        {mini ? (
          <img
            className="nd-file-mini"
            src={mini}
            alt=""
            draggable={false}
            onError={() => imageKey && setImageFailedKey(imageKey)}
          />
        ) : (
          <span className="nd-file-icon">
            <Icon size={22} />
          </span>
        )}
        <div className="nd-file-info">
          <span className="nd-file-name" title={filename}>
            {filename}
          </span>
          <span className="nd-file-meta">{meta}</span>
        </div>
        {actions}
      </div>
    )
  } else {
    let preview: JSX.Element
    if (kind === 'pdf') {
      const result = pdf.result
      if (!result) {
        preview = (
          <div className="nd-file-status">
            <LoaderCircle size={18} className="nd-file-spin" />
            <span>{t('file.previewLoading')}</span>
          </div>
        )
      } else if (result.ok) {
        preview = <img className="nd-file-thumb nd-file-thumb--page" src={result.thumb.url} alt="" draggable={false} />
      } else {
        const retryable = result.failure === 'timeout' || result.failure === 'unavailable'
        preview = (
          <div className="nd-file-status nd-file-status--warn">
            {result.failure === 'encrypted' ? <Lock size={18} /> : <FileWarning size={18} />}
            <span>{pdfFailureMessage(result.failure)}</span>
            {retryable && (
              <button
                type="button"
                className="cm-btn cm-btn--sm nodrag"
                onClick={(event) => {
                  event.stopPropagation()
                  pdf.retry()
                }}
              >
                <RotateCw size={13} />
                {t('common.retry')}
              </button>
            )}
          </div>
        )
      }
    } else if (kind === 'text') {
      if (text && !text.binary) {
        preview = (
          <pre className={`nd-file-text${text.truncated ? ' nd-file-text--more' : ''}`}>{text.text}</pre>
        )
      } else {
        preview = (
          <div className="nd-file-status nd-file-status--warn">
            <FileWarning size={18} />
            <span>{text?.binary ? t('file.previewBinary') : t('file.previewCorrupt')}</span>
          </div>
        )
      }
    } else if (DEDICATED_PREVIEW.has(kind)) {
      preview = renderDedicated(
        false,
        <div className="nd-file-generic">
          <Icon size={34} strokeWidth={1.5} />
          {typeLabel && <span className="nd-file-type">{typeLabel}</span>}
        </div>
      ) ?? <></>
    } else if (kind === 'image' && imageSrc && !imageFailed) {
      preview = (
        <img
          className="nd-file-thumb"
          src={imageSrc}
          alt=""
          draggable={false}
          onError={() => imageKey && setImageFailedKey(imageKey)}
        />
      )
    } else {
      preview = (
        <div className="nd-file-generic">
          <Icon size={34} strokeWidth={1.5} />
          {typeLabel && <span className="nd-file-type">{typeLabel}</span>}
        </div>
      )
    }
    body = (
      <div className="nd-file-full" onDoubleClick={onDoubleOpen}>
        <div className={`nd-file-preview nd-file-preview--${kind}`} title={t('file.previewHint')}>
          {preview}
        </div>
        <div className="nd-file-footer">
          <span className="nd-file-icon nd-file-icon--sm">
            <Icon size={15} />
          </span>
          <div className="nd-file-info">
            <span className="nd-file-name" title={filename}>
              {filename}
            </span>
            <span className="nd-file-meta">{meta}</span>
          </div>
          {actions}
        </div>
      </div>
    )
  }

  return (
    <NodeShell id={id} board={board} selected={selected} className="nd-file-body">
      {body}
    </NodeShell>
  )
})
