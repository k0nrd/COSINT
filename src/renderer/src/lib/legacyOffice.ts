/**
 * §R2 v1.9 (aperçu bureautique) — formats « historiques » : RTF (texte balisé) et
 * anciens binaires OLE2 / CFB (doc/dot, xls/xlt, ppt/pps/pot). Extraction de TEXTE
 * seulement, bornée (octets lus, secteurs suivis, enregistrements, blocs, caractères) ;
 * aucune macro, aucun objet incorporé n'est interprété. Les fichiers viennent de pairs
 * NON FIABLES : chaque lecture est vérifiée (hors bornes → arrêt), chaque chaîne de
 * secteurs est protégée contre les cycles.
 *
 * Si l'analyse structurée échoue, repli « heuristique » (suites imprimables UTF-16LE /
 * windows-1252) signalé par l'avertissement LEGACY_APPROXIMATE_WARNING.
 */
import { OfficePreviewError, type OfficeBlock, type OfficePreview } from './officeTypes'

/** Clé i18n de l'avertissement « aperçu approximatif » (repli heuristique). */
export const LEGACY_APPROXIMATE_WARNING = 'file.office.approximate'

/** Bornes (§R2 v1.9) — fichiers non fiables. */
export const LEGACY_LIMITS = {
  /** Taille maximale du fichier analysé. */
  maxInputBytes: 48 * 1024 * 1024,
  /** Caractères de texte produits au total. */
  maxChars: 200_000,
  /** Blocs produits au total. */
  maxBlocks: 2_000,
  /** Profondeur de groupes RTF suivie. */
  maxRtfDepth: 256,
  /** Taille maximale d'un flux CFB lu. */
  maxStreamBytes: 32 * 1024 * 1024,
  /** Entrées de répertoire CFB. */
  maxDirEntries: 4_096,
  /** Enregistrements BIFF / PowerPoint parcourus. */
  maxRecords: 400_000,
  /** Feuilles, lignes et colonnes d'un classeur. */
  maxSheets: 8,
  maxRows: 200,
  maxCols: 30,
  /** Octets examinés par le repli heuristique. */
  maxScanBytes: 8 * 1024 * 1024,
  /** Pièces du texte Word. */
  maxPieces: 20_000
} as const

/** Décodeur mis en cache par code page (windows-1252 si inconnue). */
const decoders = new Map<string, TextDecoder>()
function decoderFor(label: string): TextDecoder {
  let d = decoders.get(label)
  if (!d) {
    try {
      d = new TextDecoder(label)
    } catch {
      d = decoders.get('windows-1252') ?? new TextDecoder('windows-1252')
    }
    decoders.set(label, d)
  }
  return d
}

/** Libellé TextDecoder d'une code page Windows (ex. 1251 → windows-1251). */
export function codePageLabel(cp: number): string {
  if (cp === 65001) return 'utf-8'
  if (cp === 1200) return 'utf-16le'
  if (cp === 10000) return 'macintosh'
  if (cp === 20866) return 'koi8-r'
  if (cp === 28591) return 'iso-8859-1'
  if (cp === 932) return 'shift_jis'
  if (cp === 936) return 'gbk'
  if (cp === 949) return 'euc-kr'
  if (cp === 950) return 'big5'
  if ((cp >= 1250 && cp <= 1258) || cp === 874) return `windows-${cp}`
  return 'windows-1252'
}

/** Accumulateur de blocs borné (caractères + nombre de blocs). */
class BlockSink {
  readonly blocks: OfficeBlock[] = []
  chars = 0
  truncated = false
  get full(): boolean {
    return this.truncated
  }
  private room(len: number): boolean {
    if (this.truncated) return false
    if (this.blocks.length >= LEGACY_LIMITS.maxBlocks || this.chars + len > LEGACY_LIMITS.maxChars) {
      this.truncated = true
      return false
    }
    this.chars += len
    return true
  }
  paragraph(text: string): void {
    const t = cleanText(text)
    if (t && this.room(t.length)) this.blocks.push({ kind: 'paragraph', text: t })
  }
  table(rows: string[][], name?: string): void {
    const clean = rows.map((r) => r.map(cleanText))
    while (clean.length && clean[clean.length - 1].every((c) => !c)) clean.pop()
    if (!clean.length) return
    const len = clean.reduce((n, r) => n + r.reduce((m, c) => m + c.length + 1, 0), 0)
    if (this.room(len)) this.blocks.push(name ? { kind: 'table', name, rows: clean } : { kind: 'table', rows: clean })
  }
  slide(index: number, title: string | undefined, texts: string[]): void {
    const clean = texts.map(cleanText).filter(Boolean)
    const t = title ? cleanText(title) : undefined
    const len = clean.reduce((n, s) => n + s.length, t?.length ?? 0)
    if (!len) return
    if (this.room(len)) this.blocks.push(t ? { kind: 'slide', index, title: t, texts: clean } : { kind: 'slide', index, texts: clean })
  }
}

/** Nettoie un texte extrait : caractères de contrôle retirés, espaces normalisés. */
function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/g, '').replace(/[ \t]+$/gm, '').trim()
}

function result(format: string, sink: BlockSink, title?: string, warnings: string[] = []): OfficePreview {
  const out: OfficePreview = { format, blocks: sink.blocks, truncated: sink.truncated, warnings: [...warnings] }
  const t = title ? cleanText(title) : ''
  if (t) out.title = t.slice(0, 300)
  return out
}

// ─────────────────────────────── RTF ───────────────────────────────

