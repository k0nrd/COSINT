/**
 * §2 v1.8.8 — adresses publiques du projet.
 *
 * Regroupées ici pour qu'un déménagement de dépôt ne se cherche pas dans les
 * composants. Elles ne sont JAMAIS contactées par l'application : elles ne
 * partent qu'au navigateur du système, sur clic explicite de l'utilisateur
 * (`shell.openExternal`, validation http/https côté processus principal).
 */

/** Compte GitHub de l'auteur. */
export const AUTHOR_URL = 'https://github.com/k0nrd'

/** Dépôt public : code, notes de version, téléchargements. */
export const REPO_URL = 'https://github.com/k0nrd/COSINT'

/** Guide d'installation d'un serveur de signalisation en réseau fermé. */
export const DEPLOY_GUIDE_URL = 'https://github.com/k0nrd/COSINT/blob/main/docs/DEPLOIEMENT_LOCAL.fr.md'

/**
 * Ouvre une adresse dans le navigateur du système. Sans le pont preload
 * (rendu hors Electron : tests, prévisualisation web), l'appel est ignoré
 * silencieusement plutôt que de lever.
 */
export function openExternal(url: string): void {
  if (typeof window === 'undefined' || typeof window.cosint === 'undefined') return
  void window.cosint.openExternal(url)
}
