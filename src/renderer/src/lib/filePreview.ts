/**
 * §5 v1.9 (aperçu) — fonctions PURES de l'aperçu des fichiers importés sur le tableau
 * (nœud « file ») : détection du type d'aperçu (MIME + extension), décodage base64
 * partiel, décodage de texte avec gestion du jeu de caractères, troncature, cache LRU,
 * classification des erreurs PDF et calculs de dimensions.
 *
 * Aucune dépendance au DOM ni à pdf.js : testable sous Node (tests/filePreview.test.ts).
 * Le rendu PDF (pdf.js, chargé à la demande) vit dans lib/pdfPreview.ts.
 *
 * Sécurité : les fichiers viennent de pairs NON FIABLES. Le texte n'est jamais
 * interprété (HTML affiché comme du texte brut, caractères de contrôle neutralisés),
 * et tout travail est borné (octets décodés, lignes, caractères, pixels).
 */

/** Nature de l'aperçu d'un fichier. */
export type FilePreviewKind =
  | 'pdf'
  | 'text'
  | 'image'
  /** §R2 v1.9 — documents bureautiques (OOXML, OpenDocument, RTF, anciens binaires). */
  | 'office'
  /** §R2 v1.9 — son (lecteur <audio>, jamais d'exécution). */
  | 'audio'
  /** §R2 v1.9 — vidéo (lecteur <video>). */
  | 'video'
  /** §R2 v1.9 — code source / scripts, affichés en texte coloré, JAMAIS exécutés. */
  | 'code'
  | 'none'

/** Extensions affichées comme du TEXTE (jamais interprétées, même .html). */
const TEXT_EXTENSIONS = new Set([
  'txt',
  'text',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'ndjson',
  'log',
  'xml',
  'html',
  'htm'
])

/** §R2 v1.9 — extensions de documents bureautiques (texte extrait, jamais de macro). */
const OFFICE_EXTENSIONS = new Set([
  'docx', 'docm', 'dotx', 'dotm', 'xlsx', 'xlsm', 'xltx', 'xltm',
  'pptx', 'pptm', 'potx', 'potm', 'ppsx',
  'odt', 'ott', 'ods', 'ots', 'odp', 'otp', 'odg', 'fodt', 'fods', 'fodp',
  'rtf', 'doc', 'dot', 'xls', 'xlt', 'ppt', 'pps', 'pot',
  'pages', 'numbers'
  // « .key » N'EST PAS ici : c'est aussi l'extension des clés privées PEM/TLS
  // (server.key, courant dans les fuites) — voir keyPreviewKind.
])

/**
 * §R2 v1.9 — « .key » : Keynote (conteneur ZIP) OU clé PEM/TLS. Le MIME tranche quand
 * il est parlant ; vide / générique → aperçu bureautique, dont l'extracteur rend un
 * état neutre « non pris en charge » (jamais « endommagé ») si les octets ne sont pas
 * un ZIP.
 */
function keyPreviewKind(type: string): FilePreviewKind {
  if (type.startsWith('text/') || TEXT_APPLICATION_MIMES.has(type) || type === 'application/x-pem-file') return 'text'
  if (!type || type === 'application/octet-stream' || type === 'application/zip' || isOfficeMime(type)) return 'office'
  return 'none'
}

/** §R2 v1.9 — extensions audio. */
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'weba'])

/** §R2 v1.9 — extensions vidéo. */
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'ogv', 'mov'])

/**
 * §R2 v1.9 — code source et scripts : affichés en texte coloré, JAMAIS exécutés.
 * Les noms sans extension (Dockerfile, Makefile, .env) sont ramenés à une pseudo-
 * extension par previewExtension().
 */
