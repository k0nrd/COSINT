/**
 * §R2 v1.9 (aperçu bureautique) — extraction du CONTENU TEXTUEL d'un document
 * bureautique importé sur le tableau : OOXML (docx/xlsx/pptx et variantes), OpenDocument
 * (odt/ods/odp/odg, fodt/fods/fodp), iWork (pages/numbers/key : miniature intégrée),
 * RTF et anciens binaires (doc/xls/ppt — délégués à lib/legacyOffice.ts).
 *
 * Sécurité : les fichiers viennent de pairs NON FIABLES. On n'exécute jamais de macro,
 * on n'interprète jamais de HTML ; seul du TEXTE est extrait (le rendu construit des
 * éléments React à partir de ces chaînes). Tout est borné : taille décompressée
 * (lib/zipReader.ts), nombre d'entrées d'archive, de nœuds XML, de blocs, de
 * lignes/colonnes, de caractères, et temps (OFFICE_LIMITS.timeoutMs).
 */
import { extractLegacyOfficePreview, extractRtfPreview } from './legacyOffice'
import { OfficePreviewError, type OfficeBlock, type OfficePreview } from './officeTypes'
import { child, descendant, descendants, elements, parseXml, relId, textContent, type XNode } from './officeXml'
import { ZipArchive, ZipError, hasZipSignature, ZIP_LIMITS } from './zipReader'

export {
  OfficePreviewError,
  officeFailureOf,
  type OfficeBlock,
  type OfficeFailure,
  type OfficePreview
} from './officeTypes'

/** Extensions confiées à lib/legacyOffice.ts (anciens formats binaires OLE2). */
export const LEGACY_OFFICE_EXTENSIONS = new Set(['doc', 'dot', 'xls', 'xlt', 'ppt', 'pps', 'pot'])

/** Bornes de l'extraction (§R2 v1.9). */
export const OFFICE_LIMITS = {
  /** Taille maximale du fichier analysé (octets). */
  maxInputBytes: 64 * 1024 * 1024,
  maxBlocks: 3000,
  maxChars: 400_000,
  /** Feuilles de calcul lues (les suivantes sont seulement comptées). */
  maxSheets: 12,
  maxRows: 200,
  maxCols: 30,
  maxSlides: 300,
  /** Textes par diapositive. */
  maxSlideTexts: 80,
  /** Chaînes partagées d'un classeur. */
  maxSharedStrings: 200_000,
  /** Miniature intégrée (octets). */
  maxThumbnailBytes: 2 * 1024 * 1024,
  /** Début lu d'une partie de contenu (document, diapositive, texte ODF) — au-delà : tronqué. */
  maxPartPrefix: 8 * 1024 * 1024,
  /** Début lu d'une feuille de calcul (200 lignes affichées) et des chaînes partagées. */
  maxSheetPrefix: 4 * 1024 * 1024,
  /** Profondeur de récursion (listes, sections imbriquées). */
  maxDepth: 24,
  timeoutMs: 20_000
} as const

/** Clé i18n « contenu tronqué » (partagée avec lib/legacyOffice.ts). */
export const OFFICE_TRUNCATED_WARNING = 'file.office.truncated'

/** Famille d'un document (sert au badge et aux compteurs). */
export type OfficeFamily = 'text' | 'sheet' | 'slides' | 'drawing'

/** Libellé générique du format (badge) : Word, Calc, Keynote… ; '' si inconnu. */
export function officeFormatLabel(format: string): string {
  const f = format.toLowerCase()
  if (/^(docx|docm|dotx|dotm|doc|dot)$/.test(f)) return 'Word'
  if (/^(xlsx|xlsm|xltx|xltm|xls|xlt)$/.test(f)) return 'Excel'
  if (/^(pptx|pptm|potx|potm|ppsx|ppsm|ppt|pps|pot)$/.test(f)) return 'PowerPoint'
  if (/^(odt|ott|fodt)$/.test(f)) return 'Writer'
  if (/^(ods|ots|fods)$/.test(f)) return 'Calc'
  if (/^(odp|otp|fodp)$/.test(f)) return 'Impress'
  if (/^(odg|otg|fodg)$/.test(f)) return 'Draw'
  if (f === 'pages') return 'Pages'
  if (f === 'numbers') return 'Numbers'
  if (f === 'key') return 'Keynote'
  if (f === 'rtf') return 'RTF'
  return ''
}

/** Compteurs affichés en méta (pages inconnues → paragraphes / feuilles / diapositives). */
export function officeCounts(preview: OfficePreview): { paragraphs: number; tables: number; slides: number } {
  let paragraphs = 0
  let tables = 0
  let slides = 0
  for (const b of preview.blocks) {
    if (b.kind === 'paragraph' || b.kind === 'heading') paragraphs++
    else if (b.kind === 'table') tables++
    else slides++
  }
  return { paragraphs, tables, slides }
}