/** Destinations RTF ignorées (tables, images, objets binaires, champs d'instruction…). */
const RTF_SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'listtable', 'listoverridetable', 'revtbl', 'rsidtbl',
  'generator', 'pict', 'object', 'objdata', 'objclass', 'objname', 'themedata', 'colorschememapping',
  'latentstyles', 'datastore', 'xmlnstbl', 'fldinst', 'filetbl', 'mmathPr', 'pgdsctbl', 'nonshppict',
  'shpinst', 'sp', 'bkmkstart', 'bkmkend', 'author', 'operator', 'company', 'keywords', 'comment',
  'doccomm', 'subject', 'category', 'manager', 'hlinkbase', 'userprops', 'template', 'header',
  'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'ftnsep', 'ftnsepc',
  'aftnsep', 'aftnsepc', 'wgrffmtfilter', 'passwordhash', 'protusertbl', 'fchars', 'lchars', 'defchp', 'defpap'
])

type RtfState = { skip: boolean; title: boolean; uc: number }

/** Aperçu d'un document RTF (paragraphes + tableaux simples, titre de \info). */
export function extractRtfPreview(bytes: Uint8Array): OfficePreview {
  if (bytes.length > LEGACY_LIMITS.maxInputBytes) throw new OfficePreviewError('tooLarge')
  let start = 0
  while (start < bytes.length && start < 16 && (bytes[start] <= 0x20 || bytes[start] === 0xef || bytes[start] === 0xbb || bytes[start] === 0xbf)) start++
  const head = String.fromCharCode(...bytes.subarray(start, start + 5))
  if (head !== '{\\rtf') throw new OfficePreviewError('corrupt')

  const sink = new BlockSink()
  let codePage = 'windows-1252'
  let state: RtfState = { skip: false, title: false, uc: 1 }
  const stack: RtfState[] = []
  let depth = 0
  let para = ''
  let title = ''
  let pending: number[] = [] // octets \'hh en attente de décodage
  let skipFallback = 0 // caractères de repli à ignorer après \uN
  let inTable = false
  let cell = ''
  let row: string[] = []
  let rows: string[][] = []
  let rowsCut = false

  const emit = (s: string): void => {
    if (state.skip || !s) return
    if (state.title) title = (title + s).slice(0, 400)
    else if (inTable) cell += s
    else para += s
  }
  const flushBytes = (): void => {
    if (!pending.length) return
    const s = decoderFor(codePage).decode(new Uint8Array(pending))
    pending = []
    emit(s)
  }
  const flushTable = (): void => {
    if (cell.trim()) row.push(cell)
    if (row.length) rows.push(row)
    cell = ''
    row = []
    if (rows.length) sink.table(rows.slice(0, LEGACY_LIMITS.maxRows).map((r) => r.slice(0, LEGACY_LIMITS.maxCols)))
    rows = []
  }
  const flushPara = (): void => {
    if (rows.length || row.length) flushTable()
    sink.paragraph(para)
    para = ''
  }
  const text = (s: string): void => {
    if (skipFallback > 0) {
      skipFallback--
      return
    }
    flushBytes()
    emit(s)
  }

  let i = start
  const n = bytes.length
  while (i < n && !sink.full) {
    const c = bytes[i]
    if (c === 0x7b /* { */) {
      flushBytes()
      stack.push(state)
      state = { ...state }
      depth++
      i++
    } else if (c === 0x7d /* } */) {
      flushBytes()
      state = stack.pop() ?? state
      skipFallback = 0
      depth = Math.max(0, depth - 1)
      i++
      if (depth === 0) break
    } else if (c === 0x5c /* \ */) {
      i = rtfControl(i + 1)
    } else if (c === 0x0d || c === 0x0a) {
      i++
    } else {
      if (skipFallback > 0) {
        skipFallback--
      } else if (c >= 0x80) {
        pending.push(c)
      } else {
        text(String.fromCharCode(c))
      }
      i++
    }
    if (depth > LEGACY_LIMITS.maxRtfDepth) throw new OfficePreviewError('corrupt')
  }
  flushBytes()
  if (inTable || rows.length || row.length) flushTable()
  flushPara()
  if (rowsCut) sink.truncated = true
  return result('rtf', sink, title)

  /** Lit un mot de contrôle à partir de `j` (après la barre oblique) ; renvoie la suite. */
  function rtfControl(j: number): number {
    if (j >= n) return n
    const ch = bytes[j]
    const isLetter = (b: number): boolean => (b >= 0x61 && b <= 0x7a) || (b >= 0x41 && b <= 0x5a)
    if (!isLetter(ch)) {
      if (ch === 0x27 /* ' */) {
        const v = parseInt(String.fromCharCode(bytes[j + 1] ?? 0, bytes[j + 2] ?? 0), 16)
        if (skipFallback > 0) skipFallback--
        else if (!Number.isNaN(v)) pending.push(v)
        return j + 3
      }
      if (ch === 0x2a /* * */) {
        state.skip = true
        return j + 1
      }
      if (ch === 0x5c || ch === 0x7b || ch === 0x7d) text(String.fromCharCode(ch))
      else if (ch === 0x7e /* ~ */) text(' ')
      else if (ch === 0x5f /* _ */) text('-')
      else if (ch === 0x0d || ch === 0x0a) word('par', null)
      return j + 1
    }
    let k = j
    while (k < n && k - j < 32 && isLetter(bytes[k])) k++
    const name = String.fromCharCode(...bytes.subarray(j, k))
    let param: number | null = null
    let m = k
    if (m < n && bytes[m] === 0x2d /* - */) m++
    const digitsStart = m
    while (m < n && m - digitsStart < 10 && bytes[m] >= 0x30 && bytes[m] <= 0x39) m++
    if (m > digitsStart) {
      param = parseInt(String.fromCharCode(...bytes.subarray(k, m)), 10)
      k = m
    }
    if (k < n && bytes[k] === 0x20) k++
    if (name === 'bin') {
      flushBytes()
      return Math.min(n, k + Math.max(0, param ?? 0))
    }
    if (skipFallback > 0 && name !== 'u') {
      skipFallback--
      return k
    }
    word(name, param)
    return k
  }

  /** Applique un mot de contrôle RTF. */
  function word(name: string, param: number | null): void {
    switch (name) {
      case 'ansicpg':
        if (param !== null) codePage = codePageLabel(param)
        return
      case 'mac':
        codePage = 'macintosh'
        return
      case 'uc':
        state.uc = Math.max(0, Math.min(8, param ?? 1))
        return
      case 'u': {
        flushBytes()
        if (param === null) return
        emit(String.fromCharCode(param < 0 ? param + 65536 : param & 0xffff))
        skipFallback = state.uc
        return
      }
      case 'par':
      case 'sect':
      case 'page':
        flushBytes()
        if (state.skip || state.title) return
        if (inTable) cell += '\n'
        else flushPara()
        return
      case 'pard':
        flushBytes()
        inTable = false
        return
      case 'intbl':
        inTable = true
        return
      case 'cell':
        flushBytes()
        if (state.skip) return
        if (row.length < LEGACY_LIMITS.maxCols * 4) row.push(cell)
        cell = ''
        return
      case 'row':
        flushBytes()
        if (state.skip) return
        if (cell.trim()) row.push(cell)
        if (rows.length < LEGACY_LIMITS.maxRows) rows.push(row)
        else rowsCut = true
        row = []
        cell = ''
        return
      case 'nestcell':
        emit(' ')
        return
      case 'line':
        flushBytes()
        emit('\n')
        return
      case 'tab':
        flushBytes()
        emit('\t')
        return
      case 'title':
        state.title = true
        return
      case 'emdash': return text('—')
      case 'endash': return text('–')
      case 'bullet': return text('•')
      case 'lquote': return text('‘')
      case 'rquote': return text('’')
      case 'ldblquote': return text('“')
      case 'rdblquote': return text('”')
      default:
        if (RTF_SKIP_DESTINATIONS.has(name)) state.skip = true
    }
  }
}