const CODE_EXTENSIONS = new Set([
  'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
  'sh', 'bash', 'zsh', 'fish', 'py', 'rb', 'pl', 'php', 'lua', 'go', 'rs', 'c', 'h', 'cpp',
  'hpp', 'cc', 'cs', 'java', 'kt', 'swift', 'sql', 'r', 'ahk', 'au3', 'reg', 'inf', 'ini',
  'cfg', 'conf', 'toml', 'yml', 'yaml', 'env', 'dockerfile', 'makefile', 'gradle',
  'properties', 'asm', 's'
])

/** §R2 v1.9 — scripts qu'un double-clic exécuterait sous un système d'exploitation. */
const EXECUTABLE_SCRIPT_EXTENSIONS = new Set([
  'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta',
  'sh', 'bash', 'zsh', 'fish', 'reg', 'ahk', 'au3', 'py', 'pl', 'rb', 'php', 'lua',
  'scr', 'msh', 'inf', 'lnk', 'url', 'jar', 'command', 'applescript', 'scpt'
])

/** Noms de fichiers sans extension reconnus comme du code. */
const CODE_BASENAMES: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  '.env': 'env'
}

/** MIME bureautiques (OOXML, OpenDocument, RTF, anciens formats binaires). */
function isOfficeMime(type: string): boolean {
  return (
    type.startsWith('application/vnd.openxmlformats-officedocument.') ||
    type.startsWith('application/vnd.oasis.opendocument.') ||
    type.startsWith('application/vnd.ms-word') ||
    type.startsWith('application/vnd.ms-powerpoint') ||
    type === 'application/msword' ||
    type === 'application/rtf' ||
    type === 'text/rtf' ||
    type === 'application/x-rtf' ||
    type === 'application/vnd.apple.pages' ||
    type === 'application/vnd.apple.numbers' ||
    type === 'application/vnd.apple.keynote' ||
    type === 'application/x-iwork-keynote-sffkey'
  )
}

/** Types d'image que Chromium sait décoder dans un <img> (sans script : sûr, même SVG). */
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  svg: 'image/svg+xml'
}

const RENDERABLE_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-ms-bmp',
  'image/avif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml'
])

/** Types MIME « textuels » hors text/* (JSON, XML, YAML…). */
const TEXT_APPLICATION_MIMES = new Set([
  'application/json',
  'application/ld+json',
  'application/x-ndjson',
  'application/xml',
  'application/xhtml+xml',
  'application/x-yaml',
  'application/yaml'
])

