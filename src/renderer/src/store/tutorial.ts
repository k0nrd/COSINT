/**
 * §1 v1.8.8 — parcours guidé (tutoriel).
 *
 * État volontairement minuscule : une étape courante et un drapeau « déjà vu ».
 * SEUL `seen` est persisté — un tutoriel interrompu ne doit PAS se rouvrir tout
 * seul au lancement suivant (on ne relance que sur action explicite), et un
 * tutoriel déjà terminé ne doit plus s'annoncer.
 *
 * Le tutoriel ne simule rien : il commente l'application réelle pendant que
 * l'utilisateur la manipule. Il ne bloque donc aucune interaction (voir
 * TutorialCoach : le repère visuel est en `pointer-events: none`).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TUTORIAL_STEPS } from '@/lib/tutorialSteps'

interface TutorialState {
  /** Parcours en cours (le coach est affiché). */
  active: boolean
  /** Index de l'étape courante dans TUTORIAL_STEPS. */
  step: number
  /** Fenêtre de présentation ouverte (proposition de commencer). */
  introOpen: boolean
  /** true dès que le parcours a été terminé OU quitté au moins une fois (persisté). */
  seen: boolean
  openIntro: () => void
  closeIntro: () => void
  start: () => void
  next: () => void
  prev: () => void
  /** Quitte le parcours (bouton « Quitter » ou fin) — marque le tutoriel comme vu. */
  stop: () => void
}

export const useTutorial = create<TutorialState>()(
  persist(
    (set) => ({
      active: false,
      step: 0,
      introOpen: false,
      seen: false,
      openIntro: () => set({ introOpen: true }),
      closeIntro: () => set({ introOpen: false, seen: true }),
      start: () => set({ active: true, step: 0, introOpen: false }),
      next: () =>
        set((state) =>
          state.step >= TUTORIAL_STEPS.length - 1
            ? { active: false, step: 0, seen: true }
            : { step: state.step + 1 }
        ),
      prev: () => set((state) => ({ step: Math.max(0, state.step - 1) })),
      stop: () => set({ active: false, step: 0, introOpen: false, seen: true })
    }),
    {
      name: 'cosint:tutorial',
      version: 1,
      // Rien d'autre que « déjà vu » ne survit à un redémarrage : l'étape en cours
      // et l'état actif sont volontairement éphémères.
      partialize: (state) => ({ seen: state.seen })
    }
  )
)
