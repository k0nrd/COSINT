/**
 * Bannière discrète de mise à jour (v1.3, §5) : affichée quand une nouvelle
 * version est téléchargée et prête. Un clic redémarre l'app pour installer.
 */
import { RefreshCw } from 'lucide-react'
import { t } from '@/i18n'
import './updatebanner.css'

interface UpdateBannerProps {
  version: string
}

export function UpdateBanner({ version }: UpdateBannerProps): JSX.Element {
  return (
    <div className="cm-update-banner" role="status">
      <span>{t('update.ready', { version })}</span>
      <button
        className="cm-btn cm-btn--primary"
        onClick={() => void window.cosint.installUpdate()}
      >
        <RefreshCw size={14} />
        {t('update.restart')}
      </button>
    </div>
  )
}
