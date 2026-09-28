/**
 * §5 v1.9 (aperçu) — hooks partagés par le nœud fichier et la visionneuse :
 *  - `useFileSource` : état du fichier référencé par un nœud (complet / en cours /
 *    erreur, avec détection de transfert bloqué §1.4) ;
 *  - `usePdfThumbnail` : miniature de la 1re page (pdf.js à la demande, cache LRU) ;
 *  - `useTextExcerpt` : extrait texte décodé (jeu de caractères détecté, borné).
 *
 * La clé de cache est le HASH de contenu du fichier (identique chez tous les pairs) ;
 * rien de ce qui est calculé ici n'est écrit dans le document Yjs.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardHandle } from '@/sync/BoardDoc'
import { useFile } from '@/sync/hooks'
import { base64ByteLength, parseDataUrl } from '@/sync/files'
import {
  LruCache,
  base64DecodedLength,
  buildTextPreview,
  dataUrlPayload,
  displayImageMime,
  fileTransferPhase,
  normalizeMime,
  transferPercent,
  type FileTransferPhase,
  type TextPreview
} from '@/lib/filePreview'
import {
  forgetPdfThumbnail,
  peekPdfThumbnail,
  requestPdfThumbnail,
  type PdfThumbnailResult
} from '@/lib/pdfPreview'

/** Au-delà de ce délai sans progression, un transfert est déclaré échoué (§1.4). */
const STALL_MS = 20_000

export interface FileSourceState {
  /** empty = nœud sans fichier ; ready = octets complets ; loading = transfert en
   * cours ; missing = fichier encore inconnu de ce poste (aucun pair connecté ne l'a
   * transmis) ; error = transfert bloqué, incomplet ou corrompu. */
  phase: FileTransferPhase
  /** data-URL complète (phase « ready » uniquement). */
  dataUrl: string | null
  /** Type MIME déclaré (normalisé). */
  mime: string
  /** Taille binaire estimée (octets). */
  bytes: number
  /** Progression du transfert (0–100). */
  percent: number
  /** Clé de cache stable (hash de contenu) ; null pour un contenu inline hérité. */
  key: string | null
  /** true si le fichier attend depuis plus de STALL_MS sans progresser (phase
   * « missing » : le message passe de « en attente » à « indisponible »). */
  stalled: boolean
  /** Réessayer après un transfert bloqué. */
  retry: () => void
}

/** État du fichier référencé par le `content` d'un nœud fichier (hash ou data-URL héritée). */
export function useFileSource(handle: BoardHandle, content: string): FileSourceState {
  const isInline = content.startsWith('data:')
  const hash = !isInline && content !== '' ? content : null
  const file = useFile(handle, hash)
  const [stalled, setStalled] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Détection de blocage : réarmée à chaque progression (`received`) ou réessai.
  const received = file.status === 'loading' ? file.received : 0
  useEffect(() => {
    if (isInline || hash === null || file.status === 'complete' || file.status === 'error') {
      setStalled(false)
      return
    }
    const timer = window.setTimeout(() => setStalled(true), STALL_MS)
    return () => window.clearTimeout(timer)
  }, [isInline, hash, file.status, received, attempt])

  const retry = (): void => {
    setStalled(false)
    setAttempt((value) => value + 1)
  }

  const pending = { dataUrl: null, mime: '', bytes: 0, retry }
  if (content === '') {
    return { ...pending, phase: 'empty', percent: 0, key: null, stalled: false }
  }
  if (isInline) {
    const parsed = parseDataUrl(content)
    if (!parsed) return { ...pending, phase: 'error', percent: 0, key: null, stalled: false }
    return {
      phase: 'ready',
      dataUrl: content,
      mime: normalizeMime(parsed.mime),
      bytes: base64DecodedLength(parsed.payload),
      percent: 100,
      key: null,
      stalled: false,
      retry
    }
  }
  if (file.status === 'complete') {
    // Taille exacte : 3/4 de la charge, moins le remplissage `=` final.
    const padding = file.dataUrl.endsWith('==') ? 2 : file.dataUrl.endsWith('=') ? 1 : 0
    return {
      phase: 'ready',
      dataUrl: file.dataUrl,
      mime: normalizeMime(file.meta.mime),
      bytes: Math.max(0, base64ByteLength(file.meta.size) - padding),
      percent: 100,
      key: hash,
      stalled: false,
      retry
    }
  }
  const total = file.status === 'loading' ? file.total : 0
  return {
    ...pending,
    phase: fileTransferPhase(file.status, stalled),
    percent: transferPercent(received, total),
    key: hash,
    stalled
  }
}

