/**
 * §R2 v1.9 (aperçu du code) — extrait coloré d'un script / fichier de code dans le
 * nœud fichier : badge de langage, ~20 premières lignes (mono, sans retour à la ligne,
 * fondu en bas) et, pour les scripts exécutables (.bat, .ps1, .vbs…), un bandeau
 * « affiché en lecture seule, jamais exécuté ».
 *
 * Sécurité : le fichier n'est jamais exécuté ni interprété. Le HTML injecté vient de
 * highlightCodeLines (texte ÉCHAPPÉ + classes de jetons issues de la grammaire), comme
 * CodeNode ; aucune balise du fichier ne survit.
 */
import { useEffect, useMemo } from 'react'
import { ShieldAlert } from 'lucide-react'
import { t } from '@/i18n'
import { LruCache, dataUrlPayload, isExecutableScript } from '@/lib/filePreview'
import {
  buildCodePreview,
  codeLanguageLabel,
  highlightCodeLines,
  type CodePreview
} from '@/lib/codePreview'
import { previewCacheKey } from '../fileSource'
import type { NodePreviewProps } from './types'
import '../code.css'
import './codePreview.css'

/** Lignes affichées sur le nœud (le reste est rogné par le fondu). */
export const NODE_CODE_LINES = 20
/** Limites de l'extrait du nœud : préfixe court, jamais le fichier entier. */
const NODE_CODE_LIMITS = { bytes: 16 * 1024, chars: 4000, lines: NODE_CODE_LINES } as const

interface NodeCodeExcerpt {
  preview: CodePreview
  lines: string[]
}

const nodeCache = new LruCache<string, NodeCodeExcerpt | null>(64)

function buildExcerpt(dataUrl: string, ext: string): NodeCodeExcerpt | null {
  try {
    const preview = buildCodePreview(dataUrlPayload(dataUrl), ext, NODE_CODE_LIMITS)
    return { preview, lines: preview.binary ? [] : highlightCodeLines(preview.text, ext) }
  } catch {
    return null
  }
}

export function CodeNodePreview({
  compact,
  fallback,
  onInfo,
  cacheKey,
  dataUrl,
  ext
}: NodePreviewProps): JSX.Element | null {
  const key = previewCacheKey(cacheKey, dataUrl)
  const excerpt = useMemo(() => {
    const k = key === null ? null : `node:${ext}:${key}`
    if (k !== null && nodeCache.has(k)) return nodeCache.get(k) ?? null
    const built = buildExcerpt(dataUrl, ext)
    if (k !== null) nodeCache.set(k, built)
    return built
    // La data-URL n'intervient que via la clé (hash de contenu) quand elle existe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key ?? dataUrl, ext])

  const language = codeLanguageLabel(ext) || t('file.code.plain')
  useEffect(() => {
    onInfo(excerpt && !excerpt.preview.binary ? { meta: language } : null)
    return () => onInfo(null)
  }, [excerpt, language, onInfo])

  if (compact) return null
  if (!excerpt || excerpt.preview.binary || excerpt.lines.length === 0) return <>{fallback}</>
  const script = isExecutableScript(ext)

  return (
    <div className="cp-node">
      <div className="cp-node-bar">
        <span className="cp-lang">{language}</span>
        {script && (
          <span className="cp-script-badge" title={t('file.code.readOnlyHint')}>
            <ShieldAlert size={11} aria-hidden />
            <span>{t('file.code.readOnly')}</span>
          </span>
        )}
      </div>
      <pre className="cp-node-code cp-code" aria-label={language}>
        {excerpt.lines.slice(0, NODE_CODE_LINES).map((html, i) => (
          // HTML sûr : texte échappé + classes de jetons (voir highlightCodeLines).
          <code key={i} className="cp-node-line" dangerouslySetInnerHTML={{ __html: html || ' ' }} />
        ))}
      </pre>
    </div>
  )
}
