/**
 * §R2 v1.9 (aperçu du code) — visionneuse d'un script / fichier de code : code complet
 * (borné par VIEWER_TEXT_LIMITS) coloré ligne par ligne avec numéros, retour à la
 * ligne optionnel, copie du texte, zoom par taille de police, bandeau « jamais
 * exécuté » pour les scripts. Rien n'est exécuté ni interprété : le HTML injecté vient
 * de highlightCodeLines (texte ÉCHAPPÉ + classes de jetons).
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, ShieldAlert, WrapText } from 'lucide-react'
import { t } from '@/i18n'
import { useToasts } from '@/store/toasts'
import { LruCache, VIEWER_TEXT_LIMITS, dataUrlPayload, isExecutableScript } from '@/lib/filePreview'
import {
  buildCodePreview,
  codeLanguageLabel,
  highlightCodeLines,
  type CodePreview
} from '@/lib/codePreview'
import { previewCacheKey } from '@/components/nodes/fileSource'
import type { ViewerBodyProps } from '@/components/nodes/preview/types'
import '@/components/nodes/code.css'
import '@/components/nodes/preview/codePreview.css'

interface ViewerCode {
  preview: CodePreview
  lines: string[]
}

/** Peu d'entrées : chaque extrait peut peser ~1 Mo de texte + son HTML. */
const viewerCache = new LruCache<string, ViewerCode | null>(4)

/** Préférence de retour à la ligne (session, tous fichiers). */
let wrapPreference = false

export function CodeViewerBody({
  zoom,
  onZoomResolved,
  onMeta,
  fallback,
  cacheKey,
  dataUrl,
  ext
}: ViewerBodyProps): JSX.Element {
  const pushToast = useToasts((state) => state.push)
  const [wrap, setWrap] = useState(wrapPreference)
  const [copied, setCopied] = useState(false)
  const key = previewCacheKey(cacheKey, dataUrl)

  const code = useMemo(() => {
    const k = key === null ? null : `viewer:${ext}:${key}`
    if (k !== null && viewerCache.has(k)) return viewerCache.get(k) ?? null
    let built: ViewerCode | null
    try {
      const preview = buildCodePreview(dataUrlPayload(dataUrl), ext, VIEWER_TEXT_LIMITS)
      built = { preview, lines: preview.binary ? [] : highlightCodeLines(preview.text, ext) }
    } catch {
      built = null
    }
    if (k !== null) viewerCache.set(k, built)
    return built
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key ?? dataUrl, ext])

  const scale = zoom === 'fit' ? 1 : zoom
  useEffect(() => onZoomResolved(scale), [scale, onZoomResolved])

  const language = codeLanguageLabel(ext) || t('file.code.plain')
  const usable = code !== null && !code.preview.binary
  const lineCount = usable ? code.lines.length : 0
  const encoding = usable ? code.preview.encoding : ''
  useEffect(() => {
    onMeta(
      usable
        ? [language, t('file.code.lines', { n: lineCount }), t('file.encoding', { encoding })].join(' · ')
        : null
    )
    return () => onMeta(null)
  }, [usable, language, lineCount, encoding, onMeta])

  if (!code || !usable) return <>{fallback}</>
  const script = isExecutableScript(ext)
  const digits = String(code.lines.length).length

  const toggleWrap = (): void => {
    wrapPreference = !wrap
    setWrap(!wrap)
  }
  const copy = (): void => {
    const done = (ok: boolean): void => {
      if (ok) {
        setCopied(true)
        pushToast(t('file.code.copied'), 'success')
        window.setTimeout(() => setCopied(false), 1500)
      } else {
        pushToast(t('file.code.copyError'), 'error')
      }
    }
    const api = window.cosint?.copyText
    if (!api) return done(false)
    void api(code.preview.text).then(done, () => done(false))
  }

  return (
    <div className="cp-viewer">
      <div className="cp-viewer-bar">
        <span className="cp-lang">{language}</span>
        {script && (
          <span className="cp-script-badge" title={t('file.code.readOnlyHint')}>
            <ShieldAlert size={13} aria-hidden />
            <span>{t('file.code.readOnly')}</span>
          </span>
        )}
        <span className="cp-viewer-spacer" />
        <button
          type="button"
          className={`cp-viewer-btn${wrap ? ' cp-viewer-btn--active' : ''}`}
          aria-pressed={wrap}
          onClick={toggleWrap}
          title={t('file.code.wrap')}
        >
          <WrapText size={14} aria-hidden />
          <span>{t('file.code.wrap')}</span>
        </button>
        <button type="button" className="cp-viewer-btn" onClick={copy} title={t('file.code.copy')}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          <span>{t('file.code.copy')}</span>
        </button>
      </div>
      {code.preview.truncated && <div className="cp-viewer-note">{t('file.code.truncated')}</div>}
      <div className="cp-viewer-scroll">
        <div
          className={`cp-viewer-code cp-code${wrap ? ' cp-viewer-code--wrap' : ''}`}
          style={{ fontSize: `${12.5 * scale}px`, ['--cp-digits' as string]: `${digits}ch` }}
          aria-label={language}
        >
          {code.lines.map((html, i) => (
            <div key={i} className="cp-row">
              <span className="cp-ln" aria-hidden>
                {i + 1}
              </span>
              {/* HTML sûr : texte échappé + classes de jetons (voir highlightCodeLines). */}
              <code className="cp-src" dangerouslySetInnerHTML={{ __html: html || ' ' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
