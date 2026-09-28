/**
 * §R2 v1.9 (aperçu audio/vidéo) — corps de visionneuse : lecteur natif complet
 * (<audio>/<video controls> : lecture, position, volume, plein écran vidéo), pochette et
 * balises pour l'audio. Pas de zoom (facteur 1 annoncé). Jamais de lecture automatique ;
 * le média s'arrête à la fermeture de la visionneuse (démontage + URL blob: révoquée).
 */
import { useEffect, useRef, useState } from 'react'
import { Download, LoaderCircle, Music } from 'lucide-react'
import { t } from '@/i18n'
import { formatDuration } from '@/lib/mediaPreview'
import type { ViewerBodyProps } from '@/components/nodes/preview/types'
import {
  mediaKindOf,
  useMediaSource,
  usePauseWhenHidden,
  useVideoPoster
} from '@/components/nodes/preview/mediaSource'
import '@/components/nodes/preview/mediaPreview.css'

export function MediaViewerBody(props: ViewerBodyProps): JSX.Element {
  const { onZoomResolved, onMeta, onSave, fallback } = props
  const kind = mediaKindOf(props.kind)
  const media = useMediaSource(props, true)
  const poster = useVideoPoster(props, kind === 'video' && media.playable && media.url !== null, media.url)
  const ref = useRef<HTMLMediaElement | null>(null)
  usePauseWhenHidden(ref)
  const [elementDuration, setElementDuration] = useState<number | undefined>(undefined)
  const [playError, setPlayError] = useState(false)

  useEffect(() => onZoomResolved(1), [onZoomResolved])

  const duration = elementDuration ?? media.info?.durationSec ?? poster?.durationSec
  const meta = formatDuration(duration)
  useEffect(() => {
    onMeta(meta || null)
  }, [meta, onMeta])
  useEffect(() => () => onMeta(null), [onMeta])

  const onLoaded = (value: number): void => {
    setElementDuration(Number.isFinite(value) && value > 0 ? value : undefined)
  }

  if (media.failed) return <>{fallback}</>
  if (!media.info) {
    return (
      <div className="bd-fileviewer__status">
        <LoaderCircle size={28} className="nd-file-spin" />
        <span>{t('file.media.loading')}</span>
      </div>
    )
  }
  if (!media.playable || playError) {
    return (
      <div className="bd-fileviewer__status">
        <Music size={40} strokeWidth={1.4} />
        <span>{t(playError ? 'file.media.error' : 'file.media.unplayable')}</span>
        <span className="bd-fileviewer__muted">{t('file.previewSaveHint')}</span>
        <button type="button" className="cm-btn cm-btn--sm" onClick={onSave}>
          <Download size={13} />
          {t('file.save')}
        </button>
      </div>
    )
  }
  if (!media.url) return <>{fallback}</>

  if (kind === 'video') {
    return (
      <div className="fv-media fv-media--video">
        <video
          ref={(el) => {
            ref.current = el
          }}
          className="fv-media-video"
          src={media.url}
          poster={poster?.poster ?? undefined}
          controls
          preload="metadata"
          playsInline
          onLoadedMetadata={(e) => onLoaded(e.currentTarget.duration)}
          onError={() => setPlayError(true)}
        />
      </div>
    )
  }

  const info = media.info
  return (
    <div className="fv-media fv-media--audio">
      <div className="fv-media-cover">
        {info.cover ? <img src={info.cover} alt="" draggable={false} /> : <Music size={72} strokeWidth={1.2} />}
      </div>
      <div className="fv-media-tags">
        <div className="fv-media-title">{info.title ?? props.name}</div>
        {info.artist && <div className="fv-media-artist">{info.artist}</div>}
        {info.album && <div className="fv-media-album">{info.album}</div>}
      </div>
      <audio
        ref={(el) => {
          ref.current = el
        }}
        className="fv-media-audio"
        src={media.url}
        controls
        preload="metadata"
        onLoadedMetadata={(e) => onLoaded(e.currentTarget.duration)}
        onError={() => setPlayError(true)}
      />
      <p className="fv-media-hint">{t('file.media.noAutoplay')}</p>
    </div>
  )
}
