/**
 * §R2 v1.9 (aperçu bureautique) — lecteur ZIP borné, mini-analyseur XML et extraction
 * OOXML / OpenDocument / iWork. Les archives sont construites en mémoire (zlib).
 */
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseXml, relId, textContent } from '@/lib/officeXml'
import {
  columnIndexOf,
  extractOfficePreview,
  formatCellNumber,
  headingLevelOf,
  imageDataUrl,
  officeCounts,
  officeFormatLabel,
  resolvePartPath
} from '@/lib/officePreview'
import { OfficePreviewError, officeFailureOf } from '@/lib/officeTypes'
import { ZipArchive, ZipError, readZipDirectory } from '@/lib/zipReader'

type Entry = { name: string; data: string | Uint8Array; store?: boolean; flags?: number; fakeSize?: number }

/** Écrivain ZIP minimal (sans CRC vérifié : le lecteur ne le contrôle pas). */
function makeZip(entries: Entry[]): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const raw = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : Buffer.from(e.data)
    const body = e.store ? raw : deflateRawSync(raw)
    const name = Buffer.from(e.name, 'utf8')
    const method = e.store ? 0 : 8
    const size = e.fakeSize ?? raw.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(e.flags ?? 0, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(e.flags ?? 0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, body)
    centrals.push(central, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]))
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

describe('zipReader', () => {
  it('lit des entrées stockées et compressées', async () => {
    const zip = new ZipArchive(makeZip([{ name: 'a.txt', data: 'bonjour', store: true }, { name: 'dir\\b.xml', data: '<x>é</x>' }]))
    expect(await zip.readText('a.txt')).toBe('bonjour')
    expect(await zip.readText('dir/b.xml')).toBe('<x>é</x>')
    expect(zip.find('DIR/B.XML')).toBe('dir/b.xml')
    expect(await zip.read('absent')).toBeNull()
  })

  it('refuse les entrées chiffrées, les archives corrompues et trop d’entrées', async () => {
    const zip = new ZipArchive(makeZip([{ name: 'x', data: 'secret', flags: 1 }]))
    await expect(zip.read('x')).rejects.toMatchObject({ reason: 'encrypted' })
    expect(() => readZipDirectory(new Uint8Array(40))).toThrow(ZipError)
    const many = makeZip(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, data: '' })))
    expect(() => readZipDirectory(many, { maxEntries: 4, maxTotalInflated: 1e6, maxEntryBytes: 1e6 })).toThrow(/tooLarge/)
  })

  it('arrête une bombe de décompression malgré une taille déclarée mensongère', async () => {
    const bomb = makeZip([{ name: 'bomb.xml', data: new Uint8Array(3_000_000), fakeSize: 10 }])
    const zip = new ZipArchive(bomb, { maxEntries: 10, maxTotalInflated: 1_000_000, maxEntryBytes: 500_000 })
    await expect(zip.read('bomb.xml')).rejects.toMatchObject({ reason: 'tooLarge' })
  })

  it('applique le budget total sur plusieurs lectures', async () => {
    const data = new Uint8Array(400)
    const zip = new ZipArchive(makeZip([{ name: 'a', data }, { name: 'b', data }, { name: 'c', data }]), {
      maxEntries: 10,
      maxTotalInflated: 1000,
      maxEntryBytes: 1000
    })
    await zip.read('a')
    await zip.read('b')
    await expect(zip.read('c')).rejects.toMatchObject({ reason: 'tooLarge' })
  })

  it('readPrefix : préfixe borné au lieu d\'un refus (deflate et stockée), budget total épuisé → refus', async () => {
    const big = new Uint8Array(3_000_000).fill(65)
    const limits = { maxEntries: 10, maxTotalInflated: 1_200_000, maxEntryBytes: 500_000 }
    const zip = new ZipArchive(makeZip([{ name: 'd', data: big, fakeSize: 10 }, { name: 's', data: big, store: true }, { name: 'e', data: 'ok' }]), limits)
    await expect(zip.read('d')).rejects.toMatchObject({ reason: 'tooLarge' })
    const d = await zip.readPrefix('d')
    expect(d?.data.length).toBe(500_000)
    expect(d?.cut).toBe(true)
    const s = await zip.readPrefix('s', 1000)
    expect(s).toMatchObject({ cut: true })
    expect(s?.data.length).toBe(1000)
    expect(await zip.readPrefix('e')).toMatchObject({ cut: false })
    expect(zip.remaining).toBe(1_200_000 - 501_002)
    await zip.readPrefix('d')
    await zip.readPrefix('d')
    expect(zip.remaining).toBe(0)
    await expect(zip.readPrefix('e')).rejects.toMatchObject({ reason: 'tooLarge' })
  })
})

