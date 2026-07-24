/**
 * §2 v1.8.8 — adresses publiques du projet.
 *
 * Regroupées ici pour qu'un déménagement de dépôt ne se cherche pas dans les
 * composants. Elles ne sont JAMAIS contactées par l'application : elles ne
 * partent qu'au navigateur du système, sur clic explicite de l'utilisateur
 * (`shell.openExternal`, validation http/https côté processus principal).
 */
import { getLocale, type Locale } from '@/i18n'

/** Compte GitHub de l'auteur. */
export const AUTHOR_URL = 'https://github.com/k0nrd'

/** Dépôt public : code, notes de version, téléchargements. */
export const REPO_URL = 'https://github.com/k0nrd/COSINT'

/**
 * Guide d'installation d'un serveur de signalisation en réseau fermé — une version par
 * langue de l'interface (§2 v1.8.8). Un administrateur polonais ne doit pas se retrouver
 * devant un guide français parce que le lien était figé.
 */
export const DEPLOY_GUIDE_URLS: Record<Locale, string> = {
  fr: 'https://github.com/k0nrd/COSINT/blob/main/docs/DEPLOY_LOCAL.fr.md',
  en: 'https://github.com/k0nrd/COSINT/blob/main/docs/DEPLOY_LOCAL.md',
  pl: 'https://github.com/k0nrd/COSINT/blob/main/docs/DEPLOY_LOCAL.pl.md'
}

/** Guide de déploiement dans la langue courante de l'interface. */
export function deployGuideUrl(): string {
  return DEPLOY_GUIDE_URLS[getLocale()]
}

/**
 * Ouvre une adresse dans le navigateur du système. Sans le pont preload
 * (rendu hors Electron : tests, prévisualisation web), l'appel est ignoré
 * silencieusement plutôt que de lever.
 */
export function openExternal(url: string): void {
  if (typeof window === 'undefined' || typeof window.cosint === 'undefined') return
  void window.cosint.openExternal(url)
}