// ─────────────────────── OLE2 / Compound File Binary ───────────────────────

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const END_OF_CHAIN = 0xfffffffe
const FREE_SECT = 0xffffffff

/** Vrai si les octets commencent par la signature OLE2 / CFB. */
export function isCompoundFile(bytes: Uint8Array): boolean {
  return bytes.length >= 512 && CFB_SIGNATURE.every((b, i) => bytes[i] === b)
}

type CfbEntry = { name: string; type: number; start: number; size: number; left: number; right: number; child: number }

/** Lecteur CFB borné : flux lisibles par nom (enfants directs de la racine). */
export class CompoundFile {
  private readonly view: DataView
  private readonly sectorSize: number
  private readonly fat: Uint32Array
  private readonly miniFat: Uint32Array
  private readonly miniCutoff: number
  private readonly entries: CfbEntry[]
  private miniStream: Uint8Array | null = null
  /** Noms (enfants directs de la racine) → index d'entrée. */
  private readonly rootNames = new Map<string, number>()

  constructor(private readonly bytes: Uint8Array) {
    if (!isCompoundFile(bytes)) throw new OfficePreviewError('corrupt', 'not a compound file')
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const shift = this.u16(0x1e)
    if (shift !== 9 && shift !== 12) throw new OfficePreviewError('corrupt', 'sector size')
    this.sectorSize = 1 << shift
    const miniShift = this.u16(0x20)
    if (miniShift !== 6) throw new OfficePreviewError('corrupt', 'mini sector size')
    const maxSectors = Math.ceil(bytes.length / this.sectorSize) + 1
    // FAT : secteurs listés par le DIFAT (en-tête puis chaîne DIFAT).
    const numFat = Math.min(this.u32(0x2c), maxSectors)
    const fatSectors: number[] = []
    for (let i = 0; i < 109 && fatSectors.length < numFat; i++) {
      const s = this.u32(0x4c + i * 4)
      if (s >= FREE_SECT - 1) break
      fatSectors.push(s)
    }
    let difat = this.u32(0x44)
    const perDifat = this.sectorSize / 4 - 1
    const seenDifat = new Set<number>()
    while (fatSectors.length < numFat && difat < END_OF_CHAIN && !seenDifat.has(difat) && seenDifat.size < maxSectors) {
      seenDifat.add(difat)
      const off = this.sectorOffset(difat)
      if (off + this.sectorSize > bytes.length) break
      for (let i = 0; i < perDifat && fatSectors.length < numFat; i++) {
        const s = this.u32(off + i * 4)
        if (s < END_OF_CHAIN) fatSectors.push(s)
      }
      difat = this.u32(off + perDifat * 4)
    }
    const per = this.sectorSize / 4
    this.fat = new Uint32Array(fatSectors.length * per).fill(FREE_SECT)
    fatSectors.forEach((s, idx) => {
      const off = this.sectorOffset(s)
      if (off + this.sectorSize > bytes.length) return
      for (let i = 0; i < per; i++) this.fat[idx * per + i] = this.u32(off + i * 4)
    })
    // Répertoire.
    const dir = this.readChain(this.u32(0x30), this.fat, this.sectorSize, (s) => this.sectorOffset(s), bytes, LEGACY_LIMITS.maxDirEntries * 128)
    this.entries = []
    for (let off = 0; off + 128 <= dir.length && this.entries.length < LEGACY_LIMITS.maxDirEntries; off += 128) {
      const dv = new DataView(dir.buffer, dir.byteOffset + off, 128)
      const nameLen = Math.min(64, dv.getUint16(64, true))
      let name = ''
      for (let c = 0; c + 1 < nameLen - 1; c += 2) name += String.fromCharCode(dv.getUint16(c, true))
      this.entries.push({
        name,
        type: dv.getUint8(66),
        left: dv.getUint32(68, true),
        right: dv.getUint32(72, true),
        child: dv.getUint32(76, true),
        start: dv.getUint32(116, true),
        size: dv.getUint32(120, true)
      })
    }
    const root = this.entries[0]
    if (!root || root.type !== 5) throw new OfficePreviewError('corrupt', 'no root entry')
    this.miniCutoff = this.u32(0x38) || 4096
    const miniBytes = this.readChain(this.u32(0x3c), this.fat, this.sectorSize, (s) => this.sectorOffset(s), bytes, Math.min(this.u32(0x40), maxSectors) * this.sectorSize)
    this.miniFat = new Uint32Array(Math.floor(miniBytes.length / 4))
    for (let i = 0; i < this.miniFat.length; i++) this.miniFat[i] = new DataView(miniBytes.buffer, miniBytes.byteOffset).getUint32(i * 4, true)
    // Enfants directs de la racine : parcours de l'arbre rouge-noir (borné, sans cycle).
    const seen = new Set<number>()
    const todo = [root.child]
    while (todo.length && seen.size < this.entries.length) {
      const id = todo.pop() as number
      if (id >= this.entries.length || seen.has(id)) continue
      seen.add(id)
      const e = this.entries[id]
      if (!this.rootNames.has(e.name.toLowerCase())) this.rootNames.set(e.name.toLowerCase(), id)
      todo.push(e.left, e.right)
    }
  }