/** Format déduit du MIME quand l'extension est absente ou inconnue. */
export function officeFormatFromMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('wordprocessingml')) return 'docx'
  if (m.includes('spreadsheetml')) return 'xlsx'
  if (m.includes('presentationml')) return 'pptx'
  if (m.startsWith('application/vnd.oasis.opendocument.')) {
    const sub = m.slice('application/vnd.oasis.opendocument.'.length)
    if (sub.startsWith('text')) return 'odt'
    if (sub.startsWith('spreadsheet')) return 'ods'
    if (sub.startsWith('presentation')) return 'odp'
    if (sub.startsWith('graphics')) return 'odg'
  }
  if (m === 'application/msword') return 'doc'
  if (m === 'application/vnd.ms-excel') return 'xls'
  if (m === 'application/vnd.ms-powerpoint') return 'ppt'
  if (m === 'application/rtf' || m === 'text/rtf') return 'rtf'
  if (m.includes('apple.pages') || m.includes('iwork-pages')) return 'pages'
  if (m.includes('apple.numbers') || m.includes('iwork-numbers')) return 'numbers'
  if (m.includes('apple.keynote') || m.includes('iwork-keynote')) return 'key'
  return ''
}

// ─────────────────────────── Contexte borné ───────────────────────────

/** Nettoie un texte extrait : caractères de contrôle retirés, espaces normalisés. */
export function cleanOfficeText(s: string): string {
  return (
    s
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f￾￿]/g, '')
      .replace(/[ \t]+$/gm, '')
      .trim()
  )
}

/** Accumulateur de blocs borné + délai / annulation. */
class Ctx {
  readonly blocks: OfficeBlock[] = []
  /**
   * §R2 v1.9 — deux notions distinctes : `cut` = un contenu a été coupé (tableau > maxRows,
   * XML partiel, trop de feuilles…) → simple avertissement, l'extraction continue ;
   * `exhausted` = budget de blocs / caractères épuisé → plus aucun bloc (`full`).
   */
  private cut = false
  private exhausted = false
  private chars = 0
  private readonly deadline: number

  constructor(readonly signal?: AbortSignal, timeoutMs: number = OFFICE_LIMITS.timeoutMs) {
    this.deadline = Date.now() + timeoutMs
  }

  /** Lève 'aborted' / 'timeout' si besoin (appelé dans les boucles). */
  check(): void {
    if (this.signal?.aborted) throw new OfficePreviewError('aborted')
    if (Date.now() > this.deadline) throw new OfficePreviewError('timeout')
  }

  /** Aperçu incomplet (contenu coupé OU budget épuisé). */
  get truncated(): boolean {
    return this.cut || this.exhausted
  }

  /** Marque un contenu coupé SANS arrêter l'extraction (seul room() arrête). */
  set truncated(value: boolean) {
    if (value) this.cut = true
  }

  get full(): boolean {
    return this.exhausted
  }

  private room(len: number): boolean {
    if (this.exhausted) return false
    if (this.blocks.length >= OFFICE_LIMITS.maxBlocks || this.chars + len > OFFICE_LIMITS.maxChars) {
      this.exhausted = true
      return false
    }
    this.chars += len
    return true
  }

  heading(level: number, text: string): void {
    const t = cleanOfficeText(text)
    if (t && this.room(t.length)) this.blocks.push({ kind: 'heading', level: Math.min(6, Math.max(1, level)), text: t })
  }

  paragraph(text: string): void {
    const t = cleanOfficeText(text)
    if (t && this.room(t.length)) this.blocks.push({ kind: 'paragraph', text: t })
  }

  table(rows: string[][], name?: string): void {
    let clean = rows.map((r) => r.map(cleanOfficeText))
    while (clean.length && clean[clean.length - 1].every((c) => !c)) clean.pop()
    // Colonnes vides en fin de tableau retirées.
    let width = 0
    for (const r of clean) for (let k = r.length - 1; k >= 0; k--) if (r[k]) { width = Math.max(width, k + 1); break }
    clean = clean.map((r) => {
      const row = r.slice(0, width)
      while (row.length < width) row.push('')
      return row
    })
    if (!width && !name) return
    const len = clean.reduce((n, r) => n + r.reduce((m, c) => m + c.length + 1, 0), 0) + (name?.length ?? 0)
    if (!this.room(len)) return
    const rowsOut = width ? clean : []
    this.blocks.push(name ? { kind: 'table', name, rows: rowsOut } : { kind: 'table', rows: rowsOut })
  }