/** Extension (minuscules, sans le point) d'un nom de fichier ; '' si aucune. */
export function fileExtension(name: string): string {
  if (typeof name !== 'string') return ''
  const base = name.trim().split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** Type MIME normalisé (minuscules, sans paramètres `;charset=…`). */
export function normalizeMime(mime: string): string {
  if (typeof mime !== 'string') return ''
  return mime.split(';')[0].trim().toLowerCase()
}

/**
 * Nature de l'aperçu d'un fichier, d'après son type MIME PUIS son extension.
 * Un MIME explicite (PDF, image affichable, texte) l'emporte ; sinon (MIME vide,
 * `application/octet-stream`, ou type bureautique générique — ex. un .csv reçu en
 * `application/vnd.ms-excel` sous Windows) on se fie à l'extension.
 */
/**
 * MIME d'image déduit d'une extension — clés PROPRES uniquement (§D6 v1.9) : un nom
 * de fichier venu d'un pair (`x.constructor`, `x.__proto__`) ne doit pas remonter
 * la chaîne de prototypes de l'objet.
 */
function imageMimeForExt(ext: string): string | null {
  return Object.prototype.hasOwnProperty.call(IMAGE_MIME_BY_EXT, ext) ? IMAGE_MIME_BY_EXT[ext] : null
}

/** §R2 v1.9 — MIME de code source (hors text/plain) : affichés colorés, jamais exécutés. */
const CODE_MIMES = new Set([
  'application/javascript',
  'application/x-javascript',
  'text/javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-shellscript',
  'text/x-shellscript',
  'text/x-sh',
  'text/x-python',
  'application/x-python-code',
  'application/x-bat',
  'application/x-msdos-program',
  'application/x-powershell',
  'application/sql',
  'application/toml',
  'application/x-yaml',
  'application/yaml',
  'text/yaml',
  'text/x-yaml'
])

/**
 * §R2 v1.9 — extension servant à la détection : celle du nom, ou une pseudo-extension
 * pour les fichiers de code sans extension (Dockerfile, Makefile, .env).
 */
export function previewExtension(filename: string): string {
  const ext = fileExtension(filename)
  if (ext) return ext
  if (typeof filename !== 'string') return ''
  const base = (filename.trim().split(/[\\/]/).pop() ?? '').toLowerCase()
  return Object.prototype.hasOwnProperty.call(CODE_BASENAMES, base) ? CODE_BASENAMES[base] : ''
}

/**
 * §R2 v1.9 — vrai si l'extension désigne un script qu'un double-clic EXÉCUTERAIT
 * (.bat, .ps1, .vbs, .sh, .reg…). L'aperçu ne l'exécute jamais : ce drapeau sert
 * seulement à afficher un avertissement (« script — affiché, jamais exécuté »).
 */
export function isExecutableScript(ext: string): boolean {
  if (typeof ext !== 'string') return false
  return EXECUTABLE_SCRIPT_EXTENSIONS.has(ext.replace(/^\./, '').toLowerCase())
}

export function detectPreviewKind(mime: string, filename: string): FilePreviewKind {
  const type = normalizeMime(mime)
  if (type === 'application/pdf' || type === 'application/x-pdf') return 'pdf'
  if (RENDERABLE_IMAGE_MIMES.has(type)) return 'image'
  const ext = previewExtension(filename)
  // §R2 v1.9 — une extension connue l'emporte sur un MIME vide, générique ou trompeur
  // (.bat déposé sans MIME, .ts annoncé en video/mp2t, .csv en application/vnd.ms-excel).
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (OFFICE_EXTENSIONS.has(ext)) return 'office'
  if (ext === 'key') return keyPreviewKind(type)
  if (AUDIO_EXTENSIONS.has(ext)) return type.startsWith('video/') ? 'video' : 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return type.startsWith('audio/') ? 'audio' : 'video'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (ext === 'pdf') return 'pdf'
  if (imageMimeForExt(ext) && !type.startsWith('image/')) return 'image'
  if (isOfficeMime(type)) return 'office'
  if (CODE_MIMES.has(type)) return 'code'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('text/') || TEXT_APPLICATION_MIMES.has(type)) return 'text'
  if (type.endsWith('+json') || (type.endsWith('+xml') && !type.startsWith('image/'))) return 'text'
  return 'none'
}

/**
 * Type MIME à utiliser pour AFFICHER une image : le MIME d'origine s'il est
 * affichable, sinon celui déduit de l'extension (un SVG reçu en octet-stream ne
 * s'afficherait pas sans `image/svg+xml`). null si ce n'est pas une image affichable.
 */
export function displayImageMime(mime: string, filename: string): string | null {
  const type = normalizeMime(mime)
  if (RENDERABLE_IMAGE_MIMES.has(type)) return type
  if (type.startsWith('image/')) return null
  return imageMimeForExt(fileExtension(filename))
}

/** Libellé court du type de fichier (« PDF », « CSV », « TXT »…), pour la carte. */
export function fileTypeLabel(mime: string, filename: string): string {
  const ext = fileExtension(filename)
  if (ext && ext.length <= 8) return ext.toUpperCase()
  const type = normalizeMime(mime)
  if (type === 'application/pdf') return 'PDF'
  const sub = type.split('/')[1] ?? ''
  const clean = sub.replace(/^x-/, '').replace(/[^a-z0-9+.-]/g, '')
  return clean && clean.length <= 12 && clean !== 'octet-stream' ? clean.toUpperCase() : ''
}

// ——— Base64 ———

