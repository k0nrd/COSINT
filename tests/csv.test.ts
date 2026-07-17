import { describe, it, expect } from 'vitest'
import { detectDelimiter, parseCsv, stringifyCsv, csvCell } from '@/lib/csv'
import { classifyColumn, inferMapping, buildGraph } from '@/lib/csvSchema'
import {
  entitiesToRows,
  exportEntitiesCsv,
  exportEdgesCsv,
  entityColumns,
  edgeColumns,
  exportEntitiesCsvColumns,
  exportEdgesCsvColumns
} from '@/lib/csvExport'

describe('lib/csv — parsing (§1 v1.7)', () => {
  it('détecte le séparateur virgule / point-virgule / tabulation', () => {
    expect(detectDelimiter('a,b,c')).toBe(',')
    expect(detectDelimiter('a;b;c')).toBe(';')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    // Le séparateur entre guillemets ne compte pas.
    expect(detectDelimiter('"a;b",c,d')).toBe(',')
  })

  it('sépare en-tête et lignes, détecte l’en-tête', () => {
    const parsed = parseCsv('nom,email\nAlice,a@ex.com\nBob,b@ex.com')
    expect(parsed.hasHeader).toBe(true)
    expect(parsed.header).toEqual(['nom', 'email'])
    expect(parsed.rows).toEqual([
      ['Alice', 'a@ex.com'],
      ['Bob', 'b@ex.com']
    ])
  })

  it('gère guillemets, séparateur et retour à la ligne échappés', () => {
    const parsed = parseCsv('nom,note\n"Doe, John","ligne 1\nligne 2"\n"a ""b""",x', {
      hasHeader: true
    })
    expect(parsed.rows[0]).toEqual(['Doe, John', 'ligne 1\nligne 2'])
    expect(parsed.rows[1]).toEqual(['a "b"', 'x'])
  })

  it('gère CRLF et point-virgule', () => {
    const parsed = parseCsv('a;b\r\n1;2\r\n', { hasHeader: true })
    expect(parsed.delimiter).toBe(';')
    expect(parsed.rows).toEqual([['1', '2']])
  })

  it('sans en-tête quand la première ligne est numérique', () => {
    const parsed = parseCsv('1,2\n3,4')
    expect(parsed.hasHeader).toBe(false)
    expect(parsed.header).toBeNull()
    expect(parsed.rows).toHaveLength(2)
  })

  it('stringifyCsv échappe et ajoute le BOM', () => {
    const csv = stringifyCsv([['a', 'b,c'], ['x"y', 'z']], { bom: true })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"b,c"')
    expect(csv).toContain('"x""y"')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('csvCell n’entoure que si nécessaire', () => {
    expect(csvCell('simple', ',')).toBe('simple')
    expect(csvCell('a,b', ',')).toBe('"a,b"')
  })
})

describe('lib/csvSchema — heuristiques (§1 v1.7)', () => {
  it('classe les colonnes par nom d’en-tête', () => {
    expect(classifyColumn('E-mail', [])).toMatchObject({ fieldKind: 'email', entityHint: 'email_address' })
    expect(classifyColumn('Téléphone', [])).toMatchObject({ fieldKind: 'phone', entityHint: 'phone_number' })
    expect(classifyColumn('Site web', [])).toMatchObject({ fieldKind: 'url' })
    expect(classifyColumn('Nom complet', [])).toMatchObject({ entityHint: 'person' })
    expect(classifyColumn('Société', [])).toMatchObject({ entityHint: 'company' })
    expect(classifyColumn('Adresse IP', [])).toMatchObject({ entityHint: 'ip' })
    expect(classifyColumn('Date', [])).toMatchObject({ fieldKind: 'date' })
  })

  it('affine par le contenu quand l’en-tête est neutre', () => {
    expect(classifyColumn('valeur', ['a@b.com'])).toMatchObject({ fieldKind: 'email' })
    expect(classifyColumn('valeur', ['https://x.com'])).toMatchObject({ fieldKind: 'url' })
  })

  it('repère source et cible → mode liste de liens', () => {
    const parsed = parseCsv('source,cible,relation\nAlice,Bob,ami\nBob,Carol,collègue', { hasHeader: true })
    const mapping = inferMapping(parsed)
    expect(mapping.sourceColumn).toBe(0)
    expect(mapping.targetColumn).toBe(1)
    const { nodes, edges } = buildGraph(parsed, mapping, 'moi', { x: 0, y: 0 }, 1000)
    // 3 entités distinctes (Alice, Bob, Carol), 2 liens.
    expect(nodes).toHaveLength(3)
    expect(edges).toHaveLength(2)
    expect(edges[0].label === '' || edges[0].label !== undefined).toBe(true)
  })

  it('mode liste d’entités : une entité par ligne, colonnes = champs', () => {
    const parsed = parseCsv('nom,email,téléphone\nAlice,a@ex.com,+33612345678', { hasHeader: true })
    const mapping = inferMapping(parsed)
    const { nodes } = buildGraph(parsed, mapping, 'moi', { x: 0, y: 0 }, 1000)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].entityType).toBe('person')
    expect(nodes[0].title).toBe('Alice')
    // email + téléphone deviennent des champs.
    const kinds = nodes[0].fields.map((f) => f.kind).sort()
    expect(kinds).toContain('email')
    expect(kinds).toContain('phone')
  })

  it('champ multi-valeurs séparé par ;', () => {
    const parsed = parseCsv('nom,email\nAlice,a@ex.com;a2@ex.com', { hasHeader: true })
    const mapping = inferMapping(parsed)
    const { nodes } = buildGraph(parsed, mapping, 'moi', { x: 0, y: 0 }, 1000)
    const emails = nodes[0].fields.filter((f) => f.kind === 'email')
    expect(emails).toHaveLength(2)
  })
})

