/**
 * §3 (v1.8.1) — détection d'information partagée entre entités (suggestion de
 * liaison). Vérifie le rapprochement exact, le rapprochement numérique tolérant
 * (téléphone), l'exclusion du nœud courant et le seuil anti-bruit.
 */
import { describe, expect, it } from 'vitest'
import type { BoardNodeData, EntityField } from '@/types'
import { findValueMatches, normalizeFieldValue } from '@/lib/matching'

function field(label: string, value: string): EntityField {
  return { id: `${label}-${value}`, label, kind: 'text', value, updatedBy: 'moi', updatedAt: 0 }
}

function node(id: string, title: string, fields: EntityField[]): BoardNodeData {
  return {
    id,
    kind: 'entity',
    x: 0,
    y: 0,
    width: 260,
    height: 190,
    content: '',
    title,
    color: '#3b82f6',
    tags: [],
    entityType: 'person',
    fields,
    createdBy: 'moi',
    createdAt: 0,
    updatedBy: 'moi',
    updatedAt: 0
  }
}

describe('§3 — information partagée', () => {
  it('normalizeFieldValue : trim + minuscules + espaces compactés', () => {
    expect(normalizeFieldValue('  Jean   Dupont ')).toBe('jean dupont')
  })

  it('rapproche une valeur exacte présente sur un autre nœud', () => {
    const nodes = [
      node('a', 'Alice', [field('Email', 'contact@exemple.fr')]),
      node('b', 'Bob', [field('Email', 'contact@exemple.fr')])
    ]
    const matches = findValueMatches(nodes, 'contact@exemple.fr', 'b')
    expect(matches.map((m) => m.nodeId)).toEqual(['a'])
    expect(matches[0].label).toBe('Alice')
    expect(matches[0].fieldLabel).toBe('Email')
  })

  it('rapproche un téléphone malgré des séparateurs différents', () => {
    const nodes = [
      node('a', 'Alice', [field('Téléphone', '+33 1 11 11 11 11')]),
      node('b', 'Bob', [field('Téléphone', '+33111111111')])
    ]
    expect(findValueMatches(nodes, '+33111111111', 'b').map((m) => m.nodeId)).toEqual(['a'])
  })

  it('exclut le nœud courant et ignore les valeurs trop courtes', () => {
    const nodes = [
      node('a', 'Alice', [field('Alias', 'zoé')]),
      node('b', 'Bob', [field('Alias', 'zoé')])
    ]
    // « zoé » → 3 caractères < seuil : aucune suggestion (anti-bruit).
    expect(findValueMatches(nodes, 'zoé', 'b')).toHaveLength(0)
    // La recherche exclut toujours le nœud courant.
    expect(findValueMatches(nodes, 'contact@exemple.fr', 'b')).toHaveLength(0)
  })

  it('aucune correspondance quand la valeur est unique', () => {
    const nodes = [
      node('a', 'Alice', [field('Email', 'a@exemple.fr')]),
      node('b', 'Bob', [field('Email', 'b@exemple.fr')])
    ]
    expect(findValueMatches(nodes, 'b@exemple.fr', 'b')).toHaveLength(0)
  })
})
