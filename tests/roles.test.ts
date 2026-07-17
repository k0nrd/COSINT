/**
 * Tests des rôles et du filtrage à la réception (§6 v1.4, livrable §7.4).
 * Couvre : décision d'autorisation pure, et révocation effective d'une
 * transaction DISTANTE émise par un pair au rôle insuffisant (un client officiel
 * refuse d'INTÉGRER la modification, pas seulement de l'émettre).
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { BoardHandle } from '@/sync/BoardDoc'
import { permitsWrite, installRoleGuard } from '@/sync/roleGuard'
import { getMetaMap, getNodesMap, getRolesMap, effectiveRole } from '@/sync/model'
import { createNode, initBoardMeta } from '@/sync/boardOps'

describe('effectiveRole (§6)', () => {
  it('un participant exclu est traité en lecture seule (visiteur), pas éditeur', () => {
    const doc = new Y.Doc()
    getMetaMap(doc).set('adminId', 'user-admin')
    getRolesMap(doc).set('user-x', 'excluded')
    expect(effectiveRole(doc, 'user-x')).toBe('visitor')
    // Un userId inconnu reste éditeur par défaut.
    expect(effectiveRole(doc, 'user-y')).toBe('editor')
  })
})

describe('permitsWrite (§6)', () => {
  it('admin : tout ; éditeur : contenu + titre ; visiteur : rien', () => {
    expect(permitsWrite('admin', 'meta-sharing')).toBe(true)
    expect(permitsWrite('admin', 'roles')).toBe(true)
    expect(permitsWrite('editor', 'nodes')).toBe(true)
    expect(permitsWrite('editor', 'meta-title')).toBe(true)
    expect(permitsWrite('editor', 'meta-sharing')).toBe(false)
    expect(permitsWrite('editor', 'roles')).toBe(false)
    expect(permitsWrite('visitor', 'nodes')).toBe(false)
    expect(permitsWrite('visitor', 'comments')).toBe(false)
    // Les fichiers (adressés par contenu, §1) sont toujours autorisés.
    expect(permitsWrite('visitor', 'files')).toBe(true)
  })
})

/**
 * Fabrique un couple de documents « connectés » : les mises à jour de `remote`
 * sont appliquées à `local` avec l'origine `provider` (= transaction distante).
 * `local` porte le filtre de rôle. L'awareness mappe le clientID de `remote`.
 */
function connectedPair(remoteUserId: string): {
  local: Y.Doc
  remote: Y.Doc
  uninstall: () => void
} {
  const local = new Y.Doc()
  const remote = new Y.Doc()
  const provider = { tag: 'provider' }
  const awareness = {
    getStates: () => new Map([[remote.clientID, { user: { id: remoteUserId } }]])
  }
  const handle = { doc: local, provider, awareness } as unknown as BoardHandle
  const uninstall = installRoleGuard(handle)
  // Relaie remote → local avec l'origine provider (transaction distante).
  remote.on('update', (update: Uint8Array) => {
    Y.applyUpdate(local, update, provider)
  })
  // Relaie local → remote (pour que la révocation revienne chez remote).
  local.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== remote) Y.applyUpdate(remote, update, remote)
  })
  return { local, remote, uninstall }
}

describe('filtrage à la réception (§6)', () => {
  it('révoque un nœud créé par un VISITEUR distant', () => {
    const { local, remote, uninstall } = connectedPair('user-visitor')
    // `local` connaît la politique : admin = user-admin, user-visitor = visiteur.
    getMetaMap(local).set('adminId', 'user-admin')
    getRolesMap(local).set('user-visitor', 'visitor')
    expect(effectiveRole(local, 'user-visitor')).toBe('visitor')

    const remoteHandle = { doc: remote } as unknown as BoardHandle
    createNode(remoteHandle, { kind: 'text', x: 0, y: 0, content: 'interdit' }, 'V')

    // La création distante est révoquée : `local` ne l'intègre pas.
    expect(getNodesMap(local).size).toBe(0)
    uninstall()
  })

  it('accepte un nœud créé par un ÉDITEUR distant (rôle par défaut)', () => {
    const { local, remote, uninstall } = connectedPair('user-editor')
    getMetaMap(local).set('adminId', 'user-admin')
    // Pas d'attribution explicite → éditeur par défaut.
    expect(effectiveRole(local, 'user-editor')).toBe('editor')

    const remoteHandle = { doc: remote } as unknown as BoardHandle
    createNode(remoteHandle, { kind: 'text', x: 0, y: 0, content: 'permis' }, 'E')

    expect(getNodesMap(local).size).toBe(1)
    uninstall()
  })

  it('révoque un nœud créé par un participant EXCLU', () => {
    const { local, remote, uninstall } = connectedPair('user-excluded')
    getMetaMap(local).set('adminId', 'user-admin')
    getRolesMap(local).set('user-excluded', 'excluded')
    const remoteHandle = { doc: remote } as unknown as BoardHandle
    createNode(remoteHandle, { kind: 'text', x: 0, y: 0, content: 'exclu' }, 'X')
    expect(getNodesMap(local).size).toBe(0)
    uninstall()
  })

  it('révoque un changement de réglage de partage émis par un ÉDITEUR', () => {
    const { local, remote, uninstall } = connectedPair('user-editor')
    getMetaMap(local).set('adminId', 'user-admin')

    const remoteHandle = { doc: remote } as unknown as BoardHandle
    // Un éditeur tente de passer le tableau en accès « ouvert ».
    initBoardMeta(remoteHandle, 'Titre', 'E', 'open')

    // Le réglage de partage émis par l'éditeur est révoqué côté `local`.
    expect(getMetaMap(local).get('accessMode')).not.toBe('open')
    uninstall()
  })
})