/** Nombre d'octets décodés d'une charge base64 (padding `=` déduit). */
export function base64DecodedLength(payload: string): number {
  const len = payload.length
  if (len === 0) return 0
  let padding = 0
  if (payload.endsWith('==')) padding = 2
  else if (payload.endsWith('=')) padding = 1
  return Math.max(0, Math.floor((len * 3) / 4) - padding)
}

/** Nombre de caractères base64 à décoder pour obtenir `bytes` octets (multiple de 4). */
export function base64PrefixChars(bytes: number): number {
  return Math.ceil(Math.max(0, bytes) / 3) * 4
}

/** Tranche de décodage (caractères, multiple de 4) : évite une chaîne binaire géante. */
const DECODE_SLICE = 4 * 65536

/**
 * Décode une charge base64 en octets, au plus `maxBytes` (préfixe). Décodage par
 * tranches (pas de chaîne binaire de 25 Mo d'un coup). Lève une erreur si la charge
 * est corrompue (caractère hors alphabet) — l'appelant bascule en état d'erreur.
 */
export function decodeBase64(payload: string, maxBytes = Number.POSITIVE_INFINITY): Uint8Array {
  const limitChars = Number.isFinite(maxBytes)
    ? Math.min(payload.length, base64PrefixChars(maxBytes))
    : payload.length
  // On ne décode que des groupes complets de 4 caractères (sauf fin de charge).
  const usable = limitChars === payload.length ? limitChars : limitChars - (limitChars % 4)
  const source = payload.slice(0, usable)
  const total = base64DecodedLength(source)
  const out = new Uint8Array(total)
  let written = 0
  for (let offset = 0; offset < source.length; offset += DECODE_SLICE) {
    const binary = atob(source.slice(offset, offset + DECODE_SLICE))
    for (let i = 0; i < binary.length && written < total; i++) {
      out[written++] = binary.charCodeAt(i)
    }
  }
  const result = written === total ? out : out.subarray(0, written)
  return Number.isFinite(maxBytes) && result.length > maxBytes ? result.subarray(0, maxBytes) : result
}

/** Charge base64 d'une data-URL (sans la copier au-delà du nécessaire). '' si invalide. */
export function dataUrlPayload(dataUrl: string): string {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return ''
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return ''
  const header = dataUrl.slice(0, comma)
  if (!header.endsWith(';base64')) return ''
  return dataUrl.slice(comma + 1)
}

// ——— Texte ———

/** Encodage détecté d'un fichier texte. */
export type TextEncodingName = 'UTF-8' | 'UTF-16LE' | 'UTF-16BE' | 'windows-1252'

export interface DecodedText {
  text: string
  encoding: TextEncodingName
  /** true si le contenu ressemble à du binaire (octets NUL) : pas d'aperçu texte. */
  binary: boolean
}

/** Octets inspectés pour repérer un fichier binaire déguisé en texte. */
const BINARY_SNIFF_BYTES = 8192

function looksBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, BINARY_SNIFF_BYTES)
  for (let i = 0; i < end; i++) {
    if (bytes[i] === 0) return true
  }
  return false
}

/**
 * Table windows-1252 des octets 0x80–0x9F (le reste coïncide avec Latin-1). Décodage
 * fait à la main : l'étiquette `windows-1252` de TextDecoder n'est pas fiable partout
 * (certaines implémentations la traitent comme du Latin-1 strict : 0x80 ≠ €).
 * Les 5 octets non définis restent des contrôles C1 (neutralisés à l'affichage).
 */
const WIN1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178
]

/** Décode des octets windows-1252 (par tranches, sans pile d'appels géante). */
export function decodeWindows1252(bytes: Uint8Array): string {
  const parts: string[] = []
  const SLICE = 8192
  for (let offset = 0; offset < bytes.length; offset += SLICE) {
    const end = Math.min(bytes.length, offset + SLICE)
    const codes = new Array<number>(end - offset)
    for (let i = offset; i < end; i++) {
      const byte = bytes[i]
      codes[i - offset] = byte >= 0x80 && byte <= 0x9f ? WIN1252_HIGH[byte - 0x80] : byte
    }
    parts.push(String.fromCharCode(...codes))
  }
  return parts.join('')
}