  private u16(off: number): number {
    return off + 2 <= this.bytes.length ? this.view.getUint16(off, true) : 0
  }
  private u32(off: number): number {
    return off + 4 <= this.bytes.length ? this.view.getUint32(off, true) : FREE_SECT
  }
  private sectorOffset(s: number): number {
    return (s + 1) * this.sectorSize
  }

  /** Suit une chaîne de secteurs (détection de cycle, taille bornée à `maxBytes`). */
  private readChain(
    start: number,
    table: Uint32Array,
    size: number,
    offsetOf: (s: number) => number,
    source: Uint8Array,
    maxBytes: number
  ): Uint8Array {
    const cap = Math.max(0, Math.min(maxBytes, LEGACY_LIMITS.maxStreamBytes))
    const out = new Uint8Array(Math.min(cap, source.length + size))
    const seen = new Uint8Array(table.length)
    let len = 0
    let s = start
    while (s < table.length && len < out.length) {
      if (seen[s]) throw new OfficePreviewError('corrupt', 'sector cycle')
      seen[s] = 1
      const off = offsetOf(s)
      if (off >= source.length) break
      const chunk = source.subarray(off, Math.min(off + size, source.length, off + (out.length - len)))
      out.set(chunk, len)
      len += chunk.length
      s = table[s]
    }
    return out.subarray(0, len)
  }

  /** Noms des flux et stockages directement sous la racine. */
  names(): string[] {
    return [...this.rootNames.keys()]
  }

  /** Vrai si un flux / stockage de ce nom existe sous la racine (casse ignorée). */
  has(name: string): boolean {
    return this.rootNames.has(name.toLowerCase())
  }

  /** Contenu d'un flux sous la racine (null s'il n'existe pas). */
  stream(name: string): Uint8Array | null {
    const id = this.rootNames.get(name.toLowerCase())
    if (id === undefined) return null
    const e = this.entries[id]
    if (e.type !== 2) return null
    const size = Math.min(e.size, LEGACY_LIMITS.maxStreamBytes)
    if (size < this.miniCutoff) {
      if (!this.miniStream) {
        const root = this.entries[0]
        this.miniStream = this.readChain(root.start, this.fat, this.sectorSize, (s) => this.sectorOffset(s), this.bytes, root.size)
      }
      const mini = this.miniStream
      return this.readChain(e.start, this.miniFat, 64, (s) => s * 64, mini, size)
    }
    return this.readChain(e.start, this.fat, this.sectorSize, (s) => this.sectorOffset(s), this.bytes, size)
  }
}

/** Titre (PIDSI_TITLE) du flux « \x05SummaryInformation », s'il est lisible. */
function summaryTitle(cfb: CompoundFile): string | undefined {
  const s = cfb.stream('\u0005SummaryInformation')
  if (!s || s.length < 48) return undefined
  const dv = new DataView(s.buffer, s.byteOffset, s.byteLength)
  const sec = dv.getUint32(44, true)
  if (sec + 8 > s.length) return undefined
  const count = Math.min(dv.getUint32(sec + 4, true), 256)
  let codePage = 1252
  let titleOff = -1
  for (let i = 0; i < count; i++) {
    const p = sec + 8 + i * 8
    if (p + 8 > s.length) break
    const id = dv.getUint32(p, true)
    const off = sec + dv.getUint32(p + 4, true)
    if (off + 8 > s.length) continue
    if (id === 1 && dv.getUint32(off, true) === 2) codePage = dv.getUint16(off + 4, true)
    if (id === 2) titleOff = off
  }
  if (titleOff < 0) return undefined
  const type = dv.getUint32(titleOff, true)
  const len = Math.min(dv.getUint32(titleOff + 4, true), 1024)
  const start = titleOff + 8
  if (type === 30 && start + len <= s.length) {
    return decoderFor(codePageLabel(codePage)).decode(s.subarray(start, start + len)).replace(/\0+$/, '')
  }
  if (type === 31 && start + len * 2 <= s.length) {
    return decoderFor('utf-16le').decode(s.subarray(start, start + len * 2)).replace(/\0+$/, '')
  }
  return undefined
}

