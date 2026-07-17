/** Génère un identifiant unique pour nœuds, connexions et commentaires. */
export function newId(): string {
  return crypto.randomUUID()
}
