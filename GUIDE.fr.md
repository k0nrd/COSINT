# COSINT — Tableau collaboratif OSINT en pair-à-pair

COSINT est une application de bureau Windows permettant à des enquêteurs OSINT de
travailler **ensemble, en temps réel, sans aucun serveur central**, sur un tableau de
recherche visuel (nœuds, connexions, images, commentaires) inspiré d'OSINT Tracker,
d'Obsidian Canvas et de Miro.

- Un utilisateur crée un tableau → l'application génère un **code de partage** unique.
- Il transmet ce code à un collègue équipé de COSINT.
- Le collègue entre le code → connexion **directe en P2P (WebRTC)** → les deux voient
  et modifient le même tableau en temps réel.
- Le tableau vit **en local** sur le poste de chaque participant. Aucune donnée n'est
  stockée sur un serveur.

## Fonctionnalités

### Prise en main (v1.8.8)

Un **parcours guidé** est proposé par un bouton *Tutoriel* discret sur l'écran d'accueil
(rejouable ensuite depuis **Paramètres → À propos**). En douze étapes courtes, il fait
faire l'essentiel — créer un tableau, poser une entité, renseigner sa fiche, relier deux
entités, citer ses sources, lire la frise, partager, exporter — en **désignant l'interface
réelle** pendant que l'utilisateur la manipule : rien n'est simulé, aucune interaction
n'est bloquée, et l'on quitte à tout moment. Les étapes vivent dans
`src/renderer/src/lib/tutorialSteps.ts` ; chacune s'ancre à un élément via un attribut
`data-tut="…"` posé dans le composant correspondant (un test vérifie que toute ancre
déclarée existe bien dans le code de l'interface).

### Types de nœuds

- **Nœuds libres** : note texte (markdown simple), lien URL (ouverture uniquement dans
  le navigateur externe), image (collage Ctrl+V / glisser-déposer), note horodatée,
  groupe/zone. **Images robustes en P2P (v1.4)** : toute image est **recompressée** à
  l'import (WebP, ≤ 1600 px / ≤ 1,5 Mo pour le tableau, ≤ 256 px / ≤ 200 Ko pour les
  avatars ; refus poli au-delà) puis **transférée par morceaux** (« chunks » ≤ 48 Ko,
  adressés par hash) — ce qui empêche une grosse image de faire tomber la connexion
  WebRTC. L'image apparaît **progressivement** chez les pairs (barre de progression), et
  un transfert interrompu/corrompu affiche un état d'erreur « Réessayer » **sans jamais
  casser la session**. Les avatars ne transitent plus jamais par l'awareness (seulement
  leur hash).
- **Fiches entité** : **taxonomie de ~90 types** (v1.2) organisée en 8 catégories
  (Affaires, Cryptomonnaie, Forensique, Générique, Groupe, Internet, Localisation,
  Matériel), choisie via un sélecteur par catégories avec **barre de recherche**. Chaque
  type a une icône, une valeur principale, un champ notes et des champs personnalisés
  illimités. Les 8 fiches riches de la v1.1 (Personne, Entreprise, Domaine, Téléphone,
  Email, Adresse, Compte réseau social, Véhicule) conservent leurs champs détaillés. Une
  note texte peut être convertie en fiche entité. (Les types de catégorisation ne sont
  que des étiquettes de données, sans contenu opérationnel.)
