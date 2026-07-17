/**
 * Première ouverture (§4/§7) : création du profil local — aucun compte,
 * tout reste sur le poste. Écran plein affiché tant que le profil est absent ;
 * l'écriture dans le store suffit à faire basculer App vers l'accueil.
 */
import { useState, type FormEvent } from 'react'
import { t } from '@/i18n'
import { useSettings } from '@/store/settings'
import { USER_COLORS } from '@/lib/colors'
import type { UserProfile } from '@/types'
import { ProfileEditor } from '@/components/common/ProfileEditor'
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
  const setProfile = useSettings((state) => state.setProfile)
  const [draft, setDraft] = useState<UserProfile>(emptyProfile)
  const [pseudoError, setPseudoError] = useState(false)

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
      <form className="hm-setup-card" onSubmit={handleSubmit}>
        <h1 className="hm-setup-title">{t('profile.title')}</h1>
        <p className="hm-setup-subtitle">{t('profile.subtitle')}</p>

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
    </div>
  )
}
