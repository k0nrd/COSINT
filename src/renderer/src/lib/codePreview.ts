/**
 * §R2 v1.9 (aperçu du code) — coloration syntaxique des scripts et fichiers de code
 * importés sur le tableau (.bat, .ps1, .sh, .py, .js…). Le fichier n'est JAMAIS
 * exécuté ni interprété : Prism produit uniquement des <span class="token …"> autour
 * de texte ÉCHAPPÉ (aucune balise venue du fichier ne survit).
 *
 * Borné : au-delà de MAX_HIGHLIGHT_CHARS, le texte est seulement échappé (Prism est
 * quasi linéaire mais une grammaire pathologique ne doit pas geler l'interface).
 *
 * Squelette (§R2) : l'agent « code » complète les grammaires (imports statiques de
 * prismjs/components/*, jamais d'autoloader réseau) et les tests.
 */
import Prism from 'prismjs'
// Grammaires de base (javascript, python, bash, yaml…) chargées par lib/prism.ts.
import '@/lib/prism'
// Grammaires supplémentaires propres à l'aperçu (§R2 v1.9) : imports STATIQUES, après
// lib/prism (clike déjà chargé pour ruby/kotlin/gradle).
import 'prismjs/components/prism-batch'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-visual-basic'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-perl'
import 'prismjs/components/prism-lua'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-r'
import 'prismjs/components/prism-autohotkey'
import 'prismjs/components/prism-autoit'
import 'prismjs/components/prism-ini'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-docker'
import 'prismjs/components/prism-makefile'
import 'prismjs/components/prism-gradle'
import 'prismjs/components/prism-properties'
import 'prismjs/components/prism-nasm'
import {
  base64DecodedLength,
  decodeBase64,
  decodeTextBytes,
  sanitizePreviewText,
  truncateText
} from '@/lib/filePreview'

/** Au-delà, pas de coloration (texte échappé uniquement). */
export const MAX_HIGHLIGHT_CHARS = 200_000

/**
 * Extension (minuscules, sans point — cf. previewExtension()) → clé de grammaire Prism.
 * Une grammaire non chargée retombe sur le texte échappé.
 */
const GRAMMAR_BY_EXT: Record<string, string> = {
  bat: 'batch',
  cmd: 'batch',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  vbs: 'visual-basic',
  vbe: 'visual-basic',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  py: 'python',
  rb: 'ruby',
  pl: 'perl',
  php: 'php',
  lua: 'lua',
  go: 'go',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  sql: 'sql',
  r: 'r',
  ahk: 'autohotkey',
  au3: 'autoit',
  reg: 'ini',
  inf: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  toml: 'toml',
  yml: 'yaml',
  yaml: 'yaml',
  env: 'bash',
  dockerfile: 'docker',
  makefile: 'makefile',
  gradle: 'gradle',
  properties: 'properties',
  asm: 'nasm',
  s: 'nasm'
}

/** Clé de grammaire Prism pour une extension ('' si inconnue). */
export function codeGrammarForExt(ext: string): string {
  const key = typeof ext === 'string' ? ext.replace(/^\./, '').toLowerCase() : ''
  return Object.prototype.hasOwnProperty.call(GRAMMAR_BY_EXT, key) ? GRAMMAR_BY_EXT[key] : ''
}

/** Échappe le texte pour une insertion HTML (&, <, >, guillemets). */
export function escapeCodeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * HTML colorié (spans Prism autour de texte échappé) d'un fichier de code ; texte
 * simplement échappé si le langage est inconnu, la grammaire absente ou le texte trop long.
 */
export function highlightCode(text: string, ext: string): string {
  const grammarKey = codeGrammarForExt(ext)
  const grammar = grammarKey ? Prism.languages[grammarKey] : undefined
  if (!grammar || text.length > MAX_HIGHLIGHT_CHARS) return escapeCodeHtml(text)
  try {
    return Prism.highlight(text, grammar, grammarKey)
  } catch {
    return escapeCodeHtml(text)
  }
}

// ——— Libellés de langage (noms propres, non traduits) ———

const GRAMMAR_LABELS: Record<string, string> = {
  batch: 'Batch',
  powershell: 'PowerShell',
  'visual-basic': 'VBScript',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  jsx: 'JSX',
  bash: 'Shell',
  python: 'Python',
  ruby: 'Ruby',
  perl: 'Perl',
  php: 'PHP',
  lua: 'Lua',
  go: 'Go',
  rust: 'Rust',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  sql: 'SQL',
  r: 'R',
  autohotkey: 'AutoHotkey',
  autoit: 'AutoIt',
  ini: 'INI',
  toml: 'TOML',
  yaml: 'YAML',
  docker: 'Dockerfile',
  makefile: 'Makefile',
  gradle: 'Gradle',
  properties: 'Properties',
  nasm: 'Assembleur'
}