describe('lib/csv — aller-retour export → import (§1b v1.7)', () => {
  it('reconstruit un schéma cohérent', () => {
    const parsed = parseCsv('nom,email,téléphone\nAlice,a@ex.com,0612345678\nBob,b@ex.com,0698765432', {
      hasHeader: true
    })
    const built = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    // Export puis ré-import.
    const csv = exportEntitiesCsv(built.nodes)
    const reparsed = parseCsv(csv)
    const remapping = inferMapping(reparsed)
    const rebuilt = buildGraph(reparsed, remapping, 'moi', { x: 0, y: 0 }, 2000)
    expect(rebuilt.nodes).toHaveLength(2)
    // Le type et le titre sont préservés (colonnes `type` et `titre`).
    expect(rebuilt.nodes[0].entityType).toBe('person')
    expect(rebuilt.nodes[0].title).toBe('Alice')
    // Les valeurs des champs sont préservées.
    const alice = rebuilt.nodes.find((n) => n.title === 'Alice')!
    expect(alice.fields.some((f) => f.value === 'a@ex.com')).toBe(true)
  })

  it('entitiesToRows : type + titre + champs en colonnes', () => {
    const parsed = parseCsv('nom,email\nAlice,a@ex.com', { hasHeader: true })
    const built = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    const rows = entitiesToRows(built.nodes)
    expect(rows[0].slice(0, 2)).toEqual(['type', 'titre'])
    expect(rows[0]).toContain('email')
    expect(rows[1][0]).toBe('person')
    expect(rows[1][1]).toBe('Alice')
  })
})

describe('lib/csvSchema — non-régression heuristiques (revue v1.7)', () => {
  it('les clés courtes ne piègent plus par sous-chaîne (description/total/zip/photo)', () => {
    // 'de' ⊄ role source ; 'to' ⊄ role target ; 'ip' ⊄ hint ip.
    expect(classifyColumn('description', []).role).toBeUndefined()
    expect(classifyColumn('total', []).role).toBeUndefined()
    expect(classifyColumn('photo', []).role).toBeUndefined()
    expect(classifyColumn('zip', []).entityHint).not.toBe('ip')
    expect(classifyColumn('participant', []).entityHint).not.toBe('ip')
    // Les vrais mots entiers marchent toujours.
    expect(classifyColumn('source', []).role).toBe('source')
    expect(classifyColumn('adresse IP', []).entityHint).toBe('ip')
  })

  it('un CSV d’entités ordinaire ne bascule PAS en mode liens', () => {
    const parsed = parseCsv('nom,description,photo\nAlice,consultante,alice.jpg\nBob,plombier,bob.png', {
      hasHeader: true
    })
    const mapping = inferMapping(parsed)
    expect(mapping.sourceColumn).toBeNull()
    expect(mapping.targetColumn).toBeNull()
    const { nodes } = buildGraph(parsed, mapping, 'moi', { x: 0, y: 0 }, 1000)
    expect(nodes).toHaveLength(2)
    expect(nodes.map((n) => n.title).sort()).toEqual(['Alice', 'Bob'])
  })

  it('edge-list `from,to,type` : le type de relation est conservé', () => {
    const parsed = parseCsv('from,to,type\nAlice,Bob,ami', { hasHeader: true })
    const mapping = inferMapping(parsed)
    expect(mapping.relationColumn).toBe(2)
    const { edges } = buildGraph(parsed, mapping, 'moi', { x: 0, y: 0 }, 1000)
    expect(edges).toHaveLength(1)
    expect(edges[0].relationType).not.toBe('associated')
  })

  it('edge-list avec colonne label : aller-retour du label des liens', () => {
    const parsed = parseCsv('source,cible,relation,label\nAlice,Bob,worksFor,depuis 2019', {
      hasHeader: true
    })
    const mapping = inferMapping(parsed)
    expect(mapping.labelColumn).toBe(3)
    const { edges } = buildGraph(parsed, mapping, 'moi', { x: 0, y: 0 }, 1000)
    expect(edges[0].label).toBe('depuis 2019')
  })

  it('les lignes entièrement vides ne créent pas d’entité fantôme', () => {
    const parsed = parseCsv('nom,email\nAlice,a@ex.com\n,\nBob,b@ex.com', { hasHeader: true })
    const { nodes } = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    expect(nodes).toHaveLength(2)
  })

  it('exportEdgesCsv : le label survit à l’aller-retour', () => {
    const parsed = parseCsv('source,cible,relation,label\nAlice,Bob,worksFor,depuis 2019', {
      hasHeader: true
    })
    const built = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    const csv = exportEdgesCsv(built.nodes, built.edges)
    const reparsed = parseCsv(csv)
    const rebuilt = buildGraph(reparsed, inferMapping(reparsed), 'moi', { x: 0, y: 0 }, 2000)
    expect(rebuilt.edges[0].label).toBe('depuis 2019')
  })
})

