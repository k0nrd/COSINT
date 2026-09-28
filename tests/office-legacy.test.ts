/**
 * §R2 v1.9 (aperçu bureautique) — anciens formats : RTF et binaires OLE2/CFB
 * (doc, xls, ppt). Les fixtures sont construites à la main (CFB minimal en mémoire).
 */
import { describe, expect, it } from 'vitest'
import {
  CompoundFile,
  LEGACY_APPROXIMATE_WARNING,
  decodeRk,
  extractLegacyOfficePreview,
  extractRtfPreview,
  heuristicText
} from '@/lib/legacyOffice'
import { OfficePreviewError, officeFailureOf, type OfficePreview } from '@/lib/officeTypes'

const END = 0xfffffffe
const FREE = 0xffffffff
const SECT = 512

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)
const utf16 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length * 2)
  for (let i = 0; i < s.length; i++) {
    out[i * 2] = s.charCodeAt(i) & 0xff
    out[i * 2 + 1] = s.charCodeAt(i) >> 8
  }
  return out
}
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
const le = (bytes: number, v: number): Uint8Array => {
  const out = new Uint8Array(bytes)
  for (let i = 0; i < bytes; i++) out[i] = Math.floor(v / 2 ** (8 * i)) & 0xff
  return out
}

/** CFB v3 minimal : flux < 4096 o dans le mini-flux, les autres en secteurs normaux. */
function buildCfb(streams: { name: string; data: Uint8Array }[]): Uint8Array {
  const pad = (b: Uint8Array, n: number): Uint8Array => concat(b, new Uint8Array((n - (b.length % n)) % n))
  const minis = streams.filter((s) => s.data.length < 4096)
  const bigs = streams.filter((s) => s.data.length >= 4096)
  // Mini-flux + mini-FAT.
  const miniFat: number[] = []
  const miniStart = new Map<string, number>()
  const miniParts: Uint8Array[] = []
  for (const s of minis) {
    const count = Math.ceil(s.data.length / 64)
    miniStart.set(s.name, count ? miniFat.length : END)
    for (let i = 0; i < count; i++) miniFat.push(i === count - 1 ? END : miniFat.length + 1)
    miniParts.push(pad(s.data, 64))
  }
  const miniStream = pad(concat(...miniParts), SECT)
  const miniFatBytes = pad(concat(...miniFat.map((v) => le(4, v))), SECT)
  const dirCount = streams.length + 1
  const dirSectors = Math.ceil(dirCount / 4)
  const bigSectors = bigs.map((s) => Math.ceil(s.data.length / SECT))
  const others = dirSectors + miniFatBytes.length / SECT + miniStream.length / SECT + bigSectors.reduce((a, b) => a + b, 0)
  let nFat = 1
  while (nFat * 128 < others + nFat) nFat++
  const fat = new Array<number>(nFat * 128).fill(FREE)
  for (let i = 0; i < nFat; i++) fat[i] = 0xfffffffd
  let next = nFat
  const alloc = (count: number): number => {
    if (!count) return END
    const start = next
    for (let i = 0; i < count; i++) fat[next + i] = i === count - 1 ? END : next + i + 1
    next += count
    return start
  }
  const dirStart = alloc(dirSectors)
  const miniFatStart = alloc(miniFatBytes.length / SECT)
  const miniStreamStart = alloc(miniStream.length / SECT)
  const bigStart = bigSectors.map((n) => alloc(n))
  const entry = (name: string, type: number, start: number, size: number, child: number, right: number): Uint8Array => {
    const e = new Uint8Array(128)
    e.set(utf16(name).subarray(0, 62))
    e.set(le(2, (Math.min(name.length, 31) + 1) * 2), 64)
    e[66] = type
    e.set(le(4, FREE), 68)
    e.set(le(4, right), 72)
    e.set(le(4, child), 76)
    e.set(le(4, start), 116)
    e.set(le(4, size), 120)
    return e
  }
  const entries = [entry('Root Entry', 5, miniStream.length ? miniStreamStart : END, miniStream.length, streams.length ? 1 : FREE, FREE)]
  streams.forEach((s, i) => {
    const start = s.data.length < 4096 ? (miniStart.get(s.name) as number) : bigStart[bigs.indexOf(s)]
    entries.push(entry(s.name, 2, start, s.data.length, FREE, i + 2 <= streams.length ? i + 2 : FREE))
  })
  const dir = pad(concat(...entries), SECT)
  const header = new Uint8Array(SECT)
  header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  header.set(le(2, 0x3e), 0x18)
  header.set(le(2, 3), 0x1a)
  header.set(le(2, 0xfffe), 0x1c)
  header.set(le(2, 9), 0x1e)
  header.set(le(2, 6), 0x20)
  header.set(le(4, nFat), 0x2c)
  header.set(le(4, dirStart), 0x30)
  header.set(le(4, 4096), 0x38)
  header.set(le(4, miniFatStart), 0x3c)
  header.set(le(4, miniFatBytes.length / SECT), 0x40)
  header.set(le(4, END), 0x44)
  for (let i = 0; i < 109; i++) header.set(le(4, i < nFat ? i : FREE), 0x4c + i * 4)
  const fatBytes = concat(...fat.map((v) => le(4, v)))
  const bigData = bigs.map((s) => pad(s.data, SECT))
  return concat(header, fatBytes, dir, miniFatBytes, miniStream, ...bigData)
}