  slide(index: number, title: string | undefined, texts: string[]): void {
    const clean = texts.map(cleanOfficeText).filter(Boolean).slice(0, OFFICE_LIMITS.maxSlideTexts)
    const t = title ? cleanOfficeText(title) : ''
    const len = clean.reduce((n, s) => n + s.length, t.length) + 1
    if (!this.room(len)) return
    this.blocks.push(t ? { kind: 'slide', index, title: t, texts: clean } : { kind: 'slide', index, texts: clean })
  }
}

/** Encode des octets en base64 (par tranches, sans dépasser la pile). */
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** data: URL d'une image PNG/JPEG vérifiée par sa signature (sinon null : EMF/WMF/SVG ignorés). */
export function imageDataUrl(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.length < 8 || bytes.length > OFFICE_LIMITS.maxThumbnailBytes) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return `data:image/png;base64,${toBase64(bytes)}`
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return `data:image/jpeg;base64,${toBase64(bytes)}`
  return null
}

/** Première miniature PNG/JPEG valide parmi des noms candidats (insensible à la casse). */
async function readThumbnail(zip: ZipArchive, names: string[]): Promise<string | undefined> {
  for (const candidate of names) {
    const name = zip.find(candidate)
    if (!name) continue
    try {
      const url = imageDataUrl(await zip.read(name, OFFICE_LIMITS.maxThumbnailBytes))
      if (url) return url
    } catch (error) {
      if (error instanceof ZipError && error.reason === 'aborted') throw error
      // Miniature illisible ou trop grande : ignorée (non bloquant).
    }
  }
  return undefined
}

/**
 * Lit et analyse une partie XML de l'archive (null si absente). `prefix` (parties de
 * CONTENU : feuilles, document, diapositives) : seul le début de la partie est lu, au
 * plus `prefix` octets — une grande feuille n'est plus refusée, l'aperçu est marqué
 * tronqué (l'analyseur tolère les balises non fermées). Budget total épuisé → null.
 */
async function readXml(zip: ZipArchive, name: string, ctx: Ctx, prefix?: number): Promise<XNode | null> {
  const real = zip.find(name)
  if (!real) return null
  let text: string | null
  if (prefix !== undefined) {
    if (zip.remaining <= 0) {
      ctx.truncated = true
      return null
    }
    const part = await zip.readPrefix(real, prefix)
    if (part?.cut) ctx.truncated = true
    text = part ? new TextDecoder('utf-8', { fatal: false }).decode(part.data) : null
  } else {
    text = await zip.readText(real)
  }
  ctx.check()
  if (text === null) return null
  const { root, truncated } = parseXml(text, undefined, () => ctx.check())
  if (truncated) ctx.truncated = true
  return root
}

// ─────────────────────────────── OOXML ───────────────────────────────

/** Relations d'une partie (Id → chemin résolu dans l'archive). */
async function readRels(zip: ZipArchive, relsPath: string, baseDir: string, ctx: Ctx): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const root = await readXml(zip, relsPath, ctx)
  if (!root) return out
  for (const rel of elements(root, 'Relationship')) {
    const id = rel.attrs.Id
    const target = rel.attrs.Target
    if (!id || !target || rel.attrs.TargetMode === 'External') continue
    out.set(id, resolvePartPath(baseDir, target))
  }
  return out
}

