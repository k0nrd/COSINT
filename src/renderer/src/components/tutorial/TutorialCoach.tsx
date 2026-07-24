/**
 * §1 v1.8.8 — coach du parcours guidé.
 *
 * Principe : NE RIEN BLOQUER. Le coach est une fiche flottante posée à côté de
 * l'élément commenté ; le repère qui entoure cet élément est purement décoratif
 * (`pointer-events: none`). L'utilisateur manipule donc la vraie application
 * pendant qu'il lit — c'est tout l'intérêt par rapport à une visite simulée.
 *
 * L'ancrage est résolu à l'exécution via `[data-tut="…"]`. Si l'élément est
 * absent de l'écran courant (panneau fermé, autre écran, rôle visiteur), la
 * fiche se replie en bas de la fenêtre : jamais de flèche pointant dans le vide.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, GraduationCap, X } from 'lucide-react'
import { t } from '@/i18n'
import { TUTORIAL_STEPS, type TutorialScope } from '@/lib/tutorialSteps'
import { useTutorial } from '@/store/tutorial'
import { useToasts } from '@/store/toasts'
import './tutorial.css'

interface TutorialCoachProps {
  /** Écran réellement affiché — sert à commenter le bon contexte. */
  scope: TutorialScope
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** Largeur fixe de la fiche (le texte est calibré pour cette mesure). */
const CARD_WIDTH = 340
/** Écart entre l'élément commenté et la fiche. */
const GAP = 14
/** Marge minimale conservée avec les bords de la fenêtre. */
const MARGIN = 12
/** Cadence de re-mesure : suit l'ouverture des panneaux sans les instrumenter. */
const POLL_MS = 220

