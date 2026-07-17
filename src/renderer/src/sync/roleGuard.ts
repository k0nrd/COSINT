/**
 * Application des rôles (§6 v1.4).
 *
 * Émission : l'UI masque/désactive proprement l'édition selon le rôle
 * (BoardContext.canEdit / canManageSharing), et les opérations d'écriture ne
 * sont jamais appelées pour un visiteur.
 *
 * Réception (défense en profondeur) : `installRoleGuard` vérifie CHAQUE
 * transaction DISTANTE et révoque celles émises par un pair dont le rôle ne les
 * autorise pas — un client officiel refuse ainsi d'intégrer une modification non
 * autorisée, pas seulement de l'émettre. Limite honnête (README) : en P2P sans
 * serveur, un client modifié par un utilisateur très avancé reste une limite
 * théorique du modèle ; l'auteur d'une transaction est identifié par son
 * clientID Yjs, non falsifiable par un client officiel.
 */
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import type { BoardRole } from '@/types'
import type { BoardHandle } from './BoardDoc'
import {
  effectiveRole,
  getCommentsMap,
  getCustomTypesMap,
  getEdgesMap,
  getMetaMap,
  getNodesMap,
  getRolesMap
} from './model'

/** Cible d'écriture, pour la décision d'autorisation. */
export type WriteTarget =
  | 'nodes'
  | 'edges'
  | 'comments'
  | 'roles'
  | 'meta-sharing'
  | 'meta-title'
  | 'custom-types'
  | 'files'

/** Clés de `meta` relevant du PARTAGE (réservées à l'admin). Les autres (titre)
 * sont éditables par un éditeur. */
const SHARING_META_KEYS = new Set([
  'accessMode',
  'accessLog',
  'adminId',
  'participantLimit',
  'shareRevocation',
  // Rotation transparente du code (§1b v1.5) : réservée à l'admin.
  'shareRotation',
  'createdAt',
  'createdBy'
])

/**
 * Un rôle autorise-t-il d'écrire sur une cible donnée ? (Fonction PURE, testée.)
 *  - admin   : tout ;
 *  - éditeur : nœuds, connexions, commentaires, titre — jamais les réglages de
 *              partage ni les rôles ;
 *  - visiteur: rien (lecture seule) ;
 *  - fichiers: toujours autorisés (adressés par contenu, auto-vérifiables — §1).
 */
export function permitsWrite(role: BoardRole, target: WriteTarget): boolean {
  if (target === 'files') return true
  if (role === 'admin') return true
  if (role === 'visitor') return false
  // editor
  return (
    target === 'nodes' ||
    target === 'edges' ||
    target === 'comments' ||
    target === 'meta-title' ||
    // §2 v1.8 : les types personnalisés du tableau sont éditables par un éditeur
    // (comme les nœuds/liens) — jamais par un visiteur.
    target === 'custom-types'
  )
}

/** Remonte au type racine (nodes/edges/… ) d'un type Yjs éventuellement imbriqué. */
function rootOf(type: unknown): unknown {
  let current = type as { _item?: { parent?: unknown } | null }
  while (current._item && current._item.parent instanceof Y.AbstractType) {
    current = current._item.parent as { _item?: { parent?: unknown } | null }
  }
  return current
}

/** userId associé à un clientID Yjs via l'awareness (null si inconnu). */
function userIdOfClient(awareness: Awareness, clientId: number): string | null {
  const state = awareness.getStates().get(clientId) as
    | { user?: { id?: unknown } }
    | undefined
  const id = state?.user?.id
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * Cibles d'écriture touchées par une transaction (via `transaction.changed`,
 * en remontant au type racine pour les modifications de champ imbriquées).
 */
