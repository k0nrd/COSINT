/**
 * Barre d'état du tableau (refonte UI) — bandeau fin sous le canvas.
 * Purement informatif : rappel du fonctionnement pair-à-pair, décompte des
 * éléments et des liens, sélection en cours et niveau de zoom. Aucune action,
 * aucun état propre : tout est dérivé des props et du viewport React Flow.
 */
import { useViewport } from '@xyflow/react'
import { ShieldCheck } from 'lucide-react'
import { t } from '@/i18n'
import './footer.css'

interface BoardFooterProps {
  nodeCount: number
  edgeCount: number
  selectedCount: number
  /** false en vue Chronologie : le zoom du canvas n'y a pas de sens. */
  showZoom: boolean
}

export function BoardFooter({
  nodeCount,
  edgeCount,
  selectedCount,
  showZoom
}: BoardFooterProps): JSX.Element {
  const { zoom } = useViewport()
  return (
    <footer className="bd-footer">
      <span className="bd-footer__item bd-footer__item--lead">
        <ShieldCheck size={12} aria-hidden="true" />
        {t('footer.local')}
      </span>
      <span className="bd-footer__item bd-footer__item--num">
        {t('footer.elements', { count: nodeCount })} · {t('footer.links', { count: edgeCount })}
      </span>
      {selectedCount > 0 && (
        <span className="bd-footer__item bd-footer__item--num">
          {t('footer.selected', { count: selectedCount })}
        </span>
      )}
      <span className="bd-footer__spacer" />
      {showZoom && (
        <span className="bd-footer__item bd-footer__item--num" title={t('footer.zoom')}>
          {Math.round(zoom * 100)} %
        </span>
      )}
    </footer>
  )
}
