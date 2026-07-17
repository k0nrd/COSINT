/**
 * Registre des icônes d'entité (§2 v1.2) : résout le nom d'icône PascalCase de
 * la taxonomie (lib/taxonomy.ts) en composant lucide.
 *
 * Résolution dynamique par nom depuis l'espace de noms lucide : garantit qu'un
 * nom d'icône inconnu (ou renommé entre versions) retombe proprement sur un
 * cercle plutôt que de casser le build (la taxonomie compte ~90 types).
 */
import * as Lucide from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const REGISTRY = Lucide as unknown as Record<string, LucideIcon | undefined>
const Fallback: LucideIcon = Lucide.Circle

interface EntityIconProps {
  /** Nom d'icône PascalCase (ex. « Building2 ») issu de la taxonomie. */
  icon: string
  size?: number
}

/** Icône d'entité ; retombe sur un cercle si le nom est inconnu. */
export function EntityIcon({ icon, size = 14 }: EntityIconProps): JSX.Element {
  const Icon = REGISTRY[icon] ?? Fallback
  return <Icon size={size} />
}
