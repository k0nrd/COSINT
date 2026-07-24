/**
 * §1 v1.8.8 — proposition d'entrer dans le parcours guidé.
 *
 * Une porte, pas un péage : la fenêtre ne s'ouvre JAMAIS d'elle-même (c'est le
 * bouton discret de l'accueil, ou Paramètres → À propos, qui l'appelle), et
 * « Plus tard » referme sans rien changer à l'application.
 */
import { GraduationCap } from 'lucide-react'
import { t } from '@/i18n'
import { TUTORIAL_STEPS } from '@/lib/tutorialSteps'
import { useTutorial } from '@/store/tutorial'
import { Modal } from '@/components/common/Modal'
import './tutorial.css'

export function TutorialIntro(): JSX.Element {
  const start = useTutorial((state) => state.start)
  const closeIntro = useTutorial((state) => state.closeIntro)

  return (
    <Modal
      title={t('tutorial.introTitle')}
      onClose={closeIntro}
      width={460}
      footer={
        <>
          <button className="cm-btn" onClick={closeIntro}>
            {t('tutorial.later')}
          </button>
          <button className="cm-btn cm-btn--primary" onClick={start}>
            <GraduationCap size={15} />
            {t('tutorial.start')}
          </button>
        </>
      }
    >
      <p className="tu-intro__lead">{t('tutorial.introText')}</p>
      <ul className="tu-intro__list">
        <li>{t('tutorial.introBullet1')}</li>
        <li>{t('tutorial.introBullet2')}</li>
        <li>{t('tutorial.introBullet3')}</li>
      </ul>
      <p className="tu-intro__count">{t('tutorial.progress', { current: 1, total: TUTORIAL_STEPS.length })}</p>
    </Modal>
  )
}