/** Résout une cible relative (« worksheets/sheet1.xml », « ../x », « /xl/x »). */
export function resolvePartPath(baseDir: string, target: string): string {
  const parts = target.startsWith('/') ? [] : baseDir.split('/').filter(Boolean)
  for (const seg of target.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/** Titre des métadonnées (docProps/core.xml ou meta.xml : dc:title). */
async function readDcTitle(zip: ZipArchive, path: string, ctx: Ctx): Promise<string | undefined> {
  try {
    const root = await readXml(zip, path, ctx)
    const t = root ? descendant(root, 'title') : null
    const s = t ? cleanOfficeText(textContent(t, 400)) : ''
    return s || undefined
  } catch (error) {
    if (error instanceof OfficePreviewError) throw error
    return undefined
  }
}

const OOXML_THUMBS = ['docProps/thumbnail.jpeg', 'docProps/thumbnail.jpg', 'docProps/thumbnail.png']

/** Niveau de titre d'un nom de style (« heading 2 », « Titre1 », « Title ») ; 0 sinon. */
export function headingLevelOf(style: string): number {
  const s = style.toLowerCase().replace(/\s+/g, '')
  const m = /^(heading|titre|überschrift|nagłówek|nagwek|encabezado|titolo|kop)(\d)$/.exec(s)
  if (m) return Number(m[2])
  if (s === 'title' || s === 'titre' || s === 'titel' || s === 'tytuł' || s === 'tytul') return 1
  if (s === 'subtitle' || s === 'sous-titre' || s === 'soustitre' || s === 'podtytuł') return 2
  return 0
}

/** Texte d'un paragraphe Word (w:t, tabulations, sauts ; texte supprimé et doublons ignorés). */
function wordParagraphText(p: XNode, max = 20_000): string {
  let out = ''
  const stack: XNode[] = [p]
  while (stack.length && out.length < max) {
    const cur = stack.pop() as XNode
    for (let k = cur.children.length - 1; k >= 0; k--) {
      const c = cur.children[k]
      if (typeof c === 'string') continue
      // Fallback = double de mc:Choice ; delText / instrText = texte supprimé / code de champ.
      if (c.name === 'Fallback' || c.name === 'delText' || c.name === 'instrText' || c.name === 'pPr' || c.name === 'rPr') continue
      stack.push(c)
    }
    if (cur === p) continue
    if (cur.name === 't') out += textContent(cur, max)
    else if (cur.name === 'tab') out += '\t'
    else if (cur.name === 'br' || cur.name === 'cr') out += '\n'
    else if (cur.name === 'noBreakHyphen') out += '-'
  }
  return out
}

async function extractDocx(zip: ZipArchive, format: string, ctx: Ctx): Promise<OfficePreview> {
  const doc = await readXml(zip, 'word/document.xml', ctx, OFFICE_LIMITS.maxPartPrefix)
  if (!doc) throw new OfficePreviewError('corrupt')
  // Styles : identifiant → nom (« Titre1 » → « heading 1 »), pour reconnaître les titres.
  const styleNames = new Map<string, string>()
  try {
    const styles = await readXml(zip, 'word/styles.xml', ctx)
    if (styles) for (const st of elements(styles, 'style')) {
      const name = child(st, 'name')?.attrs.val
      if (st.attrs.styleId && name) styleNames.set(st.attrs.styleId, name)
    }
  } catch (error) {
    if (error instanceof OfficePreviewError) throw error
  }
  const body = child(doc, 'body') ?? doc
  const walk = (node: XNode, depth: number): void => {
    for (const el of elements(node)) {
      if (ctx.full) return
      ctx.check()
      if (el.name === 'p') {
        const pPr = child(el, 'pPr')
        const styleId = child(pPr, 'pStyle')?.attrs.val ?? ''
        let level = headingLevelOf(styleNames.get(styleId) ?? '') || headingLevelOf(styleId)
        const outline = child(pPr, 'outlineLvl')?.attrs.val
        if (!level && outline !== undefined && /^\d$/.test(outline) && Number(outline) < 9) level = Number(outline) + 1
        const text = wordParagraphText(el)
        if (level) ctx.heading(level, text)
        else ctx.paragraph(text)
      } else if (el.name === 'tbl') {
        const rows: string[][] = []
        for (const tr of elements(el, 'tr')) {
          if (rows.length >= OFFICE_LIMITS.maxRows) {
            ctx.truncated = true
            break
          }
          rows.push(
            elements(tr, 'tc')
              .slice(0, OFFICE_LIMITS.maxCols)
              .map((tc) => descendants(tc, 'p', 200).map((p) => wordParagraphText(p, 4000)).join('\n'))
          )
        }
        ctx.table(rows)
      } else if (depth < OFFICE_LIMITS.maxDepth && (el.name === 'sdt' || el.name === 'sdtContent' || el.name === 'customXml' || el.name === 'ins' || el.name === 'smartTag')) {
        walk(el, depth + 1)
      }
    }
  }
  walk(body, 0)
  const title = await readDcTitle(zip, 'docProps/core.xml', ctx)
  const thumbnail = await readThumbnail(zip, OOXML_THUMBS)
  return finish(format, ctx, title, thumbnail)
}

function finish(format: string, ctx: Ctx, title?: string, thumbnail?: string): OfficePreview {
  const out: OfficePreview = { format, blocks: ctx.blocks, truncated: ctx.truncated, warnings: [] }
  if (ctx.truncated) out.warnings.push(OFFICE_TRUNCATED_WARNING)
  if (title) out.title = title.slice(0, 300)
  if (thumbnail) out.thumbnail = thumbnail
  return out
}

/** Index de colonne (0) d'une référence de cellule « AB12 » ; -1 si invalide. */
export function columnIndexOf(ref: string): number {
  let col = 0
  let k = 0
  for (; k < ref.length && k < 4; k++) {
    const c = ref.charCodeAt(k) & ~0x20
    if (c < 65 || c > 90) break
    col = col * 26 + (c - 64)
  }
  return k === 0 ? -1 : col - 1
}

/** Nombre de cellule lisible (sans artefacts binaires : 0.1+0.2 → 0.3). */
export function formatCellNumber(raw: string): string {
  const n = Number(raw)
  if (!raw.trim() || !Number.isFinite(n)) return raw
  return String(Number(n.toPrecision(12)))
}

async function extractXlsx(zip: ZipArchive, format: string, ctx: Ctx): Promise<OfficePreview> {
  const wb = await readXml(zip, 'xl/workbook.xml', ctx)
  if (!wb) throw new OfficePreviewError('corrupt')
  const rels = await readRels(zip, 'xl/_rels/workbook.xml.rels', 'xl', ctx)
  const shared: string[] = []
  const sst = await readXml(zip, 'xl/sharedStrings.xml', ctx, OFFICE_LIMITS.maxSheetPrefix)
  if (sst) {
    for (const si of elements(sst, 'si')) {
      if (shared.length >= OFFICE_LIMITS.maxSharedStrings) break
      // Texte des « t » directs et des runs (r/t), sans la phonétique (rPh).
      let s = ''
      for (const part of elements(si)) {
        if (part.name === 't') s += textContent(part, 32_000)
        else if (part.name === 'r') s += textContent(child(part, 't') ?? { name: '', attrs: {}, children: [] }, 32_000)
      }
      shared.push(s)
    }
  }
  const sheets = elements(child(wb, 'sheets') ?? wb, 'sheet').filter((s) => !s.attrs.state || s.attrs.state === 'visible')
  let read = 0
  for (const sheet of sheets) {
    if (ctx.full) break
    if (read >= OFFICE_LIMITS.maxSheets) {
      ctx.truncated = true
      break
    }
    ctx.check()
    const path = rels.get(relId(sheet))
    if (path && zip.remaining <= 0) {
      ctx.truncated = true // budget de décompression épuisé : feuilles suivantes ignorées
      break
    }
    const root = path ? await readXml(zip, path, ctx, OFFICE_LIMITS.maxSheetPrefix) : null
    read++
    const name = sheet.attrs.name || `#${read}`
    if (!root) {
      ctx.table([], name) // feuille graphique ou absente : onglet vide
      continue
    }
    const rows: string[][] = []
    for (const row of elements(child(root, 'sheetData') ?? root, 'row')) {
      if (rows.length >= OFFICE_LIMITS.maxRows) {
        ctx.truncated = true
        break
      }
      const cells: string[] = []
      let next = 0
      for (const c of elements(row, 'c')) {
        const col = c.attrs.r ? columnIndexOf(c.attrs.r) : next
        next = (col < 0 ? next : col) + 1
        const at = col < 0 ? next - 1 : col
        if (at >= OFFICE_LIMITS.maxCols) continue
        const t = c.attrs.t ?? 'n'
        const v = child(c, 'v')
        const raw = v ? textContent(v, 32_000) : ''
        let value = ''
        if (t === 's') value = shared[Number(raw)] ?? ''
        else if (t === 'inlineStr') value = textContent(child(c, 'is') ?? c, 32_000)
        else if (t === 'b') value = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw
        else if (t === 'n') value = formatCellNumber(raw)
        else value = raw
        while (cells.length < at) cells.push('')
        cells[at] = value
      }
      if (cells.some(Boolean)) rows.push(cells)
    }
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0)
    ctx.table(rows.map((r) => [...r, ...Array<string>(width - r.length).fill('')]), name)
  }
  const title = await readDcTitle(zip, 'docProps/core.xml', ctx)
  const thumbnail = await readThumbnail(zip, OOXML_THUMBS)
  const out = finish(format, ctx, title, thumbnail)
  if (sheets.length > read) out.truncated = true
  return out
}

async function extractPptx(zip: ZipArchive, format: string, ctx: Ctx): Promise<OfficePreview> {
  const pres = await readXml(zip, 'ppt/presentation.xml', ctx)
  if (!pres) throw new OfficePreviewError('corrupt')
  const rels = await readRels(zip, 'ppt/_rels/presentation.xml.rels', 'ppt', ctx)
  const ids = elements(child(pres, 'sldIdLst') ?? pres, 'sldId')
  let index = 0
  for (const sld of ids) {
    if (ctx.full) break
    if (index >= OFFICE_LIMITS.maxSlides) {
      ctx.truncated = true
      break
    }
    ctx.check()
    index++
    const path = rels.get(relId(sld))
    if (path && zip.remaining <= 0) {
      ctx.truncated = true // budget de décompression épuisé : diapositives suivantes ignorées
      break
    }
    const root = path ? await readXml(zip, path, ctx, OFFICE_LIMITS.maxPartPrefix) : null
    if (!root) {
      ctx.slide(index, undefined, [])
      continue
    }
    let title: string | undefined
    const texts: string[] = []
    const csld = child(root, 'cSld') ?? root
    for (const sp of descendants(csld, 'sp', 2000)) {
      const ph = descendant(child(sp, 'nvSpPr') ?? sp, 'ph')
      const isTitle = ph?.attrs.type === 'title' || ph?.attrs.type === 'ctrTitle'
      const paras = descendants(child(sp, 'txBody') ?? sp, 'p', 400).map((p) => slideParagraphText(p))
      if (isTitle && !title) title = paras.filter(Boolean).join(' ')
      else texts.push(...paras)
    }
    // Tableaux (graphicFrame / a:tbl) : une ligne de texte par rangée.
    for (const tbl of descendants(csld, 'tbl', 50)) {
      for (const tr of elements(tbl, 'tr').slice(0, OFFICE_LIMITS.maxRows)) {
        texts.push(elements(tr, 'tc').map((tc) => descendants(tc, 'p', 50).map(slideParagraphText).join(' ')).join(' | '))
      }
    }
    ctx.slide(index, title, texts)
  }
  const title = await readDcTitle(zip, 'docProps/core.xml', ctx)
  const thumbnail = await readThumbnail(zip, OOXML_THUMBS)
  return finish(format, ctx, title, thumbnail)
}

/** Texte d'un paragraphe DrawingML (a:t, a:br). */
function slideParagraphText(p: XNode): string {
  let out = ''
  for (const el of elements(p)) {
    if (el.name === 'r' || el.name === 'fld') out += textContent(child(el, 't') ?? el, 8000)
    else if (el.name === 'br') out += '\n'
  }
  return out
}

// ──────────────────────────── OpenDocument ────────────────────────────

/** Texte d'un paragraphe ODF (text:s, text:tab, text:line-break ; notes ignorées). */
function odfText(node: XNode, max = 20_000): string {
  let out = ''
  const stack: Array<XNode | string> = [...node.children].reverse()
  while (stack.length && out.length < max) {
    const cur = stack.pop() as XNode | string
    if (typeof cur === 'string') {
      out += cur.replace(/[\r\n\t ]+/g, ' ')
      continue
    }
    if (cur.name === 's') out += ' '.repeat(Math.min(100, Math.max(1, Number(cur.attrs.c) || 1)))
    else if (cur.name === 'tab') out += '\t'
    else if (cur.name === 'line-break') out += '\n'
    else if (cur.name === 'note' || cur.name === 'annotation' || cur.name === 'tracked-changes') continue
    else for (let k = cur.children.length - 1; k >= 0; k--) stack.push(cur.children[k])
  }
  return out
}

/** Lignes d'un table:table ODF (répétitions bornées, lignes vides de fin ignorées). */
function odfTableRows(table: XNode, ctx: Ctx): string[][] {
  const rows: string[][] = []
  const pending: string[][] = [] // lignes vides retenues seulement si suivies de contenu
  const visit = (node: XNode, depth: number): void => {
    for (const el of elements(node)) {
      if (rows.length >= OFFICE_LIMITS.maxRows) {
        ctx.truncated = true
        return
      }
      if (el.name === 'table-row') {
        const cells: string[] = []
        for (const cell of elements(el)) {
          if (cell.name !== 'table-cell' && cell.name !== 'covered-table-cell') continue
          if (cells.length >= OFFICE_LIMITS.maxCols) break
          const paras = elements(cell, 'p').concat(elements(cell, 'h'))
          let value = paras.map((p) => odfText(p, 4000)).join('\n')
          if (!value) value = cell.attrs['string-value'] ?? cell.attrs.value ?? ''
          const repeat = Math.min(Math.max(1, Number(cell.attrs['number-columns-repeated']) || 1), OFFICE_LIMITS.maxCols - cells.length)
          for (let r = 0; r < repeat; r++) cells.push(value)
        }
        const empty = !cells.some(Boolean)
        const repeat = Math.max(1, Number(el.attrs['number-rows-repeated']) || 1)
        if (empty) {
          if (pending.length < OFFICE_LIMITS.maxRows) pending.push(...Array.from({ length: Math.min(repeat, OFFICE_LIMITS.maxRows) }, () => []))
          continue
        }
        rows.push(...pending.splice(0).slice(0, OFFICE_LIMITS.maxRows - rows.length))
        for (let r = 0; r < repeat && rows.length < OFFICE_LIMITS.maxRows; r++) rows.push(cells)
      } else if (depth < 4 && /^table-(header-rows|rows|row-group)$/.test(el.name)) {
        visit(el, depth + 1)
      }
    }
  }
  visit(table, 0)
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0)
  return rows.map((r) => [...r, ...Array<string>(width - r.length).fill('')])
}

