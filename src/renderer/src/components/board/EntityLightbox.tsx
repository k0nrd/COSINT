/**
 * §2 v1.9 (galerie) — visionneuse des images d'une entité : grand format,
 * précédente / suivante (flèches ←/→, bouclage), Échap pour fermer, Ctrl+C pour
 * copier l'image affichée. Mêmes actions que la galerie du panneau Détails
 * (couverture, déplacer, copier, enregistrer, retirer) ; un visiteur ne peut que
 * regarder, copier et enregistrer.
 *
 * La galerie est relue EN DIRECT depuis le document Yjs (un pair peut la modifier
 * pendant l'affichage) ; la visionneuse se ferme d'elle-même si l'entité disparaît
 * ou n'a plus d'image. Posée en `.cm-modal-overlay` : les raccourcis et le
 * copier-coller du canvas se mettent en retrait tant qu'elle est ouverte.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ImageOff,
  LoaderCircle,
  Star,
  Trash2,
  X
} from 'lucide-react'
import type { BoardNodeData } from '@/types'
import type { BoardHandle } from '@/sync/BoardDoc'
import { getNodesMap, yMapToNode } from '@/sync/model'
import { useBoardContext } from '@/flow/BoardContext'
import { copyEntityImage, saveEntityImage } from '@/flow/entityImageActions'
import {
  clampImageIndex,
  lightboxImages,
  lightboxShouldClose,
  wrapImageIndex
} from '@/lib/entityImages'
import { resolveType } from '@/lib/entityTypes'
import { useEntityLightbox } from '@/store/entityLightbox'
import { useToasts } from '@/store/toasts'
import { t } from '@/i18n'
import { EntityImageThumb, entityImageSaveName, useEntityImageSrc } from './EntityGallery'
import './entityGallery.css'

/**
 * Nœud relu en direct depuis le document (null si absent).
 * §2 v1.9 — lu PENDANT le rendu (useMemo sur id + révision) et non depuis un
 * état en retard d'un rendu : à l'ouverture, le premier rendu voit déjà la
 * galerie, sinon l'auto-fermeture « galerie vide » annulait l'ouverture.
 */
function useLiveNode(handle: BoardHandle, id: string | null): BoardNodeData | null {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!id) return
    const nodes = getNodesMap(handle.doc)
    const onChange = (): void => setRevision((r) => r + 1)
    nodes.observeDeep(onChange)
    return () => nodes.unobserveDeep(onChange)
  }, [handle, id])
  // `revision` force la relecture à chaque changement du document.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readLiveNode(handle, id), [handle, id, revision])
}

/** Lecture synchrone d'un nœud du document. */
function readLiveNode(handle: BoardHandle, id: string | null): BoardNodeData | null {
  if (!id) return null
  const map = getNodesMap(handle.doc).get(id)
  return map ? yMapToNode(id, map) : null
}

/** Image en grand (ou état de réception). */
function StageImage({ handle, hash }: { handle: BoardHandle; hash: string }): JSX.Element {
  const { src, failed, progress } = useEntityImageSrc(handle, hash)
  if (src) return <img className="bd-lightbox__img" src={src} alt="" draggable={false} />
  if (failed) {
    return (
      <div className="bd-lightbox__ph bd-lightbox__ph--failed" role="alert">
        <ImageOff size={28} />
        <span>{t('image.transferError')}</span>
      </div>
    )
  }
  // §2 v1.9 — image d'un pair encore en transit : indicateur animé + % reçu.
  return (
    <div className="bd-lightbox__ph" role="status" aria-live="polite" aria-busy="true">
      <LoaderCircle size={28} className="bd-lightbox__spin" />
      <span>{t('image.receiving')}</span>
      {progress !== null && (
        <>
          <div
            className="bd-lightbox__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="bd-lightbox__progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="bd-lightbox__pct">{progress} %</span>
        </>
      )}
    </div>
  )
}

