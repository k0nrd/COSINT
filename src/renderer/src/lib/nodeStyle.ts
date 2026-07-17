/**
 * Traduction d'une personnalisation visuelle d'entité/source (§4 v1.4) en
 * variables CSS + attributs de forme/taille appliqués par NodeShell. Les valeurs
 * absentes retombent sur les défauts du thème (aucune variable posée).
 */
import type { CSSProperties } from 'react'
import type { EntityStyle, NodeKind } from '@/types'
import { colorHex, withAlpha } from './colors'

/**
 * Types de nœuds à hauteur pilotée par le contenu (§6bis v1.4 puis §4 v1.6). La
 * hauteur stockée agit comme minimum ; le nœud grandit pour afficher tout son
 * contenu (aucun texte masqué). Utilisé à la fois par NodeShell (style du cadre) et
 * par BoardView (hauteur passée à React Flow) — doit rester cohérent entre les deux.
 * Les blocs de code (§5 v1.6) grandissent aussi jusqu'à une limite gérée en interne
 * (scroll au-delà), ils ne sont donc PAS auto-hauteur au sens React Flow.
 */
export const AUTO_HEIGHT_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'entity',
  'source',
  'text',
  'timestamped'
])

/** Épaisseur de bordure en px selon le réglage. */
const BORDER_PX: Record<string, number> = { thin: 1, normal: 1.5, thick: 3 }

export interface NodeShellVisual {
  vars: CSSProperties
  textSize: string
}

/** Style « propre » (aucune personnalisation) : défauts du thème. */
export const DEFAULT_SHELL_VISUAL: NodeShellVisual = {
  vars: {},
  textSize: 'normal'
}

/**
 * Calcule les variables CSS (`--nd-*`) et la taille de texte à poser sur
 * `.nd-shell`. Ne pose une variable que pour les propriétés RÉELLEMENT
 * personnalisées — sinon le rendu par défaut (bordure/fond du thème) est conservé.
 * La forme n'est plus personnalisable (rectangle arrondi).
 */
export function entityShellVisual(style: EntityStyle | undefined): NodeShellVisual {
  if (!style) return DEFAULT_SHELL_VISUAL
  const vars: Record<string, string> = {}
  if (style.borderColor) vars['--nd-border-color'] = colorHex(style.borderColor)
  if (style.borderStyle) vars['--nd-border-style'] = style.borderStyle
  if (style.borderWidth) vars['--nd-border-width'] = `${BORDER_PX[style.borderWidth] ?? 1.5}px`
  if (style.transparentFill) vars['--nd-fill'] = 'transparent'
  else if (style.fillColor) vars['--nd-fill'] = withAlpha(style.fillColor, style.fillOpacity ?? 1)
  return {
    vars: vars as CSSProperties,
    textSize: style.textSize ?? 'normal'
  }
}