describe('officeXml', () => {
  it('analyse éléments, attributs, entités et ignore la DTD', () => {
    const { root } = parseXml(
      '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "BOOM">]><w:doc a:k="1" k="2"><w:t>A &amp; B &#233;&a;</w:t><![CDATA[<b>]]><e/></w:doc>'
    )
    expect(root.name).toBe('doc')
    expect(root.attrs.k).toBe('1')
    expect(textContent(root)).toBe('A & B é&a;<b>')
  })

  it('plafonne le nombre de nœuds', () => {
    const r = parseXml(`<r>${'<i/>'.repeat(100)}</r>`, 10)
    expect(r.truncated).toBe(true)
    expect(() => parseXml('pas de xml')).toThrow()
  })

  it('garde id ET r:id sur le même élément (sldId PowerPoint) ; relId préfère r:id', () => {
    const { root } = parseXml('<p:sldIdLst><p:sldId id="256" r:id="rId2"/><x:e rel:id="rId9"/><y id="7"/></p:sldIdLst>')
    const [sld, e, y] = root.children as Array<{ attrs: Record<string, string>; name: string; children: [] }>
    expect(sld.attrs.id).toBe('256')
    expect(sld.attrs['r:id']).toBe('rId2')
    expect(relId(sld)).toBe('rId2')
    expect(relId(e)).toBe('rId9')
    expect(relId(y)).toBe('7')
  })

  it('reste linéaire sur des entrées hostiles (fermantes orphelines, <!x>, attributs)', () => {
    const t0 = Date.now()
    const deep = parseXml(`<r>${'<a>'.repeat(100_000)}${'</b>'.repeat(100_000)}</r>`)
    expect(deep.root.name).toBe('r')
    parseXml(`<r>${'<!x>'.repeat(400_000)}</r>`)
    parseXml(`<r ${'a'.repeat(2_000_000)}/>`)
    parseXml(`<r>${'<a b="1" c="2"/>'.repeat(50_000)}</r>`)
    expect(Date.now() - t0).toBeLessThan(3000)
  })

  it('budget de travail et rappel check() dans la boucle', () => {
    const r = parseXml(`<r>${'</z>'.repeat(1000)}</r>`, 100)
    expect(r.truncated).toBe(true)
    let calls = 0
    expect(() =>
      parseXml(`<r>${'<i/>'.repeat(20_000)}</r>`, undefined, () => {
        if (++calls > 2) throw new Error('timeout')
      })
    ).toThrow('timeout')
  })
})

