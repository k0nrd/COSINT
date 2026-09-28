/**
 * §R2 v1.9 (aperçu audio/vidéo) — hooks communs au nœud et à la visionneuse :
 * décodage des octets (une fois), MIME RENIFLÉ sur la signature, balises (cache LRU
 * par hash de contenu), URL blob: révoquée au démontage, vignette de la 1re image
 * d'une vidéo (<video> détaché + canvas, borné dans le temps). Rien n'est écrit dans Yjs.
 */
import { useEffect, useRef, useState } from 'react'
import { LruCache, dataUrlPayload, decodeBase64 } from '@/lib/filePreview'
import { parseMediaInfo, type MediaInfo } from '@/lib/mediaPreview'
import { previewCacheKey } from '../fileSource'
import type { FilePreviewSource } from './types'

type MediaKind = 'audio' | 'video'
/** Vignette vidéo : 1re image (null si impossible) et durée lue au passage. */
export type VideoPoster = { poster: string | null; durationSec?: number }

const infoCache = new LruCache<string, MediaInfo>(24)
const posterCache = new LruCache<string, VideoPoster>(48)

/** Instant capturé pour la vignette vidéo (s) et délai max de capture (ms). */
const POSTER_AT_SEC = 0.1
const POSTER_TIMEOUT_MS = 8000
const POSTER_MAX_WIDTH = 480

export function mediaKindOf(kind: string): MediaKind {
  return kind === 'video' ? 'video' : 'audio'
}

/** Le moteur sait-il lire ce MIME ? (QuickTime : on tente le lecteur MP4, même famille ISO.) */
export function resolvePlayableMime(mime: string, kind: MediaKind): string {
  if (!mime || typeof document === 'undefined') return ''
  const el = document.createElement(kind)
  if (el.canPlayType(mime) !== '') return mime
  if (mime === 'video/quicktime' && el.canPlayType('video/mp4') !== '') return 'video/mp4'
  return ''
}

export type MediaSourceState = {
  info: MediaInfo | null
  /** URL blob: de lecture (null en carte compacte audio ou si illisible). */
  url: string | null
  /** false : type non reconnu ou non lisible par le moteur. */
  playable: boolean
  failed: boolean
}

/**
 * Octets → balises + URL blob:. `withUrl` = créer l'URL de lecture (la révoque au
 * démontage). La data-URL est lue via une réf. : l'effet ne dépend que de la clé.
 */
export function useMediaSource(src: FilePreviewSource, withUrl: boolean): MediaSourceState {
  const kind = mediaKindOf(src.kind)
  const key = previewCacheKey(src.cacheKey, src.dataUrl)
  const dataRef = useRef(src.dataUrl)
  dataRef.current = src.dataUrl
  const cached = key ? (infoCache.get(key) ?? null) : null
  const [state, setState] = useState<MediaSourceState>({ info: cached, url: null, playable: true, failed: false })

  useEffect(() => {
    let url: string | null = null
    try {
      const known = key ? infoCache.get(key) : undefined
      const needBytes = withUrl || !known
      const bytes = needBytes ? decodeBase64(dataUrlPayload(dataRef.current)) : null
      const info = known ?? parseMediaInfo(bytes as Uint8Array, src.ext, src.mime, kind)
      if (key && !known) infoCache.set(key, info)
      const mime = resolvePlayableMime(info.mime, kind)
      if (withUrl && bytes && mime) url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }))
      setState({ info, url, playable: mime !== '', failed: false })
    } catch {
      setState({ info: null, url: null, playable: false, failed: true })
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [key, withUrl, kind, src.ext, src.mime])

  return state
}

/** Capture la 1re image d'une vidéo (data:image/jpeg) et sa durée. */
function capturePoster(url: string): Promise<VideoPoster> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let done = false
    const finish = (poster: string | null): void => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      resolve({ poster, durationSec: Number.isFinite(video.duration) ? video.duration : undefined })
    }
    const timer = window.setTimeout(() => finish(null), POSTER_TIMEOUT_MS)
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true
    video.onerror = () => finish(null)
    video.onloadeddata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0
      video.currentTime = d > 0 ? Math.min(POSTER_AT_SEC, d / 2) : 0
    }
    video.onseeked = () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) return finish(null)
        const scale = Math.min(1, POSTER_MAX_WIDTH / w)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(null)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.8))
      } catch {
        finish(null)
      }
    }
    video.src = url
  })
}

/** Captures en cours par clé de contenu : deux nœuds / la visionneuse partagent la même. */
const posterInflight = new Map<string, Promise<VideoPoster>>()

/**
 * Vignette d'une vidéo (cache par hash). `url` = URL de lecture existante (visionneuse
 * ou nœud déplié : l'appelant n'active le hook qu'une fois cette URL prête, pour ne pas
 * décoder le fichier une 2e fois) ; sinon (carte compacte) une URL temporaire est créée
 * puis révoquée. Une capture en cours pour le même contenu est réutilisée.
 */
export function useVideoPoster(src: FilePreviewSource, enabled: boolean, url: string | null): VideoPoster | null {
  const key = previewCacheKey(src.cacheKey, src.dataUrl)
  const dataRef = useRef(src.dataUrl)
  dataRef.current = src.dataUrl
  const [poster, setPoster] = useState<VideoPoster | null>(() => (key ? (posterCache.get(key) ?? null) : null))

  useEffect(() => {
    if (!enabled) return
    const known = key ? posterCache.get(key) : undefined
    if (known) {
      setPoster(known)
      return
    }
    let cancelled = false
    let job = key ? posterInflight.get(key) : undefined
    if (!job) {
      let temp: string | null = null
      let target = url
      if (!target) {
        try {
          const bytes = decodeBase64(dataUrlPayload(dataRef.current))
          const info = parseMediaInfo(bytes.subarray(0, 64), src.ext, src.mime, 'video')
          const mime = resolvePlayableMime(info.mime, 'video')
          if (!mime) return
          temp = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }))
          target = temp
        } catch {
          return
        }
      }
      const owned = temp !== null
      job = capturePoster(target).then((result) => {
        if (temp) URL.revokeObjectURL(temp)
        if (key) {
          posterInflight.delete(key)
          // Échec avec une URL EMPRUNTÉE (révoquée au repli du nœud) : pas mis en cache,
          // un prochain affichage retentera.
          if (result.poster || owned) posterCache.set(key, result)
        }
        return result
      })
      if (key) posterInflight.set(key, job)
    }
    void job.then((result) => {
      if (!cancelled) setPoster(result)
    })
    return () => {
      cancelled = true
    }
  }, [key, enabled, url, src.ext, src.mime])

  return poster
}

/** Met en pause le média quand la fenêtre passe en arrière-plan (lecture seulement si visible). */
export function usePauseWhenHidden(ref: { current: HTMLMediaElement | null }): void {
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.hidden) ref.current?.pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      ref.current?.pause()
    }
  }, [ref])
}