/** Corps texte ODF (titres, paragraphes, listes, sections, tableaux). */
function odfWalkText(node: XNode, ctx: Ctx, depth: number, bullet = ''): void {
  for (const el of elements(node)) {
    if (ctx.full) return
    ctx.check()
    if (el.name === 'h') ctx.heading(Number(el.attrs['outline-level']) || 1, odfText(el))
    else if (el.name === 'p') ctx.paragraph(bullet + odfText(el))
    else if (el.name === 'table') ctx.table(odfTableRows(el, ctx), undefined)
    else if (depth < OFFICE_LIMITS.maxDepth) {
      if (el.name === 'list') odfWalkText(el, ctx, depth + 1, '• ')
      else if (/^(list-item|list-header|section|index-body|table-of-content|alphabetical-index|illustration-index|bibliography|change|inserted)$/.test(el.name)) {
        odfWalkText(el, ctx, depth + 1, bullet)
      }
    }
  }
}

/** Extraction d'un document ODF déjà analysé (content.xml ou ODF « plat »). */
function extractOdfRoot(root: XNode, ctx: Ctx): void {
  const body = child(root, 'body') ?? root
  const text = child(body, 'text')
  const sheet = child(body, 'spreadsheet')
  const show = child(body, 'presentation') ?? child(body, 'drawing')
  if (text) odfWalkText(text, ctx, 0)
  else if (sheet) {
    let n = 0
    for (const table of elements(sheet, 'table')) {
      if (ctx.full) break
      if (n++ >= OFFICE_LIMITS.maxSheets) {
        ctx.truncated = true
        break
      }
      ctx.check()
      ctx.table(odfTableRows(table, ctx), table.attrs.name || `#${n}`)
    }
  } else if (show) {
    let index = 0
    for (const page of elements(show, 'page')) {
      if (ctx.full) break
      if (index >= OFFICE_LIMITS.maxSlides) {
        ctx.truncated = true
        break
      }
      ctx.check()
      index++
      let title: string | undefined
      const texts: string[] = []
      for (const frame of elements(page)) {
        if (frame.name === 'notes') continue
        const paras = descendants(frame, 'p', 400).concat(descendants(frame, 'h', 100)).map((p) => odfText(p, 8000))
        if (frame.attrs.class === 'title' && !title) title = paras.filter(Boolean).join(' ')
        else texts.push(...paras)
      }
      ctx.slide(index, title, texts)
    }
  } else throw new OfficePreviewError('corrupt')
}