/** Rectangle de l'élément portant `data-tut="anchor"`, ou null s'il est absent. */
function measureAnchor(anchor: string | undefined): Box | null {
  if (!anchor) return null
  const element = document.querySelector(`[data-tut="${anchor}"]`)
  if (!(element instanceof HTMLElement)) return null
  const rect = element.getBoundingClientRect()
  // Élément présent dans le DOM mais non peint (display:none, panneau replié).
  if (rect.width === 0 || rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Place la fiche : à droite, à gauche, dessous, au-dessus — le premier côté qui
 * tient dans la fenêtre l'emporte. Sans élément commenté, la fiche se dock en
 * bas au centre.
 */
function placeCard(target: Box | null, cardHeight: number): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxLeft = vw - CARD_WIDTH - MARGIN
  const maxTop = vh - cardHeight - MARGIN

  if (!target) {
    return { top: Math.max(MARGIN, vh - cardHeight - 28), left: clamp((vw - CARD_WIDTH) / 2, MARGIN, Math.max(MARGIN, maxLeft)) }
  }

  const centeredTop = clamp(target.top + target.height / 2 - cardHeight / 2, MARGIN, Math.max(MARGIN, maxTop))
  const centeredLeft = clamp(target.left + target.width / 2 - CARD_WIDTH / 2, MARGIN, Math.max(MARGIN, maxLeft))

  const rightEdge = target.left + target.width + GAP
  if (rightEdge + CARD_WIDTH <= vw - MARGIN) return { top: centeredTop, left: rightEdge }

  const leftEdge = target.left - CARD_WIDTH - GAP
  if (leftEdge >= MARGIN) return { top: centeredTop, left: leftEdge }

  const belowEdge = target.top + target.height + GAP
  if (belowEdge + cardHeight <= vh - MARGIN) return { top: belowEdge, left: centeredLeft }

  const aboveEdge = target.top - cardHeight - GAP
  if (aboveEdge >= MARGIN) return { top: aboveEdge, left: centeredLeft }

  return { top: clamp(centeredTop, MARGIN, Math.max(MARGIN, maxTop)), left: centeredLeft }
}

export function TutorialCoach({ scope }: TutorialCoachProps): JSX.Element | null {
  const active = useTutorial((state) => state.active)
  const stepIndex = useTutorial((state) => state.step)
  const next = useTutorial((state) => state.next)
  const prev = useTutorial((state) => state.prev)
  const stop = useTutorial((state) => state.stop)
  const pushToast = useToasts((state) => state.push)

  const cardRef = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<Box | null>(null)
  const [cardHeight, setCardHeight] = useState(200)

  const step = TUTORIAL_STEPS[stepIndex] ?? TUTORIAL_STEPS[0]
  const total = TUTORIAL_STEPS.length
  const isLast = stepIndex === total - 1
  const offScope = step.scope !== scope

  // Étape « créez un tableau » : l'accueil disparaît dès la création — on avance
  // seul plutôt que de commenter un bouton qui n'est plus à l'écran.
  useEffect(() => {
    if (active && step.advanceOnBoard && scope === 'board') next()
  }, [active, step, scope, next])

  // Suivi de l'élément commenté. Un sondage court remplace l'instrumentation de
  // chaque panneau : robuste, et sans coût mesurable (une lecture de rect).
  useEffect(() => {
    if (!active) return
    const sync = (): void => {
      const box = offScope ? null : measureAnchor(step.anchor)
      setTarget((current) => {
        if (current === box) return current
        if (
          current &&
          box &&
          current.top === box.top &&
          current.left === box.left &&
          current.width === box.width &&
          current.height === box.height
        ) {
          return current
        }
        return box
      })
    }
    sync()
    const timer = window.setInterval(sync, POLL_MS)
    window.addEventListener('resize', sync)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', sync)
    }
  }, [active, step, offScope])

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight)
  }, [stepIndex, active, offScope])

  if (!active) return null

  const position = placeCard(target, cardHeight)

  // La dernière étape termine le parcours (et le signale), les autres avancent.
  const handleNext = (): void => {
    if (!isLast) {
      next()
      return
    }
    stop()
    pushToast(t('tutorial.done'), 'success')
  }

  return (
    <>
      {target && (
        <div
          className="tu-halo"
          aria-hidden="true"
          style={{
            top: target.top - 5,
            left: target.left - 5,
            width: target.width + 10,
            height: target.height + 10
          }}
        />
      )}

      <div
        ref={cardRef}
        className="tu-card"
        style={{ top: position.top, left: position.left, width: CARD_WIDTH }}
        role="dialog"
        aria-label={t('tutorial.button')}
      >
        <div className="tu-card__head">
          <span className="tu-card__badge">
            <GraduationCap size={13} aria-hidden="true" />
            {t('tutorial.progress', { current: stepIndex + 1, total })}
          </span>
          <button
            className="cm-btn cm-btn--ghost cm-btn--icon tu-card__close"
            onClick={stop}
            title={t('tutorial.quit')}
            aria-label={t('tutorial.quit')}
          >
            <X size={14} />
          </button>
        </div>

        <h3 className="tu-card__title">{t(step.titleKey)}</h3>
        <p className="tu-card__text">{t(step.textKey)}</p>

        {offScope && (
          <p className="tu-card__nudge">
            {step.scope === 'board' ? t('tutorial.waitBoard') : t('tutorial.waitHome')}
          </p>
        )}

        <div className="tu-card__rail" aria-hidden="true">
          {TUTORIAL_STEPS.map((item, index) => (
            <span
              key={item.id}
              className={`tu-card__dot${index === stepIndex ? ' tu-card__dot--on' : ''}${
                index < stepIndex ? ' tu-card__dot--past' : ''
              }`}
            />
          ))}
        </div>

        <div className="tu-card__foot">
          <button className="cm-btn cm-btn--sm tu-card__quit" onClick={stop}>
            {t('tutorial.quit')}
          </button>
          <div className="tu-card__nav">
            <button
              className="cm-btn cm-btn--sm"
              onClick={prev}
              disabled={stepIndex === 0}
              title={t('tutorial.prev')}
            >
              <ChevronLeft size={14} />
              {t('tutorial.prev')}
            </button>
            <button className="cm-btn cm-btn--sm cm-btn--primary" onClick={handleNext}>
              {isLast ? t('tutorial.finish') : t('tutorial.next')}
              {!isLast && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