/** Libellé du langage d'une extension (ex. 'PowerShell') ; extension en capitales sinon. */
export function codeLanguageLabel(ext: string): string {
  const grammar = codeGrammarForExt(ext)
  if (grammar && GRAMMAR_LABELS[grammar]) return GRAMMAR_LABELS[grammar]
  const key = typeof ext === 'string' ? ext.replace(/^\./, '').slice(0, 12) : ''
  return key ? key.toUpperCase() : ''
}

// ——— Décodage (UTF-8 / UTF-16 / windows-1252 / IBM850 pour les .bat/.cmd) ———

/** Octets 0x80–0xFF de la page de code OEM 850 (console Windows d'Europe de l'Ouest). */
const CP850_HIGH = [
  199, 252, 233, 226, 228, 224, 229, 231, 234, 235, 232, 239, 238, 236, 196, 197, 201, 230, 198,
  244, 246, 242, 251, 249, 255, 214, 220, 248, 163, 216, 215, 402, 225, 237, 243, 250, 241, 209,
  170, 186, 191, 174, 172, 189, 188, 161, 171, 187, 9617, 9618, 9619, 9474, 9508, 193, 194, 192,
  169, 9571, 9553, 9559, 9565, 162, 165, 9488, 9492, 9524, 9516, 9500, 9472, 9532, 227, 195, 9562,
  9556, 9577, 9574, 9568, 9552, 9580, 164, 240, 208, 202, 203, 200, 305, 205, 206, 207, 9496, 9484,
  9608, 9604, 166, 204, 9600, 211, 223, 212, 210, 245, 213, 181, 254, 222, 218, 219, 217, 253, 221,
  175, 180, 173, 177, 8215, 190, 182, 167, 247, 184, 176, 168, 183, 185, 179, 178, 9632, 160
]

/** Décode des octets IBM850 (table intégrée : TextDecoder ne connaît pas cette page). */
export function decodeCp850(bytes: Uint8Array): string {
  const parts: string[] = []
  const SLICE = 8192
  for (let offset = 0; offset < bytes.length; offset += SLICE) {
    const end = Math.min(bytes.length, offset + SLICE)
    const codes = new Array<number>(end - offset)
    for (let i = offset; i < end; i++) {
      const byte = bytes[i]
      codes[i - offset] = byte >= 0x80 ? CP850_HIGH[byte - 0x80] : byte
    }
    parts.push(String.fromCharCode(...codes))
  }
  return parts.join('')
}

/** Extensions dont le texte non UTF-8 peut venir de la console (page OEM 850). */
const OEM_EXTENSIONS = new Set(['bat', 'cmd'])

/** Score de plausibilité : lettres minuscules parmi les caractères non ASCII. */
function lowercaseScore(text: string): number {
  let score = 0
  for (const ch of text) {
    if (ch.charCodeAt(0) < 0x80) continue
    if (/\p{Ll}/u.test(ch)) score++
    else if (/[─-◿]/.test(ch)) score-- // cadres/blocs : décodage suspect
  }
  return score
}

/** Choisit 'IBM850' plutôt que windows-1252 si le texte OEM est plus plausible. */
export function preferCp850(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 64 * 1024)
  let high = 0
  for (let i = 0; i < sample.length; i++) if (sample[i] >= 0x80) high++
  if (high === 0) return false
  // Échantillon uniquement : le score reste borné quelle que soit la taille du fichier.
  const oem = lowercaseScore(decodeCp850(sample))
  let ansi = 0
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i]
    if (b < 0x80) continue
    // Minuscules accentuées windows-1252 : 0xDF–0xFF sauf 0xF7 (÷), et š/œ/ž (0x9A/0x9C/0x9E).
    if ((b >= 0xdf && b !== 0xf7) || b === 0x9a || b === 0x9c || b === 0x9e) ansi++
  }
  return oem > ansi
}

/** Encodage affiché pour un aperçu de code. */
export type CodeEncodingName = 'UTF-8' | 'UTF-16LE' | 'UTF-16BE' | 'windows-1252' | 'IBM850'

export interface CodePreview {
  text: string
  encoding: CodeEncodingName
  /** true si le fichier contient plus que ce qui est affiché. */
  truncated: boolean
  /** true si le contenu ressemble à du binaire (pas d'aperçu). */
  binary: boolean
}

