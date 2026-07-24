/**
 * §2 v1.8.8 — signature de l'auteur, accolée à la marque COSINT.
 *
 * Le pseudo est un vrai bouton : il ouvre le GitHub de l'auteur dans le
 * navigateur du système (jamais dans une fenêtre de l'application).
 */
import { t } from '@/i18n'
import { AUTHOR_URL, openExternal } from '@/lib/project'

interface AuthorTagProps {
  /** Classe additionnelle pour l'ajuster à son contexte (accueil, réglages…). */
  className?: string
}

export function AuthorTag({ className }: AuthorTagProps): JSX.Element {
  return (
    <span className={className ? `cm-author ${className}` : 'cm-author'}>
      {t('app.madeBy')}{' '}
      <button
        type="button"
        className="cm-author__link"
        onClick={() => openExternal(AUTHOR_URL)}
        title={t('app.authorLink')}
      >
        {t('app.author')}
      </button>
    </span>
  )
}
