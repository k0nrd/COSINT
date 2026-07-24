/**
 * §1/§2 v1.8.8 — parcours guidé et adresses publiques du projet.
 *
 * Le tutoriel est du CONTENU : rien n'y est calculé, donc rien n'y « plante ».
 * Ce qui casse, en revanche, se casse en silence — une clé de traduction
 * renommée, une étape qui désigne un élément retiré de l'interface, un
 * dictionnaire amputé d'une entrée. Ce fichier verrouille donc quatre contrats :
 *
 *  1. chaque étape pointe des clés de traduction RÉELLES, présentes dans les
 *     TROIS langues (une étape muette en polonais est un bug invisible) ;
 *  2. chaque ancre `data-tut` déclarée existe bien dans le code de l'interface —
 *     sinon le coach commenterait le vide ;
 *  3. la progression reste cohérente (on démarre sur l'accueil, l'auto-avance
 *     n'appartient qu'à une étape d'accueil, la dernière étape conclut) ;
 *  4. les adresses publiques ne partent qu'en https, vers le dépôt de l'auteur.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TUTORIAL_STEPS } from '@/lib/tutorialSteps'
import { AUTHOR_URL, DEPLOY_GUIDE_URLS, REPO_URL, deployGuideUrl } from '@/lib/project'
import { LOCALES, setLocale } from '@/i18n'
import { fr } from '@/i18n/fr'
import { en } from '@/i18n/en'
import { pl } from '@/i18n/pl'

/** Sources de l'interface où une ancre `data-tut` peut être déclarée. */
const ANCHOR_SOURCES = [
  'src/renderer/src/components/home/HomeScreen.tsx',
  'src/renderer/src/components/board/Toolbar.tsx',
  'src/renderer/src/components/board/TopBar.tsx',
  'src/renderer/src/components/board/SidePanel.tsx',
  'src/renderer/src/flow/BoardView.tsx'
]

/** Ancres réellement posées dans le code (`data-tut="…"`). */
function declaredAnchors(): Set<string> {
  const found = new Set<string>()
  for (const file of ANCHOR_SOURCES) {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8')
    for (const match of source.matchAll(/data-tut="([^"]+)"/g)) found.add(match[1])
  }
  return found
}

describe('parcours guidé — étapes', () => {
  it('chaque étape pointe des clés de traduction existantes dans les trois langues', () => {
    for (const step of TUTORIAL_STEPS) {
      for (const key of [step.titleKey, step.textKey]) {
        expect(fr[key], `fr manque ${key}`).toBeTruthy()
        expect(en[key], `en manque ${key}`).toBeTruthy()
        expect(pl[key], `pl manque ${key}`).toBeTruthy()
      }
    }
  })

  it('chaque ancre déclarée par une étape existe dans l’interface', () => {
    const anchors = declaredAnchors()
    for (const step of TUTORIAL_STEPS) {
      if (!step.anchor) continue
      expect(anchors.has(step.anchor), `ancre absente de l’interface : ${step.anchor}`).toBe(true)
    }
  })

  it('les identifiants d’étape sont uniques', () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('le parcours démarre sur l’accueil et se termine sur le tableau', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(8)
    expect(TUTORIAL_STEPS[0].scope).toBe('home')
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].id).toBe('end')
    // L'étape finale ne désigne rien : elle conclut, elle ne montre plus.
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].anchor).toBeUndefined()
  })

  it('l’auto-avance n’appartient qu’à une étape d’accueil (le bouton disparaît ensuite)', () => {
    const auto = TUTORIAL_STEPS.filter((step) => step.advanceOnBoard)
    expect(auto).toHaveLength(1)
    expect(auto[0].scope).toBe('home')
  })

  it('les étapes d’accueil précèdent toutes les étapes de tableau', () => {
    const firstBoard = TUTORIAL_STEPS.findIndex((step) => step.scope === 'board')
    const lastHome = TUTORIAL_STEPS.map((step) => step.scope).lastIndexOf('home')
    expect(firstBoard).toBeGreaterThan(lastHome)
  })
})

describe('adresses publiques du projet', () => {
  it('ne sortent qu’en https, vers le dépôt de l’auteur', () => {
    for (const url of [AUTHOR_URL, REPO_URL, ...Object.values(DEPLOY_GUIDE_URLS)]) {
      const parsed = new URL(url)
      expect(parsed.protocol).toBe('https:')
      expect(parsed.hostname).toBe('github.com')
      expect(parsed.pathname.startsWith('/k0nrd')).toBe(true)
    }
  })

  it('le guide de déploiement existe dans les trois langues', () => {
    // Une URL par langue de l'interface, et le fichier VISÉ doit exister dans le dépôt :
    // un lien mort dans « Paramètres → À propos » ne se verrait qu'en production.
    expect(Object.keys(DEPLOY_GUIDE_URLS).sort()).toEqual([...LOCALES].sort())
    for (const url of Object.values(DEPLOY_GUIDE_URLS)) {
      const file = url.slice(url.indexOf('/docs/') + 1)
      expect(existsSync(resolve(__dirname, '..', file)), `fichier manquant : ${file}`).toBe(true)
    }
  })

  it('le lien du guide suit la langue de l’interface', () => {
    for (const locale of LOCALES) {
      setLocale(locale)
      expect(deployGuideUrl()).toBe(DEPLOY_GUIDE_URLS[locale])
    }
    setLocale('fr')
  })
})

describe('dictionnaires de traduction', () => {
  it('les trois langues portent exactement le même jeu de clés', () => {
    const frKeys = Object.keys(fr).sort()
    expect(Object.keys(en).sort()).toEqual(frKeys)
    expect(Object.keys(pl).sort()).toEqual(frKeys)
  })

  it('aucune traduction n’est vide', () => {
    for (const [name, dict] of [
      ['fr', fr],
      ['en', en],
      ['pl', pl]
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${name}.${key} est vide`).not.toBe('')
      }
    }
  })
})