async function extractOdfZip(zip: ZipArchive, format: string, ctx: Ctx): Promise<OfficePreview> {
  // Document protégé par mot de passe : manifeste avec <manifest:encryption-data>.
  const manifest = await readXml(zip, 'META-INF/manifest.xml', ctx).catch((e: unknown) => {
    if (e instanceof OfficePreviewError || e instanceof ZipError) throw e
    return null
  })
  if (manifest && descendant(manifest, 'encryption-data')) throw new OfficePreviewError('encrypted')
  const root = await readXml(zip, 'content.xml', ctx, OFFICE_LIMITS.maxPartPrefix)
  if (!root) throw new OfficePreviewError('corrupt')
  extractOdfRoot(root, ctx)
  const title = await readDcTitle(zip, 'meta.xml', ctx)
  const thumbnail = await readThumbnail(zip, ['Thumbnails/thumbnail.png'])
  return finish(format, ctx, title, thumbnail)
}

/** ODF « plat » (fodt/fods/fodp/fodg) : un seul fichier XML. */
function extractFlatOdf(bytes: Uint8Array, format: string, ctx: Ctx): OfficePreview {
  if (bytes.length > ZIP_LIMITS.maxEntryBytes) throw new OfficePreviewError('tooLarge')
  const { root, truncated } = parseXml(new TextDecoder('utf-8', { fatal: false }).decode(bytes), undefined, () => ctx.check())
  if (truncated) ctx.truncated = true
  if (root.name !== 'document') throw new OfficePreviewError('corrupt')
  extractOdfRoot(root, ctx)
  const meta = child(root, 'meta')
  const t = meta ? child(meta, 'title') : null
  return finish(format, ctx, t ? cleanOfficeText(textContent(t, 400)) : undefined)
}