/** Repli heuristique : suites imprimables UTF-16LE puis windows-1252 (≥ 4 caractères). */
export function heuristicText(bytes: Uint8Array, minLen = 4): string[] {
  const data = bytes.subarray(0, LEGACY_LIMITS.maxScanBytes)
  const found: { pos: number; text: string }[] = []
  let chars = 0
  const letterish = (t: string): boolean => {
    const good = t.match(/[\p{L}\p{N} ]/gu)?.length ?? 0
    return good >= t.length * 0.6 && /\p{L}{2}/u.test(t)
  }
  const add = (pos: number, t: string): void => {
    const s = t.replace(/\s+/g, ' ').trim()
    if (s.length >= minLen && letterish(s) && chars < LEGACY_LIMITS.maxChars) {
      found.push({ pos, text: s })
      chars += s.length
    }
  }
  // UTF-16LE (latin, latin étendu, cyrillique).
  for (let align = 0; align < 2; align++) {
    let run = ''
    let runStart = align
    for (let i = align; i + 1 < data.length; i += 2) {
      const code = data[i] | (data[i + 1] << 8)
      const hi = data[i + 1]
      const ok = (hi === 0 && (code === 9 || code === 10 || code === 13 || (code >= 0x20 && code < 0x7f) || code >= 0xa0)) || hi === 1 || hi === 4 || (hi === 0x20 && code <= 0x2044)
      if (ok) {
        if (!run) runStart = i
        run += String.fromCharCode(code)
        if (run.length > 4096) {
          add(runStart, run)
          run = ''
        }
      } else if (run) {
        add(runStart, run)
        run = ''
      }
    }
    if (run) add(runStart, run)
  }
  // 8 bits (windows-1252).
  const dec = decoderFor('windows-1252')
  let s = -1
  for (let i = 0; i <= data.length; i++) {
    const b = i < data.length ? data[i] : 0
    const ok = b === 9 || (b >= 0x20 && b < 0x7f) || b >= 0xc0
    if (ok && s < 0) s = i
    if ((!ok || i - s >= 4096) && s >= 0) {
      if (i - s >= minLen) add(s, dec.decode(data.subarray(s, i)))
      s = ok ? i : -1
    }
  }
  found.sort((a, b) => a.pos - b.pos)
  const out: string[] = []
  for (const f of found) if (out[out.length - 1] !== f.text) out.push(f.text)
  return out
}

// ─────────────────────────────── Word (.doc) ───────────────────────────────

/** Texte principal d'un flux WordDocument (FIB + table des pièces du flux 0Table/1Table). */
export function extractWordText(cfb: CompoundFile): string {
  const wd = cfb.stream('WordDocument')
  if (!wd || wd.length < 0x200) throw new OfficePreviewError('corrupt', 'no WordDocument')
  const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength)
  if (dv.getUint16(0, true) !== 0xa5ec) throw new OfficePreviewError('corrupt', 'bad FIB')
  const flags = dv.getUint16(0x0a, true)
  if (flags & 0x0100) throw new OfficePreviewError('encrypted')
  const table = cfb.stream(flags & 0x0200 ? '1Table' : '0Table')
  if (!table) throw new OfficePreviewError('corrupt', 'no table stream')
  // FibBase (32 o) → csw + fibRgW → cslw + fibRgLw → cbRgFcLcb + fibRgFcLcb.
  let p = 32
  const csw = dv.getUint16(p, true)
  p += 2 + csw * 2
  const cslw = dv.getUint16(p, true)
  const rgLw = p + 2
  p = rgLw + cslw * 4
  const cbRgFcLcb = dv.getUint16(p, true)
  const rgFcLcb = p + 2
  if (cslw < 4 || cbRgFcLcb < 34 || rgFcLcb + 34 * 8 > wd.length) throw new OfficePreviewError('corrupt', 'short FIB')
  const ccpText = dv.getUint32(rgLw + 3 * 4, true)
  const fcClx = dv.getUint32(rgFcLcb + 33 * 8, true)
  const lcbClx = dv.getUint32(rgFcLcb + 33 * 8 + 4, true)
  if (!lcbClx || fcClx + lcbClx > table.length) throw new OfficePreviewError('corrupt', 'bad Clx')
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength)
  let q = fcClx
  const clxEnd = fcClx + lcbClx
  // Prc* (0x01) ignorés, puis Pcdt (0x02).
  while (q < clxEnd && table[q] === 0x01) {
    if (q + 3 > clxEnd) throw new OfficePreviewError('corrupt', 'bad Prc')
    q += 3 + tv.getInt16(q + 1, true)
  }
  if (q + 5 > clxEnd || table[q] !== 0x02) throw new OfficePreviewError('corrupt', 'no Pcdt')
  const lcb = tv.getUint32(q + 1, true)
  const plc = q + 5
  if (plc + lcb > table.length || lcb < 16) throw new OfficePreviewError('corrupt', 'bad PlcPcd')
  const pieces = Math.min(Math.floor((lcb - 4) / 12), LEGACY_LIMITS.maxPieces)
  const pcdBase = plc + (pieces + 1) * 4
  const limit = Math.min(ccpText || Number.MAX_SAFE_INTEGER, LEGACY_LIMITS.maxChars * 2)
  const cp1252 = decoderFor('windows-1252')
  const utf16 = decoderFor('utf-16le')
  let out = ''
  for (let i = 0; i < pieces && out.length < limit; i++) {
    const cpStart = tv.getUint32(plc + i * 4, true)
    const cpEnd = tv.getUint32(plc + (i + 1) * 4, true)
    if (cpEnd <= cpStart || cpStart >= limit) continue
    const count = Math.min(cpEnd, limit) - cpStart
    const fcRaw = tv.getUint32(pcdBase + i * 8 + 2, true)
    const compressed = (fcRaw & 0x40000000) !== 0
    const fc = fcRaw & 0x3fffffff
    const start = compressed ? fc / 2 : fc
    const len = compressed ? count : count * 2
    if (start + len > wd.length) continue
    const chunk = wd.subarray(start, start + len)
    out += compressed ? cp1252.decode(chunk) : utf16.decode(chunk)
  }
  return out
}

