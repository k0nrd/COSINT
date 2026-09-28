/**
 * §2 v1.9 (galerie) — galerie d'images d'une entité, dans le panneau Détails.
 *
 * Trois façons d'ajouter (en plus du clic droit / de la barre contextuelle / du dépôt
 * sur le nœud, cf. flow/entityImageActions.ts) : le bouton « Ajouter des images… »
 * (sélecteur multiple), un glisser-déposer sur la zone, et Ctrl+V quand la zone a le
 * focus (clic dans la zone). La première image est la COUVERTURE affichée sur le nœud.
 *
 * Par image : agrandir (visionneuse), définir comme couverture, déplacer à gauche /
 * à droite, copier, enregistrer sous…, retirer. Un visiteur (lecture seule) peut
 * regarder, copier et enregistrer, jamais modifier.
 */
import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  Star,
  Trash2
} from 'lucide-react'
import type { BoardNodeData, EntityImage } from '@/types'
import type { BoardHandle } from '@/sync/BoardDoc'
import { useBoardContext } from '@/flow/BoardContext'
import { useFile } from '@/sync/hooks'
import {
  copyEntityImage,
  dragCarriesImages,
  imageFilesOf,
  saveEntityImage
} from '@/flow/entityImageActions'
import {
  entityImageFileName,
  isInlineImageRef,
  MAX_ENTITY_IMAGES,
  resolveEntityImageSrc,
  entityImageProgress
} from '@/lib/entityImages'
import { useEntityLightbox } from '@/store/entityLightbox'
import { useToasts } from '@/store/toasts'
import { t } from '@/i18n'
import './entityGallery.css'

/**
 * Source affichable d'une image de galerie (data-URL inline ou fichier complet) ;
 * `failed` si le transfert a échoué ou si le fichier n'est pas une image. `hash` null
 * (pas d'image, ex. couverture d'une entité sans galerie) → rien à afficher.
 */
export function useEntityImageSrc(
  handle: BoardHandle,
  hash: string | null
): {
  src: string | null
  failed: boolean
  /** §2 v1.9 — % reçu tant que les chunks arrivent (null sinon). */
  progress: number | null
} {
  const file = useFile(handle, hash && !isInlineImageRef(hash) ? hash : null)
  return { ...resolveEntityImageSrc(hash, file), progress: entityImageProgress(file) }
}

/** Vignette d'une image de galerie (état « réception… » tant que les chunks arrivent). */
export function EntityImageThumb({
  handle,
  image,
  className
}: {
  handle: BoardHandle
  image: EntityImage
  className?: string
}): JSX.Element {
  const { src, failed } = useEntityImageSrc(handle, image.hash)
  if (src) return <img className={className} src={src} alt="" draggable={false} />
  return (
    <span className={`${className ?? ''} bd-gallery__ph`} title={failed ? t('image.transferError') : t('image.receiving')}>
      <ImageIcon size={16} />
    </span>
  )
}

/** Nom proposé à l'enregistrement : titre de l'entité + rang de l'image. */
export function entityImageSaveName(node: BoardNodeData, index: number): string {
  return entityImageFileName(node.title, index, t('entity.imageFileName'))
}