/** Décode des octets de code : comme le texte, avec repli IBM850 pour les .bat/.cmd. */
export function decodeCodeBytes(
  bytes: Uint8Array,
  ext: string,
  partial = false
): { text: string; encoding: CodeEncodingName; binary: boolean } {
  const decoded = decodeTextBytes(bytes, partial)
  const key = typeof ext === 'string' ? ext.replace(/^\./, '').toLowerCase() : ''
  if (!decoded.binary && decoded.encoding === 'windows-1252' && OEM_EXTENSIONS.has(key)) {
    const body =
      bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
        ? bytes.subarray(3)
        : bytes
    if (preferCp850(body)) return { text: decodeCp850(body), encoding: 'IBM850', binary: false }
  }
  return decoded
}

/**
 * Extrait de code d'une charge base64 : ne décode que le préfixe utile, détecte
 * l'encodage, neutralise (contrôles, bidi) et tronque (lignes/caractères).
 */
export function buildCodePreview(
  payload: string,
  ext: string,
  limits: { bytes: number; chars: number; lines: number }
): CodePreview {
  const totalBytes = base64DecodedLength(payload)
  const partial = totalBytes > limits.bytes
  const bytes = decodeBase64(payload, limits.bytes)
  const decoded = decodeCodeBytes(bytes, ext, partial)
  if (decoded.binary) return { text: '', encoding: decoded.encoding, truncated: false, binary: true }
  const cut = truncateText(sanitizePreviewText(decoded.text), limits.chars, limits.lines)
  return { text: cut.text, encoding: decoded.encoding, truncated: partial || cut.truncated, binary: false }
}

// ——— Coloration ligne par ligne (numéros de ligne, retour à la ligne) ———

type PrismToken = string | Prism.Token

/** Classe CSS sûre d'un jeton Prism (types de grammaire, jamais le contenu du fichier). */
function tokenClass(token: Prism.Token): string {
  const aliases = Array.isArray(token.alias) ? token.alias : token.alias ? [token.alias] : []
  return ['token', token.type, ...aliases]
    .map((c) => String(c).replace(/[^\w-]/g, ''))
    .filter(Boolean)
    .join(' ')
}

/** Texte brut d'un jeton (itératif : pas de récursion sur une imbrication profonde). */
function tokenText(token: PrismToken): string {
  let out = ''
  const pending: PrismToken[] = [token]
  while (pending.length > 0) {
    const item = pending.pop() as PrismToken
    if (typeof item === 'string') out += item
    else if (Array.isArray(item.content)) pending.push(...[...item.content].reverse())
    else pending.push(item.content as PrismToken)
  }
  return out
}

/**
 * Découpe un texte en lignes HTML colorées : chaque ligne est autonome (les <span>
 * ouverts sont refermés en fin de ligne et rouverts à la suivante). Le texte est
 * TOUJOURS échappé ; seules les classes de jetons (issues de la grammaire) sont ajoutées.
 */
export function highlightCodeLines(text: string, ext: string): string[] {
  const grammarKey = codeGrammarForExt(ext)
  const grammar = grammarKey ? Prism.languages[grammarKey] : undefined
  const plain = (): string[] => text.split('\n').map(escapeCodeHtml)
  if (!grammar || text.length > MAX_HIGHLIGHT_CHARS) return plain()
  let tokens: PrismToken[]
  try {
    tokens = Prism.tokenize(text, grammar)
  } catch {
    return plain()
  }
  const lines: string[] = []
  const stack: string[] = []
  let current = ''
  const walk = (list: PrismToken[] | PrismToken, depth: number): void => {
    const items = Array.isArray(list) ? list : [list]
    for (const item of items) {
      if (typeof item === 'string') {
        const parts = item.split('\n')
        parts.forEach((part, i) => {
          if (i > 0) {
            lines.push(current + '</span>'.repeat(stack.length))
            current = stack.map((c) => `<span class="${c}">`).join('')
          }
          current += escapeCodeHtml(part)
        })
      } else if (depth < 32) {
        const cls = tokenClass(item)
        stack.push(cls)
        current += `<span class="${cls}">`
        walk(item.content as PrismToken[] | PrismToken, depth + 1)
        stack.pop()
        current += '</span>'
      } else {
        walk(tokenText(item), depth) // imbrication anormale : texte seul
      }
    }
  }
  walk(tokens, 0)
  lines.push(current)
  return lines
}
