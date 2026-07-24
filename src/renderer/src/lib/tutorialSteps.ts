/**
 * §1 v1.8.8 — étapes du parcours guidé.
 *
 * Chaque étape désigne :
 *  - `anchor` : la valeur de l'attribut `data-tut` de l'élément à mettre en
 *    évidence dans l'interface RÉELLE. Absent (ou introuvable à l'écran) → le
 *    coach se pose simplement en bas de la fenêtre, sans repère ;
 *  - `scope`  : l'écran où l'étape a du sens. Si l'utilisateur n'y est pas, le
 *    coach l'invite à y revenir plutôt que de désigner un élément inexistant ;
 *  - `advanceOnBoard` : l'étape passe SEULE à la suivante dès qu'un tableau
 *    s'ouvre (l'écran d'accueil disparaît : commenter un bouton parti serait
 *    absurde).
 *
 * Le contenu reste volontairement centré sur l'ESSENTIEL du métier (poser,
 * relier, sourcer, dater, partager, exporter) — pas sur la personnalisation.
 */
import type { MessageKey } from '@/i18n'

/** Écran auquel une étape se rapporte. */
export type TutorialScope = 'home' | 'board'

export interface TutorialStep {
  /** Identifiant lisible (journal, tests). */
  id: string
  scope: TutorialScope
  /** Valeur de `data-tut` de l'élément désigné, si l'étape en désigne un. */
  anchor?: string
  titleKey: MessageKey
  textKey: MessageKey
  /** Passe automatiquement à l'étape suivante dès qu'un tableau est ouvert. */
  advanceOnBoard?: boolean
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'welcome',
    scope: 'home',
    titleKey: 'tutorial.welcome.title',
    textKey: 'tutorial.welcome.text'
  },
  {
    id: 'create',
    scope: 'home',
    anchor: 'home-create',
    titleKey: 'tutorial.create.title',
    textKey: 'tutorial.create.text',
    advanceOnBoard: true
  },
  {
    id: 'canvas',
    scope: 'board',
    anchor: 'board-canvas',
    titleKey: 'tutorial.canvas.title',
    textKey: 'tutorial.canvas.text'
  },
  {
    id: 'entity',
    scope: 'board',
    anchor: 'add-entity',
    titleKey: 'tutorial.entity.title',
    textKey: 'tutorial.entity.text'
  },
  {
    id: 'details',
    scope: 'board',
    anchor: 'side-panel',
    titleKey: 'tutorial.details.title',
    textKey: 'tutorial.details.text'
  },
  {
    id: 'status',
    scope: 'board',
    anchor: 'side-panel',
    titleKey: 'tutorial.status.title',
    textKey: 'tutorial.status.text'
  },
  {
    id: 'link',
    scope: 'board',
    anchor: 'board-canvas',
    titleKey: 'tutorial.link.title',
    textKey: 'tutorial.link.text'
  },
  {
    id: 'source',
    scope: 'board',
    anchor: 'add-source',
    titleKey: 'tutorial.source.title',
    textKey: 'tutorial.source.text'
  },
  {
    id: 'timeline',
    scope: 'board',
    anchor: 'timeline',
    titleKey: 'tutorial.timeline.title',
    textKey: 'tutorial.timeline.text'
  },
  {
    id: 'search',
    scope: 'board',
    anchor: 'search',
    titleKey: 'tutorial.search.title',
    textKey: 'tutorial.search.text'
  },
  {
    id: 'share',
    scope: 'board',
    anchor: 'share',
    titleKey: 'tutorial.share.title',
    textKey: 'tutorial.share.text'
  },
  {
    id: 'roles',
    scope: 'board',
    anchor: 'share',
    titleKey: 'tutorial.roles.title',
    textKey: 'tutorial.roles.text'
  },
  {
    id: 'privacy',
    scope: 'board',
    anchor: 'connection',
    titleKey: 'tutorial.privacy.title',
    textKey: 'tutorial.privacy.text'
  },
  {
    id: 'storage',
    scope: 'board',
    titleKey: 'tutorial.storage.title',
    textKey: 'tutorial.storage.text'
  },
  {
    id: 'export',
    scope: 'board',
    anchor: 'export',
    titleKey: 'tutorial.export.title',
    textKey: 'tutorial.export.text'
  },
  {
    id: 'end',
    scope: 'board',
    titleKey: 'tutorial.end.title',
    textKey: 'tutorial.end.text'
  }
] as const
