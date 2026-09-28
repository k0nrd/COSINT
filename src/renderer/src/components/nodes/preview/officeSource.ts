/**
 * §R2 v1.9 (aperçu bureautique) — extraction partagée entre le nœud et la visionneuse :
 * un seul calcul par contenu (clé = hash de contenu, identique chez tous les pairs),
 * résultats (succès OU échec) gardés dans un LRU mémoire ; rien n'est écrit dans Yjs.
 */
import { useEffect, useState } from 'react'
import { formatNumber, localeTag, t, type MessageKey } from '@/i18n'
import { LruCache, dataUrlPayload, decodeBase64 } from '@/lib/filePreview'
import {
  OFFICE_LIMITS,
  extractOfficePreview,
  officeCounts,
  officeFailureOf,
  type OfficeFailure,
  type OfficePreview
} from '@/lib/officePreview'
import { previewCacheKey } from '../fileSource'
import type { FilePreviewSource } from './types'

export type OfficeResult = { ok: true; preview: OfficePreview } | { ok: false; failure: OfficeFailure }
export type OfficeState = { status: 'loading' } | { status: 'ready'; preview: OfficePreview } | { status: 'error'; failure: OfficeFailure }

const cache = new LruCache<string, OfficeResult>(12)
const inflight = new Map<string, Promise<OfficeResult>>()

/** Lance (ou réutilise) l'extraction d'un contenu. */
function requestOffice(key: string, src: FilePreviewSource): Promise<OfficeResult> {
  const done = cache.get(key)
  if (done) return Promise.resolve(done)
  const running = inflight.get(key)
  if (running) return running
  const job = (async (): Promise<OfficeResult> => {
    // Laisse le rendu « chargement » s'afficher avant le travail synchrone (XML).
    await new Promise((r) => setTimeout(r, 0))
    if (src.bytes > OFFICE_LIMITS.maxInputBytes) return { ok: false, failure: 'tooLarge' }
    try {
      const bytes = decodeBase64(dataUrlPayload(src.dataUrl), OFFICE_LIMITS.maxInputBytes)
      return { ok: true, preview: await extractOfficePreview(bytes, src.ext, src.mime) }
    } catch (error) {
      return { ok: false, failure: officeFailureOf(error) }
    }
  })().then((result) => {
    inflight.delete(key)
    // Une annulation n'est pas un résultat durable.
    if (result.ok || result.failure !== 'aborted') cache.set(key, result)
    return result
  })
  inflight.set(key, job)
  return job
}

/** Aperçu bureautique d'une source (désactivé si `enabled` est faux). */
export function useOfficePreview(src: FilePreviewSource, enabled = true): OfficeState {
  const key = previewCacheKey(src.cacheKey, src.dataUrl)
  const [state, setState] = useState<{ key: string | null; value: OfficeState }>(() => {
    const hit = key ? cache.get(key) : undefined
    return { key, value: hit ? toState(hit) : { status: 'loading' } }
  })
  useEffect(() => {
    if (!enabled || !key) return
    let alive = true
    void requestOffice(key, src).then((result) => {
      if (alive) setState({ key, value: toState(result) })
    })
    return () => {
      alive = false
    }
    // La data-URL n'est lue qu'au lancement : l'effet ne dépend que de la clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return state.key === key ? state.value : { status: 'loading' }
}

function toState(result: OfficeResult): OfficeState {
  return result.ok ? { status: 'ready', preview: result.preview } : { status: 'error', failure: result.failure }
}

/** Message localisé d'un échec. */
export function officeFailureText(failure: OfficeFailure): string {
  return t(`file.office.${failure}` as MessageKey)
}

function plural(count: number, base: 'paragraph' | 'sheet' | 'slide'): string {
  let category: Intl.LDMLPluralRule = 'other'
  try {
    category = new Intl.PluralRules(localeTag()).select(count)
  } catch {
    // Intl indisponible : forme générale.
  }
  const form = category === 'one' ? 'One' : category === 'few' ? 'Few' : 'Many'
  return t(`file.office.${base}${form}` as MessageKey, { count: formatNumber(count, 0) })
}

/** Méta lisible : « 3 feuilles », « 12 diapositives », « 40 paragraphes » ('' si rien). */
export function officeMeta(preview: OfficePreview): string {
  const c = officeCounts(preview)
  if (c.slides) return plural(c.slides, 'slide')
  if (c.tables && !c.paragraphs && preview.blocks.every((b) => b.kind === 'table' && b.name !== undefined)) {
    return plural(c.tables, 'sheet')
  }
  if (c.paragraphs) return plural(c.paragraphs, 'paragraph')
  return ''
}