export function transactionTargets(
  doc: Y.Doc,
  transaction: Y.Transaction
): WriteTarget[] {
  const nodes = getNodesMap(doc)
  const edges = getEdgesMap(doc)
  const comments = getCommentsMap(doc)
  const meta = getMetaMap(doc)
  const roles = getRolesMap(doc)
  const customTypes = getCustomTypesMap(doc)
  const targets = new Set<WriteTarget>()
  transaction.changed.forEach((keys, type) => {
    const root = rootOf(type as unknown)
    if (root === nodes) targets.add('nodes')
    else if (root === edges) targets.add('edges')
    else if (root === comments) targets.add('comments')
    else if (root === roles) targets.add('roles')
    else if (root === customTypes) targets.add('custom-types')
    else if (root === meta) {
      keys.forEach((key) => {
        if (key !== null && SHARING_META_KEYS.has(key)) targets.add('meta-sharing')
        else targets.add('meta-title')
      })
    }
    // Le type racine `files` n'est pas gardé (toujours autorisé).
  })
  return [...targets]
}

/** clientIDs dont l'horloge a avancé dans la transaction (= auteurs). */
function authorsOf(transaction: Y.Transaction): number[] {
  const authors: number[] = []
  transaction.afterState.forEach((clock, client) => {
    if ((transaction.beforeState.get(client) ?? 0) < clock) authors.push(client)
  })
  return authors
}

/**
 * Installe le filtre de réception : révoque toute transaction DISTANTE émise par
 * un pair dont le rôle n'autorise pas les cibles modifiées. Retourne la fonction
 * de désinstallation. Sans effet si le tableau n'est pas connecté (solo).
 *
 * Fail-safe permissif : si l'auteur ou son rôle est momentanément inconnu
 * (awareness pas encore synchronisée), on N'ANNULE PAS (on évite de révoquer par
 * erreur une édition légitime) ; l'UI d'émission reste la garde principale.
 */
export function installRoleGuard(handle: BoardHandle): () => void {
  const doc = handle.doc
  const provider = handle.provider
  const awareness = handle.awareness
  if (!provider || !awareness) return () => undefined

  // UndoManager dédié aux transactions DISTANTES (origine = provider) : sert
  // uniquement à révoquer une transaction non autorisée (restaure ajouts,
  // modifications ET suppressions). captureTimeout 0 = une entrée par transaction.
  const guard = new Y.UndoManager(
    [
      getNodesMap(doc),
      getEdgesMap(doc),
      getCommentsMap(doc),
      getMetaMap(doc),
      getRolesMap(doc),
      getCustomTypesMap(doc)
    ],
    { trackedOrigins: new Set([provider]), captureTimeout: 0 }
  )

  const onAfter = (transaction: Y.Transaction): void => {
    // Seules les transactions distantes sont filtrées (les locales passent par
    // l'UI, déjà gardée ; l'annulation elle-même a une autre origine).
    if (transaction.origin !== provider) return
    const targets = transactionTargets(doc, transaction)
    if (targets.length === 0) {
      guard.clear()
      return
    }
    const authors = authorsOf(transaction)
    // On NE garde QUE les éditions incrémentales à UN SEUL auteur : c'est la forme
    // d'une modification en direct. Les transactions MULTI-auteurs (synchro
    // initiale `syncStep2`, fusions d'historique) portent du contenu déjà validé
    // à l'époque de sa création — les révoquer effacerait tout le tableau à cause
    // d'un seul auteur aujourd'hui rétrogradé. Un pair ne contrôle de toute façon
    // que son propre clientID (il ne peut pas forger une transaction multi-auteurs).
    if (authors.length !== 1) {
      guard.clear()
      return
    }
    const userId = userIdOfClient(awareness, authors[0])
    // Rôle inconnu (awareness pas encore synchronisée) → permissif (fail-safe).
    const disallowed =
      userId !== null &&
      targets.some((target) => !permitsWrite(effectiveRole(doc, userId), target))
    if (disallowed && guard.canUndo()) {
      // Révoque la transaction non autorisée. L'annulation a l'origine de `guard`
      // (≠ provider) → elle n'est pas re-filtrée, et se propage aux pairs.
      guard.undo()
    }
    // Réinitialise la pile après chaque transaction distante : la prochaine
    // révocation ne portera que sur la transaction distante suivante.
    guard.clear()
  }

  doc.on('afterTransaction', onAfter)
  return () => {
    doc.off('afterTransaction', onAfter)
    guard.destroy()
  }
}
