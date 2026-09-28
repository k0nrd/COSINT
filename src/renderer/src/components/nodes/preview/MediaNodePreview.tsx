/**
 * §R2 v1.9 (aperçu audio/vidéo) — aperçu dans le nœud fichier.
 * Audio : pochette (ID3/FLAC) + titre/artiste + mini-lecteur (lecture/pause, position,
 * durée). Vidéo : lecteur natif avec la 1re image en vignette. Jamais de lecture
 * automatique ; la lecture s'arrête au démontage ou quand la fenêtre est masquée.
 * Carte compacte : rien d'affiché, seulement la vignette (pochette / 1re image) remontée.
 */
import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react'
import { Music, Pause, Play } from 'lucide-react'
import { t } from '@/i18n'
import { formatDuration } from '@/lib/mediaPreview'
import type { NodePreviewProps } from './types'
import { mediaKindOf, useMediaSource, usePauseWhenHidden, useVideoPoster } from './mediaSource'
import './mediaPreview.css'

/** Les commandes du lecteur ne doivent ni déplacer le nœud ni ouvrir la visionneuse. */
const stop = (event: MouseEvent | SyntheticEvent): void => event.stopPropagation()

export function MediaNodePreview(props: NodePreviewProps): JSX.Element | null {
  const { compact, fallback, onInfo } = props
  const kind = mediaKindOf(props.kind)
  const media = useMediaSource(props, !compact)
  // §R2 v1.9 — déplié : attendre l'URL de lecture (sinon 2e décodage + 2e capture).
  const poster = useVideoPoster(props, kind === 'video' && media.playable && (compact || media.url !== null), compact ? null : media.url)
  const [elementDuration, setElementDuration] = useState<number | undefined>(undefined)
  const [playError, setPlayError] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  usePauseWhenHidden(videoRef)

  const duration = elementDuration ?? media.info?.durationSec ?? poster?.durationSec
  const meta = formatDuration(duration)
  const thumbnail = kind === 'audio' ? media.info?.cover : (poster?.poster ?? undefined)
  useEffect(() => {
    onInfo(meta || thumbnail ? { meta: meta || undefined, thumbnail } : null)
  }, [meta, thumbnail, onInfo])
  useEffect(() => () => onInfo(null), [onInfo])

  if (compact) return null
  if (media.failed || !media.info) return <>{fallback}</>
  if (!media.playable || playError) {
    return (
      <div className="nd-media nd-media--message">
        {fallback}
        <p className="nd-media-note">{t(playError ? 'file.media.error' : 'file.media.unplayable')}</p>
      </div>
    )
  }
  if (!media.url) return <div className="nd-media nd-media--message">{t('file.media.loading')}</div>

  if (kind === 'video') {
    return (
      <div className="nd-media nd-media--video">
        <video
          ref={videoRef}
          className="nd-media-video nodrag nopan nowheel"
          src={media.url}
          poster={poster?.poster ?? undefined}
          controls
          preload="metadata"
          playsInline
          onDoubleClick={onVideoDoubleClick}
          onLoadedMetadata={(e) => setElementDuration(finite(e.currentTarget.duration))}
          onError={() => setPlayError(true)}
        />
      </div>
    )
  }
  return (
    <AudioCard
      url={media.url}
      cover={media.info.cover}
      title={media.info.title ?? props.name}
      artist={[media.info.artist, media.info.album].filter(Boolean).join(' — ')}
      duration={duration}
      onDuration={setElementDuration}
      onError={() => setPlayError(true)}
    />
  )
}

/** Hauteur (px) de la barre de commandes native en bas du lecteur vidéo. */
const VIDEO_CONTROLS_PX = 44

/**
 * §R2 v1.9 — double-clic sur l'image de la vidéo : ouvre la visionneuse (l'événement
 * remonte jusqu'au nœud) au lieu du plein écran natif, et remet en pause la lecture
 * lancée par le 1er clic. Sur la barre de commandes, il reste au lecteur.
 */
function onVideoDoubleClick(event: MouseEvent<HTMLVideoElement>): void {
  const video = event.currentTarget
  const rect = video.getBoundingClientRect()
  // Le zoom du tableau met le nœud à l'échelle : la barre aussi.
  const scale = video.offsetHeight > 0 ? rect.height / video.offsetHeight : 1
  if (event.clientY > rect.bottom - VIDEO_CONTROLS_PX * scale) {
    event.stopPropagation()
    return
  }
  event.preventDefault()
  video.pause()
}

function finite(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined
}

type AudioCardProps = {
  url: string
  cover?: string
  title: string
  artist: string
  duration?: number
  onDuration: (value: number | undefined) => void
  onError: () => void
}

/** Mini-lecteur audio du nœud (élément <audio> sans commandes natives). */
function AudioCard({ url, cover, title, artist, duration, onDuration, onError }: AudioCardProps): JSX.Element {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  usePauseWhenHidden(ref)

  const toggle = (event: MouseEvent): void => {
    event.stopPropagation()
    const el = ref.current
    if (!el) return
    if (el.paused) void el.play().catch(() => onError())
    else el.pause()
  }
  const max = duration ?? 0

  return (
    <div className="nd-media nd-media--audio">
      <div className="nd-media-cover">
        {cover ? <img src={cover} alt="" draggable={false} /> : <Music size={28} />}
      </div>
      <div className="nd-media-text">
        <div className="nd-media-title" title={title}>{title}</div>
        {artist && <div className="nd-media-artist" title={artist}>{artist}</div>}
      </div>
      <div className="nd-media-bar nodrag nopan" onDoubleClick={stop} onPointerDown={stop}>
        <button
          type="button"
          className="nd-media-play"
          onClick={toggle}
          title={t(playing ? 'file.media.pause' : 'file.media.play')}
          aria-label={t(playing ? 'file.media.pause' : 'file.media.play')}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <input
          type="range"
          className="nd-media-seek nowheel"
          min={0}
          max={max || 1}
          step={0.1}
          value={Math.min(position, max || 1)}
          disabled={!max}
          aria-label={t('file.media.seek')}
          onChange={(e) => {
            const el = ref.current
            if (el) el.currentTime = Number(e.currentTarget.value)
            setPosition(Number(e.currentTarget.value))
          }}
        />
        <span className="nd-media-time">
          {formatDuration(position) || '0:00'}
          {max ? ` / ${formatDuration(max)}` : ''}
        </span>
      </div>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => onDuration(finite(e.currentTarget.duration))}
        onError={onError}
      />
    </div>
  )
}