/** Découpe le texte Word : \r = paragraphe, \x07 = fin de cellule / de ligne, champs épurés. */
function wordTextToBlocks(text: string, sink: BlockSink): void {
  // Champs : \x13 instruction \x14 résultat \x15 → on garde le résultat.
  let clean = ''
  const fields: boolean[] = [] // true = dans l'instruction du champ courant
  for (const ch of text) {
    if (ch === '\u0013') fields.push(true)
    else if (ch === '\u0014') {
      if (fields.length) fields[fields.length - 1] = false
    } else if (ch === '\u0015') fields.pop()
    else if (!fields.some(Boolean)) clean += ch
  }
  clean = clean.replace(/\u000b/g, '\n').replace(/\u000c/g, '\r').replace(/\u001e/g, '-').replace(/[\u0001\u0008\u001f]/g, '')
  let buf = ''
  let row: string[] = []
  let rows: string[][] = []
  let prevCell = false
  const flushTable = (): void => {
    if (row.length) rows.push(row)
    if (rows.length) sink.table(rows.slice(0, LEGACY_LIMITS.maxRows).map((r) => r.slice(0, LEGACY_LIMITS.maxCols)))
    rows = []
    row = []
  }
  for (const ch of clean) {
    if (sink.full) return
    if (ch === '\u0007') {
      if (!buf && prevCell) {
        rows.push(row)
        row = []
      } else {
        row.push(buf)
      }
      buf = ''
      prevCell = true
    } else if (ch === '\r') {
      if (row.length) buf += '\n'
      else {
        if (rows.length) flushTable()
        sink.paragraph(buf)
        buf = ''
      }
      prevCell = false
    } else {
      buf += ch
      prevCell = false
    }
  }
  flushTable()
  sink.paragraph(buf)
}

// ─────────────────────────────── Excel (.xls, BIFF8/BIFF5) ───────────────────────────────

type BiffRecord = { type: number; off: number; data: Uint8Array }

/** Découpe un flux BIFF en enregistrements (borné). */
function biffRecords(s: Uint8Array): BiffRecord[] {
  const out: BiffRecord[] = []
  let p = 0
  while (p + 4 <= s.length && out.length < LEGACY_LIMITS.maxRecords) {
    const type = s[p] | (s[p + 1] << 8)
    const len = s[p + 2] | (s[p + 3] << 8)
    if (p + 4 + len > s.length) break
    out.push({ type, off: p, data: s.subarray(p + 4, p + 4 + len) })
    p += 4 + len
  }
  return out
}

/** Octets « compressés » BIFF8 = UTF-16 à octet de poids fort nul (Latin-1). */
function latin1(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode(...b.subarray(i, i + 4096))
  return s
}

/** Lecteur de chaînes Unicode BIFF8 à travers les enregistrements CONTINUE. */
class BiffStringReader {
  private seg = 0
  private pos = 0
  constructor(private readonly segs: Uint8Array[], start: number) {
    this.pos = start
  }
  private cur(): Uint8Array | undefined {
    while (this.seg < this.segs.length && this.pos >= this.segs[this.seg].length) {
      this.seg++
      this.pos = 0
    }
    return this.segs[this.seg]
  }
  byte(): number {
    const c = this.cur()
    if (!c) throw new RangeError('eof')
    return c[this.pos++]
  }
  u16(): number {
    return this.byte() | (this.byte() << 8)
  }
  u32(): number {
    return (this.u16() | (this.u16() << 16)) >>> 0
  }
  skip(n: number): void {
    for (let left = n; left > 0; ) {
      const c = this.cur()
      if (!c) throw new RangeError('eof')
      const k = Math.min(left, c.length - this.pos)
      this.pos += k
      left -= k
    }
  }
  /** XLUnicodeRichExtendedString (SST) ; un octet d'options est relu à chaque CONTINUE. */
  richString(): string {
    const cch = this.u16()
    const flags = this.byte()
    let high = (flags & 0x01) !== 0
    const runs = flags & 0x08 ? this.u16() : 0
    const ext = flags & 0x04 ? this.u32() : 0
    let s = ''
    let left = cch
    while (left > 0) {
      const before = this.seg
      let c = this.cur()
      if (!c) throw new RangeError('eof')
      if (this.seg !== before) {
        high = (c[this.pos++] & 0x01) !== 0
        c = this.cur()
        if (!c) throw new RangeError('eof')
      }
      const avail = high ? Math.floor((c.length - this.pos) / 2) : c.length - this.pos
      const k = Math.min(left, avail)
      if (k <= 0) throw new RangeError('bad string')
      if (s.length < 32_768) {
        s += high
          ? decoderFor('utf-16le').decode(c.subarray(this.pos, this.pos + k * 2))
          : latin1(c.subarray(this.pos, this.pos + k))
      }
      this.pos += high ? k * 2 : k
      left -= k
    }
    this.skip(runs * 4 + ext)
    return s
  }
}

/** Valeur d'un nombre RK (entier 30 bits ou double tronqué, /100 éventuel). */
export function decodeRk(rk: number): number {
  let v: number
  if (rk & 0x02) v = rk >> 2
  else {
    const dv = new DataView(new ArrayBuffer(8))
    dv.setUint32(4, (rk & 0xfffffffc) >>> 0, true)
    v = dv.getFloat64(0, true)
  }
  return rk & 0x01 ? v / 100 : v
}

/** Affichage neutre d'un nombre (sans format de cellule). */
function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return ''
  if (Number.isInteger(v)) return String(v)
  return String(parseFloat(v.toPrecision(12)))
}