/** WordDocument + 1Table : une pièce 8 bits puis une pièce UTF-16. */
function buildDoc(opts: { encrypted?: boolean; badIdent?: boolean } = {}): Uint8Array {
  const piece1 = 'Bonjour\rCafé '
  const piece2 = 'Zdzisław \u0013 HYPERLINK "x" \u0014lien\u0015\rA1\u0007B1\u0007\u0007A2\u0007B2\u0007\u0007Fin\r'
  const wd = new Uint8Array(4608)
  const dv = new DataView(wd.buffer)
  dv.setUint16(0, opts.badIdent ? 0x1234 : 0xa5ec, true)
  dv.setUint16(0x0a, 0x0200 | (opts.encrypted ? 0x0100 : 0), true)
  let p = 32
  dv.setUint16(p, 14, true) // csw
  p += 2 + 28
  dv.setUint16(p, 22, true) // cslw
  const rgLw = p + 2
  dv.setUint32(rgLw + 12, piece1.length + piece2.length, true) // ccpText
  p = rgLw + 88
  dv.setUint16(p, 93, true) // cbRgFcLcb
  const rg = p + 2
  // Texte : 8 bits à 0x800, UTF-16 à 0x900 ; « Texte caché important » pour le repli heuristique.
  wd.set(Uint8Array.from(piece1, (c) => c.charCodeAt(0)), 0x800)
  wd.set(utf16(piece2), 0x900)
  wd.set(utf16('Texte caché important'), 0xe00)
  const clx = concat(
    Uint8Array.of(0x01), le(2, 2), Uint8Array.of(0, 0), // un Prc à ignorer
    Uint8Array.of(0x02), le(4, 4 * 3 + 8 * 2),
    le(4, 0), le(4, piece1.length), le(4, piece1.length + piece2.length),
    le(2, 0), le(4, (0x800 * 2) | 0x40000000), le(2, 0),
    le(2, 0), le(4, 0x900), le(2, 0)
  )
  const table = concat(new Uint8Array(16), clx)
  dv.setUint32(rg + 33 * 8, 16, true)
  dv.setUint32(rg + 33 * 8 + 4, clx.length, true)
  return buildCfb([
    { name: 'WordDocument', data: wd },
    { name: '1Table', data: table },
    { name: '\u0005SummaryInformation', data: summaryInfo('Rapport annuel') }
  ])
}

/** Flux de propriétés avec PIDSI_TITLE (VT_LPSTR, code page 1252). */
function summaryInfo(title: string): Uint8Array {
  const str = concat(ascii(title), Uint8Array.of(0))
  const props = concat(le(4, 2), le(2, 1252), le(2, 0), le(4, 30), le(4, str.length), str)
  const section = concat(le(4, 8 + 16 + props.length), le(4, 2), le(4, 1), le(4, 24), le(4, 2), le(4, 24 + 8), props)
  return concat(le(2, 0xfffe), le(2, 0), le(4, 0), new Uint8Array(16), le(4, 1), new Uint8Array(16), le(4, 48), section)
}

const rec = (type: number, data: Uint8Array): Uint8Array => concat(le(2, type), le(2, data.length), data)