/**
 * Décode des octets de texte : BOM (UTF-8 / UTF-16 LE / BE) d'abord, puis UTF-8
 * STRICT, et repli windows-1252 (fichiers Windows « ANSI » accentués) si l'UTF-8 est
 * invalide. `partial` = les octets sont un PRÉFIXE du fichier : une séquence UTF-8
 * coupée en fin de préfixe n'est alors pas prise pour une erreur d'encodage.
 */
export function decodeTextBytes(bytes: Uint8Array, partial = false): DecodedText {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = new TextDecoder('utf-16le').decode(bytes.subarray(2), { stream: partial })
    return { text, encoding: 'UTF-16LE', binary: false }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = new TextDecoder('utf-16be').decode(bytes.subarray(2), { stream: partial })
    return { text, encoding: 'UTF-16BE', binary: false }
  }
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const body = hasUtf8Bom ? bytes.subarray(3) : bytes
  if (looksBinary(body)) return { text: '', encoding: 'UTF-8', binary: true }
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body, {
      stream: partial
    })
    return { text, encoding: 'UTF-8', binary: false }
  } catch {
    if (hasUtf8Bom) {
      // BOM UTF-8 mais octets invalides : décodage tolérant (caractères de remplacement).
      return { text: new TextDecoder('utf-8').decode(body), encoding: 'UTF-8', binary: false }
    }
    return { text: decodeWindows1252(body), encoding: 'windows-1252', binary: false }
  }
}

/**
 * Neutralise le texte pour l'affichage : fins de ligne normalisées (\n), caractères
 * de contrôle C0/C1 (hors tabulation / saut de ligne) et contrôles de direction bidi
 * (usurpation visuelle) remplacés par U+FFFD.
 */
export function sanitizePreviewText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '\uFFFD')
}

/**
 * Tronque un texte à `maxLines` lignes et `maxChars` caractères (sans couper une
 * paire de substitution). `truncated` signale qu'une partie a été retirée.
 */
export function truncateText(
  text: string,
  maxChars: number,
  maxLines: number
): { text: string; truncated: boolean } {
  let truncated = false
  let out = text
  if (out.length > maxChars) {
    let cut = Math.max(0, maxChars)
    const code = out.charCodeAt(cut - 1)
    if (cut > 0 && code >= 0xd800 && code <= 0xdbff) cut -= 1
    out = out.slice(0, cut)
    truncated = true
  }
  let lines = 0
  for (let i = 0; i < out.length; i++) {
    if (out.charCodeAt(i) === 10) {
      lines++
      if (lines >= maxLines) {
        out = out.slice(0, i)
        truncated = truncated || i < text.length
        break
      }
    }
  }
  return { text: out, truncated }
}

/** Extrait texte prêt à afficher (nœud ou visionneuse). */
export interface TextPreview {
  text: string
  encoding: TextEncodingName
  /** true si le fichier contient plus que ce qui est affiché. */
  truncated: boolean
  binary: boolean
}

/** Limites de l'extrait affiché SUR LE NŒUD. */
export const NODE_TEXT_LIMITS = { bytes: 16 * 1024, chars: 4000, lines: 40 } as const
/** Limites du texte affiché dans la VISIONNEUSE (borné : un journal de 25 Mo n'est
 * pas injecté en entier dans le DOM). */
export const VIEWER_TEXT_LIMITS = { bytes: 1024 * 1024, chars: 1024 * 1024, lines: 20000 } as const

/**
 * Construit l'extrait texte d'une charge base64 : ne décode que le préfixe utile
 * (`limits.bytes`), détecte l'encodage, neutralise et tronque.
 */
