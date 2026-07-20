/**
 * Fenêtre légère de mise à jour (§3 v1.8.2) : dès qu'une nouvelle version est publiée
 * sur GitHub, une petite fenêtre s'affiche avec le numéro de version et le lien vers la
 * page GitHub des releases. Si la version est déjà téléchargée, un bouton propose de
 * redémarrer pour l'installer. Elle est refermable (« Plus tard ») et non bloquante.
 *
 * Le lien s'ouvre dans le navigateur externe via le pont preload (jamais dans l'app).
 */
import { Sparkles, X } from 'lucide-react'
import { t } from '@/i18n'
import './updatepopup.css'

/** Page des versions publiées de COSINT (dépôt de mise à jour automatique). */
const RELEASES_URL = 'https://github.com/k0nrd/COSINT/releases'

interface UpdatePopupProps {
  state: 'available' | 'downloaded'
  version: string
  onClose: () => void
}

export function UpdatePopup({ state, version, onClose }: UpdatePopupProps): JSX.Element {
  const downloaded = state === 'downloaded'
  const url = `${RELEASES_URL}/tag/v${version}`
  return (
    <div className="cm-updatepop" role="dialog" aria-label={t('update.popupTitle')}>
      <button
        className="cm-updatepop__close"
        onClick={onClose}
        title={t('common.close')}
        aria-label={t('common.close')}
      >
        <X size={14} />
      </button>
      <div className="cm-updatepop__head">
        <Sparkles size={18} className="cm-updatepop__icon" aria-hidden="true" />
        <span className="cm-updatepop__title">{t('update.popupTitle')}</span>
      </div>
      <p className="cm-updatepop__body">
        {downloaded
          ? t('update.popupReady', { version })
          : t('update.popupAvailable', { version })}
      </p>
      <a
        className="cm-updatepop__link"
        href={url}
        onClick={(event) => {
          event.preventDefault()
          void window.cosint.openExternal(url)
        }}
      >
        {t('update.popupGithub')}
      </a>
      <div className="cm-updatepop__foot">
        <button className="cm-btn cm-btn--sm" onClick={onClose}>
          {t('update.popupLater')}
        </button>
        {downloaded && (
          <button
            className="cm-btn cm-btn--primary cm-btn--sm"
            onClick={() => void window.cosint.installUpdate()}
          >
            {t('update.restart')}
          </button>
        )}
      </div>
    </div>
  )
}