/** Classeur BIFF8 : SST (dont une chaîne coupée par CONTINUE), une feuille. */
function buildXls(opts: { encrypted?: boolean } = {}): Uint8Array {
  const bof = (dt: number): Uint8Array => rec(0x0809, concat(le(2, 0x0600), le(2, dt), new Uint8Array(12)))
  const sheetName = concat(Uint8Array.of(6, 0), ascii('Ventes'))
  const sstStr1 = concat(le(2, 3), Uint8Array.of(0), ascii('Nom'))
  // « Łódź » : 2 caractères UTF-16 ici, la suite dans CONTINUE (octet d'options relu).
  const sstStr2a = concat(le(2, 4), Uint8Array.of(1), utf16('Łó'))
  const sstCont = concat(Uint8Array.of(1), utf16('dź'))
  const sst = concat(rec(0x00fc, concat(le(4, 2), le(4, 2), sstStr1, sstStr2a)), rec(0x003c, sstCont))
  const globalsHead = concat(bof(0x0005), opts.encrypted ? rec(0x002f, new Uint8Array(6)) : new Uint8Array(0))
  const boundsheetLen = 4 + 4 + 2 + sheetName.length
  const globalsLen = globalsHead.length + boundsheetLen + sst.length + 4
  const cell = (r: number, c: number): Uint8Array => concat(le(2, r), le(2, c), le(2, 0))
  const num = new Uint8Array(8)
  new DataView(num.buffer).setFloat64(0, 3.5, true)
  const sheet = concat(
    bof(0x0010),
    rec(0x00fd, concat(cell(0, 0), le(4, 0))),
    rec(0x00fd, concat(cell(0, 1), le(4, 1))),
    rec(0x0203, concat(cell(1, 0), num)),
    rec(0x027e, concat(cell(1, 1), le(4, (42 << 2) | 2))),
    rec(0x00bd, concat(le(2, 2), le(2, 0), le(2, 0), le(4, (7 << 2) | 2), le(2, 0), le(4, (1234 << 2) | 3), le(2, 1))),
    rec(0x0204, concat(cell(3, 0), le(2, 5), Uint8Array.of(0), ascii('Total'))),
    rec(0x000a, new Uint8Array(0))
  )
  const boundsheet = rec(0x0085, concat(le(4, globalsLen), Uint8Array.of(0, 0), sheetName))
  const wb = concat(globalsHead, boundsheet, sst, rec(0x000a, new Uint8Array(0)), sheet)
  return buildCfb([{ name: 'Workbook', data: wb }])
}

/** « PowerPoint Document » : SlideListWithText (2 diapositives, atomes UTF-16 et 8 bits). */
function buildPpt(opts: { encrypted?: boolean } = {}): Uint8Array {
  const atom = (type: number, data: Uint8Array, inst = 0): Uint8Array => concat(le(2, inst << 4), le(2, type), le(4, data.length), data)
  const cont = (type: number, kids: Uint8Array[], inst = 0): Uint8Array => {
    const body = concat(...kids)
    return concat(le(2, (inst << 4) | 0x0f), le(2, type), le(4, body.length), body)
  }
  const list = cont(0x0ff0, [
    atom(0x03f3, new Uint8Array(20)),
    atom(0x0f9f, le(4, 0)),
    atom(0x0fa0, utf16('Plan d’action')),
    atom(0x0f9f, le(4, 1)),
    atom(0x0fa8, Uint8Array.from('Point un\rPoint deux été', (c) => c.charCodeAt(0))),
    atom(0x03f3, new Uint8Array(20)),
    atom(0x0f9f, le(4, 6)),
    atom(0x0fa0, utf16('Conclusion'))
  ])
  const extra = opts.encrypted ? [cont(0x2f14, [atom(0x0fa0, utf16('x'))])] : []
  const doc = cont(0x03e8, [atom(0x03e9, new Uint8Array(40)), list, ...extra])
  return buildCfb([{ name: 'PowerPoint Document', data: doc }, { name: 'Current User', data: new Uint8Array(20) }])
}

const reasonOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (err) {
    return officeFailureOf(err)
  }
  return 'ok'
}
const paragraphs = (p: OfficePreview): string[] => p.blocks.flatMap((b) => (b.kind === 'paragraph' ? [b.text] : []))
const tables = (p: OfficePreview): string[][][] => p.blocks.flatMap((b) => (b.kind === 'table' ? [b.rows] : []))

