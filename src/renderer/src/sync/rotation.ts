/**
 * Rotation transparente du code de partage (§1b v1.5).
 *
 * DISTINCTION FONDAMENTALE (corrige le bug v1.4 « régénérer éjecte en solo ») :
 *  - RÉVOQUER (`shareRevocation`, boardOps) = couper le partage volontairement :
 *    TOUT le monde est déconnecté et repasse en solo (comportement voulu).
 *  - FAIRE TOURNER LE CODE (rotation, ce module) = invalider l'ancien code pour
 *    les NOUVEAUX venus tout en gardant les participants DÉJÀ connectés, qui
 *    migrent de façon transparente vers le nouveau code/secret.
 *
 * MÉCANISME de migration transparente :
 *  1. Chaque participant connecté publie une clé publique éphémère (`rekey`) dans
 *     son awareness (BoardHandle.rekey, publiée par BoardView).
 *  2. À la rotation, l'admin génère un nouveau code + secret, puis SCELLE le
 *     couple {code, secret} à la clé publique de CHAQUE participant connecté (hors
 *     exclus) via ECDH→AES-GCM (sealSecret) et écrit ces enveloppes dans
 *     `meta.shareRotation = { token, grants: { userId → SealedSecret } }`.
 *  3. Ces enveloppes se propagent aux participants sur le salon ACTUEL (ancien),
 *     encore chiffré par l'ancien secret — seul le destinataire peut ouvrir la
 *     sienne. Puis l'admin bascule vers le nouveau salon.
 *  4. Chaque participant détecte le changement de `token`, ouvre son enveloppe
 *     avec sa clé privée et rejoint le nouveau salon SANS interruption ni retour
 *     au mode solo. Un détenteur de l'ANCIEN code non connecté (donc sans
 *     enveloppe) reste sur le salon mort → il perd l'accès (but de la rotation).
 */
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import type { BoardHandle } from './BoardDoc'
import { getMetaMap, isExcluded } from './model'
import { openSecret, sealSecret, type SealedSecret } from '@/lib/shareCode'

/** Contenu scellé transmis à un participant lors d'une rotation. */
export interface RotationPayload {
  code: string
  secret: string
}

/** Structure stockée dans `meta.shareRotation`. */
export interface ShareRotation {
  /** Jeton unique de la rotation (change à chaque rotation). */
  token: string
  /** Enveloppes scellées par userId (seul le destinataire peut ouvrir la sienne). */
  grants: Record<string, SealedSecret>
}

/** Clé du champ de meta portant la rotation courante. */
const ROTATION_KEY = 'shareRotation'

/** Champ d'awareness portant la clé publique éphémère d'un participant. */
const REKEY_FIELD = 'rekey'

/** Publie la clé publique éphémère locale dans l'awareness (émetteur de rotation). */
export function publishRekey(handle: BoardHandle): void {
  if (!handle.awareness || !handle.rekey) return
  handle.awareness.setLocalStateField(REKEY_FIELD, handle.rekey.publicKey)
}

/** Lit la rotation courante depuis le document (défensif). null si absente/malformée. */
export function readRotation(doc: Y.Doc): ShareRotation | null {
  const raw = getMetaMap(doc).get(ROTATION_KEY)
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.token !== 'string' || record.token === '') return null
  if (typeof record.grants !== 'object' || record.grants === null) return null
  return { token: record.token, grants: record.grants as Record<string, SealedSecret> }
}

/** Jeton de rotation courant ('' si aucune rotation) — pour le snapshot d'arrivée. */
export function rotationToken(doc: Y.Doc): string {
  return readRotation(doc)?.token ?? ''
}

/** Clés publiques éphémères des AUTRES participants connectés, par userId. */
function connectedRekeys(awareness: Awareness, doc: Y.Doc): Map<string, string> {
  const result = new Map<string, string>()
  awareness.getStates().forEach((raw, clientId) => {
    if (clientId === awareness.clientID) return
    const state = raw as { user?: { id?: unknown }; [REKEY_FIELD]?: unknown }
    const userId = typeof state.user?.id === 'string' ? state.user.id : ''
    const pub = typeof state[REKEY_FIELD] === 'string' ? (state[REKEY_FIELD] as string) : ''
    // On ne migre pas un participant exclu (la rotation sert justement à l'écarter).
    if (userId === '' || pub === '' || isExcluded(doc, userId)) return
    result.set(userId, pub)
  })
  return result
}

/**
 * Écrit la rotation dans le document COURANT (ancien salon) : scelle le nouveau
 * {code, secret} à chaque participant connecté. À appeler AVANT de basculer le
 * tableau vers le nouveau code (laisser un court instant de propagation).
 * Retourne le nombre de participants qui migreront.
 */
export async function rotateShare(
  handle: BoardHandle,
  newCode: string,
  newSecret: string,
  token: string
): Promise<number> {
  if (!handle.awareness) return 0
  const rekeys = connectedRekeys(handle.awareness, handle.doc)
  const payload = JSON.stringify({ code: newCode, secret: newSecret } satisfies RotationPayload)
  const grants: Record<string, SealedSecret> = {}
  for (const [userId, publicKey] of rekeys) {
    try {
      grants[userId] = await sealSecret(payload, publicKey)
    } catch {
      /* clé publique invalide : ce participant ne pourra pas migrer (rare) */
    }
  }
  handle.doc.transact(() => {
    getMetaMap(handle.doc).set(ROTATION_KEY, { token, grants } satisfies ShareRotation)
  }, handle.localOrigin)
  return Object.keys(grants).length
}

/**
 * Ouvre l'enveloppe de rotation destinée à `userId` avec la clé privée éphémère
 * locale. Retourne le nouveau {code, secret}, ou null si aucune enveloppe pour
 * moi (je ne suis pas un participant migrant) ou si le déchiffrement échoue.
 */
export async function openRotationGrant(
  handle: BoardHandle,
  userId: string
): Promise<RotationPayload | null> {
  if (!handle.rekey) return null
  const rotation = readRotation(handle.doc)
  const sealed = rotation?.grants?.[userId]
  if (!sealed) return null
  try {
    const json = await openSecret(sealed, handle.rekey.privateKey)
    const parsed = JSON.parse(json) as Partial<RotationPayload>
    if (typeof parsed.code === 'string' && typeof parsed.secret === 'string') {
      return { code: parsed.code, secret: parsed.secret }
    }
    return null
  } catch {
    return null
  }
}