describe('helpers', () => {
  it('résout chemins, colonnes, nombres, titres et libellés', () => {
    expect(resolvePartPath('xl', 'worksheets/sheet1.xml')).toBe('xl/worksheets/sheet1.xml')
    expect(resolvePartPath('ppt', '/ppt/slides/s.xml')).toBe('ppt/slides/s.xml')
    expect(resolvePartPath('xl/a', '../b.xml')).toBe('xl/b.xml')
    expect(columnIndexOf('A1')).toBe(0)
    expect(columnIndexOf('AB12')).toBe(27)
    expect(formatCellNumber('0.30000000000000004')).toBe('0.3')
    expect(headingLevelOf('heading 2')).toBe(2)
    expect(headingLevelOf('Titre1')).toBe(1)
    expect(headingLevelOf('Normal')).toBe(0)
    expect(officeFormatLabel('ODS')).toBe('Calc')
    expect(officeFormatLabel('key')).toBe('Keynote')
    expect(imageDataUrl(PNG)).toMatch(/^data:image\/png;base64,/)
    expect(imageDataUrl(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })
})

describe('OOXML', () => {
  it('docx : titres, paragraphes, tableau, sauts, titre et miniature', async () => {
    const doc = `<w:document ${W}><w:body>
      <w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:r><w:t>Chapitre</w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve">Ligne </w:t></w:r><w:r><w:br/><w:t>deux</w:t><w:delText>X</w:delText></w:r></w:p>
      <w:p/>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>`
    const styles = `<w:styles ${W}><w:style w:styleId="Titre1"><w:name w:val="heading 1"/></w:style></w:styles>`
    const core = '<cp:coreProperties xmlns:dc="x"><dc:title>Mon rapport</dc:title></cp:coreProperties>'
    const bytes = makeZip([
      { name: 'word/document.xml', data: doc },
      { name: 'word/styles.xml', data: styles },
      { name: 'docProps/core.xml', data: core },
      { name: 'docProps/thumbnail.png', data: PNG, store: true }
    ])
    const p = await extractOfficePreview(bytes, 'docx', '')
    expect(p.format).toBe('docx')
    expect(p.title).toBe('Mon rapport')
    expect(p.thumbnail).toMatch(/^data:image\/png/)
    expect(p.blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Chapitre' },
      { kind: 'paragraph', text: 'Ligne\ndeux' },
      { kind: 'table', rows: [['a', 'b']] }
    ])
    expect(officeCounts(p)).toEqual({ paragraphs: 2, tables: 1, slides: 0 })
  })

  it('xlsx : feuilles visibles, chaînes partagées, inline, nombres, booléens', async () => {
    const bytes = makeZip([
      { name: 'xl/workbook.xml', data: '<workbook xmlns:r="r"><sheets><sheet name="Données" sheetId="1" r:id="rId1"/><sheet name="Cachée" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>' },
      { name: 'xl/sharedStrings.xml', data: '<sst><si><t>Nom</t></si><si><r><t>Va</t></r><r><t>leur</t></r><rPh><t>x</t></rPh></si></sst>' },
      {
        name: 'xl/worksheets/sheet1.xml',
        data: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>x</t></is></c><c r="B2"><v>0.1</v></c><c r="C2" t="b"><v>1</v></c></row></sheetData></worksheet>'
      }
    ])
    const p = await extractOfficePreview(bytes, 'xlsx', '')
    expect(p.blocks).toEqual([{ kind: 'table', name: 'Données', rows: [['Nom', '', 'Valeur'], ['x', '0.1', 'TRUE']] }])
  })

  it('pptx : ordre des diapositives et titres', async () => {
    const slide = (title: string, body: string): string =>
      `<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    const bytes = makeZip([
      { name: 'ppt/presentation.xml', data: '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>' },
      { name: 'ppt/_rels/presentation.xml.rels', data: '<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>' },
      { name: 'ppt/slides/slide1.xml', data: slide('Un', 'corps un') },
      { name: 'ppt/slides/slide2.xml', data: slide('Deux', 'corps deux') }
    ])
    const p = await extractOfficePreview(bytes, 'pptx', '')
    expect(p.blocks).toEqual([
      { kind: 'slide', index: 1, title: 'Deux', texts: ['corps deux'] },
      { kind: 'slide', index: 2, title: 'Un', texts: ['corps un'] }
    ])
  })

  it('xlsx > maxRows : feuille affichée coupée à 200 lignes (pas perdue), feuilles suivantes lues', async () => {
    const rows = Array.from({ length: 300 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join('')
    const bytes = makeZip([
      { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="Grande" sheetId="1" r:id="rId1"/><sheet name="Petite" sheetId="2" r:id="rId2"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>' },
      { name: 'xl/worksheets/sheet1.xml', data: `<worksheet><sheetData>${rows}</sheetData></worksheet>` },
      { name: 'xl/worksheets/sheet2.xml', data: '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ok</t></is></c></row></sheetData></worksheet>' }
    ])
    const p = await extractOfficePreview(bytes, 'xlsx', '')
    expect(p.truncated).toBe(true)
    expect(p.warnings).toContain('file.office.truncated')
    expect(p.blocks).toHaveLength(2)
    const big = p.blocks[0]
    expect(big.kind === 'table' && big.rows.length).toBe(200)
    expect(p.blocks[1]).toEqual({ kind: 'table', name: 'Petite', rows: [['ok']] })
  })

  it('« .key » non ZIP (clé PEM) → « non pris en charge », jamais « endommagé »', async () => {
    const pem = new TextEncoder().encode('-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n')
    await expect(extractOfficePreview(pem, 'key', '')).rejects.toMatchObject({ reason: 'unsupported' })
  })

  it('xlsx : feuille XML > 8 Mo (40 000 lignes) → aperçu tronqué des premières lignes, pas de refus', async () => {
    const rows = Array.from({ length: 40_000 }, (_, i) => {
      const r = i + 1
      return `<row r="${r}">${'ABCDEFGHIJ'.split('').map((c) => `<c r="${c}${r}" t="inlineStr"><is><t>valeur ${c}${r}</t></is></c>`).join('')}</row>`
    }).join('')
    const sheet = `<worksheet><sheetData>${rows}</sheetData></worksheet>`
    expect(sheet.length).toBeGreaterThan(8 * 1024 * 1024)
    const bytes = makeZip([
      { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="Grande" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: 'xl/worksheets/sheet1.xml', data: sheet }
    ])
    expect(bytes.length).toBeLessThan(25 * 1024 * 1024)
    const p = await extractOfficePreview(bytes, 'xlsx', '')
    expect(p.truncated).toBe(true)
    const t = p.blocks[0]
    expect(t.kind === 'table' && t.rows.length).toBe(200)
    expect(t.kind === 'table' && t.rows[0][0]).toBe('valeur A1')
  })

  it('docx : tableau > maxRows coupé puis suite lue ; XML partiel (trop de nœuds) → premiers blocs gardés', async () => {
    const tr = '<w:tr><w:tc><w:p><w:r><w:t>c</w:t></w:r></w:p></w:tc></w:tr>'
    const doc = `<w:document ${W}><w:body><w:tbl>${tr.repeat(300)}</w:tbl><w:p><w:r><w:t>après</w:t></w:r></w:p></w:body></w:document>`
    const p = await extractOfficePreview(makeZip([{ name: 'word/document.xml', data: doc }]), 'docx', '')
    expect(p.truncated).toBe(true)
    expect(p.blocks).toHaveLength(2)
    expect(p.blocks[0].kind === 'table' && p.blocks[0].rows.length).toBe(200)
    expect(p.blocks[1]).toEqual({ kind: 'paragraph', text: 'après' })
    const para = '<w:p><w:r><w:t>x</w:t></w:r></w:p>'
    const huge = `<w:document ${W}><w:body>${para.repeat(140_000)}</w:body></w:document>`
    const q = await extractOfficePreview(makeZip([{ name: 'word/document.xml', data: huge }]), 'docx', '')
    expect(q.truncated).toBe(true)
    expect(q.blocks.length).toBeGreaterThan(100)
  })

  it('OOXML chiffré (conteneur OLE2) → encrypted ; archive vide → corrupt', async () => {
    const ole = new Uint8Array(512)
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    await expect(extractOfficePreview(ole, 'docx', '')).rejects.toMatchObject({ reason: 'encrypted' })
    await expect(extractOfficePreview(new Uint8Array([1, 2, 3]), 'xlsx', '')).rejects.toMatchObject({ reason: 'corrupt' })
    await expect(extractOfficePreview(makeZip([{ name: 'x', data: 'y' }]), 'docx', '')).rejects.toBeInstanceOf(OfficePreviewError)
    expect(officeFailureOf(new OfficePreviewError('timeout'))).toBe('timeout')
  })

  it('annulation → aborted', async () => {
    const ctl = new AbortController()
    ctl.abort()
    await expect(extractOfficePreview(makeZip([]), 'docx', '', { signal: ctl.signal })).rejects.toMatchObject({ reason: 'aborted' })
  })
})

describe('OpenDocument et iWork', () => {
  const content = (body: string): string =>
    `<office:document-content xmlns:office="o" xmlns:text="t" xmlns:table="tb"><office:body>${body}</office:body></office:document-content>`

  it('odt : titres, paragraphes (text:s), listes, tableau, miniature, titre', async () => {
    const bytes = makeZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.text', store: true },
      {
        name: 'content.xml',
        data: content(
          '<office:text><text:h text:outline-level="2">Partie</text:h><text:p>a<text:s text:c="2"/>b<text:note><text:p>note</text:p></text:note></text:p><text:list><text:list-item><text:p>item</text:p></text:list-item></text:list><table:table><table:table-row><table:table-cell><text:p>c1</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"><text:p>c2</text:p></table:table-cell></table:table-row></table:table></office:text>'
        )
      },
      { name: 'meta.xml', data: '<office:document-meta><office:meta><dc:title>Note</dc:title></office:meta></office:document-meta>' },
      { name: 'Thumbnails/thumbnail.png', data: PNG, store: true }
    ])
    const p = await extractOfficePreview(bytes, 'odt', '')
    expect(p.title).toBe('Note')
    expect(p.thumbnail).toMatch(/^data:image\/png/)
    expect(p.blocks).toEqual([
      { kind: 'heading', level: 2, text: 'Partie' },
      { kind: 'paragraph', text: 'a  b' },
      { kind: 'paragraph', text: '• item' },
      { kind: 'table', rows: [['c1', 'c2', 'c2']] }
    ])
  })

  it('ods : répétitions énormes bornées, lignes vides ignorées', async () => {
    const sheet =
      '<office:spreadsheet><table:table table:name="F1"><table:table-row><table:table-cell office:value="3"><text:p>3</text:p></table:table-cell><table:table-cell table:number-columns-repeated="16384"/></table:table-row><table:table-row table:number-rows-repeated="1048000"><table:table-cell/></table:table-row></table:table></office:spreadsheet>'
    const p = await extractOfficePreview(makeZip([{ name: 'content.xml', data: content(sheet) }]), 'ods', '')
    expect(p.blocks).toEqual([{ kind: 'table', name: 'F1', rows: [['3']] }])
  })

  it('odp : pages, titres de cadre, notes ignorées', async () => {
    const pres =
      '<office:presentation><draw:page draw:name="p1"><draw:frame presentation:class="title"><draw:text-box><text:p>Titre</text:p></draw:text-box></draw:frame><draw:frame><draw:text-box><text:p>Texte</text:p></draw:text-box></draw:frame><presentation:notes><text:p>secret</text:p></presentation:notes></draw:page></office:presentation>'
    const p = await extractOfficePreview(makeZip([{ name: 'content.xml', data: content(pres) }]), 'odp', '')
    expect(p.blocks).toEqual([{ kind: 'slide', index: 1, title: 'Titre', texts: ['Texte'] }])
  })

  it('ODF chiffré → encrypted ; ODF plat analysé directement', async () => {
    const enc = makeZip([
      { name: 'META-INF/manifest.xml', data: '<manifest:manifest><manifest:file-entry><manifest:encryption-data/></manifest:file-entry></manifest:manifest>' },
      { name: 'content.xml', data: 'binaire' }
    ])
    await expect(extractOfficePreview(enc, 'odt', '')).rejects.toMatchObject({ reason: 'encrypted' })
    const flat = new TextEncoder().encode(
      '<office:document><office:meta><dc:title>Plat</dc:title></office:meta><office:body><office:text><text:p>ok</text:p></office:text></office:body></office:document>'
    )
    const p = await extractOfficePreview(flat, 'fodt', '')
    expect(p).toMatchObject({ format: 'fodt', title: 'Plat', blocks: [{ kind: 'paragraph', text: 'ok' }] })
  })

  it('iWork : miniature QuickLook seulement ; format par MIME si extension absente', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0])
    const p = await extractOfficePreview(makeZip([{ name: 'QuickLook/Thumbnail.jpg', data: jpeg, store: true }]), 'key', '')
    expect(p.format).toBe('key')
    expect(p.thumbnail).toMatch(/^data:image\/jpeg/)
    expect(p.blocks).toEqual([])
    const docx = makeZip([{ name: 'word/document.xml', data: `<w:document ${W}><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>` }])
    const q = await extractOfficePreview(docx, '', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(q.format).toBe('docx')
  })
})