describe('§R2 v1.9 — RTF', () => {
  const rtf = (s: string): OfficePreview => extractRtfPreview(ascii(s))

  it('extrait paragraphes, accents (\\\'hh et \\u), titre et tableau ; ignore tables et images', () => {
    const p = rtf(
      "{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}" +
        '{\\info{\\title Mon titre}{\\author Quelqu\'un}}{\\*\\generator Outil 1.0;}' +
        "\\pard Caf\\'e9 cr\\u232?me\\par Deuxi\\'e8me\\line ligne\\par{\\pict\\pngblip 89504e470d0a}" +
        '\\pard\\intbl A1\\cell B1\\cell\\row\\pard\\intbl A2\\cell B2\\cell\\row\\pard Fin\\par}'
    )
    expect(p.format).toBe('rtf')
    expect(p.title).toBe('Mon titre')
    expect(paragraphs(p)).toEqual(['Café crème', 'Deuxième\nligne', 'Fin'])
    expect(tables(p)).toEqual([[['A1', 'B1'], ['A2', 'B2']]])
    expect(JSON.stringify(p)).not.toMatch(/Arial|Outil|89504e|Quelqu/)
    expect(p.warnings).toEqual([])
    expect(p.truncated).toBe(false)
  })

  it('suit la code page \\ansicpg (1251, 1250)', () => {
    expect(paragraphs(rtf("{\\rtf1\\ansi\\ansicpg1251 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2\\par}"))).toEqual(['Привет'])
    expect(paragraphs(rtf("{\\rtf1\\ansi\\ansicpg1250 Zdzis\\'b3aw \\'9c\\par}"))).toEqual(['Zdzisław ś'])
  })

  it('gère \\uc, \\u négatifs (paires de substitution), \\bin et les symboles', () => {
    expect(paragraphs(rtf('{\\rtf1{\\uc2\\u1055??}\\u-10179?\\u-8704?\\par}'))).toEqual(['П😀'])
    expect(paragraphs(rtf('{\\rtf1 A\\bin4 {}}}B\\~C\\{D\\}\\par}'))).toEqual(['AB C{D}'])
  })

  it('refuse ce qui n\'est pas du RTF et borne la profondeur', () => {
    expect(reasonOf(() => rtf('Bonjour'))).toBe('corrupt')
    expect(reasonOf(() => rtf('{\\rtf1 ' + '{'.repeat(1000) + 'x'))).toBe('corrupt')
  })
})

describe('§R2 v1.9 — conteneur OLE2 / CFB', () => {
  it('lit les flux par nom (mini-flux et secteurs normaux)', () => {
    const big = new Uint8Array(5000).map((_, i) => i & 0xff)
    const cfb = new CompoundFile(buildCfb([{ name: 'Petit', data: ascii('abc') }, { name: 'Grand', data: big }]))
    expect(cfb.names().sort()).toEqual(['grand', 'petit'])
    expect(Array.from(cfb.stream('petit') ?? [])).toEqual([97, 98, 99])
    expect(cfb.stream('Grand')).toEqual(big)
    expect(cfb.stream('Absent')).toBeNull()
  })

  it('détecte un cycle dans la FAT', () => {
    const bytes = buildCfb([{ name: 'Grand', data: new Uint8Array(5000) }])
    // Le secteur de répertoire (n° 1, juste après la FAT) pointe sur lui-même.
    new DataView(bytes.buffer).setUint32(SECT + 1 * 4, 1, true)
    expect(reasonOf(() => new CompoundFile(bytes))).toBe('corrupt')
    // L'extraction ne plante pas : repli heuristique ou erreur typée.
    expect(['corrupt', 'ok']).toContain(reasonOf(() => extractLegacyOfficePreview(bytes, 'doc')))
  })

  it('rejette un fichier sans signature et les en-têtes incohérents', () => {
    expect(reasonOf(() => new CompoundFile(new Uint8Array(1024)))).toBe('corrupt')
    const bytes = buildCfb([])
    bytes[0x1e] = 20
    expect(reasonOf(() => new CompoundFile(bytes))).toBe('corrupt')
  })
})

describe('§R2 v1.9 — Word 97-2003 (.doc)', () => {
  it('extrait le texte (pièces 8 bits et UTF-16), les champs épurés, un tableau et le titre', () => {
    const p = extractLegacyOfficePreview(buildDoc(), 'doc')
    expect(p.format).toBe('doc')
    expect(p.title).toBe('Rapport annuel')
    expect(paragraphs(p)).toEqual(['Bonjour', 'Café Zdzisław lien', 'Fin'])
    expect(tables(p)).toEqual([[['A1', 'B1'], ['A2', 'B2']]])
    expect(JSON.stringify(p)).not.toContain('HYPERLINK')
    expect(p.warnings).toEqual([])
  })

  it('document chiffré → erreur typée « encrypted »', () => {
    expect(reasonOf(() => extractLegacyOfficePreview(buildDoc({ encrypted: true }), 'doc'))).toBe('encrypted')
    const pkg = buildCfb([{ name: 'EncryptionInfo', data: new Uint8Array(8) }, { name: 'EncryptedPackage', data: new Uint8Array(8) }])
    expect(reasonOf(() => extractLegacyOfficePreview(pkg, 'doc'))).toBe('encrypted')
  })

  it('FIB illisible → repli heuristique marqué « approximatif »', () => {
    const p = extractLegacyOfficePreview(buildDoc({ badIdent: true }), 'doc')
    expect(p.warnings).toEqual([LEGACY_APPROXIMATE_WARNING])
    expect(paragraphs(p)).toContain('Texte caché important')
  })

  it('RTF renommé en .doc, archive ZIP, fichier opaque', () => {
    const p = extractLegacyOfficePreview(ascii('{\\rtf1 Salut\\par}'), 'doc')
    expect(p.format).toBe('doc')
    expect(paragraphs(p)).toEqual(['Salut'])
    expect(reasonOf(() => extractLegacyOfficePreview(ascii('PK\u0003\u0004xxxx'), 'doc'))).toBe('unsupported')
    expect(reasonOf(() => extractLegacyOfficePreview(new Uint8Array(600), 'doc'))).toBe('corrupt')
    const plain = extractLegacyOfficePreview(ascii('\u0000\u0001Un texte lisible ici\u0000\u0002'), 'doc')
    expect(plain.warnings).toEqual([LEGACY_APPROXIMATE_WARNING])
  })
})

