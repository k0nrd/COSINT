/**
 * Écran de synchronisation initiale (§1a v1.5).
 *
 * Affiché à un nouvel arrivant tant que l'intégralité de l'état courant du tableau
 * n'est pas reçue : il ne voit JAMAIS un canvas vide alors que le tableau est déjà
 * rempli. Montre une progression (pairs joints, éléments reçus) puis s'efface pour
 * révéler le tableau complet. Les images continuent d'arriver progressivement.
 */
import { Loader2 } from 'lucide-react'
import { t } from '@/i18n'
import './access.css'

interface SyncOverlayProps {
  peerCount: number
  nodeCount: number
  edgeCount: number
}

export function SyncOverlay({ peerCount, nodeCount, edgeCount }: SyncOverlayProps): JSX.Element {
  return (
    <div className="bd-sync-overlay" role="status" aria-live="polite">
      <div className="bd-sync-card">
        <div className="bd-sync-spinner" aria-hidden="true">
          <Loader2 size={26} />
        </div>
        <h1 className="bd-sync-title">{t('sync.title')}</h1>
        <p className="bd-sync-sub">{t('sync.sub')}</p>
        <p className="bd-sync-progress">
          {peerCount > 0
            ? t('sync.received', { nodes: nodeCount, edges: edgeCount })
            : t('sync.connecting')}
        </p>
      </div>
    </div>
  )
}