// ───────────────────────────── Aiguillage ─────────────────────────────

const IWORK_THUMBS = ['QuickLook/Thumbnail.jpg', 'QuickLook/Thumbnail.png', 'preview.jpg', 'preview-web.jpg', 'preview-micro.jpg', 'QuickLook/Preview.jpg']
const OOXML_EXT = /^(docx|docm|dotx|dotm|xlsx|xlsm|xltx|xltm|pptx|pptm|potx|potm|ppsx|ppsm)$/

/** Famille d'une archive d'après son CONTENU (l'extension peut mentir). */
async function zipFamily(zip: ZipArchive, ctx: Ctx): Promise<'docx' | 'xlsx' | 'pptx' | 'odf' | 'iwork' | ''> {
  if (zip.find('word/document.xml')) return 'docx'
  if (zip.find('xl/workbook.xml')) return 'xlsx'
  if (zip.find('ppt/presentation.xml')) return 'pptx'
  if (zip.find('content.xml')) return 'odf'
  if (zip.find('Index/Document.iwa') || IWORK_THUMBS.some((n) => zip.find(n))) return 'iwork'
  // Paquet iWork zippé depuis un dossier (« Rapport.pages/… ») : préfixe commun.
  for (const name of zip.entries.keys()) {
    ctx.check()
    if (/^[^/]+\.(pages|numbers|key)\/(QuickLook\/Thumbnail\.jpg|preview\.jpg|Index\/)/i.test(name)) return 'iwork'
  }
  return ''
}

