/**
 * Première ouverture (§4/§7) : création du profil local — aucun compte, tout reste sur
 * le poste. §7 v1.8.6 : mise en page plus éditoriale (marque, accroche, note de
 * confidentialité) et choix de la langue dès l'accueil.
 */
import { useState, type FormEvent } from 'react'
import { KeyRound, RadioTower, ServerOff } from 'lucide-react'
import { LOCALES, LOCALE_LABELS, setLocale, t, type Locale } from '@/i18n'
import { useSettings } from '@/store/settings'
import { USER_COLORS } from '@/lib/colors'
import type { UserProfile } from '@/types'
import { ProfileEditor } from '@/components/common/ProfileEditor'
import { AuthorTag } from '@/components/common/AuthorTag'
import cosintLogo from '@/assets/logo.png'
import './home.css'

/** Profil vierge proposé à la première ouverture. */
function emptyProfile(): UserProfile {
  return {
    userId: crypto.randomUUID(),
    pseudo: '',
    colorHex: USER_COLORS[0],
    avatarType: 'initials',
    avatarValue: '',
    role: '',
    status: 'available'
  }
}

export function ProfileSetup(): JSX.Element {
  const language = useSettings((state) => state.language)
  const setLanguage = useSettings((state) => state.setLanguage)
  const setProfile = useSettings((state) => state.setProfile)
  const [draft, setDraft] = useState<UserProfile>(emptyProfile)
  const [pseudoError, setPseudoError] = useState(false)

  const changeLanguage = (loc: Locale): void => {
    setLocale(loc)
    setLanguage(loc)
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    const pseudo = draft.pseudo.trim()
    if (pseudo === '') {
      setPseudoError(true)
      return
    }
    setProfile({ ...draft, pseudo })
  }

  return (
    <div className="hm-setup">
      <div className="hm-setup-panel">
        <header className="hm-setup-brand">
          <div className="hm-setup-mark">
            <img className="hm-setup-mark__logo" src={cosintLogo} alt="" aria-hidden="true" />
            <span className="hm-setup-mark__word">COSINT</span>
          </div>
          <div className="hm-seg hm-setup-lang" role="group" aria-label={t('profile.langLabel')}>
            {LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                className={`hm-seg__btn${language === loc ? ' hm-seg__btn--on' : ''}`}
                onClick={() => changeLanguage(loc)}
              >
                {LOCALE_LABELS[loc]}
              </button>
            ))}
          </div>
        </header>

        <p className="hm-setup-kicker">{t('profile.welcomeKicker')}</p>
        <h1 className="hm-setup-title">{t('profile.title')}</h1>
        <p className="hm-setup-subtitle">{t('profile.subtitle')}</p>

        <form className="hm-setup-form" onSubmit={handleSubmit}>
          <ProfileEditor
            value={draft}
            onChange={(profile) => {
              setDraft(profile)
              setPseudoError(false)
            }}
          />
          {pseudoError && (
            <p className="hm-error" role="alert">
              {t('profile.pseudoRequired')}
            </p>
          )}

          <button className="cm-btn cm-btn--primary hm-setup-submit" type="submit">
            {t('profile.save')}
          </button>
        </form>

        <p className="hm-setup-foot">
          {t('profile.privacyNote')}
          <AuthorTag className="hm-setup-author" />
        </p>
      </div>

      {/* Refonte UI : colonne de droite — ce que fait (et ne fait pas) l'application.
          Purement informative ; masquée sur les fenêtres étroites. */}
      <aside className="hm-setup-aside" aria-label={t('setup.factsTitle')}>
        <div className="hm-setup-facts">
          <h2 className="hm-setup-facts__title">{t('setup.factsTitle')}</h2>
          <div className="hm-setup-fact">
            <ServerOff size={15} aria-hidden="true" />
            <div>
              <strong>{t('setup.fact1Title')}</strong>
              <p>{t('setup.fact1Text')}</p>
            </div>
          </div>
          <div className="hm-setup-fact">
            <RadioTower size={15} aria-hidden="true" />
            <div>
              <strong>{t('setup.fact2Title')}</strong>
              <p>{t('setup.fact2Text')}</p>
            </div>
          </div>
          <div className="hm-setup-fact">
            <KeyRound size={15} aria-hidden="true" />
            <div>
              <strong>{t('setup.fact3Title')}</strong>
              <p>{t('setup.fact3Text')}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
