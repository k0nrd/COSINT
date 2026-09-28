/**
 * Nœud image (§1 v1.4) : le contenu du nœud est un HASH qui référence un fichier
 * transféré en chunks (sync/files.ts), jamais une data-URL inline. Le rendu suit
 * l'état du transfert :
 *  - complet   → image affichée ;
 *  - en cours  → placeholder + barre de progression (affichage progressif) ;
 *  - erreur    → message + bouton « Réessayer » (chunk manquant/corrompu).
 * Un transfert incomplet ou corrompu n'interrompt jamais la session (§1.4).
 *
 * Rétrocompatibilité : un `content` encore en data-URL inline (avant migration)
 * est affiché directement.
 */
import { memo, useEffect, useState } from 'react'
import { AlertTriangle, Copy, GripVertical, Image as ImageIcon, RotateCw } from 'lucide-react'
import { t } from '@/i18n'
import type { CosintNodeProps } from '@/flow/flowTypes'
import { useBoardContext } from '@/flow/BoardContext'
import { useFile } from '@/sync/hooks'
import { copyImageWithToast, startImageDrag, warmImagePng } from '@/lib/imageClipboard'
import { NodeShell } from './NodeShell'

/** Au-delà de ce délai SANS progression, un transfert en cours est déclaré
 * échoué (§1.4) — l'émetteur est probablement parti avant la fin. */
const STALL_MS = 20_000

export const ImageNode = memo(function ImageNode({ id, data, selected }: CosintNodeProps): JSX.Element {
  const board = data.board
  const { handle, copyImageNode } = useBoardContext()
  const content = board.content

  // Sécurité (§8) : une data-URL héritée n'est affichée que si c'est bien une
  // image locale ; toute autre valeur non-hash est ignorée.
  const isLegacyInline = content.startsWith('data:image/')
  const hash = !isLegacyInline && content !== '' ? content : null
  const file = useFile(handle, hash)
  // Échec de décodage <img> (base64 corrompu) → bascule en état d'erreur.
  const [decodeError, setDecodeError] = useState(false)
  // Clé de réessai : force une nouvelle tentative de rendu de l'<img>.
  const [retry, setRetry] = useState(0)
  // Transfert bloqué (aucune progression depuis STALL_MS) → état d'erreur (§1.4).
  const [stalled, setStalled] = useState(false)

  // Détection de blocage : l'effet se ré-exécute à chaque progression (dépendance
  // `received`) et RÉARME le délai ; le minuteur ne se déclenche donc que si RIEN
  // n'a progressé pendant STALL_MS (chargement figé ou métadonnées jamais reçues).
  const received = file.status === 'loading' ? file.received : 0
  useEffect(() => {
    if (file.status === 'complete' || file.status === 'error') {
      setStalled(false)
      return
    }
    const timer = window.setTimeout(() => setStalled(true), STALL_MS)
    return () => window.clearTimeout(timer)
    // `retry` réarme la détection après un « Réessayer ».
  }, [file.status, received, retry])

  const src = isLegacyInline ? content : file.status === 'complete' ? file.dataUrl : null

  // §2 v1.8.1 : copie du BITMAP dans le presse-papiers système, pour le coller dans
  // un autre document (traitement de texte, messagerie…). Distinct du Ctrl+C interne
  // (fragment de graphe) : ici on écrit l'image elle-même.
  // §1 v1.9 : MÊME chemin que Ctrl+C (conversion PNG, écriture vérifiée par le main,
  // toast du vrai résultat, recollage du nœud entier dans COSINT).
  const copyImage = (): void => {
    if (copyImageNode) copyImageNode(id)
    else void copyImageWithToast(src)
  }

  let body: JSX.Element
  if (content === '') {
    body = (
      <div className="nd-image-empty">
        <ImageIcon size={22} />
        <span>{t('image.pasteHint')}</span>
      </div>
    )
  } else if (src && !decodeError) {
    body = (
      <div className="nd-image-frame">
        <img
          key={retry}
          className="nd-image"
          src={src}
          alt={t('node.imageAlt')}
          draggable={false}
          onError={() => setDecodeError(true)}
        />
        {selected && (
          <button
            type="button"
            className="nd-image-copy nodrag"
            title={t('image.copy')}
            aria-label={t('image.copy')}
            onClick={(event) => {
              event.stopPropagation()
              copyImage()
            }}
          >
            <Copy size={13} />
          </button>
        )}
        {/* §1 v1.9 : poignée DÉDIÉE pour glisser l'image hors de COSINT (bureau,
            explorateur, messagerie, traitement de texte…). Le glisser HTML est annulé et
            remplacé par le glisser NATIF du système (fichier PNG écrit par le main) ; le
            déplacement normal du nœud (glisser son corps) reste inchangé (`nodrag`). */}
        {selected && (
          <div
            className="nd-image-drag nodrag nopan"
            role="button"
            draggable
            title={t('image.dragOut')}
            aria-label={t('image.dragOut')}
            onPointerEnter={() => warmImagePng(src)}
            onPointerDown={(event) => {
              event.stopPropagation()
              warmImagePng(src)
            }}
            onDragStart={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void startImageDrag(src, board.title)
            }}
          >
            <GripVertical size={14} />
          </div>
        )}
      </div>
    )
  } else if (decodeError || file.status === 'error' || (stalled && file.status !== 'complete')) {
    body = (
      <div className="nd-image-error">
        <AlertTriangle size={20} />
        <span>{t('image.transferError')}</span>
        <button
          type="button"
          className="cm-btn cm-btn--sm nodrag"
          onClick={() => {
            // Réessayer : ré-évalue l'état (les chunks manquants peuvent être
            // arrivés entre-temps si un pair qui les détient s'est reconnecté).
            setDecodeError(false)
            setStalled(false)
            setRetry((value) => value + 1)
          }}
        >
          <RotateCw size={13} />
          {t('common.retry')}
        </button>
      </div>
    )
  } else {
    // « loading » (chunks en cours) ou « missing » (métadonnées pas encore reçues).
    const received = file.status === 'loading' ? file.received : 0
    const total = file.status === 'loading' ? file.total : 0
    const percent = total > 0 ? Math.round((received / total) * 100) : 0
    body = (
      <div className="nd-image-loading">
        <ImageIcon size={20} />
        <span>{t('image.receiving')}</span>
        <div className="nd-image-progress" role="progressbar" aria-valuenow={percent}>
          <div className="nd-image-progress__bar" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }

  return (
    <NodeShell id={id} board={board} selected={selected} className="nd-image-body">
      {body}
    </NodeShell>
  )
})