/** Feuilles (nom + lignes) d'un flux Workbook / Book. */
export function extractWorkbookSheets(stream: Uint8Array): { name: string; rows: string[][] }[] {
  const recs = biffRecords(stream)
  const sst: string[] = []
  const sheetNames = new Map<number, string>()
  const sheets: { name: string; rows: string[][] }[] = []
  let biff8 = true
  let cells: Map<number, Map<number, string>> | null = null
  let sheetName = ''
  let maxRow = -1
  let maxCol = -1
  let pendingFormula: { r: number; c: number } | null = null
  const u16 = (d: Uint8Array, o: number): number => (o + 2 <= d.length ? d[o] | (d[o + 1] << 8) : 0)
  const u32 = (d: Uint8Array, o: number): number => (o + 4 <= d.length ? (u16(d, o) | (u16(d, o + 2) << 16)) >>> 0 : 0)
  const put = (r: number, c: number, v: string): void => {
    if (!cells || r >= LEGACY_LIMITS.maxRows || c >= LEGACY_LIMITS.maxCols || !v) return
    let row = cells.get(r)
    if (!row) cells.set(r, (row = new Map()))
    row.set(c, v)
    maxRow = Math.max(maxRow, r)
    maxCol = Math.max(maxCol, c)
  }
  const shortString = (d: Uint8Array, o: number, cch: number): string => {
    if (!biff8) return decoderFor('windows-1252').decode(d.subarray(o, o + cch))
    const high = (d[o] ?? 0) & 0x01
    return high ? decoderFor('utf-16le').decode(d.subarray(o + 1, o + 1 + cch * 2)) : latin1(d.subarray(o + 1, o + 1 + cch))
  }
  for (let i = 0; i < recs.length; i++) {
    const { type, off, data: d } = recs[i]
    if (type === 0x0809 || type === 0x0209 || type === 0x0409) {
      biff8 = u16(d, 0) === 0x0600
      const dt = u16(d, 2)
      if (dt === 0x0010) {
        if (sheets.length >= LEGACY_LIMITS.maxSheets) break
        cells = new Map()
        maxRow = maxCol = -1
        sheetName = sheetNames.get(off) ?? `#${sheets.length + 1}`
      } else cells = null
    } else if (type === 0x000a /* EOF */) {
      if (cells) {
        const rows: string[][] = []
        for (let r = 0; r <= maxRow; r++) {
          const src = cells.get(r)
          rows.push(Array.from({ length: maxCol + 1 }, (_, c) => src?.get(c) ?? ''))
        }
        sheets.push({ name: sheetName, rows })
      }
      cells = null
    } else if (type === 0x002f /* FILEPASS */) {
      throw new OfficePreviewError('encrypted')
    } else if (type === 0x0085 /* BOUNDSHEET */) {
      const cch = d[6] ?? 0
      if ((d[5] ?? 0) === 0) sheetNames.set(u32(d, 0), shortString(d, 7, cch))
    } else if (type === 0x00fc /* SST */) {
      const segs = [d.subarray(8)]
      for (let j = i + 1; j < recs.length && recs[j].type === 0x003c; j++) segs.push(recs[j].data)
      const reader = new BiffStringReader(segs, 0)
      const unique = Math.min(u32(d, 4), 200_000)
      try {
        for (let k = 0; k < unique; k++) sst.push(reader.richString())
      } catch {
        /* SST tronquée : on garde ce qui a été lu */
      }
    } else if (!cells) {
      continue
    } else if (type === 0x00fd /* LABELSST */) {
      put(u16(d, 0), u16(d, 2), sst[u32(d, 6)] ?? '')
    } else if (type === 0x0204 /* LABEL */) {
      put(u16(d, 0), u16(d, 2), shortString(d, 8, u16(d, 6)))
    } else if (type === 0x0203 /* NUMBER */) {
      if (d.length >= 14) put(u16(d, 0), u16(d, 2), formatNumber(new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true)))
    } else if (type === 0x027e /* RK */) {
      put(u16(d, 0), u16(d, 2), formatNumber(decodeRk(u32(d, 6))))
    } else if (type === 0x00bd /* MULRK */) {
      const r = u16(d, 0)
      const first = u16(d, 2)
      const n = Math.floor((d.length - 6) / 6)
      for (let k = 0; k < n && first + k < LEGACY_LIMITS.maxCols; k++) put(r, first + k, formatNumber(decodeRk(u32(d, 4 + k * 6 + 2))))
    } else if (type === 0x0205 /* BOOLERR */) {
      if (d[7] === 0) put(u16(d, 0), u16(d, 2), d[6] ? 'TRUE' : 'FALSE')
    } else if (type === 0x0006 /* FORMULA */) {
      const r = u16(d, 0)
      const c = u16(d, 2)
      if (d.length >= 14 && d[12] === 0xff && d[13] === 0xff) {
        if (d[6] === 0) pendingFormula = { r, c }
        else if (d[6] === 1) put(r, c, d[8] ? 'TRUE' : 'FALSE')
      } else if (d.length >= 14) put(r, c, formatNumber(new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true)))
    } else if (type === 0x0207 /* STRING */) {
      if (pendingFormula) put(pendingFormula.r, pendingFormula.c, shortString(d, 2, u16(d, 0)))
      pendingFormula = null
    }
  }
  return sheets
}

// ─────────────────────────────── PowerPoint (.ppt) ───────────────────────────────

type PptSlide = { title?: string; texts: string[] }