- **Sources** (v1.1) : titre, URL, type, et note de fiabilité sur l'**échelle Amirauté**
  simplifiée (fiabilité A–F, crédibilité 1–6). Relier un élément à une source crée un
  lien automatique « source de » en pointillé. Un panneau « Sources » liste toutes les
  sources (tri, compteur d'éléments rattachés) et un export **Rapport des sources**
  (Markdown) est disponible.
- **Bloc de code (v1.6)** : nouvelle catégorie **« Code »** dans le sélecteur de
  création (aussi accessible au double-clic et dans la barre d'outils). Éditeur sur
  place avec **coloration syntaxique** (Prism.js — léger, hors-ligne), **numéros de
  ligne**, police monospace et **indentation préservée** (Tab = 2 espaces). Menu de
  langage **cherchable** (≥ 20 langages : JavaScript/TypeScript, JSX/TSX, Python, HTML,
  CSS, JSON, SQL, Bash, PHP, Java, C, C++, C#, Go, Rust, YAML, Markdown, texte brut),
  bouton **Copier le code**, bouton **plein écran** pour éditer un long extrait, titre
  optionnel (ex. nom de fichier). Thème sombre/clair cohérent avec l'app. Contenu,
  langage et titre **synchronisés en P2P**, inclus dans les exports JSON/PNG et dans la
  **recherche plein texte** (Ctrl+F). Le bloc se relie comme n'importe quel nœud.

### Collaboration & édition

- **Connexions** (§1) : au survol d'un nœud, des poignées apparaissent sur ses 4 côtés ;
  tirer d'une poignée vers un autre nœud crée le lien (relâcher dans le vide annule). Le
  lien sélectionné ouvre une **barre contextuelle** réglant en un geste : type de
  relation prédéfini (« associé à », « travaille pour », « transaction vers »…), label,
  style (plein / tirets / pointillés), extrémités (aucune / simple / double flèche),
  épaisseur (fin / normal / épais), tracé (courbe / droite / coudé) et couleur (palette
  rapide + sélecteur complet). Clic droit sur un lien → menu (modifier / inverser /
  supprimer / **tracé automatique**) ; Suppr supprime. Sélectionner un nœud met en avant
  ses liens et voisins directs et estompe le reste. Une **légende** repliable rappelle
  les styles et couleurs utilisés.
- **Routage manuel des liens (v1.6)** : on maîtrise par où passe chaque fil. Sur un lien
  sélectionné, des **poignées** apparaissent sur la courbe : **glisser** un point de
  passage pour déformer le tracé (torsion de la courbe), **clic droit** dessus pour le
  supprimer. On **ajoute** un point de passage par **double-clic** sur le lien (à
  l'endroit voulu) ou en tirant depuis le milieu d'un segment ; le fil suit l'ordre des
  points, de la source vers la cible. On choisit le **côté d'ancrage** de chaque
  extrémité (Auto / Haut / Bas / Gauche / Droite) dans le panneau Détails, ou en tirant
  l'extrémité sur une autre poignée du nœud. Le routage fonctionne avec les tracés
  **courbe** et **coudé**. Un bouton/menu **« Tracé automatique »** efface points et
  ancrages. Les points de passage sont en coordonnées **absolues** (ils restent en place
  quand un nœud relié est déplacé — le tracé ne « saute » pas) ; tout le routage est
  **synchronisé en P2P** et inclus dans les exports JSON/PNG.
- **Mode « Dessiner le tracé » (v1.7.1)** : le logiciel n'impose plus le côté par lequel
  un lien entre/sort des entités. Bouton ✏ sur la barre du lien (ou clic droit →
  *Dessiner le tracé*) : **1)** cliquer une **pastille** du nœud source pour choisir le
  côté de **départ** (haut/bas/gauche/droite — ou le nœud lui-même pour « auto »), **2)**
  cliquer sur le fond pour poser les **points du trajet** (clic droit = retirer le
  dernier, aperçu en pointillé animé), puis cliquer une pastille du nœud **cible** pour
  le côté d'**arrivée** (Entrée = arrivée auto, Échap = tout annuler — rien n'est écrit).
  Le tout s'applique en **une seule étape d'annulation** (Ctrl+Z restaure l'ancien
  tracé). Les côtés Départ/Arrivée sont aussi réglables directement dans la **barre du
  lien** (deux sélecteurs), sans passer par le panneau Détails.
- **Ergonomie zoom (v1.6)** : poignées de redimensionnement, de connexion, points de
  passage et badges de statut gardent une **taille écran à peu près constante quel que
  soit le zoom** (compensation par l'inverse du zoom, bornée), avec une zone de clic
  élargie — ils restent confortablement cliquables même très dézoomé.
- **Zones de texte auto-grandissantes (v1.6)** : partout où l'on saisit du texte
  multiligne (notes, descriptions, champs longs, commentaires, code), la zone s'agrandit
  en hauteur pour afficher tout le contenu pendant la saisie, jusqu'à une limite au-delà
  de laquelle un scroll apparaît.
- **Couleurs libres** (v1.1) : sélecteur complet (12 couleurs prédéfinies + historique
  + saisie hexadécimale) pour nœuds, liens, zones et profil. Filtres par tag, couleur
  exacte, **catégorie et type d'entité** (v1.2), recherche plein texte (Ctrl+F, indexe
  aussi les champs d'entité et les commentaires), mini-carte. Les tags restent des
  libellés neutres (sans couleur).
- Curseurs et sélections des collègues en direct, liste des connectés avec **avatars**
  (initiales / emoji / image), **rôle** et **statut** (disponible / occupé / absent),
  undo/redo **par utilisateur** (Ctrl+Z / Ctrl+Y).
- **Gestionnaire de raccourcis clavier (v1.6)** : une section **« Raccourcis clavier »**
  dans les Paramètres liste toutes les actions raccourciables, groupées par catégorie
  (Édition, Navigation, Création, Vue). Pour chacune : le raccourci actuel, un bouton
  pour le **réassigner** (on presse la nouvelle combinaison, capturée en direct), le
  **réinitialiser** ou le **supprimer**. **Détection de conflits** (prévient et propose
  de réassigner), possibilité d'**ajouter** un raccourci à une action qui n'en a pas,
  **import/export** d'un jeu de raccourcis (JSON), bouton **« Tout réinitialiser »** et
  filtre de recherche. Toute l'application lit ses raccourcis depuis cette
  configuration (centralisée, stockée localement par utilisateur).
- **Cycle de vie du partage (v1.4)** : un tableau **naît solo** (aucun code, aucune
  connexion réseau). Le menu *Partage* permet de **générer un code** (choix du mode
  d'accès), puis de **révoquer** (les participants sont déconnectés et conservent leur
  copie locale) ou **régénérer** un code (rotation du secret : les anciens détenteurs ne
  peuvent plus revenir) — voir la section dédiée.
- **Rôles et permissions (v1.4)** : **Admin** (créateur : règle l'accès, la limite, les
  rôles, exclut, transfère l'admin), **Éditeur** (par défaut : édite le contenu),
  **Visiteur** (lecture seule, UI d'édition masquée). Limite de participants **réglable de
  2 à 10** (défaut 5). Les rôles sont attachés à l'identité stable (pas au pseudo) et
  **appliqués aussi à la réception** (un client officiel refuse d'intégrer une
  modification d'un pair non autorisé).
- **Contrôle de compatibilité (v1.4)** : un participant exécutant une **version antérieure**
  à celle des membres du tableau est **refusé à la connexion** (message « Version trop
  ancienne — mettez à jour »), afin qu'un client ne comprenant pas les nouveaux formats
  (images en chunks, rôles, cycle de partage) ne dégrade pas le tableau.
- **Liens cliquables dans les entités (v1.4)** : les champs site web, profils sociaux,
  URL, archive, backlink, page/contenu (et tout champ ressemblant à une URL) sont des
  liens ouvrant le navigateur externe (icône de plateforme, clic droit → « Copier le
  lien ») ; un identifiant `@pseudo` construit automatiquement l'URL de la plateforme
  choisie. Email/téléphone : copie au clic.
- **Personnalisation visuelle des entités (v1.4)** : barre contextuelle à la sélection —
  bordure (style / épaisseur / couleur), fond (couleur + opacité + option transparente),
  taille du texte, réinitialisation, et **pipette de style** (copier/appliquer). Styles
  synchronisés en P2P et inclus aux exports JSON/PNG.
- **Ergonomie des entités (v1.4)** : suppression au clavier (**Suppr** / **Retour
  arrière**) et au clic droit (confirmation à partir de 3 éléments, annulable Ctrl+Z),
  retour à la ligne automatique, **champs à valeurs multiples** illimitées (bouton +/×).
  Par défaut, **tous les détails renseignés s'affichent** sur le nœud (qui **grandit en
  hauteur** pour tout montrer) ; l'**œil** permet d'en masquer et les champs affichés
  sont **réordonnables par glisser-déposer**. Tri du sélecteur d'entités (catégorie /
  alphabétique) avec sections **Récents** et **Favoris** épinglables.
- **Badges de statut (v1.5)** : un badge par élément (entité, nœud libre **et** lien) —
  *Confirmé* (vert), *Problème* (orange), *Faux positif* (noir), *Question* (bleu), *Stop*
  (rouge), *En attente* (sablier), ou *Aucun*. Pastille en coin de l'élément, réglable
  depuis la barre contextuelle ou le clic droit → *Statut*. **Filtre par badge** (avec
  compteur par statut) dans la barre de filtres ; statut inclus aux exports JSON/PNG/rapport.
- **Plateformes de comptes étendues (v1.5)** : le sélecteur de plateforme d'un profil
  couvre désormais ~38 plateformes (réseaux sociaux **et** comptes/fournisseurs : Google,
  Proton, Free, Orange, PayPal, Steam, Spotify…) avec construction automatique de l'URL et
  icône. Option **« Autre / personnalisé »** (nom + gabarit d'URL `{id}` + icône) mémorisée
  localement pour réutilisation. Sélecteur **cherchable** et groupé.
- **Zones améliorées (v1.5)** : nom de zone éditable (double-clic) et, en maintenant
  **Ctrl** pendant le déplacement d'une zone, tous les nœuds posés dessus se déplacent avec
  elle (déplacement groupé par recouvrement géométrique).
- **Mini-carte utile (v1.5)** : la mini-carte (bas-droite) affiche les nœuds **et** les
  liens à leurs couleurs, le cadre de la vue courante, et permet de cliquer/glisser pour se
  déplacer sur le tableau.
- **Diagnostic enrichi (v1.5)** : bouton **« Rafraîchir l'affichage »** (re-synchronise vue
  et document sans quitter l'app) et **journal de synchronisation** dans le panneau de
  diagnostic.
- **Contrôle d'accès** (v1.1) : chaque tableau partagé est *ouvert*, *sur approbation*
  (défaut) ou *privé* — voir la section dédiée ci-dessous.
- Traçabilité : chaque élément porte auteur + horodatages de création/modification ;
  fil de commentaires par nœud.
- Autosave continu en local (IndexedDB), export/import `.trace` (JSON complet, images
  incluses), export PNG haute résolution du canvas, export Markdown des sources.
- **Interface d'outil d'analyste** (v1.1) : thème sombre dense par défaut (thème clair
  disponible), design centralisé sur des *design tokens*, interface en français.

### Nouveautés v1.7

- **Import / export CSV** — voir la section dédiée ci-dessous.
- **Copier-coller natif du canvas (Ctrl+C / Ctrl+X / Ctrl+V)** : copiez/coupez une
  sélection (entités, nœuds, liens internes, zones, blocs de code, badges et styles inclus)
  et collez-la — à la position de la souris, avec un léger décalage par défaut. Fonctionne
  **entre tableaux différents** de l'application. Coller un **texte** externe crée la bonne
  brique (e-mail → entité « adresse e-mail », téléphone → entité « téléphone », URL → nœud
  lien, sinon note) ; coller une **image** crée un nœud image (pipeline de chunks v1.4).
  Quand le focus est dans un champ en cours d'édition, Ctrl+C/X/V agit sur le **texte**, pas
  sur les nœuds. Un import ou un collage s'annule d'un seul **Ctrl+Z**.
- **Recherche Ctrl+F fiabilisée** : insensible aux **accents** et à la casse par défaut,
  avec options *sensible à la casse*, *mot entier* et *filtre par catégorie d'entité*. Elle
  trouve aussi les **liens** (libellé et type de relation) ; résultats surlignés sur le
  canvas, navigation Entrée / Maj+Entrée avec compteur `3/12` et **centrage automatique** de
  la vue (y compris sur un lien).
- **Chronologie (frise)** : voir la section dédiée ci-dessous.

### Nouveautés v1.8

- **Entité « Événement » + datation** : un nouveau type d'entité **Événement** (icône
  calendrier). Dans le panneau **Détails**, le bloc **Datation de l'événement** permet de
  saisir soit une **date exacte** (avec l'heure si utile), soit une **fourchette** *au plus
  tôt → au plus tard* quand le moment précis est inconnu (fréquent en OSINT). La case
  « préciser l'heure » distingue une datation au jour près d'une datation horaire. Ces
  champs restent disponibles sur **n'importe quelle entité**, pas seulement « Événement ».
- **Types d'entité personnalisés (par tableau)** : dans le sélecteur d'entités, section
  **Personnalisés (ce tableau)** → **Nouveau type** : donnez un **nom**, une **icône**, une
  **couleur** et des **champs par défaut**. Le type est **synchronisé** avec tous les
  participants et **enregistré dans l'export `.trace`** — chaque affaire a donc ses propres
  types, en plus de la taxonomie intégrée. Supprimer un type **conserve** les entités
  existantes (affichées comme « type personnalisé supprimé »).
- **Frise des événements** : la Chronologie a désormais **deux onglets** (voir la section
  dédiée ci-dessous).
- **Export CSV à la carte** : choix des colonnes à l'export (voir la section Export CSV).

> **Compatibilité.** Le format de fichier `.trace` passe en **version 6**. Les fichiers plus
> anciens (v1 à v5) s'ouvrent normalement. En collaboration, tous les participants doivent
> être en **1.8.0 ou plus récent** pour rejoindre un tableau 1.8 (les versions antérieures
> ne comprennent pas les nouveaux champs).

### Nouveautés v1.9

- **Copier une image vers une autre application** : sélectionnez un nœud image (ou une
  image d'entité) puis **Ctrl+C**, ou **clic droit › Copier l'image** ; collez-la dans
  n'importe quel logiciel (dessin, traitement de texte, messagerie). **Clic droit ›
  Enregistrer l'image sous…** l'écrit en PNG sur le disque, et on peut aussi **glisser
  l'image hors du tableau** vers le bureau ou une autre fenêtre. Le message affiché reflète
  le résultat réel : COSINT écrit l'image **une seule fois** puis **relit le
  presse-papiers** pour vérifier (sous Windows, l'historique du presse-papiers Win+V peut le
  verrouiller un instant — COSINT réessaie). Recollée dans COSINT, l'image redevient le même
  nœud (titre, étiquettes, taille).
- **Ajouter des images à une entité** : panneau **Détails › Images › Ajouter des
  images…** (ou déposer des images dans la zone, ou cliquer la zone puis Ctrl+V), clic
  droit sur l'entité, bouton de la barre d'outils du nœud, ou simplement **déposer des
  fichiers image sur l'entité** dans le tableau. Jusqu'à **12 images** ; la première est la
  **couverture** affichée sur le nœud (badge **+N** s'il y en a d'autres). Un clic ouvre la
  **visionneuse** (← →, *Définir comme couverture*, copier, enregistrer) ; le panneau
  Détails permet de réordonner et de retirer.
- **Aperçu d'un document** : importez un fichier (glisser-déposer, trombone de la barre
  d'outils ou menu d'ajout, 25 Mo max). Un **PDF** affiche sa première page et son nombre
  de pages, un **fichier texte** un extrait ; **double-cliquez** le nœud pour ouvrir la
  visionneuse (← → pour les pages, + / − pour le zoom, Échap pour fermer). Sont aussi
  prévisualisés :
  - **Word, Excel, PowerPoint** (`.docx`, `.xlsx`, `.pptx`) : texte, tableaux, feuilles et
    diapositives ; les anciens `.doc`, `.xls`, `.ppt` sont lus au mieux (texte seul,
    signalé « approximatif ») ;
  - **LibreOffice / OpenOffice** (`.odt`, `.ods`, `.odp`, `.odg`) et **RTF** ; les fichiers
    **Apple iWork** (Pages, Numbers, Keynote) montrent leur miniature intégrée ;
  - **audio** (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`…) : lecteur avec durée et tags
    (titre, artiste, album, pochette) ; **vidéo** (`.mp4`, `.webm`…) lue dans la
    visionneuse ;
  - **code et scripts** (`.bat`, `.ps1`, `.sh`, `.py`…) : affichés avec coloration
    syntaxique, **jamais exécutés** — un script reçu d'un pair ne peut rien lancer.

  Les autres fichiers ont une carte avec un bouton **Enregistrer**. L'aperçu est calculé
  sur votre poste : rien de plus n'est synchronisé. Un document trop gros ou malformé
  affiche simplement un aperçu tronqué ou la carte par défaut.
- **Préréglages de lien** : **Paramètres › Préréglages de lien › Nouveau préréglage** —
  nommez-le, cochez les réglages à reprendre (relation, y compris « Autre » en texte libre,
  libellé, couleur, épaisseur, style de trait, flèches, tracé, statut, côtés d'ancrage) et
  vérifiez l'aperçu. Plus rapide : réglez un lien à la main puis, dans sa barre d'outils,
  **Préréglage › Enregistrer comme préréglage…**. Pour **appliquer** : barre d'outils du lien
  › Préréglage, ou clic droit sur plusieurs liens sélectionnés ; juste après avoir relié deux
  entités, un choix propose « Automatique » et vos préréglages (↑ ↓ puis Entrée, Échap =
  automatique). Les préréglages sont propres au poste ; le style appliqué est visible de tous.

> **Compatibilité.** Le format `.trace` reste en **version 7** : un tableau 1.9 s'ouvre en
> 1.8.9, qui ignore simplement les galeries d'images. Un pair 1.8.9 peut rejoindre un tableau
> 1.9 mais voit les nœuds fichier comme des notes vides : mettez tous les postes à jour.

## Import / export CSV (v1.7)

### Import

Ouvrez un CSV par le menu **Fichier → Importer un CSV…** (`Ctrl+Shift+I`), par le menu
**Export/Import** de la barre supérieure, ou en **glissant-déposant** un fichier `.csv` sur
le canvas. L'application détecte le **séparateur** (`,` `;` tabulation), l'**encodage**
(UTF-8 avec/sans BOM, UTF-16 LE/BE) et la présence d'une **ligne d'en-tête**, puis propose
deux modes :

- **Automatique** : chaque ligne devient une entité, chaque colonne un champ. Le **type
  d'entité** est deviné par heuristiques sur le nom des colonnes et leur contenu :

  | Colonne (nom ou contenu) | Type d'entité | Type de champ |
  |---|---|---|
  | email, mail, courriel, `@` dans la valeur | `email_address` | email |
  | tel, téléphone, mobile, portable, suite de chiffres | `phone_number` | téléphone |
  | domaine, hostname | `domain_name` | url |
  | url, site, web, lien, `http`/`www.` dans la valeur | `website` | url |
  | ip, adresse ip | `ip` | texte |
  | adresse, rue, ville, pays | `address` | texte |
  | société, entreprise, organisation, org | `company` | texte |
  | pseudo, username, login, alias | `username` | texte |
  | nom, prénom, name, personne, contact | `person` | texte |
  | date, événement, créé | — | date |
  | *(indéterminé)* | `generic_other` | texte |

  Si des colonnes **source** et **cible** existent, chaque ligne crée plutôt un **lien**
  entre deux entités (mode « liste de liens », relation depuis une colonne « relation »).
  Disposition automatique **lisible** (grille aérée par défaut, ou graphe force-directed
  léger pour un réseau de liens) et recentrage de la vue sur le résultat.

- **Assisté** : assistant en 5 étapes — *Format* (séparateur / en-tête / encodage), *Type
  d'entité* (un type unique, une colonne portant le type, ou détection auto par ligne),
  *Colonnes* (mapper chaque colonne vers champ / titre / type / ignorer, avec son type de
  champ), *Liens* (aucun, colonnes source→cible + relation, ou liaison par valeur clé
  partagée), *Disposition* (grille / graphe) et **destination** (ajouter au tableau courant
  ou nouveau tableau).

L'import est **non destructif** (ajout au tableau courant sans écraser l'existant, ou
nouveau tableau au choix) et **annulable par Ctrl+Z**. Au-delà de **2000 lignes**, une
confirmation est demandée avant génération.

### Export

Menu **Export/Import** de la barre supérieure (ou **Fichier → Exporter en CSV…**) :

- **Entités** : une ligne par entité ; colonnes `type`, `titre`, puis une colonne par
  libellé de champ présent (les **valeurs multiples** d'un même champ sont sérialisées dans
  une cellule, séparées par `;`). Encodage **UTF-8 avec BOM** (compatible Excel).
- **Liens** (fichier `*_liens.csv`) : colonnes `source`, `cible`, `relation`, `label`
  (source/cible = titre des nœuds).

Réimporter l'export des **entités** reconstruit un schéma cohérent (aller-retour testé) :
la colonne `type` fixe le type d'entité, `titre` le nom, les autres colonnes redeviennent
des champs.

**Choix des colonnes (v1.8).** À l'export (entités comme liens), une fenêtre liste toutes
les colonnes disponibles — **standard** (type, titre, statut, tags, **datation d'événement**
en ISO 8601, traçabilité) et **champs des entités** (une par libellé présent) — chacune
**cochée par défaut**. Décochez ce que vous ne voulez pas exporter, choisissez le
**séparateur** (`,` `;` tabulation), puis **Exporter**. L'ordre des colonnes du fichier suit
l'ordre standard (les colonnes `type` + `titre` en tête restent ré-importables).

## Chronologie / frise (v1.7)

Le bouton **Chronologie** de la barre d'outils (icône calendrier) bascule entre la vue
**Canvas** et une **frise chronologique** des découvertes. Chaque nœud y est placé selon sa
**date d'événement** si elle est renseignée (champ optionnel « Date de l'événement » du
panneau Détails — utile en OSINT pour dater le *fait* observé, distinct de la date de
saisie), sinon sa **date de création**. La frise est **horizontale, défilable et
zoomable** (échelle adaptative heure / jour / mois / année) ; chaque point porte l'icône du
type, le titre et l'auteur ; le survol donne le détail, le **clic** ramène au canvas et
centre l'élément. **Filtres** par catégorie, auteur, badge de statut et plage de dates.
**Export PNG** et **CSV** (élément, date, type, auteur). La frise se met à jour en **temps
réel** avec la collaboration P2P.

**Deux frises (v1.8).** La Chronologie propose désormais deux onglets : **Ajouts** (quand
les éléments ont été *ajoutés* au tableau) et **Événements** (quand les faits se sont
*déroulés*, d'après la datation d'événement — voir « Nouveautés v1.8 »). Un événement à
**date exacte** est un point ; un événement à **fourchette** devient une **barre** couvrant
sa durée d'incertitude. L'onglet Événements se **trie** par date de début, date précise,
nom ou type d'événement, en vue **Frise** (barres/points) ou **Liste** (tableau trié).

## Installation (développement)

Prérequis : **Node.js ≥ 22.12** et npm.

```bash
npm install
npm run dev        # lance l'application en mode développement (HMR)
npm test           # tests : codes de partage, handshake d'accès, sérialisation,
                   #         migration v1→v1.1, modèle des entités
npm run typecheck  # vérification TypeScript stricte
```

## Build du .exe Windows

```bash
npm run build:win
```

Produit dans `release/` :
- `COSINT-Setup-<version>.exe` — installeur NSIS (par utilisateur, dossier au choix) ;
- `COSINT-Portable-<version>.exe` — version portable sans installation.

Le build cible Windows 10/11 64 bits. Il peut être lancé depuis Windows ou depuis
Linux/WSL (electron-builder télécharge les outils nécessaires au premier build).
L'icône est générée par `npm run build:icon` (script sans dépendance).

### Signature de code Windows (supprimer l'avertissement SmartScreen)

L'avertissement **« Windows a protégé votre ordinateur » (SmartScreen)** au
téléchargement de l'exécutable vient de l'**absence de signature de code** — pas d'un
problème de l'application. On ne peut pas le supprimer par le code ; il faut **signer**
le binaire avec un certificat de signature de code. Tout est prêt côté build ; il ne
reste qu'à fournir un certificat.

**Quel certificat acheter ?**

| Type | Effet sur SmartScreen | Prix indicatif | Remarque |
|---|---|---|---|
| **OV** (Organization Validation) | L'avertissement **disparaît progressivement** à mesure que la réputation se construit (téléchargements) | ~150–250 €/an | Suffisant pour la plupart des cas |
| **EV** (Extended Validation) | L'avertissement **disparaît immédiatement** (réputation SmartScreen d'emblée) | ~250–500 €/an | Livré sur **jeton matériel** (HSM/USB) |

Autorités reconnues : **Certum** (option « Open Source » à bas coût), **Sectigo**,
**SSL.com**, **DigiCert**, **GlobalSign**. Depuis juin 2023, les certificats OV/EV sont
livrés sur support matériel ou via un service de signature cloud (KSP/HSM).

**Builder une version signée** — la configuration (`electron-builder.yml`) est pilotée
par **variables d'environnement**, aucun secret n'est stocké dans le dépôt :

- **Certificat OV (fichier `.pfx`)** :

  ```bash
  export CSC_LINK=/chemin/vers/certificat.pfx   # ou une chaîne base64 du .pfx
  export CSC_KEY_PASSWORD='mot-de-passe-du-pfx'
  npm run build:win                             # electron-builder détecte et signe
  ```

- **Certificat EV (jeton matériel / magasin Windows)** — depuis Windows, le certificat
  étant dans le magasin :

  ```powershell
  npm run build:icon; npm run build
  npx electron-builder --win --x64 --config.win.signtoolOptions.certificateSubjectName="Nom Légal Exact"
  ```

L'algorithme de hachage (`sha256`) et l'**horodatage RFC-3161**
(`timestamp.sectigo.com`, pour que la signature reste valide après expiration du
certificat) sont déjà configurés. Une fois l'app signée, repassez
`win.verifyUpdateCodeSignature` à `true` dans `electron-builder.yml` pour que les mises
à jour automatiques vérifient aussi la signature.

Sans ces variables, `npm run build:win` produit un exécutable **non signé mais
parfaitement fonctionnel** (il affichera juste l'avertissement SmartScreen).

**En attendant le certificat**, les métadonnées de l'exécutable sont complètes (nom du
produit *COSINT*, éditeur, version, description, copyright, icône) — un binaire bien
renseigné réduit les frictions. L'application n'a aucun comportement assimilable à un
logiciel malveillant : elle **n'écrit que dans les dossiers utilisateur standard**
(`%APPDATA%/COSINT` et les fichiers que **vous** choisissez via les dialogues « Enregistrer
sous »), **ne lance aucun processus** externe (les liens s'ouvrent dans votre navigateur
par défaut), et bloque toute navigation, permission ou téléchargement non sollicités.

### Installation pour les utilisateurs finaux (avertissement SmartScreen)

Si vous téléchargez COSINT et que Windows affiche **« Windows a protégé votre
ordinateur »** :

1. Cliquez sur **« Informations complémentaires »**.
2. Cliquez sur le bouton **« Exécuter quand même »** qui apparaît.
3. L'installation se poursuit normalement.

Cet avertissement est **normal pour une application récente non encore signée** : il ne
signale pas un virus, mais l'absence (pour l'instant) d'un certificat de signature de
code payant. **Les versions signées ne l'afficheront plus.** Vérifiez toujours que vous
téléchargez COSINT depuis la source officielle.

### Installation, désinstallation et mise à jour

- **Installation** : l'installeur NSIS crée une entrée dans « Applications » de Windows
  (Paramètres / Panneau de configuration), les raccourcis Bureau + menu Démarrer, et un
  désinstallateur.
- **Mise à jour par remplacement** : installer une nouvelle version **par-dessus**
  l'ancienne fonctionne sans désinstallation manuelle (l'`appId` `com.cosint.app` est
  stable, donc Windows reconnaît la même application). Vos tableaux et votre profil sont
  conservés.
- **Désinstallation** : le désinstallateur propose de **conserver (par défaut) ou
  supprimer** les données locales (`%APPDATA%/COSINT`). Conservation par défaut : une
  désinstallation accidentelle ne fait pas perdre les enquêtes.

### Publier une mise à jour (mises à jour automatiques)

COSINT vérifie silencieusement les mises à jour au démarrage via **GitHub Releases**
([electron-updater](https://www.electron.build/auto-update)) : une nouvelle version →
notification « Mise à jour disponible » → téléchargement en arrière-plan → bannière
« Redémarrer pour installer ». Rien à héberger.

**Publication automatisée (recommandée).** Le dépôt contient une chaîne GitHub Actions
(`.github/workflows/`) :

- `ci.yml` — à chaque push sur `main` et à chaque pull request : typecheck, tests, build et
  empaquetage sous Windows **et** Linux. Les installeurs produits se téléchargent pendant
  7 jours depuis l'onglet *Actions* (pour essayer une PR sans rien construire chez soi).
- `release.yml` — à chaque tag `vX.Y.Z` : construit les deux plates-formes et crée la
  *release* GitHub **en brouillon** avec les 7 fichiers ci-dessous.
- `codeql.yml` et `dependabot.yml` — analyse de sécurité du code et PR hebdomadaires de
  mise à jour des dépendances (à préférer à `npm audit fix --force`, qui saute des versions
  majeures sans rien vérifier).

Pour publier ainsi : incrémentez `version` dans `package.json`, ajoutez
`docs/RELEASE_NOTES_vX.Y.Z.md` (facultatif : il sert de texte à la release), poussez sur
`main`, puis :

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
```

Quand le workflow est vert, relisez le brouillon dans *Releases* et publiez-le. Pour signer
les exécutables Windows, ajoutez les secrets `CSC_LINK` (base64 du `.pfx`) et
`CSC_KEY_PASSWORD` au dépôt ; sans eux, le build reste non signé.

Pour publier une version à la main (sans GitHub Actions) :

1. Dans `electron-builder.yml`, renseignez `publish.owner` (votre compte GitHub) et
   `publish.repo` (le dépôt).
2. Exportez un jeton GitHub avec le droit `repo` : `export GH_TOKEN=ghp_...`
3. Incrémentez la version dans `package.json` (ex. `1.9.0`).
4. Publiez **Windows et Linux en une seule commande** (à lancer sous Linux ou WSL, où
   electron-builder sait produire les deux) :

   ```bash
   npm run release      # build + electron-builder --win --linux --x64 --publish always
   ```

   Cela crée une *release* GitHub (en brouillon par défaut). Vérifiez qu'elle contient bien
   les **7 fichiers** attendus, sinon une partie des clients ne verra pas la mise à jour :

   | Fichier | Rôle |
   |---|---|
   | `COSINT-Setup-<version>.exe` | installeur Windows |
   | `COSINT-Setup-<version>.exe.blockmap` | téléchargement différentiel des mises à jour Windows |
   | `COSINT-Portable-<version>.exe` | version portable Windows (sans installation, sans mise à jour auto) |
   | `COSINT-<version>-x86_64.AppImage` | Linux, un seul fichier exécutable |
   | `COSINT-<version>-amd64.deb` | Linux Debian/Ubuntu (apt/dpkg) |
   | `latest.yml` | ce qu'electron-updater lit sous **Windows** |
   | `latest-linux.yml` | ce qu'electron-updater lit sous **Linux** (AppImage) |

   Si vous construisez les deux plates-formes séparément (`npm run build:win` puis
   `npm run build:linux`), téléversez ces 7 fichiers à la main dans la même release — sans
   `latest.yml` les postes Windows ne voient rien, sans `latest-linux.yml` les postes Linux
   non plus. Publiez la release : les clients existants la détectent au prochain démarrage.

Les données locales (tableaux, profil) vivent dans `%APPDATA%/COSINT`, **hors** du
dossier programme : elles **survivent à toute mise à jour**.

## Fonctionnement du P2P

- **CRDT** : le tableau est un document [Yjs](https://yjs.dev). Chaque modification est
  fusionnée sans conflit, quel que soit l'ordre d'arrivée — y compris après un travail
  hors ligne prolongé.
- **Transport** : [y-webrtc](https://github.com/yjs/y-webrtc). Les participants d'un
  même tableau se connectent directement entre eux en WebRTC (maillage complet, limite
  **réglable de 2 à 10 participants**, défaut 5).
- **Signalisation** : pour se *trouver*, les pairs passent par un serveur de
  signalisation WebSocket. Il ne voit que l'identifiant de room (une valeur dérivée,
  non réversible) et des messages de négociation **chiffrés en AES-GCM** avec une clé
  dérivée du code de partage. Aucune donnée du tableau n'y transite. Pour héberger ce
  serveur sur un réseau fermé, suivre le guide pas à pas
  [`docs/DEPLOY_LOCAL.fr.md`](./docs/DEPLOY_LOCAL.fr.md) (service systemd, jeton
  d'accès, pare-feu **IPv6 compris**, provisionnement des postes, dépannage).
- **STUN** : pour découvrir leur adresse publique, les pairs interrogent des serveurs
  STUN (Google, Cloudflare, Twilio). Le STUN ne voit passer aucune donnée non plus.
- **Hors ligne** : sans réseau (ou sans pair en ligne), on travaille seul ; tout est
  enregistré localement et la synchronisation reprend automatiquement au retour d'un
  pair (comportement natif de Yjs).

### État de connexion et diagnostic (v1.3)

L'indicateur d'état, dans la **barre du haut**, affiche en permanence l'une de ces
situations — et il est **cliquable** pour ouvrir le **panneau de diagnostic** :

- **Connexion au réseau…** — la signalisation est en cours d'établissement ;
- **En ligne — en attente de participants** — la signalisation répond, mais personne
  d'autre n'est encore sur ce tableau ;
- **Connecté — N participant(s)** — au moins un pair est joignable en direct ;
- **Réseau inaccessible — mode local** — aucun serveur de signalisation ne répond ;
  vous travaillez en local, la synchro reprendra dès que le réseau reviendra.

Le **panneau de diagnostic** (clic sur l'indicateur) montre en temps réel : l'état de
chaque serveur de signalisation (connecté / échec + nombre de tentatives), les pairs
découverts et l'état de chaque connexion WebRTC (en négociation / connectée / échouée),
la dernière erreur détaillée, et un bouton **Retester la connexion**. Si des pairs sont
découverts mais qu'aucune connexion directe n'aboutit, le panneau signale explicitement
un **réseau restrictif** (voir « Limites réseau » ci-dessous).

### Serveurs de signalisation par défaut (⚠ important)

Les serveurs de signalisation publics historiques de y-webrtc
(`signaling.yjs.dev`, les serveurs Heroku, `y-webrtc-eu.fly.dev`) sont **hors service**
— nous l'avons vérifié empiriquement le **2026-07-05** (voir `DECISIONS.md` n°68 pour le
tableau de résultats). C'était **la cause** des échecs de connexion. Par défaut, COSINT
utilise désormais :

| Usage | Destination par défaut | État au 2026-07-05 |
|---|---|---|
| Signalisation | `wss://y-webrtc.fly.dev` | ✅ répond (~500 ms) |
| Signalisation (secours) | `wss://y-webrtc-eu.fly.dev` | ⚠ muet, conservé au cas où |
| STUN | `stun.l.google.com:19302`, `stun.cloudflare.com:3478`, `global.stun.twilio.com:3478` | ✅ |
| Données du tableau | **directement entre pairs (WebRTC chiffré)** | jamais via un serveur |

Ces serveurs sont un service communautaire **sans garantie**. **Pour un usage
professionnel ou fiable, hébergez le vôtre** — c'est l'affaire de 5 minutes et c'est
sans risque pour la confidentialité (la signalisation ne voit passer aucune donnée du
tableau) : voir [`server/README.md`](./server/README.md). Renseignez ensuite son adresse
(une ou plusieurs, séparées par des virgules) dans **Paramètres → Réseau &
confidentialité** — elle remplace alors les serveurs publics.

### Mode « 100 % local » (v1.7.1) — déploiement en réseau fermé

Pour les organisations (administration, entreprise…) qui exigent que **rien ne sorte du
réseau interne**, **Paramètres → Réseau & confidentialité** propose deux modes :

- **Standard (Internet)** — comportement historique : serveurs publics par défaut,
  remplaçables par des adresses personnalisées. Une case à cocher contrôle la
  vérification de mise à jour (GitHub Releases) au démarrage.
- **100 % local (auto-hébergé)** — **aucun service public n'est jamais contacté** :
  - la signalisation utilise **uniquement** la ou les adresses internes saisies
    (le serveur du dossier [`server/`](./server/README.md), `ws://` sur un LAN de
    confiance ou `wss://` derrière un reverse-proxy TLS interne) ;
  - les STUN publics sont **retirés** ; le champ « Serveurs STUN/TURN » accepte, une
    entrée par ligne, `stun:hôte:port` ou `turn:hôte:port utilisateur motdepasse`
    (ex. un [coturn](https://github.com/coturn/coturn) interne pour des postes sur des
    sous-réseaux différents). Vide = aucun : sur un même sous-réseau, les adresses
    locales suffisent à la connexion directe ;
  - la **vérification de mise à jour est coupée** (aucun contact GitHub — le processus
    principal n'émet la requête que sur autorisation explicite du renderer) ;
  - **jamais de repli silencieux** : si l'adresse interne est vide ou invalide, les
    tableaux partagés restent **hors ligne** (message explicite) — l'application ne
    retombe pas sur les serveurs publics.

Le panneau affiche en permanence un récapitulatif **« Ce que l'application
contactera »** (signalisation, STUN/TURN, mises à jour, contenu des tableaux) calculé
par **la même fonction** (`effectiveNetworkConfig`) que celle qui ouvre les connexions :
ce qui est affiché est exactement ce que le logiciel fait. Le verdict final indique
« Aucun service public ne sera contacté » dès que la configuration le garantit. Le
panneau de **diagnostic** (pilule d'état) rappelle aussi le mode réseau actif. Les
réglages sont **locaux à chaque poste** : chaque participant saisit la même adresse
interne (ou distribuez un build préconfiguré, voir la note ci-dessous).

> Note parc : pour figer ces valeurs **par construction** (aucun réglage utilisateur),
> modifiez les défauts (`store/settings.ts`, `sync/network.ts`) et recompilez — voir le
> guide de déploiement en réseau fermé. Le mode 100 % local de l'interface offre la même
> garantie sans recompilation.

Note OPSEC : les favicons des nœuds « Lien » ne sont **jamais** téléchargés (une icône
générique est affichée) afin de ne pas contacter les domaines investigués depuis votre
poste.

## Tester la connexion à deux clients

Pour valider la collaboration en direct (critère d'acceptation §1.8) :

**Automatiquement** — un test d'intégration exerce tout le chemin (création, demande
d'accès par code, approbation, transmission chiffrée du secret, synchro bidirectionnelle
en moins de 2 s, refus d'un mauvais secret) sur deux clients y-webrtc réellement
indépendants :

```bash
npm test    # inclut tests/p2p.integration.test.ts
```

**Manuellement, sur deux vraies machines** (ou deux comptes Windows distincts) :

1. Assurez-vous que les deux postes utilisent le **même serveur de signalisation** (le
   défaut, ou le même serveur personnalisé dans Paramètres → Réseau).
2. Sur le **PC A** : *Créer un tableau*. L'indicateur passe à « En ligne — en attente de
   participants » (s'il reste « Réseau inaccessible », ouvrez le diagnostic : le serveur
   de signalisation est injoignable). Notez le code de partage (menu *Partage* →
   *Copier le code*).
3. Sur le **PC B** : *Rejoindre avec un code* → saisir le code. B affiche « Réseau
   joignable — recherche d'un membre… » puis « Membre en ligne trouvé — demande
   envoyée ».
4. Sur A : une **pop-up d'approbation** apparaît → *Accepter*.
5. B rejoint le tableau. L'indicateur des deux côtés passe à « Connecté — 2 participant(s) ».
6. Sur A : créez un nœud (double-clic sur le fond) → il apparaît **sur B en moins de
   2 secondes**, et inversement. Les curseurs de chacun sont visibles chez l'autre.

Si l'étape 5 échoue alors que la signalisation est OK des deux côtés (indicateur
« En ligne » mais jamais « Connecté »), c'est un **réseau restrictif** : voir ci-dessous.

## Codes de partage et sécurité

- Format `XXXX-XXXX-XXXX` (12 caractères, alphabet sans 0/O/1/I), généré par
  `crypto.getRandomValues` (60 bits d'entropie).
- Le code est dérivé en deux valeurs indépendantes (HKDF-SHA-256) :
  l'**identifiant de room** (seule information visible de la signalisation) et la
  **clé de chiffrement** (jamais transmise). Sans le code, impossible de rejoindre le
  tableau ni de déchiffrer les échanges.
- **Le code EST la clé du tableau** : transmettez-le par un canal sûr (messagerie
  chiffrée, de vive voix). Toute personne disposant du code et de l'application peut
  lire et modifier le tableau.
- Mesures applicatives : liens ouverts uniquement dans le navigateur externe,
  `contextIsolation` + sandbox Electron, CSP stricte, markdown intégralement échappé
  (aucune injection HTML possible).

## Contrôle d'accès (v1.1)

Chaque tableau a un **mode d'accès**, réglable par tout membre connecté dans le menu
« Partage » et signalé en permanence par une icône (cadenas) dans la barre du haut :

- **Ouvert** : toute personne disposant du code est admise (par un membre en ligne).
- **Sur approbation** (défaut des nouveaux tableaux) : chaque demande doit être approuvée
  par un membre connecté.
- **Privé (verrouillé)** : personne ne peut rejoindre, même avec le code ; les membres
  déjà présents continuent de collaborer.

### Mécanisme (à deux salons)

Le salon où vit le document est chiffré par un **secret de session aléatoire**, généré à
la création du tableau, **non dérivable du code**, et conservé uniquement sur le poste
des membres (jamais en clair sur le réseau, jamais dans le document synchronisé).

Quand quelqu'un entre un code sans être déjà membre :

1. il ne rejoint qu'un **salon d'attente** (« lobby »), dérivé du code — donc joignable
   par tout détenteur du code, mais qui **ne contient aucune donnée du document** ;
2. il y publie sa demande (pseudo, avatar) et une **clé publique éphémère** (ECDH P-256) ;
3. un **membre en ligne** applique la politique du tableau : *ouvert* → acceptation
   automatique ; *sur approbation* → une pop-up demande à un membre d'accepter ou
   refuser ; *privé* → refus automatique ;
4. en cas d'acceptation, le membre transmet le secret de session **chiffré à la clé
   éphémère du demandeur** (ECDH → AES-GCM) — illisible pour les autres occupants du
   lobby ;
5. le demandeur déchiffre le secret et rejoint alors le salon du document.

Conséquences (assumées et documentées) :

- **un membre doit être en ligne** pour admettre un nouveau venu, même en mode ouvert
  (le code seul ne déchiffre jamais le tableau — c'est une amélioration OPSEC par
  rapport à la v1) ; sans membre en ligne, le demandeur voit « Aucun membre en ligne
  pour approuver, réessayez plus tard » ;
- on ne peut pas **« dé-partager » un secret** : quiconque a déjà obtenu le secret garde
  l'accès ; passer en *privé*/*sur approbation* ne bloque que les personnes qui ne l'ont
  jamais reçu ;
- la politique est appliquée par les membres (le premier qui répond décide).

Les tableaux créés avec la **v1** (sans secret de session) restent accessibles par la
clé dérivée du code, en mode *ouvert* (compatibilité ascendante).

## Cycle de vie du partage (clarifié en v1.5)

Un tableau **naît solo** : à la création, **aucun code n'est généré et aucune connexion
réseau n'est ouverte** (l'indicateur affiche « Tableau privé (solo) »). Le partage se
pilote depuis le menu *Partage*, qui distingue clairement **DEUX actions** :

- **Générer un code de partage** (tableau solo) : choisit le mode d'accès (défaut : sur
  approbation), crée le code + le secret de session, et ouvre la connexion P2P. **Générer
  un code sur un tableau solo n'efface rien et ne déconnecte personne.**
- **Générer un nouveau code (garder les participants)** — *rotation transparente
  (v1.5)* : invalide l'ancien code pour les **nouveaux** venus, mais **garde les
  participants déjà connectés**. Ceux-ci **migrent automatiquement** vers le nouveau
  code/secret, **sans coupure ni retour au mode solo** (le nouveau secret leur est poussé
  de façon chiffrée via leur canal existant). Seuls les détenteurs de l'**ancien** code
  qui n'étaient **pas** connectés au moment de la rotation perdent l'accès.
- **Révoquer le partage (déconnecter tout le monde)** : coupe volontairement le partage —
  **tous** les participants sont déconnectés et repassent en solo (message clair : « Le
  partage de ce tableau a été révoqué ») ; chacun **conserve sa copie locale**.

> **Important (correctif v1.5)** : le message « Ce tableau est privé (solo)… » n'apparaît
> QUE pour un tableau réellement jamais partagé ou remis en solo par son admin — **plus
> jamais comme effet de bord d'une régénération de code**. On peut donc inviter quelqu'un
> **à tout moment** sans casser la session des autres : le code reste valable dans le temps
> tant qu'il n'est pas explicitement régénéré ou révoqué.

### Ce que voit un nouvel arrivant (v1.5)

Quand une personne rejoint un tableau **déjà rempli**, elle voit d'abord un écran
**« Synchronisation du tableau… »** (avec une progression) tant que l'**intégralité de
l'état courant** (nœuds, liens, zones, entités, commentaires, images) n'est pas reçue —
puis le tableau complet s'affiche. Elle ne voit **jamais** un canvas vide par erreur. Les
images (transférées par morceaux) apparaissent progressivement. Si le premier échange
d'état tarde, la connexion est **relancée automatiquement** (backoff). Techniquement, les
gros messages d'état initial sont **fragmentés** au niveau du transport WebRTC pour ne plus
jamais être perdus silencieusement (voir DECISIONS.md n°125).

### Limites de participants

La limite (réglable **de 2 à 10**, menu *Partage*) est **réellement bloquante** : une fois
atteinte, une nouvelle demande est refusée avec un message clair (« Tableau complet
(N/N) — impossible de rejoindre pour le moment »), vérifié **à l'approbation ET à la
connexion effective** (pour éviter que deux arrivées simultanées ne dépassent la limite).

Les tableaux existants (créés avant la v1.4) **gardent leur code** et bénéficient de tout
le cycle de vie ci-dessus.

## Rôles et permissions (v1.4)

Les rôles vivent dans le document et se gèrent depuis le panneau **Participants** du menu
*Partage*. Ils sont attachés à l'**identité stable** de chaque installation (`userId`),
pas au pseudo.

- **Admin** (le créateur du tableau) : change le mode d'accès et la limite de
  participants, approuve/refuse les demandes, change le rôle des autres, **exclut** un
  participant, révoque/régénère le code, **transfère** le rôle d'admin. Un seul admin en
  v1.4.
- **Éditeur** (par défaut à l'arrivée) : crée/modifie/supprime nœuds, liens,
  commentaires ; ne touche pas aux réglages de partage.
- **Visiteur** : lecture seule (navigation, zoom, recherche, lecture des fiches et
  commentaires) ; l'UI d'édition est **masquée**.

Le changement de rôle est **immédiat** (l'interface bascule, avec une notification
« Votre rôle est maintenant : … »). **Exclusion** : le participant exclu est déconnecté ;
pour l'empêcher de revenir avec un client modifié, **combinez l'exclusion avec la
régénération du code** (la boîte de dialogue le rappelle).

**Limite honnête du modèle sans serveur** : les permissions sont appliquées par les
clients. Les clients officiels les respectent strictement et **refusent d'intégrer les
modifications émises par un pair dont le rôle ne les autorise pas** (validation à la
**réception**, pas seulement à l'émission : un client identifie l'auteur d'une
modification par son identifiant Yjs, non falsifiable par un client officiel). Mais en
pair-à-pair **sans serveur**, un client **modifié** par un utilisateur très avancé reste
une **limite théorique** du modèle. La régénération du code (rotation du secret) est le
recours pour exclure durablement une identité.

Précision technique : le filtre de réception révoque les **ajouts et modifications** non
autorisés (l'auteur est identifié par son clientID Yjs). Une **suppression** pure
n'avance pas l'horloge de son auteur et l'encodage Yjs ne porte pas l'identité du
supprimeur : la suppression émise par un client **visiteur modifié** n'est donc pas
révocable automatiquement (l'UI officielle l'interdit déjà). Recours : Ctrl+Z (tout
éditeur/admin restaure), exclusion + régénération du code.

## Limites connues

- **Disponibilité** : le tableau n'existe que sur les postes des participants. Pour le
  récupérer, il faut qu'au moins un détenteur d'une copie soit en ligne en même temps
  que vous. (Chacun peut aussi exporter/importer un fichier `.trace`.)
- **Réseaux restrictifs (TURN)** : sur un **NAT symétrique** ou derrière un **pare-feu
  d'entreprise**, le P2P direct WebRTC peut être impossible même si la signalisation
  répond. COSINT ne configure **aucun relais TURN par défaut** (aucun TURN public n'est à
  la fois gratuit, fiable et sans inscription ; en embarquer un donnerait une fausse
  impression de robustesse). Dans ce cas, le panneau de diagnostic l'affiche clairement
  (« des pairs sont découverts mais aucune connexion WebRTC n'aboutit ») **au lieu
  d'échouer en silence**. Solutions : se placer sur un réseau moins restrictif, ou faire
  transiter par un serveur TURN — un TURN peut être ajouté aux `iceServers` de
  `src/renderer/src/sync/network.ts` (ex. compte gratuit [Metered / Open Relay](https://www.metered.ca/tools/openrelay/),
  ~20 Go/mois, ou [Cloudflare Realtime TURN](https://developers.cloudflare.com/realtime/turn/)).
- **Limite de participants (2–10)** appliquée « au mieux » : en P2P pur, aucun serveur ne
  peut la faire respecter ; un client modifié pourrait l'ignorer.
- **Rôles et contrôle d'accès best-effort** : les modes d'accès et les rôles sont
  appliqués par les clients (émission ET réception). Un membre exécutant un client
  modifié pourrait divulguer le secret ou ignorer son rôle ; le modèle protège contre un
  simple détenteur du code et contre les clients officiels, pas contre un membre déjà
  admis et malveillant. Recours : exclure + **régénérer le code** (rotation du secret).
- **Synchro d'un tableau déjà chargé d'images** : le découpage en morceaux corrige le cas
  où l'image est ajoutée **pendant** que les pairs sont connectés (le bug bloquant et le
  critère d'acceptation). Pour un pair qui **rejoint** un tableau contenant déjà des
  images, y-webrtc regroupe encore l'état initial en un seul message ; la compression
  borne fortement la taille et, en pratique, la négociation WebRTC de Chromium (Electron)
  supporte des messages bien au-delà de 256 Ko. Voir `DECISIONS.md` n°98.
- **Édition concurrente d'une même fiche entité** : les champs d'une fiche fusionnent au
  niveau du tableau de champs (dernier écrivain gagne si deux personnes éditent la même
  fiche exactement au même moment). Les fiches différentes fusionnent sans conflit.
- La suppression d'un tableau ne supprime que **votre copie locale** ; les copies des
  collègues subsistent.
- Les serveurs de signalisation publics sont un service communautaire sans garantie de
  disponibilité (configurez le vôtre pour un usage professionnel).
- Les polices Inter / JetBrains Mono utilisent un **repli système** (la CSP stricte
  interdit de charger des polices web distantes).

## Données locales

- Tableaux : IndexedDB (`cosint-<boardId>`, identifiant de stockage local découplé du
  code depuis la v1.4), profil et registre des tableaux récents : `localStorage` — le
  tout dans le profil utilisateur Electron (`%APPDATA%/COSINT` sous Windows).
- « Supprimer de ce poste » sur l'accueil efface la copie locale (IndexedDB + registre).

## Structure du code

```
src/main/       Processus principal Electron (fenêtre, sécurité, IPC, menu,
                mises à jour auto electron-updater)
src/preload/    Pont contextBridge minimal (dialogues fichiers, liens externes,
                presse-papiers, mises à jour)
src/shared/     Modules partagés main/renderer (validation d'URL externe)
src/renderer/   Application React
  src/types.ts        Modèle de données
  src/i18n/           Dictionnaire français (structure prête pour l'anglais)
  src/lib/            Codes de partage (crypto), sérialisation .trace, markdown sûr,
                      compression d'images, export PNG
  src/sync/           Couche Yjs : document, mutations, awareness, hooks React,
                      réseau (network.ts : STUN, états de connexion, diagnostic)
  src/store/          État local (profil, paramètres, registre, toasts)
  src/flow/           BoardView (liaison React Flow ↔ Yjs), menu d'ajout
  src/components/     Nœuds, connexions, écrans, panneaux (dont diagnostic)
server/         Mini-serveur de signalisation auto-hébergeable (guide déploiement)
tests/          Tests unitaires + intégration P2P deux clients (vitest)
scripts/        Génération de l'icône .ico
```

### Ajouter une langue

Créer `src/renderer/src/i18n/en.ts` avec les mêmes clés que `fr.ts`, l'enregistrer
dans `DICTIONARIES` (`i18n/index.ts`) et exposer le choix dans les Paramètres.

Voir aussi [`DECISIONS.md`](./DECISIONS.md) pour les décisions prises en cours de
développement.