export function buildTextPreview(
  payload: string,
  limits: { bytes: number; chars: number; lines: number }
): TextPreview {
  const totalBytes = base64DecodedLength(payload)
  const partial = totalBytes > limits.bytes
  const bytes = decodeBase64(payload, limits.bytes)
  const decoded = decodeTextBytes(bytes, partial)
  if (decoded.binary) return { text: '', encoding: decoded.encoding, truncated: false, binary: true }
  const clean = sanitizePreviewText(decoded.text)
  const cut = truncateText(clean, limits.chars, limits.lines)
  return {
    text: cut.text,
    encoding: decoded.encoding,
    truncated: partial || cut.truncated,
    binary: false
  }
}

// ——— Cache LRU (miniatures, extraits) ———

/**
 * Cache LRU en mémoire (clé = hash de contenu du fichier). Chaque pair calcule ses
 * aperçus localement : rien n'est stocké dans le document Yjs.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>()

  constructor(private readonly max: number) {}

  get size(): number {
    return this.map.size
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined
    const value = this.map.get(key) as V
    // Rafraîchit l'ordre : l'entrée devient la plus récente.
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > Math.max(1, this.max)) {
      const oldest = this.map.keys().next().value as K
      this.map.delete(oldest)
    }
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}

// ——— PDF ———

/** Raison d'échec d'un aperçu PDF (message adapté à l'utilisateur). */
export type PdfFailure = 'encrypted' | 'corrupt' | 'timeout' | 'unavailable'

/** Erreur de délai dépassé (rendu borné dans le temps). */
export class PreviewTimeoutError extends Error {
  constructor() {
    super('preview-timeout')
    this.name = 'PreviewTimeoutError'
  }
}

/** Classe une erreur pdf.js (ou de délai) en raison lisible. */
export function classifyPdfError(error: unknown): PdfFailure {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : ''
  if (name === 'PasswordException') return 'encrypted'
  if (name === 'PreviewTimeoutError') return 'timeout'
  if (
    name === 'InvalidPDFException' ||
    name === 'FormatError' ||
    name === 'MissingPDFException' ||
    name === 'UnknownErrorException' ||
    name === 'InvalidCharacterError'
  ) {
    return 'corrupt'
  }
  return 'unavailable'
}

/** true si les octets commencent (à ~1 Ko près) par la signature `%PDF-`. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length - 5, 1024)
  for (let i = 0; i <= end; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) {
      return true
    }
  }
  return false
}

/**
 * Échelle de rendu d'une page (dimensions à l'échelle 1) pour tenir dans
 * `maxWidth` × `maxHeight` ET sous `maxPixels` pixels. Toujours > 0 et fini.
 */
export function fitScale(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
  maxPixels: number
): number {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return 1
  let scale = Math.min(maxWidth / width, maxHeight / height)
  if (width * height * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (width * height))
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/** Bornes de la miniature PDF (px) — assez pour un nœud large sur écran HiDPI. */
export const PDF_THUMB_BOUNDS = { width: 640, height: 900, pixels: 640 * 900 } as const
/** Bornes d'un canvas de page dans la visionneuse (≈ 16 Mpx, côté ≤ 8192). */
export const PDF_VIEWER_BOUNDS = { side: 8192, pixels: 16_777_216 } as const

/** Niveaux de zoom proposés par la visionneuse (1 = 100 %). */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

/** Zoom suivant (`direction` = +1) ou précédent (-1) à partir d'un zoom quelconque. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    for (const step of ZOOM_STEPS) if (step > current + 1e-6) return step
    // §5 v1.9 : au-delà du dernier palier, ne jamais « zoomer » vers le bas
    return Math.max(current, ZOOM_STEPS[ZOOM_STEPS.length - 1])
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current - 1e-6) return ZOOM_STEPS[i]
  }
  // §5 v1.9 : sous le premier palier (ajustement d'une grande image < 25 %),
  // dézoomer ne doit pas agrandir — on reste au zoom courant.
  return Math.min(current, ZOOM_STEPS[0])
}

/** Numéro de page borné à [1, pageCount]. */
export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || pageCount < 1) return 1
  return Math.min(Math.max(1, Math.round(page)), pageCount)
}