/** Empreinte FNV-1a 32 bits d'une tranche de chaîne (non cryptographique). */
function fnv1a(text: string, from: number, to: number, seed: number): number {
  let h = seed
  for (let i = from; i < to; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Taille de l'échantillon hashé en tête et en fin de data-URL inline. */
const INLINE_KEY_SAMPLE = 64 * 1024

/**
 * Clé de cache d'un aperçu : le hash de contenu, ou — contenu inline hérité (avant
 * migration en chunks, ex. juste après l'import d'un `.trace`) — une clé COURTE
 * dérivée de la data-URL (longueur + empreinte du début et de la fin, §D2 v1.9) :
 * la chaîne de plusieurs Mo n'est jamais retenue comme clé dans le cache LRU.
 */
export function previewCacheKey(key: string | null, dataUrl: string | null): string | null {
  if (key !== null) return key
  if (dataUrl === null) return null
  const len = dataUrl.length
  const head = fnv1a(dataUrl, 0, Math.min(len, INLINE_KEY_SAMPLE), 0x811c9dc5)
  const tail = fnv1a(dataUrl, Math.max(0, len - INLINE_KEY_SAMPLE), len, head ^ len)
  return `inline:${len}:${head.toString(36)}:${tail.toString(36)}`
}

/**
 * Miniature de la 1re page d'un PDF (null tant qu'elle se calcule). La data-URL
 * n'est lue qu'au lancement du rendu (réf.) : l'effet ne dépend que de la clé, pas
 * de l'identité de la chaîne (recréée à chaque arrivée de chunk d'un autre fichier).
 */
export function usePdfThumbnail(
  hash: string | null,
  dataUrl: string | null,
  enabled: boolean
): { result: PdfThumbnailResult | null; retry: () => void } {
  const dataRef = useRef(dataUrl)
  dataRef.current = dataUrl
  // Contenu inline hérité (sans hash) : la data-URL sert de clé (sinon attente sans fin).
  const key = previewCacheKey(hash, dataUrl)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<PdfThumbnailResult | null>(() =>
    key && enabled ? (peekPdfThumbnail(key) ?? null) : null
  )
  const ready = enabled && key !== null && dataUrl !== null

  useEffect(() => {
    if (!ready || key === null) {
      setResult(null)
      return
    }
    let alive = true
    const cached = peekPdfThumbnail(key)
    setResult(cached ?? null)
    if (!cached) {
      void requestPdfThumbnail(key, () => dataUrlPayload(dataRef.current ?? '')).then((value) => {
        if (alive) setResult(value)
      })
    }
    return () => {
      alive = false
    }
  }, [key, ready, attempt])

  const retry = (): void => {
    if (key) forgetPdfThumbnail(key)
    setResult(null)
    setAttempt((value) => value + 1)
  }
  return { result, retry }
}

/** Extraits texte déjà décodés (clé = hash + profil de limites). */
const textCache = new LruCache<string, TextPreview | null>(96)

/**
 * Extrait texte d'un fichier (null si la charge est corrompue). Mémoïsé par clé :
 * seul le préfixe utile de la charge est décodé.
 */
export function useTextExcerpt(
  key: string | null,
  dataUrl: string | null,
  enabled: boolean,
  limits: { bytes: number; chars: number; lines: number },
  profile: string
): TextPreview | null {
  const ready = enabled && dataUrl !== null
  // Sans clé (contenu inline hérité), on dépend de la chaîne elle-même.
  const identity = key === null ? dataUrl : key
  return useMemo(() => {
    if (!ready || dataUrl === null) return null
    const cacheKey = key === null ? null : `${profile}:${key}`
    if (cacheKey !== null && textCache.has(cacheKey)) return textCache.get(cacheKey) ?? null
    let preview: TextPreview | null
    try {
      preview = buildTextPreview(dataUrlPayload(dataUrl), limits)
    } catch {
      preview = null
    }
    if (cacheKey !== null) textCache.set(cacheKey, preview)
    return preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, ready, profile])
}

/**
 * data-URL affichable d'une image (MIME corrigé d'après l'extension si le type
 * déclaré n'est pas affichable, ex. un SVG reçu en octet-stream). null sinon.
 */
export function imageDisplayUrl(dataUrl: string | null, mime: string, filename: string): string | null {
  if (!dataUrl) return null
  const display = displayImageMime(mime, filename)
  if (!display) return null
  if (normalizeMime(mime) === display) return dataUrl
  const payload = dataUrlPayload(dataUrl)
  return payload ? `data:${display};base64,${payload}` : null
}