export function EntityLightbox(): JSX.Element | null {
  const { handle, canEdit, editEntityImages, customTypeMap } = useBoardContext()
  const nodeId = useEntityLightbox((state) => state.nodeId)
  const rawIndex = useEntityLightbox((state) => state.index)
  const setIndex = useEntityLightbox((state) => state.setIndex)
  const close = useEntityLightbox((state) => state.close)
  const pushToast = useToasts((state) => state.push)
  const node = useLiveNode(handle, nodeId)
  const frameRef = useRef<HTMLDivElement>(null)

  const images = lightboxImages(node)
  const count = images.length
  const index = clampImageIndex(rawIndex, count)
  const image = count > 0 ? images[index] : null

  // Entité supprimée / galerie vidée (localement ou par un pair) → fermeture.
  useEffect(() => {
    if (lightboxShouldClose(nodeId, node)) close()
  }, [nodeId, node, close])

  // Changement de tableau : la visionneuse ne survit pas au démontage.
  useEffect(() => () => useEntityLightbox.getState().close(), [])

  // Focus sur le cadre à l'ouverture (clavier immédiatement actif).
  useEffect(() => {
    if (nodeId) frameRef.current?.focus()
  }, [nodeId])

  // Clavier (phase de capture : prioritaire sur les raccourcis du tableau).
  const state = useRef({ index, count, image })
  state.current = { index, count, image }
  useEffect(() => {
    if (!nodeId) return
    const onKey = (event: KeyboardEvent): void => {
      const current = state.current
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        setIndex(wrapImageIndex(current.index, event.key === 'ArrowLeft' ? -1 : 1, current.count))
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && current.image) {
        event.preventDefault()
        event.stopPropagation()
        void copyEntityImage(handle, current.image.hash)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [nodeId, handle, close, setIndex])

  if (!nodeId || !node || !image) return null

  const name = node.title.trim() || resolveType(node.entityType ?? 'generic_other', customTypeMap).label
  const title = t('entity.imageViewerTitle', { name })
  const go = (delta: number): void => setIndex(wrapImageIndex(index, delta, count))
  const move = (delta: number): void => {
    editEntityImages(node.id, { type: 'move', hash: image.hash, delta })
    // L'image affichée suit son déplacement.
    setIndex(clampImageIndex(index + delta, count))
  }

  return (
    <div
      className="cm-modal-overlay bd-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      // Un fichier lâché sur la visionneuse ne doit pas tomber sur le canvas en dessous.
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'none'
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="bd-lightbox__frame" ref={frameRef} tabIndex={-1}>
        <header className="bd-lightbox__head">
          <span className="bd-lightbox__title" title={title}>
            {title}
          </span>
          <span className="bd-lightbox__pos">{t('entity.imagePosition', { index: index + 1, count })}</span>
          {index === 0 && <span className="bd-lightbox__cover">{t('entity.imageCover')}</span>}
          <button
            type="button"
            className="cm-btn cm-btn--ghost cm-btn--icon"
            onClick={close}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </header>

        <div className="bd-lightbox__stage">
          <button
            type="button"
            className="bd-lightbox__nav bd-lightbox__nav--prev"
            disabled={count < 2}
            onClick={() => go(-1)}
            title={t('entity.imagePrev')}
            aria-label={t('entity.imagePrev')}
          >
            <ChevronLeft size={22} />
          </button>
          <StageImage handle={handle} hash={image.hash} />
          <button
            type="button"
            className="bd-lightbox__nav bd-lightbox__nav--next"
            disabled={count < 2}
            onClick={() => go(1)}
            title={t('entity.imageNext')}
            aria-label={t('entity.imageNext')}
          >
            <ChevronRight size={22} />
          </button>
        </div>

        <footer className="bd-lightbox__bar">
          {count > 1 && (
            <div className="bd-lightbox__strip">
              {images.map((entry, i) => (
                <button
                  key={entry.hash}
                  type="button"
                  className={`bd-lightbox__thumb${i === index ? ' bd-lightbox__thumb--active' : ''}`}
                  onClick={() => setIndex(i)}
                  title={t('entity.imagePosition', { index: i + 1, count })}
                  aria-label={t('entity.imagePosition', { index: i + 1, count })}
                  aria-current={i === index}
                >
                  <EntityImageThumb handle={handle} image={entry} className="bd-lightbox__thumb-img" />
                </button>
              ))}
            </div>
          )}
          <div className="bd-lightbox__actions">
            {canEdit && (
              <>
                <button
                  type="button"
                  className="cm-btn cm-btn--sm"
                  disabled={index === 0}
                  onClick={() => {
                    editEntityImages(node.id, { type: 'cover', hash: image.hash })
                    setIndex(0)
                  }}
                >
                  <Star size={14} />
                  {t('entity.imageSetCover')}
                </button>
                <button
                  type="button"
                  className="cm-btn cm-btn--sm cm-btn--icon"
                  disabled={index === 0}
                  onClick={() => move(-1)}
                  title={t('entity.imageMoveLeft')}
                  aria-label={t('entity.imageMoveLeft')}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  className="cm-btn cm-btn--sm cm-btn--icon"
                  disabled={index >= count - 1}
                  onClick={() => move(1)}
                  title={t('entity.imageMoveRight')}
                  aria-label={t('entity.imageMoveRight')}
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              className="cm-btn cm-btn--sm"
              onClick={() => void copyEntityImage(handle, image.hash)}
            >
              <Copy size={14} />
              {t('image.copy')}
            </button>
            <button
              type="button"
              className="cm-btn cm-btn--sm"
              onClick={() => void saveEntityImage(handle, image.hash, entityImageSaveName(node, index))}
            >
              <Download size={14} />
              {t('entity.imageSave')}
            </button>
            {canEdit && (
              <button
                type="button"
                className="cm-btn cm-btn--sm cm-btn--danger"
                onClick={() => {
                  editEntityImages(node.id, { type: 'remove', hash: image.hash })
                  pushToast(t('entity.imageRemoved'), 'info')
                  setIndex(clampImageIndex(index, count - 1))
                }}
              >
                <Trash2 size={14} />
                {t('entity.imageRemove')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