/**
 * §5 v1.9 — piège à focus de la visionneuse : index du prochain élément
 * focalisable quand on presse Tab (ou Maj+Tab). `current` vaut -1 si le focus
 * est hors de la liste (ex. sur le cadre lui-même). Renvoie -1 si rien n'est
 * focalisable.
 */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (count < 1) return -1
  if (current < 0 || current >= count) return backwards ? count - 1 : 0
  return backwards ? (current - 1 + count) % count : (current + 1) % count
}

// ——— État du transfert ———

/** Phase d'affichage d'un fichier référencé par un nœud. */
export type FileTransferPhase = 'empty' | 'ready' | 'loading' | 'missing' | 'error'

/**
 * Phase d'un fichier NON complet d'après son statut de stockage (sync/files.ts) :
 *  - `missing` (métadonnées absentes : aucun pair connecté ne l'a encore transmis)
 *    reste « missing » — y compris bloqué : le message dit alors « indisponible » ;
 *  - `loading` (chunks en cours) bloqué depuis trop longtemps → `error` ;
 *  - `error` (taille incohérente, chunks corrompus) → `error`.
 */
export function fileTransferPhase(
  status: 'loading' | 'missing' | 'error',
  stalled: boolean
): Exclude<FileTransferPhase, 'empty' | 'ready'> {
  if (status === 'missing') return 'missing'
  if (status === 'error' || stalled) return 'error'
  return 'loading'
}

/** Progression d'un transfert en % entier borné à [0, 100] (0 si total inconnu). */
export function transferPercent(received: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(received)) return 0
  return Math.min(100, Math.max(0, Math.round((received / total) * 100)))
}

// ——— Dimensions du nœud ———

/** Taille initiale d'un nœud fichier selon son aperçu (import). */
export function initialFileNodeSize(kind: FilePreviewKind): { width: number; height: number } {
  switch (kind) {
    case 'pdf':
      return { width: 240, height: 360 }
    case 'text':
      return { width: 320, height: 260 }
    case 'image':
      return { width: 280, height: 250 }
    // §R2 v1.9 — bureautique (page/diapo), code (comme le texte), lecteurs audio/vidéo.
    case 'office':
      return { width: 260, height: 340 }
    case 'code':
      return { width: 340, height: 260 }
    case 'audio':
      return { width: 300, height: 170 }
    case 'video':
      return { width: 320, height: 250 }
    default:
      return { width: 260, height: 96 }
  }
}

/**
 * §5 v1.9 : position du `index`-ième élément d'un import de `total` fichiers faits
 * d'un coup (sélecteur multiple, glisser-déposer) — disposés en GRILLE à partir de
 * `origin` pour qu'ils ne se recouvrent pas. La cellule couvre le plus grand nœud
 * d'aperçu (image ≤ 420 px, page PDF 360 px de haut) plus une marge.
 */
export const FILE_GRID_CELL = { width: 440, height: 400 } as const

export function fileGridPosition(
  origin: { x: number; y: number },
  index: number,
  total: number
): { x: number; y: number } {
  const count = Math.max(1, Math.floor(total))
  const columns = Math.ceil(Math.sqrt(count))
  const i = Math.max(0, Math.floor(index))
  return {
    x: origin.x + (i % columns) * FILE_GRID_CELL.width,
    y: origin.y + Math.floor(i / columns) * FILE_GRID_CELL.height
  }
}

/** En-dessous de cette hauteur, le nœud affiche la carte compacte (miniature en
 * vignette à la place de l'icône) — cas des nœuds créés avant l'aperçu (96 px). */
export const FILE_NODE_COMPACT_HEIGHT = 150
