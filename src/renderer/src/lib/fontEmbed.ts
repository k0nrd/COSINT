/**
 * Polices embarquées en `data:` URI pour l'export PNG (html-to-image).
 *
 * html-to-image rend le DOM dans une image SVG : les polices de la page n'y sont pas
 * disponibles, il faut les lui fournir sous forme de CSS autonome (`fontEmbedCSS`).
 * Sans cela il tente de re-télécharger les fichiers de police — impossible en
 * production (`file://`, CSP stricte) — et l'image exportée retomberait sur une
 * police système, différente de l'écran.
 *
 * Module chargé À LA DEMANDE (import dynamique) : le base64 des polices ne pèse pas
 * sur le démarrage. Les plages unicode sont celles de styles/fonts.css.
 */
import sans400Ext from '@/assets/fonts/ibm-plex-sans-latin-ext-400-normal.woff2?inline'
import sans400Latin from '@/assets/fonts/ibm-plex-sans-latin-400-normal.woff2?inline'
import sans500Ext from '@/assets/fonts/ibm-plex-sans-latin-ext-500-normal.woff2?inline'
import sans500Latin from '@/assets/fonts/ibm-plex-sans-latin-500-normal.woff2?inline'
import sans600Ext from '@/assets/fonts/ibm-plex-sans-latin-ext-600-normal.woff2?inline'
import sans600Latin from '@/assets/fonts/ibm-plex-sans-latin-600-normal.woff2?inline'
import sans700Ext from '@/assets/fonts/ibm-plex-sans-latin-ext-700-normal.woff2?inline'
import sans700Latin from '@/assets/fonts/ibm-plex-sans-latin-700-normal.woff2?inline'
import mono400Ext from '@/assets/fonts/ibm-plex-mono-latin-ext-400-normal.woff2?inline'
import mono400Latin from '@/assets/fonts/ibm-plex-mono-latin-400-normal.woff2?inline'
import mono500Ext from '@/assets/fonts/ibm-plex-mono-latin-ext-500-normal.woff2?inline'
import mono500Latin from '@/assets/fonts/ibm-plex-mono-latin-500-normal.woff2?inline'
import mono600Ext from '@/assets/fonts/ibm-plex-mono-latin-ext-600-normal.woff2?inline'
import mono600Latin from '@/assets/fonts/ibm-plex-mono-latin-600-normal.woff2?inline'

const EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

const FACES: Array<[family: string, weight: number, dataUri: string, range: string]> = [
  ['IBM Plex Sans', 400, sans400Ext, EXT],
  ['IBM Plex Sans', 400, sans400Latin, LATIN],
  ['IBM Plex Sans', 500, sans500Ext, EXT],
  ['IBM Plex Sans', 500, sans500Latin, LATIN],
  ['IBM Plex Sans', 600, sans600Ext, EXT],
  ['IBM Plex Sans', 600, sans600Latin, LATIN],
  ['IBM Plex Sans', 700, sans700Ext, EXT],
  ['IBM Plex Sans', 700, sans700Latin, LATIN],
  ['IBM Plex Mono', 400, mono400Ext, EXT],
  ['IBM Plex Mono', 400, mono400Latin, LATIN],
  ['IBM Plex Mono', 500, mono500Ext, EXT],
  ['IBM Plex Mono', 500, mono500Latin, LATIN],
  ['IBM Plex Mono', 600, mono600Ext, EXT],
  ['IBM Plex Mono', 600, mono600Latin, LATIN]
]

/** CSS `@font-face` autonome (polices en data: URI), à passer à `fontEmbedCSS`. */
export const FONT_EMBED_CSS: string = FACES.map(
  ([family, weight, dataUri, range]) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};` +
    `src:url(${dataUri}) format('woff2');unicode-range:${range}}`
).join('\n')