/** Diapositives d'un flux « PowerPoint Document » (SlideListWithText, sinon SlideContainer). */
export function extractPptSlides(s: Uint8Array): PptSlide[] {
  const listSlides: PptSlide[] = []
  const containerSlides: PptSlide[] = []
  let records = 0
  let textType = -1
  const cp1252 = decoderFor('windows-1252')
  const utf16 = decoderFor('utf-16le')
  const addText = (slide: PptSlide | undefined, raw: string): void => {
    if (!slide) return
    const t = raw.replace(/\r/g, '\n').replace(/\u000b/g, '\n')
    if (!t.trim()) return
    if ((textType === 0 || textType === 6) && !slide.title) slide.title = t.replace(/\n+/g, ' ')
    else if (slide.texts.length < 200) slide.texts.push(...t.split('\n').filter((x) => x.trim()))
  }
  /** Parcours récursif (profondeur bornée) ; `ctx` = diapositive courante par source. */
  const walk = (start: number, end: number, depth: number, inList: boolean, current: PptSlide | undefined): void => {
    let p = start
    let listCur: PptSlide | undefined
    while (p + 8 <= end && records++ < LEGACY_LIMITS.maxRecords) {
      const verInst = s[p] | (s[p + 1] << 8)
      const type = s[p + 2] | (s[p + 3] << 8)
      const len = (s[p + 4] | (s[p + 5] << 8) | (s[p + 6] << 16) | (s[p + 7] << 24)) >>> 0
      const body = p + 8
      const next = body + len
      if (next > end || next < body) return
      if (type === 0x2f14) throw new OfficePreviewError('encrypted')
      const container = (verInst & 0x0f) === 0x0f
      if (type === 0x0ff0 /* SlideListWithText */) {
        if (verInst >> 4 === 0 && depth < 16) walk(body, next, depth + 1, true, undefined)
      } else if (type === 0x03ee /* Slide */) {
        const slide: PptSlide = { texts: [] }
        if (depth < 16) walk(body, next, depth + 1, false, slide)
        containerSlides.push(slide)
      } else if (type === 0x03f0 || type === 0x03f8 || type === 0x0fc9 /* Notes, MainMaster, Handout */) {
        // ignorés
      } else if (inList && type === 0x03f3 /* SlidePersistAtom */) {
        listCur = { texts: [] }
        listSlides.push(listCur)
        textType = -1
      } else if (type === 0x0f9f /* TextHeaderAtom */) {
        textType = len >= 4 ? s[body] | (s[body + 1] << 8) : -1
      } else if (type === 0x0fa0 /* TextCharsAtom */) {
        addText(inList ? listCur : current, utf16.decode(s.subarray(body, body + (len & ~1))))
      } else if (type === 0x0fa8 /* TextBytesAtom */) {
        addText(inList ? listCur : current, cp1252.decode(s.subarray(body, next)))
      } else if (container && depth < 16) {
        walk(body, next, depth + 1, inList, current)
      }
      p = next
    }
  }
  walk(0, s.length, 0, false, undefined)
  const pick = listSlides.some((x) => x.title || x.texts.length) ? listSlides : containerSlides
  // Anciennes versions d'une même diapositive (sauvegardes incrémentales) : doublons retirés.
  const seen = new Set<string>()
  return pick.filter((sl) => {
    const key = JSON.stringify(sl)
    if (!sl.title && !sl.texts.length) return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─────────────────────────────── Point d'entrée ───────────────────────────────

const WORD_EXTS = new Set(['doc', 'dot'])
const EXCEL_EXTS = new Set(['xls', 'xlt'])
const PPT_EXTS = new Set(['ppt', 'pps', 'pot'])

/** Repli heuristique (avertissement « approximatif ») ; aucun texte → 'corrupt'. */
function heuristicPreview(format: string, data: Uint8Array, title?: string): OfficePreview {
  const sink = new BlockSink()
  for (const t of heuristicText(data)) {
    if (sink.full) break
    sink.paragraph(t)
  }
  if (!sink.blocks.length) throw new OfficePreviewError('corrupt', 'no text')
  return result(format, sink, title, [LEGACY_APPROXIMATE_WARNING])
}

/** Aperçu d'un ancien document binaire Office (doc/dot, xls/xlt, ppt/pps/pot). */
export function extractLegacyOfficePreview(bytes: Uint8Array, ext: string): OfficePreview {
  const format = ext.toLowerCase().replace(/^\./, '')
  if (bytes.length > LEGACY_LIMITS.maxInputBytes) throw new OfficePreviewError('tooLarge')
  if (!isCompoundFile(bytes)) {
    // Fichiers renommés : RTF enregistré en .doc (fréquent), archive OOXML (non prise ici).
    const head = String.fromCharCode(...bytes.subarray(0, 8))
    if (/^\s*\{\\rtf/.test(head) || (bytes[0] === 0xef && /\{\\rtf/.test(head))) return { ...extractRtfPreview(bytes), format }
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new OfficePreviewError('unsupported')
    return heuristicPreview(format, bytes)
  }
  let cfb: CompoundFile
  try {
    cfb = new CompoundFile(bytes)
  } catch (err) {
    if (err instanceof OfficePreviewError && err.reason === 'encrypted') throw err
    return heuristicPreview(format, bytes)
  }
  // OOXML chiffré (EncryptedPackage) ou PowerPoint chiffré (EncryptedSummary).
  if (cfb.has('EncryptedPackage') || cfb.has('EncryptionInfo') || cfb.has('EncryptedSummary')) {
    throw new OfficePreviewError('encrypted')
  }
  let title: string | undefined
  try {
    title = summaryTitle(cfb)
  } catch {
    title = undefined
  }
  // Le type réel prime sur l'extension (un .xls peut être un classeur renommé en .doc).
  const kind = cfb.has('WordDocument') ? 'word' : cfb.has('Workbook') || cfb.has('Book') ? 'excel' : cfb.has('PowerPoint Document') ? 'ppt' : WORD_EXTS.has(format) ? 'word' : EXCEL_EXTS.has(format) ? 'excel' : PPT_EXTS.has(format) ? 'ppt' : ''
  const mainName = kind === 'word' ? 'WordDocument' : kind === 'excel' ? (cfb.has('Workbook') ? 'Workbook' : 'Book') : 'PowerPoint Document'
  const sink = new BlockSink()
  try {
    if (kind === 'word') {
      wordTextToBlocks(extractWordText(cfb), sink)
    } else if (kind === 'excel') {
      const wb = cfb.stream(mainName)
      if (!wb) throw new OfficePreviewError('corrupt', 'no Workbook')
      const sheets = extractWorkbookSheets(wb)
      for (const sh of sheets) sink.table(sh.rows, sh.name)
    } else if (kind === 'ppt') {
      const pd = cfb.stream(mainName)
      if (!pd) throw new OfficePreviewError('corrupt', 'no PowerPoint Document')
      extractPptSlides(pd).forEach((sl, i) => sink.slide(i + 1, sl.title, sl.texts))
    } else {
      throw new OfficePreviewError('corrupt', 'unknown compound document')
    }
  } catch (err) {
    if (err instanceof OfficePreviewError && (err.reason === 'encrypted' || err.reason === 'tooLarge')) throw err
    return heuristicPreview(format, cfb.stream(mainName) ?? bytes, title)
  }
  if (!sink.blocks.length && kind !== 'excel') {
    try {
      return heuristicPreview(format, cfb.stream(mainName) ?? bytes, title)
    } catch {
      /* document réellement vide */
    }
  }
  return result(format, sink, title)
}
