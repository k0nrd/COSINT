/**
 * Tests du bloc de code (§5 v1.6) : sérialisation du langage + contenu (aller-retour
 * Y.Map et .trace), coloration Prism et repli de langage.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { BoardNodeData } from '@/types'
import {
  TRACE_FORMAT,
  TRACE_VERSION,
  parseTrace,
  serializeTrace,
  type TraceFile
} from '@/lib/serialization'
import { nodeToYMap, yMapToNode } from '@/sync/model'
import { CODE_LANGUAGES, codeLanguage, highlightCode } from '@/lib/prism'

const codeNode: BoardNodeData = {
  id: 'c1',
  kind: 'code',
  x: 10,
  y: 20,
  width: 380,
  height: 240,
  content: "function add(a, b) {\n  return a + b // somme\n}\n",
  title: 'add.ts',
  color: '#8a94a6',
  tags: ['snippet'],
  fields: [],
  language: 'typescript',
  createdBy: 'a',
  createdAt: 1,
  updatedBy: 'a',
  updatedAt: 1
}

describe('bloc de code — sérialisation Y.Map (§5 v1.6)', () => {
  it('conserve langage, titre et contenu (indentation) à l’aller-retour', () => {
    const doc = new Y.Doc()
    doc.getMap('nodes').set('c1', nodeToYMap(codeNode))
    const back = yMapToNode('c1', doc.getMap('nodes').get('c1') as Y.Map<unknown>)
    expect(back.kind).toBe('code')
    expect(back.language).toBe('typescript')
    expect(back.title).toBe('add.ts')
    expect(back.content).toBe(codeNode.content)
  })

  it('un bloc de code sans langage explicite retombe sur « plaintext »', () => {
    const doc = new Y.Doc()
    const map = new Y.Map<unknown>()
    map.set('kind', 'code')
    map.set('content', 'x = 1')
    doc.getMap('nodes').set('c2', map)
    const back = yMapToNode('c2', doc.getMap('nodes').get('c2') as Y.Map<unknown>)
    expect(back.language).toBe('plaintext')
  })
})

describe('bloc de code — sérialisation .trace (§5 v1.6)', () => {
  const trace: TraceFile = {
    format: TRACE_FORMAT,
    version: TRACE_VERSION,
    exportedAt: 0,
    meta: {
      title: 'c',
      createdAt: 0,
      createdBy: 'a',
      accessMode: 'open',
      accessLog: [],
      adminId: '',
      participantLimit: 5,
      shareRevocation: ''
    },
    nodes: [codeNode],
    edges: [],
    comments: []
  }

  it('aller-retour serialize → parse à l’identique', () => {
    const parsed = parseTrace(serializeTrace(trace))
    const back = parsed.nodes.find((n) => n.id === 'c1')
    expect(back?.language).toBe('typescript')
    expect(back?.content).toBe(codeNode.content)
    expect(back?.title).toBe('add.ts')
  })
})

describe('coloration Prism (§5 v1.6)', () => {
  it('propose au moins les langages requis', () => {
    const ids = CODE_LANGUAGES.map((l) => l.id)
    for (const required of ['javascript', 'typescript', 'python', 'json', 'sql', 'bash', 'rust', 'plaintext']) {
      expect(ids).toContain(required)
    }
  })

  it('codeLanguage retombe sur « texte brut » pour un id inconnu', () => {
    expect(codeLanguage('inconnu').id).toBe('plaintext')
    expect(codeLanguage(undefined).id).toBe('plaintext')
  })

  it('texte brut : échappe le HTML sans balises de coloration', () => {
    const html = highlightCode('<script>a && b</script>', 'plaintext')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('class="token')
  })

  it('langage connu : produit des jetons colorés (spans token) et échappe le HTML', () => {
    // Régression du correctif prism-markup-templating (§5) : sans lui, le hook php
    // levait et highlightCode retombait sur le texte brut. Ici la coloration DOIT
    // produire des jetons, et le HTML rester échappé (pas d'injection).
    const html = highlightCode('const x = 42 & y < 3', 'javascript')
    expect(html).toContain('class="token')
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;')
    expect(html).not.toContain('<script')
  })

  it('PHP se colore aussi (dépendance markup-templating chargée)', () => {
    const html = highlightCode('<?php echo "hi"; ?>', 'php')
    expect(html).toContain('class="token')
  })
})