describe('§R2 v1.9 — Excel 97-2003 (.xls)', () => {
  it('lit SST (avec CONTINUE), LABELSST, LABEL, NUMBER, RK et MULRK', () => {
    const p = extractLegacyOfficePreview(buildXls(), 'xls')
    expect(p.blocks).toEqual([
      { kind: 'table', name: 'Ventes', rows: [['Nom', 'Łódź'], ['3.5', '42'], ['7', '12.34'], ['Total', '']] }
    ])
  })

  it('classeur protégé (FILEPASS) → « encrypted »', () => {
    expect(reasonOf(() => extractLegacyOfficePreview(buildXls({ encrypted: true }), 'xls'))).toBe('encrypted')
  })

  it('décode les nombres RK', () => {
    expect(decodeRk((42 << 2) | 2)).toBe(42)
    expect(decodeRk((-5 << 2) | 2)).toBe(-5)
    expect(decodeRk((1234 << 2) | 3)).toBeCloseTo(12.34)
    expect(decodeRk(0x3ff00000)).toBe(1) // 1.0 : 30 bits de poids fort du double
  })
})

describe('§R2 v1.9 — PowerPoint 97-2003 (.ppt)', () => {
  it('produit une diapositive par SlidePersistAtom avec titre et puces', () => {
    const p = extractLegacyOfficePreview(buildPpt(), 'ppt')
    expect(p.blocks).toEqual([
      { kind: 'slide', index: 1, title: 'Plan d’action', texts: ['Point un', 'Point deux été'] },
      { kind: 'slide', index: 2, title: 'Conclusion', texts: [] }
    ])
  })

  it('présentation chiffrée → « encrypted »', () => {
    expect(reasonOf(() => extractLegacyOfficePreview(buildPpt({ encrypted: true }), 'pps'))).toBe('encrypted')
  })
})

describe('§R2 v1.9 — repli heuristique', () => {
  it('récupère les suites UTF-16LE et 8 bits lisibles, dans l\'ordre, sans bruit', () => {
    const bytes = concat(Uint8Array.of(1, 2, 3, 0xff), utf16('Premier texte'), Uint8Array.of(0, 0, 7, 0x05), ascii('Second passage'), Uint8Array.of(0, 0x12, 0x9f, 0x03))
    expect(heuristicText(bytes)).toEqual(['Premier texte', 'Second passage'])
    expect(heuristicText(Uint8Array.from({ length: 4000 }, (_, i) => (i * 7919) % 31))).toEqual([])
  })

  it('les erreurs sont typées', () => {
    expect(new OfficePreviewError('encrypted').reason).toBe('encrypted')
  })
})

describe('§R2 v1.9 — robustesse (octets altérés)', () => {
  it('ne lève jamais autre chose qu\'une OfficePreviewError', () => {
    let seed = 12345
    const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const sources: [Uint8Array, string][] = [[buildDoc(), 'doc'], [buildXls(), 'xls'], [buildPpt(), 'ppt'], [ascii('{\\rtf1\\ansi A\\\'e9\\u233?\\par}'), 'rtf']]
    for (const [src, ext] of sources) {
      for (let round = 0; round < 60; round++) {
        const b = src.slice()
        for (let k = 0; k < 12; k++) b[Math.floor(rand() * b.length)] = Math.floor(rand() * 256)
        try {
          const p = ext === 'rtf' ? extractRtfPreview(b) : extractLegacyOfficePreview(b, ext)
          expect(Array.isArray(p.blocks)).toBe(true)
        } catch (err) {
          expect(err).toBeInstanceOf(OfficePreviewError)
        }
      }
    }
  })
})