export function EntityGallery({ node }: { node: BoardNodeData }): JSX.Element {
  const { handle, canEdit, attachEntityImages, pickEntityImages, editEntityImages } = useBoardContext()
  const openLightbox = useEntityLightbox((state) => state.open)
  const pushToast = useToasts((state) => state.push)
  const images = node.images ?? []
  const [activeHash, setActiveHash] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const activeIndex = Math.max(
    0,
    images.findIndex((image) => image.hash === activeHash)
  )
  const active = images.length > 0 ? images[activeIndex] : null
  const full = images.length >= MAX_ENTITY_IMAGES

  const attach = (files: File[]): void => {
    if (files.length === 0) {
      pushToast(t('entity.imagesNone'), 'info')
      return
    }
    attachEntityImages(node.id, files)
  }

  const remove = (image: EntityImage): void => {
    editEntityImages(node.id, { type: 'remove', hash: image.hash })
    pushToast(t('entity.imageRemoved'), 'info')
  }

  return (
    <>
      <label className="cm-label bd-gallery__label">
        <span>{t('entity.images')}</span>
        {images.length > 0 && (
          <span className="bd-gallery__count">
            {t('entity.imagesCount', { count: images.length, max: MAX_ENTITY_IMAGES })}
          </span>
        )}
      </label>
      <div
        className={`bd-gallery${dragging ? ' bd-gallery--drag' : ''}`}
        tabIndex={0}
        role="group"
        aria-label={t('entity.imagesZoneLabel')}
        title={canEdit ? t('entity.imagesZoneLabel') : undefined}
        onPaste={(event) => {
          // Ctrl+V dans la zone : images du presse-papiers → galerie (jamais un nœud
          // du tableau : le collage du canvas ignore le panneau Détails).
          if (!canEdit) return
          const files = imageFilesOf(event.clipboardData)
          if (files.length === 0) return
          event.preventDefault()
          event.stopPropagation()
          attach(files)
        }}
        onDragOver={(event) => {
          if (!canEdit || !dragCarriesImages(event.dataTransfer)) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'copy'
          if (!dragging) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          // Toujours intercepté : un dépôt sur le panneau ne doit ni créer de nœud
          // image sur le canvas en dessous, ni faire naviguer la fenêtre.
          event.preventDefault()
          event.stopPropagation()
          setDragging(false)
          if (!canEdit) return
          attach(imageFilesOf(event.dataTransfer))
        }}
      >
        {images.length === 0 ? (
          <p className="bd-gallery__empty">
            <ImageIcon size={16} />
            <span>{t('entity.imagesEmpty')}</span>
          </p>
        ) : (
          <div className="bd-gallery__grid">
            {images.map((image, index) => (
              <button
                key={image.hash}
                type="button"
                className={`bd-gallery__tile${index === activeIndex ? ' bd-gallery__tile--active' : ''}`}
                onClick={() => setActiveHash(image.hash)}
                onDoubleClick={() => openLightbox(node.id, index)}
                title={t('entity.imagePosition', { index: index + 1, count: images.length })}
                aria-label={t('entity.imagePosition', { index: index + 1, count: images.length })}
                aria-pressed={index === activeIndex}
              >
                <EntityImageThumb handle={handle} image={image} className="bd-gallery__img" />
                {index === 0 && <span className="bd-gallery__cover">{t('entity.imageCover')}</span>}
              </button>
            ))}
          </div>
        )}

        {active && (
          <div className="bd-gallery__actions" role="toolbar" aria-label={t('entity.images')}>
            <GalleryAction
              icon={<Maximize2 size={14} />}
              label={t('entity.imageView')}
              onClick={() => openLightbox(node.id, activeIndex)}
            />
            {canEdit && (
              <>
                <GalleryAction
                  icon={<Star size={14} />}
                  label={t('entity.imageSetCover')}
                  disabled={activeIndex === 0}
                  onClick={() => editEntityImages(node.id, { type: 'cover', hash: active.hash })}
                />
                <GalleryAction
                  icon={<ChevronLeft size={14} />}
                  label={t('entity.imageMoveLeft')}
                  disabled={activeIndex === 0}
                  onClick={() => editEntityImages(node.id, { type: 'move', hash: active.hash, delta: -1 })}
                />
                <GalleryAction
                  icon={<ChevronRight size={14} />}
                  label={t('entity.imageMoveRight')}
                  disabled={activeIndex >= images.length - 1}
                  onClick={() => editEntityImages(node.id, { type: 'move', hash: active.hash, delta: 1 })}
                />
              </>
            )}
            <GalleryAction
              icon={<Copy size={14} />}
              label={t('image.copy')}
              onClick={() => void copyEntityImage(handle, active.hash)}
            />
            <GalleryAction
              icon={<Download size={14} />}
              label={t('entity.imageSave')}
              onClick={() => void saveEntityImage(handle, active.hash, entityImageSaveName(node, activeIndex))}
            />
            {canEdit && (
              <GalleryAction
                icon={<Trash2 size={14} />}
                label={t('entity.imageRemove')}
                danger
                onClick={() => remove(active)}
              />
            )}
          </div>
        )}

        {canEdit && (
          <button
            type="button"
            className="cm-btn cm-btn--sm bd-gallery__add"
            disabled={full}
            title={full ? t('entity.imagesFull', { max: MAX_ENTITY_IMAGES }) : undefined}
            onClick={() => pickEntityImages(node.id)}
          >
            <ImagePlus size={14} />
            {t('entity.addImages')}
          </button>
        )}

        {dragging && (
          <div className="bd-gallery__drop" aria-hidden>
            <ImagePlus size={18} />
            <span>{t('entity.imagesDropHere')}</span>
          </div>
        )}
      </div>
    </>
  )
}

function GalleryAction({
  icon,
  label,
  onClick,
  disabled,
  danger
}: {
  icon: JSX.Element
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      className={`cm-btn cm-btn--ghost cm-btn--icon bd-gallery__action${danger ? ' bd-gallery__action--danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  )
}