async function extractZip(bytes: Uint8Array, format: string, ctx: Ctx): Promise<OfficePreview> {
  const zip = new ZipArchive(bytes, ZIP_LIMITS, ctx.signal)
  const family = await zipFamily(zip, ctx)
  const fmt = (f: string): string => (format && officeFormatLabel(format) ? format : f)
  if (family === 'docx') return extractDocx(zip, fmt('docx'), ctx)
  if (family === 'xlsx') return extractXlsx(zip, fmt('xlsx'), ctx)
  if (family === 'pptx') return extractPptx(zip, fmt('pptx'), ctx)
  if (family === 'odf') {
    const mt = zip.find('mimetype') ? ((await zip.readText('mimetype', 256)) ?? '') : ''
    return extractOdfZip(zip, fmt(officeFormatFromMime(mt.trim()) || 'odt'), ctx)
  }
  if (family === 'iwork') {
    const names = [...IWORK_THUMBS]
    for (const name of zip.entries.keys()) {
      if (/\/(QuickLook\/Thumbnail\.jpg|preview\.jpg)$/i.test(name)) names.push(name)
      if (names.length > 16) break
    }
    return finish(fmt('pages'), ctx, undefined, await readThumbnail(zip, names))
  }
  throw new OfficePreviewError('unsupported')
}

/** true si les octets sont un conteneur OLE2/CFB (anciens binaires ou OOXML chiffré). */
function hasOleSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

function mapZipError(error: unknown): unknown {
  if (error instanceof ZipError) return new OfficePreviewError(error.reason)
  if (error instanceof OfficePreviewError) return error
  if (error instanceof DOMException && error.name === 'AbortError') return new OfficePreviewError('aborted')
  return new OfficePreviewError('corrupt', error instanceof Error ? error.message : undefined)
}

/**
 * Extrait l'aperçu d'un document bureautique. `ext` : extension en minuscules sans
 * point ; `mime` : MIME déclaré (peut être vide). Rejette avec OfficePreviewError.
 */
export async function extractOfficePreview(
  bytes: Uint8Array,
  ext: string,
  mime: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<OfficePreview> {
  if (opts?.signal?.aborted) throw new OfficePreviewError('aborted')
  if (bytes.length > OFFICE_LIMITS.maxInputBytes) throw new OfficePreviewError('tooLarge')
  let format = ext.toLowerCase().replace(/^\./, '')
  if (!officeFormatLabel(format)) format = officeFormatFromMime(mime) || format
  if (format === 'rtf') return extractRtfPreview(bytes)
  // §R2 v1.9 — « .key » non ZIP = clé PEM/TLS, pas un Keynote : état neutre, pas « endommagé ».
  if (format === 'key' && !hasZipSignature(bytes)) throw new OfficePreviewError('unsupported')
  if (LEGACY_OFFICE_EXTENSIONS.has(format) && !hasZipSignature(bytes)) return extractLegacyOfficePreview(bytes, format)
  const ctx = new Ctx(opts?.signal, opts?.timeoutMs)
  try {
    if (/^fod[tspg]$/.test(format)) return extractFlatOdf(bytes, format, ctx)
    if (hasZipSignature(bytes)) return await extractZip(bytes, format, ctx)
    // OOXML protégé par mot de passe = conteneur OLE2 « EncryptedPackage ».
    if (hasOleSignature(bytes)) {
      if (OOXML_EXT.test(format)) throw new OfficePreviewError('encrypted')
      return extractLegacyOfficePreview(bytes, format.startsWith('x') ? 'xls' : format.startsWith('p') ? 'ppt' : 'doc')
    }
    if (bytes.length && bytes[0] === 0x7b && format !== 'rtf') {
      // RTF déguisé (extension .doc courante) : on tente l'analyse RTF.
      return extractRtfPreview(bytes)
    }
    throw new OfficePreviewError(bytes.length ? 'corrupt' : 'unsupported')
  } catch (error) {
    throw mapZipError(error)
  }
}