describe('lib/csvExport — choix des colonnes (§4 v1.8)', () => {
  it('entityColumns : colonnes structurelles + une par libellé de champ présent', () => {
    const parsed = parseCsv('nom,email\nAlice,a@ex.com', { hasHeader: true })
    const built = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    const columns = entityColumns(built.nodes)
    const ids = columns.map((c) => c.id)
    // Colonnes fixes reproduisant l'export historique + datation + traçabilité.
    expect(ids.slice(0, 2)).toEqual(['type', 'titre'])
    expect(ids).toEqual(expect.arrayContaining(['statut', 'tags', 'event_exact', 'created_by']))
    // Une colonne de champ par libellé présent (ici « email »).
    const emailCol = columns.find((c) => c.header === 'email')
    expect(emailCol?.group).toBe('field')
  })

  it('exportEntitiesCsvColumns : n’exporte QUE les colonnes choisies, dans l’ordre donné', () => {
    const parsed = parseCsv('nom,email\nAlice,a@ex.com', { hasHeader: true })
    const built = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    const all = entityColumns(built.nodes)
    // On garde seulement titre puis type (ordre inversé volontairement).
    const chosen = [all.find((c) => c.id === 'titre')!, all.find((c) => c.id === 'type')!]
    const csv = exportEntitiesCsvColumns(built.nodes, chosen, { bom: false })
    const rows = parseCsv(csv, { hasHeader: false }).rows
    expect(rows[0]).toEqual(['titre', 'type'])
    expect(rows[1]).toEqual(['Alice', 'person'])
    // La colonne email n’a pas été incluse.
    expect(rows[0]).not.toContain('email')
  })

  it('datation d’événement exportée en ISO 8601', () => {
    const parsed = parseCsv('nom,email\nAlice,a@ex.com', { hasHeader: true })
    const built = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    const stamp = Date.UTC(2021, 5, 15, 9, 30)
    const node = { ...built.nodes[0], eventDate: stamp }
    const columns = entityColumns([node]).filter((c) => c.id === 'event_exact')
    const csv = exportEntitiesCsvColumns([node], columns, { bom: false })
    const rows = parseCsv(csv, { hasHeader: false }).rows
    expect(rows[0]).toEqual(['evenement_date_exacte'])
    expect(rows[1][0]).toBe(new Date(stamp).toISOString())
  })

  it('edgeColumns : source, cible, relation, label, statut', () => {
    const parsed = parseCsv('source,cible,relation,label\nAlice,Bob,worksFor,depuis 2019', {
      hasHeader: true
    })
    const built = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    const ids = edgeColumns(built.nodes).map((c) => c.id)
    expect(ids).toEqual(['source', 'cible', 'relation', 'label', 'statut'])
  })

  it('exportEdgesCsvColumns : sous-ensemble de colonnes + séparateur point-virgule', () => {
    const parsed = parseCsv('source,cible,relation,label\nAlice,Bob,worksFor,depuis 2019', {
      hasHeader: true
    })
    const built = buildGraph(parsed, inferMapping(parsed), 'moi', { x: 0, y: 0 }, 1000)
    const cols = edgeColumns(built.nodes).filter((c) => c.id === 'source' || c.id === 'cible')
    const csv = exportEdgesCsvColumns(built.edges, cols, { delimiter: ';', bom: false })
    const rows = parseCsv(csv, { hasHeader: false, delimiter: ';' }).rows
    expect(rows[0]).toEqual(['source', 'cible'])
    expect(rows[1]).toEqual(['Alice', 'Bob'])
  })
})
