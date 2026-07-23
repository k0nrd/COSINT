# DECISIONS.md — Décisions prises pendant le développement

Ce fichier consigne toutes les décisions techniques ou produit prises en cours de route,
lorsque la spécification laissait un choix ouvert ou présentait une contradiction.

## Architecture & outillage

1. **electron-vite** comme outil de dev/build (au lieu d'un webpack maison) : intégration
   native Electron + Vite + TypeScript, HMR pour le renderer, sorties séparées
   main/preload/renderer. C'est l'option la plus simple et la plus robuste en 2026.
2. **React Flow (@xyflow/react v12)** retenu, pas tldraw : React Flow couvre tous les
   besoins §6 (nœuds custom, connexions par poignées, multi-sélection, mini-carte,
   zoom/pan, `hidden` sur les nœuds pour les filtres) avec un modèle de données simple
   à mapper sur Yjs. tldraw impose son propre store et sa propre persistance, ce qui
   ferait doublon avec Yjs et compliquerait la synchro.
3. **Pas de `"type": "module"`** dans package.json : electron-vite produit alors du CJS
   pour main/preload, le mode le plus robuste avec Electron + `sandbox: true`.
4. **CSP stricte injectée uniquement au build de production** (plugin Vite
   `transformIndexHtml`). En dev, react-refresh et le client HMR de Vite nécessitent des
   scripts inline incompatibles avec `script-src 'self'`. La CSP de production interdit
   tout script non local, tout iframe, tout formulaire. Défense en profondeur côté main :
   `setWindowOpenHandler` → deny, `will-navigate` bloqué, permissions refusées.
5. **Rendu markdown : mini-moteur maison** (gras, italique, listes, échappement HTML
   systématique) plutôt qu'une dépendance type marked/DOMPurify. Le sous-ensemble requis
   (§3 : gras, italique, listes) est trivial ; un moteur maison de ~60 lignes qui échappe
   TOUT le HTML source élimine par construction le risque d'injection (contexte OSINT).
6. **Pas de récupération de favicon pour les nœuds Lien** (l'icône générique est
   utilisée systématiquement). La spec §3 dit « favicon si récupérable » mais la spec §8
   exige « aucun appel réseau autre que la signalisation WebRTC et le STUN ». Récupérer
   un favicon contacterait le domaine investigué depuis le poste de l'enquêteur — une
   fuite OPSEC inacceptable en contexte OSINT. La sécurité (§8) prime.

## Modèle de données & synchro

7. **Nœuds et connexions stockés en Y.Map imbriquées** (un Y.Map par nœud/edge, champ
   par champ) : permet la fusion CRDT au niveau du champ (deux utilisateurs modifiant
   couleur et position du même nœud ne se marchent pas dessus). Les commentaires sont
   des objets JS figés (immuables une fois créés) dans un Y.Map.
8. **Identifiant local d'un tableau = roomId dérivé du code de partage.** La base
   y-indexeddb s'appelle `cosint-<roomId>`. Le registre des tableaux récents
   (localStorage) stocke `{roomId, shareCode, title, lastOpenedAt}` — le code doit être
   conservé localement pour rester affichable dans le menu « Partage » (exigence §4).
9. **Limite de 5 participants : application « au mieux » (best-effort).** En P2P pur,
   aucun serveur ne peut faire respecter une limite. Implémentation : au moment de
   rejoindre, si l'awareness compte déjà 5 participants, l'app se déconnecte et affiche
   « Tableau complet (5/5) ». Un client malveillant pourrait l'ignorer — documenté dans
   le README comme limite connue.
10. **Undo/redo par utilisateur** : `Y.UndoManager` avec `trackedOrigins` limité à
    l'origine locale (`localOrigin`), donc Ctrl+Z n'annule jamais les modifications d'un
    collègue. `captureTimeout` par défaut (500 ms) pour fusionner les micro-mouvements
    de drag.
11. **Position mise à jour pendant le drag** (throttlée) et non seulement au drop :
    les collègues voient le nœud bouger en direct ; le coût CRDT est acceptable
    (fusion des transactions par captureTimeout côté undo).
12. **Groupe/zone = nœud d'arrière-plan purement visuel** (zIndex négatif, pas de
    parentage React Flow) : déplacer un groupe ne déplace pas les nœuds qu'il recouvre.
    La spec §3 le décrit comme « rectangle coloré en arrière-plan pour regrouper
    visuellement » — le parentage (drag groupé) est noté comme évolution v2.

## Codes de partage & crypto

13. **Alphabet des codes : `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`** (32 symboles, sans
    0/O/1/I ; « l » minuscule est normalisé en « L » majuscule à la saisie). 32 = 2⁵ →
    échantillonnage uniforme direct de `crypto.getRandomValues`, 12 caractères = 60 bits
    d'entropie.
14. **Dérivation : HKDF-SHA-256** (WebCrypto), sel constant `COSINT-v1`,
    `info = "room-id"` → identifiant de room (16 octets, base64url, préfixe `cosint-`),
    `info = "enc-key"` → clé de chiffrement (32 octets, base64url) passée comme
    `password` à y-webrtc. HKDF est préféré à PBKDF2 : le code a déjà 60 bits d'entropie
    aléatoire uniforme, l'étirement de clé n'apporte rien ; HKDF garantit la séparation
    de domaines room/clé. La room ne révèle rien sur la clé (fonctions à sens unique,
    contextes distincts).
15. **Serveurs de signalisation par défaut** : `wss://signaling.yjs.dev` et
    `wss://y-webrtc-eu.fly.dev` (les anciens serveurs Heroku de la doc y-webrtc sont
    morts). Champ « serveur personnalisé » dans les Paramètres (exigence §2).

## Produit / UI

16. **Import `.trace`** : génère toujours un nouveau code de partage (exigence §7) ;
    le tableau importé devient un tableau local indépendant.
17. **Filtres (tags/couleurs)** : les nœuds non concernés sont masqués (`hidden` React
    Flow), ainsi que les connexions dont une extrémité est masquée — comportement
    « afficher seulement » demandé par la spec, plutôt qu'un simple estompage.
18. **Thème sombre par défaut**, thème clair en option dans les Paramètres (§10.6),
    via variables CSS sur `:root[data-theme]`.
19. **Icône applicative générée par script maison** (`scripts/generate-icon.mjs`,
    PNG encodé à la main + conteneur ICO, zéro dépendance) — evite d'embarquer un
    binaire opaque dans le dépôt.
20. **Images : compression automatique** au-delà de 2 Mo via canvas (redimensionnement
    + JPEG qualité décroissante) ; refus au-delà de 8 Mo à la source. Les images
    converties perdent la transparence si conversion JPEG nécessaire (compromis taille).

## Correctifs issus de la revue multi-agents

Une revue automatisée (5 dimensions : sécurité Electron, correction Yjs, conformité
spec, français/UI, correction React) suivie d'une vérification adversariale a produit
24 findings confirmés, tous corrigés :

21. **Sécurité IPC — assainissement des chemins de sauvegarde** : `defaultName` venant
    du renderer (zone non fiable sous sandbox) est désormais réduit côté main à un nom
    de base assaini (`win32.basename` + purge des caractères de chemin), l'extension
    attendue est forcée, et le chemin est ancré dans `Documents`. Empêche un renderer
    compromis de pré-pointer un dialogue « Enregistrer sous » vers un chemin/nom/extension
    arbitraires (ex. un `.bat` dans le dossier Démarrage). Plafond de taille ajouté.
22. **Nœud image — n'affiche qu'une `data:image/`** : une URL http distante injectée par
    un pair n'est plus jamais posée en `src` (aucune requête réseau depuis le poste, §8).
23. **Présence — champs distants assainis** : `readOthersPresence` valide la couleur
    (`#rrggbb`, sinon gris) et borne le pseudo, sans muter l'objet vivant de l'awareness.
24. **Limite de 5 participants — repensée** : l'ancien classement par `Date.now()`
    comparait des horloges de postes différents (un arrivant à l'horloge en retard
    pouvait évincer un membre établi). Nouvelle règle purement locale : un client qui
    ouvre le tableau se retire lui-même s'il constate une sur-occupation pendant sa
    courte fenêtre d'arrivée (8 s) ; un participant établi ne s'auto-évince jamais après
    coup. Le contrôle s'applique aussi à la réouverture depuis les récents (sinon la
    limite était contournable). L'éviction ne supprime pas la copie locale.
25. **Fuite y-webrtc** : `provider.disconnect()` est appelé avant `provider.destroy()`
    (y-webrtc 10.3.0 ne retire le provider du registre global que dans `disconnect()`).
26. **Export PNG complet** : `onlyRenderVisibleElements` est désactivé pendant l'export,
    sinon seul le contenu du viewport courant figurait dans l'image (§7 exige le tableau
    entier). Les décors éphémères (anneaux de sélection distante, surlignages de
    recherche, curseurs) sont retirés de l'image exportée.
27. **Sélections fantômes** : les ids de sélection sont purgés quand un nœud/edge
    disparaît du document (React Flow n'émet pas de désélection pour un élément retiré),
    sans churn d'identité (le set n'est remplacé que si un id a réellement disparu).
28. **Signal de menu périmé** : la ref de séquence est initialisée à la valeur présente
    au montage, pour ne pas rejouer un export non sollicité à l'ouverture du tableau
    suivant.
29. **Recherche plein texte** : elle couvre désormais aussi le fil de commentaires des
    nœuds (le contenu base64 des images reste exclu pour éviter les faux positifs).
30. **Performance collaboration** : `remoteSelection` (et donc la reconstruction des
    nœuds) ne dépend plus que des sélections, pas des curseurs — plus de reconstruction
    de tous les nœuds à chaque mouvement de curseur distant.
31. **UI/français** : format des nombres à la française (virgule décimale), troncature
    des pseudos/tags/libellés longs venant des pairs, indice sur tableau vide, menu
    d'ajout re-cadré près des bords, Échap et erreurs d'export/import correctement
    distingués (annulation silencieuse vs échec signalé par un toast).

## Décisions v1.1 (évolution)

32. **Design tokens centralisés** (`styles/tokens.css`, §1) : source unique des
    couleurs, rayons, ombres, espacements, polices. Les composants ne référencent que
    des `var(--…)` — aucune couleur en dur. Esthétique « outil d'analyste » (fonds
    quasi noirs, bordures 1 px, rayons 2–4 px, ombres minimales). Police UI = Inter avec
    repli système, monospace = JetBrains Mono avec repli — **repli système assumé** :
    la CSP stricte interdit de charger des polices web distantes et embarquer les
    fichiers de police alourdirait le paquet ; `system-ui`/`ui-monospace` donnent un
    rendu proche sans réseau.
33. **Couleurs libres (§5)** : `color` (nœuds, liens) passe d'un énuméré à un **hex
    string**. `colorHex()` accepte les hex ET les 8 anciens noms v1 (migration
    transparente). 12 couleurs prédéfinies + historique local des couleurs récentes
    (par poste). Le filtre par couleur regroupe par hex exact.
34. **Fiches entité — champs en tableau JSON simple** (§3) : les champs d'une fiche
    sont stockés comme un tableau d'objets sur le Y.Map du nœud. Choix assumé : la
    fusion CRDT se fait au niveau du *tableau de champs* (dernier-écrivain-gagne si
    deux personnes éditent la MÊME fiche simultanément) ; chaque champ conserve
    néanmoins son propre auteur + horodatage (exigence de traçabilité §3). Une fusion
    au niveau de chaque champ (Y.Map imbriquée par champ) est notée comme évolution v1.2.
35. **Entité = un `kind` unique + `entityType`** : plutôt que 8 types de nœuds
    distincts, un seul `kind: 'entity'` porte un `entityType` (person, company, …) et
    des champs issus d'un gabarit (`lib/entities.ts`). Le nœud affiche le titre + les
    3 premiers champs non vides ; le reste dans le panneau Détails.
36. **Photo d'entité = champ URL** (pas d'image inline dans les fiches en v1.1) : évite
    un sous-système d'image-dans-champ ; on peut toujours relier un nœud Image. La
    photo est un champ cliquable ouvrant l'URL dans le navigateur externe.
37. **Sources (§4)** : nœud `kind: 'source'` avec fiabilité (A–F) et crédibilité (1–6)
    de l'échelle Amirauté. Relier un élément à une source crée un lien automatique de
    type « source de » en pointillé. Le « Rapport des sources » est un export Markdown
    additionnel (nouveau canal IPC `file:save-report`, assaini comme les autres).
38. **Contrôle d'accès — architecture à deux salons (§6, sécurité)** : le salon de
    *document* est chiffré par un **secret de session aléatoire**, non dérivable du
    code, détenu localement par les membres. Un nouveau demandeur ne rejoint d'abord
    qu'un **salon d'attente** (dérivé du code) sans aucune donnée du document ; il y
    publie sa demande + une clé publique éphémère (ECDH P-256). Un membre en ligne
    applique la politique (ouvert → auto ; approbation → humain ; privé → refus) et,
    en cas d'acceptation, lui transmet le secret **chiffré à sa clé éphémère**
    (ECDH → AES-GCM). Conséquences assumées :
    - même en mode « ouvert », **un membre doit être en ligne** pour admettre un
      nouveau venu (le code seul ne déchiffre jamais le tableau — amélioration OPSEC) ;
    - la politique est appliquée par les **membres** (le demandeur ne lit pas le mode,
      qui vit dans le document) ; « le premier qui répond décide » (dernier-écrivain
      sur le grant) ;
    - **on ne peut pas “dé-partager” un secret** : quiconque a déjà reçu le secret
      garde l'accès ; passer en privé/approbation ne bloque que les parties qui ne
      l'ont jamais reçu. Documenté dans le README.
39. **Limite de participants** conservée mais appliquée sur le **salon de document**
    (membres admis) ; les demandeurs dans le salon d'attente ne comptent pas.
40. **Migration v1 → v1.1** : le format `.trace` passe en **version 2** ; `parseTrace`
    accepte encore la version 1 et la migre (couleurs nommées → hex, `fields: []`,
    `relationType: ''`, `direction: 'none'`, `accessMode: 'open'`). Les anciens tableaux
    locaux (sans secret de session en registre) retombent sur la clé dérivée du code
    (mode ouvert historique). Le profil v1 est complété (avatar/rôle/statut) par une
    migration `zustand/persist` (version 2).
41. **Profil enrichi (§7)** : avatar (initiales/emoji/image locale compressée ≤ 512 px,
    diffusée via Awareness, plafonnée à 300 Ko), rôle libre, statut (disponible/occupé/
    absent). Les champs distants sont **assainis** avant rendu (avatar image =
    data-URL locale uniquement, couleur = hex validé, longueurs bornées).

## Correctifs issus de la revue v1.1

Revue multi-agents (4 dimensions × vérification adversariale, 21 agents) → 17 findings
confirmés (après dédup), tous corrigés :

42. **Handshake — identifiant de demande unique par tentative** : le lobby indexait les
    demandes sur l'`userId` stable du profil, et les « grants » n'étaient jamais
    invalidés → un refus ou un grant scellé à une ancienne clé verrouillait toute
    nouvelle tentative. Correction : `requestId = crypto.randomUUID()` par tentative
    (les anciens grants deviennent orphelins), + **TTL de 15 s** sur les demandes (le
    « TTL naturel » promis), + `clearInterval` du timer de republication dans `cleanup`.
43. **Lobby — surface minimale** : l'awareness du salon d'attente ne diffuse plus que le
    booléen `member` (plus l'identité complète, inutile et exposée à tout détenteur du
    code) ; l'avatar d'une demande **non approuvée** est assaini (mêmes règles que la
    présence) avant tout rendu chez le membre.
44. **Relation « source de » canonique** : `SOURCE_RELATION` vaut désormais `'source'`
    (l'id de RELATION_TYPES), pour qu'un lien créé automatiquement et un lien typé à la
    main via le panneau Détails soient **strictement identiques**. Le compteur de sources
    et le rapport Markdown reconnaissent la source **quelle que soit l'orientation** du
    lien (extrémité de type « source ») et **dédoublonnent** les liens identiques
    (concurrence P2P). `linkToSource` déduplique aussi à la création.
45. **Direction « double »** : `CosintEdge` transmet désormais `markerStart` à `BaseEdge`
    (la seconde flèche s'affiche) ; le libellé d'un lien affiche le type de relation
    traduit quand aucun label libre n'est saisi.
46. **Recherche Ctrl+F** indexe les **champs de fiche** non vides (§3).
47. **Filtres orphelins purgés** : les filtres par tag/couleur dont la valeur disparaît
    du tableau sont retirés (sinon le canvas se vidait sans moyen de désactiver le filtre).
48. **Robustesse CRDT** : `readAllNodes/readAllEdges` et la cascade de suppression
    ignorent les entrées non-`Y.Map`, et `readAllComments` assainit chaque commentaire —
    une écriture malformée d'un pair modifié ne peut plus rendre le tableau inouvrable.
49. **Commit-on-unmount** des éditeurs inline (note, titre d'entité) : un brouillon n'est
    plus perdu si un pair sort le nœud du viewport pendant l'édition
    (`onlyRenderVisibleElements`).
50. **Menu entité de la barre d'outils** : le bouton bascule ferme bien le sélecteur
    (gestion du clic-extérieur remontée au conteneur, comme le menu d'export).
51. **Couleur des tags** : non implémentée en v1.1 (décision assumée) — les tags restent
    des libellés neutres ; le sélecteur de couleur s'applique aux nœuds, liens, zones et
    profil. README corrigé en conséquence.

## Décisions v1.2 (évolution)

52. **Liaison des nœuds — cause du bug (§1)** : en v1.1, `.nd-shell` portait
    `overflow: hidden` alors que les poignées de connexion débordent de 5–6 px hors du
    cadre → elles étaient **rognées** à un liseré de ~3 px, rendant la connexion quasi
    impossible. Correctif : `.nd-shell` passe en `overflow: visible` et le contenu est
    clippé par un wrapper interne `.nd-clip`. Les poignées sont agrandies (11 px, à
    cheval sur le bord), révélées au survol/sélection, et **toutes de type `source`** en
    `ConnectionMode.Loose` (on peut tirer depuis n'importe quel côté et relâcher sur
    n'importe quel côté). Vérifié par tests de cycle de vie des liens + smoke.
53. **Relâcher une connexion dans le vide = annulation** (§1) : React Flow n'émet pas
    `onConnect` sans cible valide, donc aucun lien n'est créé. Option « créer un nœud à
    l'endroit du relâcher » notée comme évolution v1.3 (choix le plus simple retenu).
54. **Barre contextuelle du lien** (§1) : elle apparaît dès qu'un lien est **sélectionné**
    (clic simple ou double-clic) et permet de régler immédiatement type de relation,
    label, style (plein/tirets/pointillés), extrémités (aucune/simple/double), épaisseur
    (fin/normal/épais), tracé (courbe/droite/coudé) et couleur (palette rapide +
    sélecteur complet). Clic droit → menu (modifier/inverser/supprimer). Suppr supprime.
55. **Taxonomie d'entités (§2)** : ~90 types regroupés en 8 catégories
    (`lib/taxonomy.ts`). Choix : `entityType` devient un **id string** de taxonomie (id
    interne anglais) plutôt qu'un énuméré strict ; validité vérifiée au runtime. Les 8
    fiches riches de la v1.1 sont **re-clées** vers les ids de taxonomie
    (`domain`→`domain_name`, `phone`→`phone_number`, `email`→`email_address`,
    `social`→`account_profile`, `vehicle`→`ground_vehicle`) et conservent leur gabarit
    détaillé ; les autres types utilisent la structure par défaut (titre = valeur
    principale + champ notes + champs personnalisés).
56. **Ids uniques malgré les libellés répétés** : « transaction » et « autre »
    apparaissent dans plusieurs catégories ; les ids sont désambiguïsés
    (`transaction`/`crypto_transaction`, `business_other`/`crypto_other`/…).
57. **Résolution d'icônes robuste** : `entityIcons.tsx` résout le nom d'icône PascalCase
    de la taxonomie dynamiquement depuis l'espace de noms lucide, avec repli sur un
    cercle. Un nom d'icône inconnu ou renommé entre versions **ne casse pas le build**.
    Coût : le bundle importe l'ensemble des icônes lucide (~1 Mo de plus) — acceptable
    pour une application de bureau chargée depuis le disque.
58. **Sélecteur d'entité par catégories + recherche** (§2) : modale avec barre de
    recherche filtrant sur le libellé traduit ET l'id interne, catégories en en-têtes.
    Ouvert depuis la barre d'outils (création au centre) ou par double-clic sur le
    canvas (création au point cliqué). Le sous-menu d'entité de l'ancien menu d'ajout est
    remplacé par l'ouverture de ce sélecteur.
59. **Filtres catégorie/type (§2)** : un filtre par catégorie ou par type ne concerne
    que les entités ; lorsqu'il est actif, les nœuds **non-entité** sont masqués (on se
    concentre sur les entités). Les filtres orphelins (valeur disparue) sont purgés.
60. **Migration v1.1 → v1.2** : format `.trace` en **version 3** (versions 1 et 2 encore
    lues). Les connexions gagnent `width` (défaut `normal`) et `pathType` (défaut
    `bezier`) ; les `entityType` v1.1 sont normalisés à la lecture (`yMapToNode`) et à
    l'import. Aucune conversion destructive : un tableau v1.1 s'ouvre tel quel, ses
    entités reclassées gardant leurs champs.
61. **Légende repliable (§3)** : panneau listant les catégories d'entités, les couleurs
    et les styles de liens réellement présents sur le tableau.

## Correctifs issus de la revue v1.2

Revue multi-agents (3 dimensions × vérification adversariale) → 6 findings confirmés,
tous corrigés :

62. **Liens « flottants » (correctif majeur §1)** : les connexions ne stockaient pas
    d'ancre de poignée, donc React Flow les rattachait toujours à la poignée **gauche**
    des deux nœuds → tracé illisible (gauche→gauche) quel que soit le geste. Correctif
    sans changement de schéma : BoardView calcule dynamiquement, pour chaque lien, la
    poignée du **côté tourné vers l'autre nœud** (façon Maltego). Corrige aussi tous les
    liens déjà persistés ; `reverseEdge` reste inchangé.
63. **Anti-pollution de prototype (§2)** : `normalizeEntityType('toString')` remontait la
    chaîne de prototypes et renvoyait une fonction → crash Yjs à l'écriture. Corrigé par
    `hasOwnProperty` + validation du résultat ; couvert par un test.
64. **Rapport des sources cohérent** : le rapport Markdown reconnaît maintenant la source
    quelle que soit l'orientation du lien et dédoublonne, comme le compteur du panneau —
    logique factorisée dans `resolveSourceAttachments` (lib/entities.ts), utilisée par
    les deux.
65. **Recherche d'entité insensible aux accents** : « vehicule » trouve « Véhicule
    terrestre » (normalisation NFD des diacritiques).
66. **Relation personnalisée d'un lien** : sélectionner « Lien personnalisé… » n'écrit
    plus le libellé de menu dans le document ; la saisie est un brouillon local commité
    au blur (plus de transaction Yjs à chaque frappe, plus d'input démonté en cours de
    frappe).
67. **Création sous filtre actif** : un nœud créé alors qu'un filtre le masque déclenche
    un toast « Nœud créé, mais masqué par les filtres actifs » (la création ne semble
    plus avoir échoué).

## Décisions v1.3 (correctifs de connexion P2P — bugs bloquants)

68. **Cause racine du « ça ne se connecte jamais » : serveurs de signalisation
    par défaut morts.** Test empirique effectué le **2026-07-05** (script
    `ws` sur 10 serveurs, 3 passes) :

    | Serveur | Résultat (3 passes) |
    |---|---|
    | `wss://y-webrtc.fly.dev` | **3/3 OK** (~500 ms) |
    | `wss://signaling.yjs.dev` | 0/3 — DNS inexistant (ENOTFOUND) |
    | `wss://y-webrtc-eu.fly.dev` | 0/3 — timeout du handshake (zombie, issue yjs/y-webrtc#73) |
    | `wss://y-webrtc-signaling-eu.herokuapp.com` | 0/3 — 404 « No such app » |
    | `wss://y-webrtc-signaling-us.herokuapp.com` | 0/3 — 404 |
    | `wss://demos.yjs.dev/ws` | 0/3 — 504 |
    | `wss://yjs-signaling.deno.dev` | 0/3 — 404 |
    | 3 autres candidats | 0/3 — DNS inexistant / ECONNRESET |

    Les deux serveurs par défaut de la v1.2 (`signaling.yjs.dev`,
    `y-webrtc-eu.fly.dev`) étaient donc **tous deux hors service** → aucun pair
    ne se découvrait jamais → l'approbation ne trouvait personne et la synchro
    ne démarrait pas. **C'était LA cause des deux symptômes signalés.**

69. **Serveurs de signalisation retenus** : `DEFAULT_SIGNALING_URLS =
    ['wss://y-webrtc.fly.dev', 'wss://y-webrtc-eu.fly.dev']`. Le premier est le
    **seul serveur public y-webrtc vivant** au moment du test ; le second est
    conservé en **secours** (au cas où il serait ravivé) — y-webrtc les
    interroge en parallèle et tolère les serveurs morts. Comme il n'existe **pas
    3 à 5 serveurs publics fiables** (tout l'écosystème y-webrtc public est
    non maintenu depuis fin 2023), la robustesse repose sur l'**auto-hébergement** :
    un mini-serveur (`server/`, ~140 lignes, dépendance unique `ws`, adapté du
    script officiel) est fourni avec un guide de déploiement Render en 5 minutes
    (`server/README.md`). La signalisation ne voit passer aucune donnée de
    tableau (chiffrement de bout en bout AES-GCM), seulement des identifiants
    de room dérivés (non réversibles). Serveurs personnalisés **multiples**
    désormais acceptés dans les Paramètres (séparés par des virgules).

70. **STUN explicite (§1.3)** : `peerOpts.config.iceServers` = Google
    (`stun.l.google.com:19302` + `stun1`), Cloudflare
    (`stun.cloudflare.com:3478`), Twilio (`global.stun.twilio.com:3478`) — les
    trois répondent (binding requests testés le 2026-07-05). Configuré
    explicitement plutôt que de dépendre des défauts de simple-peer. Le STUN ne
    voit passer aucune donnée. **Pas de TURN par défaut** (assumé) : aucun
    serveur TURN public n'est gratuit *et* fiable *et* sans inscription ; en
    embarquer un donnerait une fausse impression de robustesse. Sur réseau
    restrictif (NAT symétrique, pare-feu d'entreprise), le P2P direct échoue —
    ce cas est désormais **détecté et affiché** (voir n°72) au lieu d'échouer
    en silence, avec renvoi au README pour configurer un TURN.

71. **Refonte des états de connexion (§1.5)** : l'ancien trio
    connecté/attente/hors-ligne confondait « signalisation en cours »,
    « signalisation OK mais seul » et « signalisation injoignable ». Cinq états
    distincts (`sync/network.ts`) : **Connexion au réseau…** (grâce de 10 s),
    **En ligne — en attente de participants** (signalisation OK, 0 pair),
    **Connecté — N participant(s)**, **Réseau inaccessible — mode local**
    (signalisation morte au-delà de la grâce), **Mode local** (ouverture sans
    connexion). L'indicateur devient une **pilule cliquable** dans la barre du
    haut ouvrant le panneau de diagnostic.

72. **Panneau de diagnostic (§1.4)** : `DiagnosticsPanel` affiche en temps réel
    et en français l'état de chaque serveur de signalisation
    (connecté/connexion/échec + nb de tentatives), les pairs découverts et
    l'état de chaque connexion WebRTC (en négociation/connectée/échouée), la
    dernière erreur détaillée, et un bouton **Retester la connexion**.
    L'indicateur et le panneau lisent la **même** photographie réseau
    (`ConnectionDiagnostics`) : ils ne peuvent pas se contredire. Détection
    « réseau restrictif » : signalisation OK + pairs découverts + aucune
    connexion WebRTC aboutie ⇒ message TURN.

73. **Flux d'approbation robuste (§1.6)** : le message « Aucun membre en ligne »
    ne s'affiche plus quand c'est en réalité le **réseau** qui est injoignable.
    La salle d'attente a désormais une machine d'états (`LobbyClientPhase`) :
    *connexion au réseau* → *recherche d'un membre* (grâce 10 s) → *membre
    présent* / *aucun membre* / *réseau injoignable*, chacun avec son message.
    La demande **reste publiée** (republication toutes les 4 s + reconnexion
    automatique de la signalisation avec backoff via lib0), donc un membre qui
    arrive plus tard voit la demande — plus d'échec immédiat.

74. **Bug de TTL des demandes corrigé (piège d'horloges désynchronisées)** :
    côté membre, la fraîcheur d'une demande était jugée en comparant `at`
    (horloge du **demandeur**) à `Date.now()` (horloge du **membre**). Deux
    postes désynchronisés de >15 s rendaient donc toute demande soit
    immédiatement périmée, soit éternelle. Corrigé comme la limite de
    participants (DECISIONS n°24) : la fraîcheur est mesurée **localement** (on
    note quand chaque valeur `at` distincte est *observée* ; la republication
    du demandeur prouve qu'il est vivant). Aucune comparaison entre horloges de
    postes différents.

75. **Codes de partage (§1.7)** : la dérivation était déjà robuste et
    déterministe (HKDF-SHA-256, contextes séparés room/clé/lobby-room/lobby-key,
    échange de secret X25519-équivalent P-256 ECDH → AES-GCM) et testée. v1.3
    ajoute des **tests d'intégration deux clients** (`p2p.integration.test.ts`)
    exerçant tout le chemin : création → demande → approbation → transmission
    du secret scellé → synchro bidirectionnelle < 2 s → refus d'un mauvais
    secret. La validation de format à la saisie (insensible à la casse, tirets
    optionnels, message d'erreur clair) était déjà présente (`normalizeShareCode`).

76. **§2 Presse-papier** : `navigator.clipboard` échouait sous sandbox Electron
    (contexte non sécurisé / focus). Remplacé par l'**API `clipboard`
    d'Electron côté main** via un canal IPC `app:copy-text` exposé par le
    preload, utilisé pour toutes les copies (code de partage, champs
    email/téléphone). Toast « Copié » au succès.

77. **§4 Liens externes** : normalisation et validation **factorisées** dans un
    module partagé main/renderer (`src/shared/url.ts`, alias `@shared`) :
    préfixe `https://` si le schéma est absent (« google.com » fonctionne),
    n'accepte que http/https (rejet de `file:`, `javascript:`, `data:`…),
    exige un hôte plausible pour les saisies sans schéma. `setWindowOpenHandler`
    et `will-navigate` **redirigent** désormais les http(s) vers le navigateur
    externe (au lieu de seulement refuser) ; les autres schémas sont bloqués.
    Testé (`url.test.ts`, 13 cas).

78. **§3 Pan au Ctrl+clic** : `panActivationKeyCode={['Space', 'Control']}`. Sur
    le **fond** du canvas, Ctrl+glisser déplace la vue (curseur main géré par
    React Flow) ; sur un **nœud**, Ctrl+clic reste la multi-sélection
    (`multiSelectionKeyCode`, distinct). Le lasso simple sur le fond reste
    disponible sans Ctrl.

79. **§5 Installeur & mises à jour** : `oneClick: false` +
    `allowToChangeInstallationDirectory: true` conservés ; l'`appId`
    (`com.cosint.app`) est **inchangé** → GUID NSIS stable → mise à jour
    par-dessus sans désinstallation manuelle, entrée « Applications » de
    Windows. `build/installer.nsh` propose à la désinstallation de **conserver
    (défaut) ou supprimer** les données locales (`%APPDATA%/COSINT`), et ne le
    demande **pas** lors d'une mise à jour (`${isUpdated}`). Mises à jour
    automatiques via **GitHub Releases** (`electron-updater`) : vérification
    silencieuse au démarrage → toast « Mise à jour disponible » → téléchargement
    → bannière « Redémarrer pour installer ». Publication : `npm run release`
    (`electron-builder --publish always`) après avoir renseigné `publish.owner`
    dans `electron-builder.yml`. Version portée à **1.3.0**, affichée dans le
    titre de fenêtre (`page-title-updated` bloqué pour ne pas être écrasé) et
    dans les Paramètres. Les données locales survivent à toute mise à jour
    (elles vivent dans `%APPDATA%/COSINT`, hors du dossier programme).

80. **Test d'intégration : isolation des clients** : y-webrtc maintient un
    registre **global** de rooms par instance de module. Pour simuler deux
    clients réellement indépendants dans un seul processus de test, chaque
    client charge sa propre instance des modules (`vi.resetModules()`), et
    `y-webrtc` est ajouté à `test.server.deps.inline` (sinon le registre serait
    partagé). Le transport est le vrai `BroadcastChannel` de Node (mêmes
    messages chiffrés AES-GCM qu'en production ; seule la découverte WebRTC
    réseau — signalisation → ICE — n'est pas exercée, elle est couverte par la
    procédure manuelle deux PC du README et par la vérification pilotée de
    l'app réelle).

## Correctifs issus de la revue v1.3 (revue multi-agents adversariale)

Revue multi-agents (5 dimensions × vérification adversariale indépendante de
chaque finding, 28 agents) → 18 findings confirmés (2 high, 5 medium, 11 low).
Corrigés :

81. **[HIGH] Contournement de la politique d'accès (§6)** : un membre fraîchement
    admis a d'abord un document VIDE (IndexedDB vide, meta pas encore synchronisé
    par WebRTC). `readMeta` retombant sur `accessMode = 'open'`, son serveur de
    lobby auto-scellait le secret de session à tout demandeur en attente, sans
    décision humaine — contournant « approbation » et « privé » pendant quelques
    secondes. Correctif : `startLobbyServer` reçoit `isPolicyReady()` (vrai quand
    `meta.createdAt > 0`, c.-à-d. politique réellement synchronisée) ; tant que
    c'est faux, il **n'admet ni ne refuse** personne (fail-safe : sans données du
    tableau, on n'a pas l'autorité pour décider). Couvert par un test
    d'intégration dédié (`p2p.integration.test.ts` : mode 'open' + politique non
    prête ⇒ aucun grant ; politique prête ⇒ admission).
82. **[HIGH] Pan au Ctrl+clic inopérant (§3)** : `panActivationKeyCode` avec
    `'Control'` était mort — le filtre d3-zoom de React Flow refuse par principe
    tout `mousedown` portant Ctrl (Ctrl étant réservé au zoom molette). Le pan au
    Ctrl+glisser gauche sur le fond ne faisait donc RIEN (ni pan, ni lasso).
    Correctif : implémentation **manuelle** du pan (BoardView : `onCanvasPointerDown`
    + suivi du pointeur → `reactFlow.setViewport`), déclenchée uniquement sur le
    fond (`.react-flow__pane`, jamais sur un nœud → la multi-sélection Ctrl+clic
    reste intacte), avec curseur « main fermée ». `'Control'` reste dans
    `panActivationKeyCode` uniquement pour désactiver le lasso pendant Ctrl.
    Vérifié en pilotant l'app réelle (le viewport suit le curseur au pixel près).
83. **[MEDIUM] Bouton « Retester la connexion » cassé** : (a) y-webrtc 10.3.0 ne
    vide jamais `provider.signalingConns` dans `disconnect()` et `connect()` y
    re-pousse ; le dédoublonnage par URL gardait la PREMIÈRE occurrence = la
    connexion DÉTRUITE → statut figé « Réseau inaccessible » après un retest, même
    reconnexion réussie. Correctif : garder la DERNIÈRE occurrence (la connexion
    vivante). (b) La fenêtre de grâce (`startedAt`) n'était pas réarmée au retest,
    donc pas de retour visuel « Connexion au réseau… ». Correctif : `retestProvider`
    pose `__cosintRetestAt` sur le provider, lu par `computeDiagnostics`
    (`graceStart = max(startedAt, retestAt)`).
84. **[LOW, déjà corrigé avant revue] Fuite d'écouteurs + faux « unreachable »** :
    `observeDiagnostics` retire désormais ses écouteurs `connect`/`disconnect`
    posés sur les connexions de signalisation PARTAGÉES (registre global y-webrtc)
    au démontage ; et le statut `'waiting'` ne dépend plus de `navigator.onLine`
    (souvent faux sous VPN/adaptateur virtuel Windows) : une signalisation
    connectée prouve la connectivité.
85. **[LOW] Re-rendu périodique inutile** : `startLobbyServer` déduplique
    `onPendingChange` (sérialisation comparée) — plus de re-rendu d'App+BoardView
    toutes les 5 s quand aucune demande ne change.
86. **[LOW] Salle d'attente : « no-member » transitoire après reconnexion** :
    `signalingUpAt` est réinitialisé quand la signalisation retombe, de sorte
    qu'une reconnexion (Wi-Fi rétabli) accorde une nouvelle fenêtre « searching »
    de 10 s au lieu d'afficher « Aucun membre en ligne » avant la redécouverte.
87. **[LOW] Course annulation/réessai du handshake** : `requestJoin` utilise une
    ÉPOQUE (`joinEpochRef`) incrémentée à chaque demande ET à chaque annulation ;
    une demande dont l'époque a changé pendant l'`await requestAccess` (annulée ou
    remplacée) est détruite sans effet, et `onPhase`/`onResult` l'ignorent — plus
    de client fantôme ni d'ouverture de tableau après une annulation.
88. **[LOW] Effets de bord dans les updaters setState** : `openByCode` et
    `handleBack` détruisent le tableau précédent HORS de la fonction de mise à
    jour (via `boardRef`), les updaters redevenant purs (contrat React,
    double-invocation StrictMode).
89. **[LOW] Durcissement du serveur de signalisation** : `server/signaling.js`
    borne désormais la taille des messages (`maxPayload` 64 Kio + contrôle
    applicatif), le nombre de topics par connexion (100) et la longueur d'un nom
    de topic (200) — contre l'épuisement mémoire/l'amplification par un client
    anonyme. Impact d'origine limité (relais optionnel, contenu chiffré E2E).

Findings NON retenus (réfutés à la vérification ou hors périmètre) : 5 candidats
écartés (symptômes impossibles vu le code réel, ex. « clés React dupliquées »
rendues impossibles par le dédoublonnage par URL).

## Décisions v1.4 (évolution)

### §1 — Stabilité des images en P2P (bug bloquant)

90. **Cause racine confirmée du crash « ajouter une image casse la session ».**
    Deux mécanismes distincts :
    - **(a) Avatar dans l'awareness.** L'état d'awareness Yjs est rediffusé en
      continu à tous les pairs. Une data-URL d'avatar (plusieurs centaines de Ko)
      y était placée telle quelle (`PresenceUser.avatar.value`), saturant les
      canaux WebRTC à chaque changement de curseur/présence.
    - **(b) Image de tableau en un bloc.** `map.set('content', '<3 Mo base64>')`
      produit UNE mise à jour Yjs de plusieurs Mo → un message de synchro y-webrtc
      dépassant la taille max d'un message DataChannel WebRTC (~256 Ko) → la
      connexion tombe.

91. **Protocole de chunks (`sync/files.ts`).** Y.Map dédiée `files` sur le
    document, clés plates :
    - `m:<hash>` → métadonnées `{ mime, chunkCount, size, width, height }` ;
    - `c:<hash>:<i>` → chunk `i` (≤ 48 Ko de base64).
    **Le point clé de correction** : les chunks sont écrits en **transactions
    Yjs SÉPARÉES** (origine `FILE_ORIGIN`, distincte de l'undo). Chaque chunk =
    une mise à jour distincte et bornée (≤ 48 Ko) = un message WebRTC bien
    en-dessous de ~256 Ko → la connexion tient. Écriture légèrement étalée
    (lots de 4, `setTimeout(0)`) pour préserver la réactivité et laisser les
    autres éditions s'intercaler. `CHUNK_SIZE = 48 Ko` (marge sous 64 Ko/256 Ko
    après overhead Yjs + chiffrement AES-GCM). Les fonctions de découpage /
    réassemblage / hash sont **pures** (testables sous Node).

92. **Adressage par contenu (hash SHA-256 → base64url tronqué 22 car.).** Sert
    d'identifiant ET de clé de **déduplication** (deux imports de la même image
    réutilisent les chunks) ET de contrôle d'intégrité léger (une divergence de
    taille au réassemblage → état d'erreur). Les nœuds image ne portent plus que
    le hash dans `content` ; les avatars, le hash dans l'awareness.

93. **`files` exemptée du filtrage par rôle (§6).** Le contenu étant adressé par
    hash (auto-vérifiable, immuable), tout pair — y compris un visiteur — peut y
    contribuer un blob sans risque (un blob corrompu produit une image cassée →
    état d'erreur, jamais un crash ni une corruption d'un fichier existant). Cela
    permet aussi à un visiteur de diffuser son avatar. Origine `FILE_ORIGIN`
    reconnue à la réception et laissée passer.

94. **Robustesse (§1.4).** `readFileStatus` retourne `complete | loading |
    missing | error` de façon **synchrone** et sans jamais lever d'exception. Le
    nœud image affiche : image / barre de progression (affichage progressif) /
    « Réessayer ». Un `<img onError>` (base64 corrompu) bascule aussi en erreur.
    `resumeFile` réécrit les chunks manquants depuis une source locale
    (reprise / bouton Réessayer quand le pair possède l'original). Un transfert
    interrompu n'affecte que ce nœud ; le reste du tableau continue.

95. **Compression systématique à l'import (§1.3).** `processImage(blob, profile)`
    redimensionne puis réencode **toujours** (WebP, repli JPEG si non supporté ;
    WebP préserve la transparence). Deux profils avec **limites strictes après
    compression** : tableau ≤ 1600 px / ≤ 1,5 Mo, avatar ≤ 256 px / ≤ 200 Ko ;
    au-delà (même après compression), **refus poli** expliquant la limite (jamais
    d'insertion d'une image qui saturerait la synchro). Limite à la source portée
    à 25 Mo (les photos de téléphone sont compressées ensuite).

96. **Avatars référencés par hash.** L'awareness porte `{ type: 'image', value:
    '<hash>' }` ; l'image vit dans `files` (chunkée). À l'arrivée sur un tableau,
    `BoardView` enregistre l'avatar (data-URL locale du profil) dans `files` et
    remplace la valeur d'awareness par le hash — en attendant, initiales. Les
    pairs résolvent le hash → data-URL via `resolveAvatar` (recalculé à chaque
    changement de `files`, donc l'avatar apparaît dès les chunks reçus). L'avatar
    LOCAL (aperçu de soi) reste la data-URL du profil (jamais de réseau).
    Le salon d'attente (lobby) reste inchangé : c'est un canal transient et les
    avatars y sont désormais bornés à 200 Ko — hors périmètre du bug awareness.

97. **Migration (§1.5).** `migrateInlineImages` convertit à l'ouverture les nœuds
    image dont `content` est encore une data-URL inline (tableaux d'avant la v1.4)
    vers le format en chunks ; idempotent, non bloquant, exécuté aussi après un
    import `.trace`. Le nœud image affiche une data-URL héritée directement tant
    qu'elle n'est pas migrée (rétrocompatibilité). Le `.trace` reste **portable**
    (auto-suffisant) : `exportBoardData` réintègre la data-URL inline des images
    (réassemblée depuis `files`) ; à l'import, la migration les re-chunke.

98. **Limite honnête documentée : synchro INITIALE d'un tableau déjà chargé
    d'images.** Le découpage en chunks + transactions séparées corrige le cas
    **incrémental** (les deux pairs connectés, l'image arrive en direct — c'est LE
    bug signalé et le critère d'acceptation obligatoire §1.6). Pour la synchro
    **initiale** (un pair qui rejoint/reconnecte un tableau contenant déjà des
    images), y-webrtc regroupe encore le diff complet en un seul message
    (`syncStep2`), qui peut dépasser ~256 Ko. Atténuation : la compression borne
    fortement chaque image, et en pratique la négociation SCTP Chromium↔Chromium
    (Electron) autorise des messages bien au-delà de 256 Ko. Une fragmentation au
    niveau transport de y-webrtc n'a pas été implémentée (patch fragile des
    internes de simple-peer, non testable sans banc WebRTC réel, risque de casser
    la connexion existante). Documenté dans le README.

### §5 — Cycle de vie du partage (solo → code → révocation)

99. **Découplage stockage local / code de partage.** En v1.3, l'identifiant de
    stockage IndexedDB ÉTAIT le `roomId` dérivé du code → impossible d'avoir un
    tableau sans code. En v1.4, `BoardHandle.boardId` (clé de stockage `cosint-
    <boardId>`) est **découplé** du `shareCode` (salon P2P dérivé du code). Un
    tableau créé localement a `boardId = local-<uuid>` et `shareCode = null` (solo,
    aucun provider). Générer un code n'ouvre le provider que sur le salon dérivé du
    code, sans changer le stockage. Migration du registre (`zustand/persist`
    version 1) : `roomId` → `boardId` (même valeur, stockage inchangé), les
    tableaux existants gardent leur code.

100. **Reconfiguration du partage sans perte ni course IndexedDB.** Générer /
    révoquer / régénérer **ré-ouvre** le document avec une nouvelle configuration
    (provider ou solo). Pour éviter toute course avec le vidage IndexedDB, l'état
    courant est réinjecté via `Y.encodeStateAsUpdate` + `Y.applyUpdate` (idempotent
    avec le chargement disque, adressage CRDT). Le `boardId` (stockage) ne change
    jamais.

101. **Révocation clock-free.** Un `meta.shareRevocation` (jeton aléatoire) est posé
    à la révocation ; chaque client snapshotte le jeton à sa connexion et se
    déconnecte si le jeton **change** (comparaison par ÉGALITÉ — jamais d'horloge,
    même piège évité qu'aux n°24/74). L'admin pré-fixe son propre snapshot au
    nouveau jeton pour ne pas s'auto-révoquer, laisse ~800 ms de propagation, puis
    repasse en solo. La **régénération** = poser un nouveau jeton (déconnecte tout
    le monde) + rouvrir avec un nouveau code + nouveau secret ; le changement de
    ROOM (dérivée du code) suffit déjà à isoler les anciens détenteurs, le jeton
    assure la déconnexion + le message. Un révoqué/exclu **repasse en solo** (copie
    locale conservée), son entrée de registre passe `shareCode: null`.

### §6 — Limite réglable, rôles et permissions

102. **Rôles dans le document, attachés à l'identité stable.** `meta.adminId`
    (créateur) + une Y.Map `roles` (`userId → 'editor' | 'visitor' | 'excluded'`,
    par clé → fusion concurrente). `effectiveRole` : admin si `adminId`, sinon
    l'attribution explicite, sinon **éditeur par défaut** (défaut à l'arrivée, sans
    écriture). Une valeur « admin » dans `roles` est ignorée (l'admin passe UNIQUEMENT
    par `meta.adminId` → un pair ne peut pas se hisser admin via `roles`). La limite
    de participants (`meta.participantLimit`, 2..10, défaut 5) remplace la constante
    fixe dans `watchParticipantLimit`.

103. **Filtrage à la RÉCEPTION (`sync/roleGuard.ts`).** Défense en profondeur en plus
    du masquage UI : un `Y.UndoManager` suit les transactions DISTANTES (origine =
    provider) ; à chaque transaction distante, on identifie l'auteur par le
    **clientID Yjs** (horloge avancée dans `afterState`) → `userId` via l'awareness →
    rôle, et on **révoque** (`guard.undo()`) toute transaction touchant une cible non
    autorisée pour ce rôle (`permitsWrite`, pure et testée). Fail-safe **permissif**
    (auteur/rôle momentanément inconnu → on n'annule pas). La Y.Map `files` est
    **exemptée** (adressée par contenu, auto-vérifiable — n°93). L'annulation a une
    origine ≠ provider → elle n'est pas re-filtrée et se propage ; un éditeur légitime
    n'est jamais révoqué (donc pas de boucle). Limite documentée : un client MODIFIÉ
    reste une limite théorique (l'auteur d'un struct Yjs n'est infalsifiable que pour
    un client officiel).

104. **Émission gardée aussi.** `BoardContext` expose `role/canEdit/canManageSharing` ;
    les callbacks d'écriture no-op pour un visiteur, l'UI d'édition est masquée
    proprement (barre d'outils, double-clic, collage, glisser, suppression, poignées
    React Flow `nodesDraggable/nodesConnectable`), et seuls les admins voient les
    contrôles de partage/rôles/limite/exclusion.

### §6bis — Ergonomie des entités

105. **Suppression clavier + clic droit.** `deleteKeyCode` de React Flow désactivé
    (null) ; suppression gérée à la main (Suppr **et** Retour arrière, jamais dans un
    champ texte, gardée par `canEdit`). Confirmation `window.confirm` **uniquement à
    partir de 3 éléments**. Annulable (Ctrl+Z, origine locale). Clic droit sur un
    nœud/une sélection → `SelectionContextMenu` (« Supprimer N élément(s) »).

106. **Débordement des nœuds.** Correctif CSS : `overflow-wrap: anywhere` +
    `-webkit-line-clamp` sur les valeurs d'entité, `overflow-wrap: anywhere` sur le
    markdown → le texte long **revient à la ligne** et est clippé DANS le cadre (le
    `.nd-clip` clippe déjà), le texte complet restant dans le panneau Détails. La
    croissance automatique en hauteur écrivant dans le document n'a PAS été retenue
    (churn P2P + risque de boucle) : les nœuds restent redimensionnables à la main.
    Multi-lignes : Entrée = nouvelle ligne dans les `textarea`, Échap valide.

107. **Champs à valeurs multiples + affichage personnalisable.** Chaque VALEUR est un
    `EntityField` distinct (même libellé/type) ; bouton « + » = champ frère,
    « × » = retrait — valeurs illimitées, toutes visibles dans Détails et
    synchronisées. Nouveau champ optionnel `EntityField.shown` : `visibleNodeFields`
    affiche les champs `shown === true` (ordre du tableau, réordonnable par
    glisser-déposer), ou à défaut les 2 premiers champs non vides. Le premier
    basculement d'un œil **fige** explicitement l'ensemble visible avant d'inverser
    (transition sans disparition). Préférences du sélecteur d'entités (tri
    catégorie/alpha, récents, favoris) stockées **localement** par utilisateur
    (`zustand/persist` version 3).

### §3 — Liens cliquables dans les entités

108. **Nouveau `FieldKind: 'social'`.** La valeur STOCKÉE reste une **URL http(s)
    normale** (portable, rendue comme n'importe quel lien) ; l'UI du champ social
    ajoute un sélecteur de plateforme + un identifiant, et construit l'URL
    (`buildSocialUrl`). `lib/links.ts` : plateformes extensibles (X, Instagram,
    Facebook, LinkedIn, TikTok, Telegram, YouTube, GitHub, Reddit…), détection de la
    plateforme d'après l'hôte (icône), résolution d'URL **réutilisant
    `normalizeExternalUrl` du §4 v1.3** (préfixe https://, http/https uniquement).
    Un `@pseudo` devient l'URL de la plateforme choisie. Clic = ouverture externe ;
    clic droit = « Copier le lien » (IPC presse-papier). Email/téléphone gardent la
    copie au clic. Testé (`links.test.ts`).

### §4 — Personnalisation visuelle des entités

109. **Style stocké en objet JSON `style` sur le nœud** (comme `fields`) : `shape`,
    `borderStyle/Width/Color`, `fillColor/Opacity/transparentFill`, `textSize`.
    Fusion LWW à l'échelle de l'objet style (édition rare, mono-utilisateur en
    général). Rendu par NodeShell via **variables CSS** (`--nd-*`) posées seulement
    pour les propriétés personnalisées (repli sur les défauts du thème). Formes :
    `border-radius` (rectangle/arrondi/capsule/cercle) ou `clip-path` porté par
    `.nd-clip` (losange/hexagone) — jamais sur `.nd-shell`, pour **ne pas rogner les
    poignées** de connexion (§1 v1.2). Pipette de style via un presse-style local
    (BoardView). « Réinitialiser » supprime la clé `style` (retour au défaut du
    type, couleur de catégorie). Styles synchronisés P2P et inclus aux exports
    JSON/PNG (readAllNodes + rendu DOM).

### §2 — Signature de code & SmartScreen

110. **Signature pilotée par variables d'environnement, jamais de secret au dépôt.**
    `electron-builder.yml` : `signingHashAlgorithms: [sha256]`, horodatage RFC-3161
    (`timestamp.sectigo.com`), `publisherName`, `copyright`. Le certificat est fourni
    par `CSC_LINK`/`CSC_KEY_PASSWORD` (OV .pfx, auto-détectés) ou
    `--config.win.certificateSubjectName` (EV, magasin Windows). Sans ces variables,
    `npm run build:win` produit un binaire **non signé mais fonctionnel** (l'exigence
    « build:win doit fonctionner » est préservée). `verifyUpdateCodeSignature: false`
    tant que non signé (auto-update non bloqué ; à repasser à true après signature).
    README : guide d'achat (OV suffit, EV supprime l'avertissement immédiatement ;
    Certum/Sectigo/SSL.com), commandes de build signé, et section « Installation »
    utilisateur (Informations complémentaires → Exécuter quand même). Aucun
    comportement de type malware : écritures cantonnées à `%APPDATA%/COSINT` + fichiers
    choisis via dialogues, aucun processus lancé, navigation/permissions/téléchargements
    bloqués (main/security.ts).

## Correctifs issus de la revue v1.4 (revue multi-agents adversariale)

Revue multi-agents (3 dimensions × vérification adversariale indépendante, 23 agents,
20 findings candidats) → **17 findings confirmés**, corrigés :

111. **[HIGH] Première révocation jamais détectée** : le watcher gardait
    `revocationSnapshotRef !== ''`, ce qui supprimait la transition `'' → jeton`
    (première révocation). Corrigé : détecter TOUTE différence avec le jeton
    snapshotté à la connexion (l'admin pré-fixe son snapshot pour ne pas s'auto-révoquer).
112. **[HIGH] Le filtre de rôle révoquait des transactions MULTI-auteurs** : la synchro
    initiale (`syncStep2`) est une seule transaction contenant l'historique de tous les
    auteurs ; si l'un était aujourd'hui rétrogradé visiteur, `guard.undo()` effaçait TOUT
    le tableau. Corrigé : ne garder QUE les transactions à **un seul auteur** (forme
    d'une édition en direct) ; les transactions multi-auteurs portent du contenu déjà
    validé et ne sont jamais révoquées (un pair ne contrôle que son propre clientID, il
    ne peut pas forger une transaction multi-auteurs).
113. **[HIGH] Menu contextuel de lien + redimensionnement + barre de lien non gardés
    pour un visiteur** : `onEdgeContextMenu`, la barre `EdgeToolbar`, le
    `NodeResizer` et l'écriture de dimensions dans `onNodesChange` contournaient
    `canEdit`. Corrigés (masqués/no-op pour un visiteur), en plus du filtre de réception.
114. **[MEDIUM] `effectiveRole('excluded')` → éditeur** : un participant exclu était
    traité en éditeur par défaut (ses écritures acceptées). Corrigé : « excluded » →
    `visitor` (ses écritures sont révoquées à la réception).
115. **[MEDIUM] Migration d'images inline exécutée par un visiteur** : `migrateInlineImages`
    tournait pour tous ; un visiteur écrivant `content = hash` était révoqué à la
    réception, restaurant la grosse valeur inline d'un coup. Corrigé : la migration ne
    s'exécute pas pour un visiteur.
116. **[MEDIUM] Transfert d'image interrompu → barre de progression éternelle** : aucun
    délai ne faisait passer un `loading` figé en `error`. Corrigé : `ImageNode` bascule
    en erreur après `STALL_MS` (20 s) sans progression ; « Réessayer » réévalue l'état
    (les chunks manquants peuvent arriver si un pair les détenant se reconnecte).
117. **[MEDIUM] Divers §6bis/§3/§4** : pipette de style qui fusionnait au lieu de
    remplacer (→ `applyNodeStyle`) ; `visibleNodeFields` qui « ressuscitait » les champs
    masqués quand on masquait le dernier visible (→ détection explicite sur
    `shown !== undefined`) ; Suppr/Retour arrière supprimant le nœud édité depuis un
    `<select>`/`<button>` du panneau (→ garde élargie) ; `buildSocialUrl` transformant un
    identifiant à points (`john.doe`) en URL morte (→ détection URL par schéma/chemin/hôte
    connu) ; anneau de sélection absent sur losange/hexagone (→ règle dédiée) ; poignée de
    glissement seule « draggable » + nettoyage `onDragEnd` (sélection de texte préservée) ;
    numéros à points pris pour des liens (→ TLD alphabétique).
118. **[LOW] Chunk corrompu irréparable + avatar de lobby** : `registerFile` compare
    désormais le CONTENU (et non la présence) → un chunk corrompu est réécrit
    (`resumeFile` répare) ; le lobby ne diffuse plus la data-URL d'avatar (initiales).

### Limites v1.4 assumées et documentées (non corrigées, honnêtes)

119. **[HIGH — inhérent] Synchro INITIALE d'un tableau déjà chargé d'images.** Voir
    n°98. Non corrigée : la seule vraie correction (fragmentation au niveau transport)
    n'est PAS injectable proprement — y-webrtc 10.3.0 n'accepte pas de classe `Peer`
    personnalisée via `peerOpts`, et patcher les internes de simple-peer (send +
    réassemblage avant le handler 'data' de y-webrtc) est fragile et non testable sans
    banc WebRTC réel (risque de casser la connexion qui MARCHE). Le critère d'acceptation
    obligatoire §1.6 (les deux pairs connectés, ajout en direct) est satisfait ; le cas
    « rejoindre un tableau ayant déjà des images » est borné par la compression et, en
    pratique, la négociation SCTP Chromium↔Chromium tolère de gros messages ; y-webrtc
    avale d'ailleurs l'exception d'envoi (le pair ne casse pas, mais peut ne pas recevoir
    l'état initial). Documenté README.
120. **[HIGH — inhérent CRDT] Suppressions non attribuables au filtre de réception.**
    Le filtre révoque les AJOUTS et MODIFICATIONS non autorisés (auteur identifié par le
    clientID Yjs dont l'horloge avance). Une SUPPRESSION pure n'avance pas l'horloge de
    son auteur et le `deleteSet` Yjs ne porte pas l'identité du supprimeur → une
    suppression émise par un client VISITEUR MODIFIÉ n'est pas révocable. L'UI officielle
    interdit déjà la suppression à un visiteur (Suppr, clic droit, poignées gardés) ;
    recours contre un client modifié : Ctrl+Z (tout éditeur/admin restaure) + exclusion +
    régénération du code. Une solution « tombstone » (suppression douce attribuable)
    a été écartée : elle change toute la sémantique de suppression et fait croître le
    document sans fin. Cohérent avec la « limite théorique du modèle sans serveur ».
121. **[LOW] La Y.Map `files` croît sans GC.** Un nœud image supprimé et chaque avatar
    superséré laissent leurs chunks. L'adressage par contenu BORNE la croissance aux
    images/avatars DISTINCTS réellement utilisés (les réimports sont dédupliqués). Un GC
    automatique n'a pas été implémenté : en P2P live, supprimer un fichier qu'un nœud
    image concurrent (pas encore synchronisé) référence, ou un avatar d'un pair non
    encore vu par l'awareness, casserait l'affichage — le risque dépasse le bénéfice
    (croissance lente). Un « compactage » coordonné est une évolution possible.

## Ajustements produit v1.4 (retours utilisateur)

122. **Formes d'entités supprimées.** Le choix de forme (cercle/losange/hexagone/
    capsule) n'apportait pas de valeur et compliquait le rendu (clip-path, poignées) :
    retiré de l'UI, du modèle (`EntityStyle.shape`) et du CSS. Les entités restent des
    **rectangles arrondis**. Le reste de la personnalisation §4 (bordure, fond, opacité,
    transparent, taille du texte, pipette, réinitialisation) est conservé. Un `shape`
    hérité d'un ancien document est simplement ignoré à la lecture.

123. **Aucune limite d'affichage des détails.** Par défaut, un nœud entité/source
    affiche désormais **TOUS ses champs renseignés** (au lieu des 2 premiers) — mettre
    10 numéros de téléphone les montre tous. Les nœuds entité/source passent en
    **hauteur automatique** (React Flow mesure le contenu ; la hauteur stockée sert de
    minimum, le redimensionnement manuel fixe ce minimum, le contenu peut dépasser). L'œil
    (§6bis) permet toujours de masquer explicitement des champs.

124. **Blocage des versions antérieures à la connexion.** La version applicative est
    injectée au build (`__APP_VERSION__` via Vite `define`). Le demandeur la publie dans
    sa requête de lobby ; le membre approbateur **refuse d'emblée** (motif `outdated`,
    quel que soit le mode d'accès) toute demande dont la version est STRICTEMENT
    antérieure à la sienne (`isOlderVersion`, testé), avec un message dédié « Version trop
    ancienne — mettez à jour ». Enforcement au **point de jointure** (lobby) ; un membre
    déjà admis qui rétrograderait puis reviendrait avec le secret mémorisé est un cas
    limite documenté (l'awareness ne peut pas forcer la déconnexion d'un vieux client qui
    ne coopère pas).

## Décisions v1.5 (évolution — synchronisation fiable + confort d'usage)

### §1 — Bugs de synchronisation qui cassaient le travail en équipe (priorité absolue)

125. **§1a — Fragmentation applicative du transport WebRTC (`sync/peerFraming.ts`).**
    *Cause racine du « nouvel arrivant voit un canvas vide ».* Quand un pair rejoint un
    tableau déjà rempli, y-webrtc lui envoie l'état initial complet (`syncStep2`) en UN
    SEUL message DataChannel. Dès qu'il contient une image (chunks de la Y.Map `files`),
    ce message dépasse la taille maximale d'un message SCTP négocié (~256 Ko côté
    Chromium) : `simple-peer.send()` lève une exception que y-webrtc AVALE silencieusement
    (`try {…} catch {}`) — l'arrivant ne reçoit jamais l'état initial, alors que la
    présence (petits messages) fonctionne. C'était admis noir sur blanc en limite v1.4
    (n°98). **Correctif :** on instrumente chaque `WebrtcConn.peer` (sans forker
    node_modules) — l'ENVOI découpe tout message > 48 Ko en trames bornées
    `[MAGIC, msgId, index, total, …payload]`, la RÉCEPTION les réassemble avant de les
    remettre au handler d'origine de y-webrtc (capturé puis ré-enveloppé). Les petits
    messages passent INCHANGÉS (octet de tête 0xFB impossible pour un vrai message Yjs
    dont le type tient sur 1 octet 0..4) → compatibilité descendante totale. Testé
    (`tests/peerFraming.test.ts` : round-trip d'un message de 300 Ko, trames en désordre,
    passthrough d'un message normal).

126. **§1a — Écran de synchronisation initiale + backoff (`useInitialSync`,
    `SyncOverlay`).** Un nouvel arrivant voit « Synchronisation du tableau… » (avec
    progression : pairs joints, éléments reçus) TANT QUE l'état complet n'est pas reçu —
    jamais un canvas vide. Considéré prêt quand `meta.createdAt > 0` (preuve que l'état
    initial est arrivé ; un membre qui rouvre un tableau en cache local l'a d'emblée) ou
    quand le provider a signalé une synchro complète (`synced`). Si rien n'arrive après
    4/8/16 s, on relance automatiquement signalisation + découverte (backoff, journalisé)
    plutôt que de rester bloqué.

127. **§1a — Correction du faux « partage révoqué » à l'arrivée.** Le veilleur de
    révocation snapshotait `meta.shareRevocation` sur le document ENCORE VIDE d'un
    arrivant (valeur ''), puis la première sync livrait un jeton historique non vide →
    faux positif « révoqué » qui éjectait l'arrivant en solo. **Correctif :** la référence
    de partage n'est ARMÉE qu'une fois l'état initial reçu (`shareBaselineReadyRef`), en
    re-snapshotant à ce moment-là les vrais jetons SANS réagir. Un jeton historique ne
    déclenche donc plus de révocation à tort.

128. **§1b/§1c — Rotation transparente du code vs révocation (`sync/rotation.ts`).**
    *Mécanisme de migration transparente des participants lors de la rotation de code
    (livrable §7.2).* La v1.4 implémentait « régénérer » COMME une révocation (un seul
    champ `shareRevocation`), sans canal pour pousser le nouveau secret : tous les
    participants étaient éjectés en solo. On distingue désormais deux opérations :
    - **Révoquer** (`shareRevocation`, boardOps) = couper le partage : TOUT le monde
      repasse en solo (comportement voulu, bouton « Révoquer le partage (déconnecter tout
      le monde) »).
    - **Faire tourner le code** (rotation, bouton « Générer un nouveau code (garder les
      participants) ») = invalider l'ancien code pour les NOUVEAUX venus tout en gardant
      les participants déjà connectés.

    **Migration transparente :** chaque participant connecté publie une clé publique
    éphémère (`rekey`, ECDH P-256) dans son awareness. À la rotation, l'admin génère un
    nouveau code + secret, SCELLE le couple `{code, secret}` à la clé publique de CHAQUE
    participant connecté (hors exclus) via ECDH→AES-GCM (`sealSecret`) et écrit ces
    enveloppes dans `meta.shareRotation = { token, grants: { userId → SealedSecret } }`.
    Ces enveloppes se propagent sur le salon ACTUEL (ancien, encore chiffré par l'ancien
    secret ; seul le destinataire peut ouvrir la sienne) ; l'admin bascule ensuite vers le
    nouveau salon. Chaque participant détecte le changement de `token`, ouvre son
    enveloppe avec sa clé privée et rejoint le nouveau salon SANS interruption ni retour
    au mode solo (`reconfigureShare`). Un détenteur de l'ANCIEN code NON connecté (donc
    sans enveloppe) reste sur le salon mort → il perd l'accès (c'est le but de la
    rotation). `shareRotation` est ajouté à `SHARING_META_KEYS` (roleGuard) → écriture
    réservée à l'admin. Testé (`tests/p2p.integration.test.ts` : B connecté reçoit et
    déchiffre le nouveau code/secret ; un userId absent n'obtient rien).

129. **§1d — Fiabilisation du rendu (disparitions aléatoires d'éléments).** *Cause
    racine.* `useBoardData` reconstruit tout le tableau à chaque tick Yjs ; les objets
    nœuds React Flow repartaient alors SANS `measured`, ce qui fait réinitialiser à React
    Flow (`adoptUserNodes`) les `handleBounds` et masquer les nœuds auto-hauteur
    (`visibility:hidden`) — faisant DISPARAÎTRE liens (en premier) et nœuds jusqu'au
    redémarrage. **Correctif :** on REPORTE `measured` (lu via `reactFlow.getNode(id)`)
    dans les objets reconstruits → poignées et affichage restent stables, plus aucun
    démontage d'edges. Bouton « Rafraîchir l'affichage » (panneau de diagnostic) qui
    force une re-mesure complète (sans report de `measured` pour un rendu), réparant tout
    désalignement résiduel SANS quitter l'app. Journal de synchronisation (`store/syncLog`)
    affiché dans le diagnostic (arrivées, migrations, fragmentation, rafraîchissements).

130. **§1e — Limite de participants réellement bloquante.** Vérification à DEUX points :
    (1) à l'APPROBATION — le membre approbateur refuse toute demande avec un motif explicite
    « tableau complet » (`reason: 'full'`) quand le nombre de participants du document
    (awareness) atteint la limite, tous modes confondus ; (2) à la CONNEXION effective —
    `watchParticipantLimit` fait se retirer proprement le surnuméraire (déconnexion
    complète, jamais d'état à moitié connecté), couvrant les approbations quasi simultanées
    par plusieurs membres. Message clair « Tableau complet (N/N) — impossible de rejoindre
    pour le moment ». Testé (`tests/p2p.integration.test.ts` : `isFull → refused 'full'`).

### §4 — Zones : déplacement du contenu

131. **Détection d'appartenance à une zone par recouvrement géométrique (livrable §7.2).**
    Un nœud est considéré « sur » une zone si son CENTRE (`x + width/2`, `y + height/2`) est
    dans le rectangle de la zone. Ctrl+glisser sur une zone déplace la zone ET tous ces
    nœuds (capturés à `onNodeDragStart`, décalés du même delta pendant `onNodeDrag`). Sans
    Ctrl, la zone bouge seule. Pas de conflit avec le pan Ctrl+clic (v1.3) : celui-ci ne
    s'active que sur le FOND vide (`react-flow__pane`), jamais sur un nœud/zone. Le nom de
    zone (double-clic pour éditer, Entrée/blur valide) était déjà en place (GroupNode).

### §6 — Espacement des libellés catégorie · type

132. **Catégorie et type séparés partout.** Bug « InternetCompte / profil » : dans
    l'en-tête d'entité, la catégorie et le titre (repli = type) étaient deux `<span>`
    inline sans style, donc collés. Correctif CSS : `.nd-entity-head-text` en colonne,
    `.nd-entity-cat` en petite étiquette au-dessus. Le panneau Détails affiche « Catégorie
    · Type » avec séparateur. Le sélecteur et les filtres montraient déjà catégorie et type
    dans des sections distinctes.

### §3 — Badges de statut (`lib/status.ts`)

133. **Un badge de statut par élément, posable sur nœuds ET liens.** Sept valeurs (Aucun,
    Confirmé, Problème, Faux positif, Question, Stop, En attente) définies dans un fichier
    unique et extensible (couleur + glyphe + libellé i18n). Stocké dans un champ `status`
    du Y.Map du nœud/lien (absent = 'none', jamais écrit → pas de bruit). Pastille en coin
    du nœud (NodeShell) et près du lien (CosintEdge). Réglable depuis les barres
    contextuelles (NodeToolbar, EdgeToolbar) ET le clic droit (SelectionContextMenu pour
    tout type de nœud + multi-sélection, EdgeContextMenu). Filtre par badge + compteur par
    statut dans la barre de filtres. Inclus dans les exports : JSON (sérialisation), PNG
    (la pastille est dans le DOM capturé), rapport de sources (ligne « Statut »). Testé
    (sérialisation aller-retour nœuds + liens, statut inconnu ignoré).

### §5 — Minimap utile (`BoardMiniMap`)

134. **Mini-carte maison (nœuds + liens).** La MiniMap native de React Flow ne dessine que
    les nœuds (pas les liens) et paraissait vide (aggravé par le bug §1d). On la remplace
    par un SVG maison qui affiche nœuds/entités ET liens à leurs couleurs, le cadre de la
    vue courante, et permet de cliquer/glisser pour se déplacer (conversion écran→tableau
    via la CTM SVG, `setCenter`). Masquée à l'export PNG.

### §2 — Plateformes de comptes (`lib/links.ts`)

135. **Catalogue de plateformes étendu + personnalisées.** Liste unique et extensible
    (`PLATFORMS`) passée à un modèle par GABARIT d'URL (`{id}`) : ~38 plateformes (réseaux
    sociaux + comptes/fournisseurs), chacune avec catégorie, icône et hôtes de détection.
    Les fournisseurs sans URL de profil publique (Google, Proton, e-mail…) ont un gabarit
    vide → l'identifiant brut est conservé. Plateformes PERSONNALISÉES (nom, gabarit `{id}`
    optionnel, icône) mémorisées localement (`store/settings.customPlatforms`) et
    réutilisables. Sélecteur cherchable et groupé (`PlatformPicker`) avec ajout inline
    d'une plateforme personnalisée. Testé (construction d'URL, détection, plateforme
    personnalisée avec/sans gabarit).

### Limites v1.5 assumées

136. **Fragmentation entre versions mixtes.** Un pair v1.4 (non patché) qui recevrait une
    trame fragmentée d'un v1.5 ne saurait pas la lire — MAIS un v1.4 ne recevait de toute
    façon jamais un gros message (c'était le bug §1a), donc aucune régression. Le contrôle
    de version au lobby (n°124) écarte déjà les v1.4 des tableaux v1.5.

137. **Migration de rotation et pairs momentanément déconnectés.** Un participant qui se
    déconnecte pile pendant la fenêtre de rotation (~800 ms) peut manquer son enveloppe et
    devoir re-rejoindre avec le nouveau code. Cas limite accepté ; l'enveloppe reste dans
    le document (le pair peut la lire s'il revient assez vite).

## Correctifs issus de la revue v1.5 (revue multi-agents adversariale)

138. **[HIGH] §1d — Le report de `measured` lisait le mauvais nœud.**
    `reactFlow.getNode(id)` renvoie le *userNode* qu'on a nous-mêmes passé (sans
    `measured` en mode contrôlé) : le report était un **no-op** et la disparition
    persistait. Corrigé en lisant `reactFlow.getInternalNode(id)?.measured` (le nœud
    INTERNE porte la mesure réelle mise à jour par React Flow). Le bouton « Rafraîchir
    l'affichage » utilise désormais l'API dédiée `useUpdateNodeInternals` (au lieu d'une
    mutation de ref en phase de rendu, fragile sous React StrictMode).

139. **[HIGH] §1a — Le gate de synchro s'ouvrait sur un canvas vide.** y-webrtc émet un
    `synced: true` **vacueux** quand la DERNIÈRE connexion pair se ferme
    (`room.webrtcConns` vidée) — y compris déclenché par notre PROPRE backoff de retest
    (disconnect/connect) ou par un échec ICE. S'y fier ouvrait le gate (« Synchronisation
    terminée ») sur un tableau distant pourtant rempli. Corrigé : le signal de « prêt »
    repose UNIQUEMENT sur l'arrivée du meta du document (`readMeta(doc).createdAt > 0`,
    toujours écrit par `initBoardMeta`), fiable ; l'événement `synced` n'est plus consulté.

140. **[MEDIUM] §1a — Fragmentation avec backpressure.** L'envoi synchrone de toutes les
    trames d'un état initial > 16 Mio débordait le tampon du DataChannel ; l'exception
    (avalée par y-webrtc) laissait un message partiel jamais complété (retour du bug).
    Corrigé : les trames sont mises en FILE (ordre préservé) et drainées tant que
    `bufferedAmount < 8 Mio` ; un échec de `send()` **ne retire pas** la trame de la file
    (réessai différé) → plus de perte silencieuse. Drainage abandonné si le peer est détruit.

141. **[HIGH] §2 — Réécriture silencieuse d'un champ social vers x.com.** La plateforme
    n'étant pas persistée mais re-déduite de la valeur (`platformForUrl`, limité aux
    plateformes intégrées), une valeur d'une plateforme PERSONNALISÉE ou SANS URL de
    profil retombait sur Twitter au montage, et un simple blur réécrivait le champ en
    `https://x.com/…`. Corrigé sur deux fronts : (1) `customToPlatform` DÉRIVE l'hôte du
    gabarit → les plateformes personnalisées sont détectables depuis une URL stockée
    (`detectPlatform` consulte intégrées + personnalisées) ; (2) un garde `dirty` empêche
    toute réécriture sur un blur PASSIF (aucune saisie utilisateur) — indispensable pour
    les plateformes sans hôte (identifiant brut) dont la plateforme n'est pas récupérable.

142. **[LOW] §5 — Dérive du glisser dans la mini-carte.** Le viewBox dépendait du cadre de
    vue courant : pendant un glisser de navigation, déplacer le cadre étendait les bornes
    → le viewBox changeait → la correspondance curseur→tableau dérivait (« chasse »).
    Corrigé : le cadrage est FIGÉ pour toute la durée du glisser (snapshot au pointerdown).

143. **[LOW] §6 — Exclusion enforced dès la première synchro.** Le veilleur établissait sa
    référence de partage sur la première synchro puis retournait sans contrôler
    l'exclusion (état COURANT, pas un changement de jeton). Un participant exclu ré-admis
    par le lobby (le seal du lobby ne connaît pas le userId) restait donc connecté sur un
    tableau inactif. Corrigé : l'exclusion est vérifiée aussi sur la passe d'établissement
    de la référence.

144. **[MEDIUM, PRÉ-EXISTANT] roleGuard aveugle aux suppressions pures.** La revue a
    reconfirmé la limite déjà documentée (n°120) : une transaction distante composée
    UNIQUEMENT de suppressions n'avance aucune horloge → pas d'auteur détectable → non
    révocable. Inchangé (choix assumé : le « tombstone » alourdit la sémantique et fait
    croître le document ; recours : Ctrl+Z + exclusion + rotation du code).

## Décisions v1.6 (évolution — contrôle des liens, ergonomie, bloc de code)

Version cible **1.6.0**. Cinq chantiers : routage manuel des liens (§1), ergonomie
zoom/poignées (§2), gestionnaire de raccourcis clavier (§3), auto-grandissement des
zones de texte (§4), bloc de code (§5). Format `.trace` : **version 4** (les
versions 1 à 3 restent lues ; les nouveaux champs sont OPTIONNELS → un fichier v3
s'ouvre sans erreur, liens sans routage). Blocage des pairs antérieurs conservé (un
pair < 1.6.0 ne rejoint pas un tableau 1.6 : `sync/lobby.ts` + `lib/version.ts`),
donc pas de souci de rétro-compat P2P intra-session (les nœuds `code` inconnus d'un
1.5 ne se rencontrent jamais).

### §2 — Ergonomie du zoom et des poignées (`flow/ZoomCompensator.tsx`, CSS)

- **Compensation inverse-zoom par variable CSS.** Poignées de connexion, poignées de
  redimensionnement, zones de clic, waypoints et badges de statut vivent DANS la
  couche transformée de React Flow : leur taille écran est multipliée par le zoom, et
  devient minuscule au dézoom. Plutôt qu'abonner CHAQUE nœud au zoom (coûteux : tous
  les nœuds se re-rendraient à chaque cran de zoom — cf. le précédent `CursorsOverlay`
  qui, lui, est un seul overlay), un unique composant `ZoomCompensator` (monté dans
  `<ReactFlow>`) lit le zoom via `useStore` et publie **une** variable CSS
  `--fl-inv-zoom` (inverse du zoom, borné [0,5 ; 6]) sur le conteneur `.fl-canvas-wrap`.
  Elle est HÉRITÉE par les nœuds ET l'overlay des libellés de liens. Le CSS applique la
  compensation avec la propriété CSS **indépendante `scale:`** (et non `transform:`),
  qui se compose avec le `transform: translate(...)` que React Flow utilise déjà pour
  positionner les poignées — donc **sans casser leur placement** (piège vérifié dans le
  CSS de React Flow : `.react-flow__handle-*` occupe `transform`, `.react-flow__resize-control.handle`
  occupe `translate:`, les deux laissent `scale:` libre).
- **Bornes par élément** (`clamp()` en CSS) : poignées [0,8 ; 3], badges [0,85 ; 2,4] —
  « lisible au dézoom sans devenir énorme ». Taille de base des badges légèrement
  augmentée (18 px en coin de nœud, 17 px sur les liens).
- **Zone de clic élargie** : pseudo-élément `.nd-handle::before { inset: -9px }` (suit
  l'échelle de la poignée), on ne vise plus au pixel près.

### §4 — Auto-grandissement des zones de texte (`components/common/AutoTextarea.tsx`)

- **Un composant réutilisable** `AutoTextarea` (textarea contrôlé qui mesure
  `scrollHeight` à chaque frappe et ajuste sa hauteur jusqu'à `maxHeight`, puis scroll)
  généralise l'auto-grandissement — déjà présent au niveau des nœuds entité/source
  (§6bis v1.4) — à tous les champs multilignes restants : champs « texte long » du
  panneau Détails (dont descriptions de sources), composeur de commentaires, éditeur de
  note du canvas, et l'éditeur de code (§5).
- **Notes du canvas rendues auto-hauteur.** Pour honorer « pas de texte masqué », les
  nœuds `text` et `timestamped` rejoignent l'ensemble AUTO_HEIGHT_KINDS
  (`lib/nodeStyle.ts`, partagé NodeShell/BoardView) : ils grandissent pour afficher tout
  leur contenu (la hauteur stockée reste un minimum). Auparavant un contenu trop long
  était rogné. Choix assumé : un contenu très long agrandit le nœud (cohérent avec les
  entités/sources depuis v1.4) ; l'éditeur, lui, plafonne puis scrolle.
- **Titres laissés en champ mono-ligne** (`<input>`) : le texte reste visible pendant la
  frappe (défilement horizontal), aucun masquage vertical à corriger ; les convertir en
  textarea changerait la sémantique d'Entrée. Non retenu.

### §1 — Routage manuel des liens (`lib/edgeRouting.ts`, `edges/CosintEdge.tsx`)

- **Modèle de données** (champs OPTIONNELS sur `BoardEdgeData`, absents = tracé auto) :
  `waypoints: {x,y}[]` en coordonnées **absolues** du tableau (donc stables au
  déplacement d'un nœud — le fil ne « saute » pas), et `sourceAnchor`/`targetAnchor`
  (`t|b|l|r`) pour le côté de départ/arrivée. Persistés dans `sync/model.ts` (lecture
  défensive : waypoints malformés ignorés) et le `.trace` (`sanitizeEdge`). `EdgePatch`
  étendu ; `updateEdge` clone la liste de waypoints ; `resetEdgeRouting` SUPPRIME les
  clés (updateEdge ignore `undefined`, il ne peut pas retirer une clé) ; `reverseEdge`
  **inverse aussi** l'ordre des waypoints et échange les ancres (sinon le routage se
  retrouverait à l'envers/sur la mauvaise extrémité).
- **Waypoints = mécanisme unifié de contrôle.** Le cahier des charges distingue
  « points de contrôle » (torsion de la courbe) et « points de passage ». On les
  **unifie** en un seul primitif : des points par lesquels le fil PASSE, avec des
  poignées déplaçables sur la courbe. En bézier, la courbe est lissée pour passer par
  chaque point (Catmull-Rom → Bézier cubique) : déplacer un point règle donc la torsion
  de la courbe (exigence « contrôle de la torsion »). En coudé, segments orthogonaux
  passant par les points ; en droite, polyligne. Rationale : un seul primitif,
  entièrement synchronisé P2P, sérialisable et testable — plutôt que des poignées de
  contrôle « hors courbe » (control points bézier classiques) difficiles à synchroniser
  et déroutantes. Documenté comme choix produit.
- **Interaction** (dans `CosintEdge`, quand le lien est sélectionné et éditable) : ronds
  pleins = waypoints (glisser pour déplacer, clic droit pour supprimer) ; ronds creux au
  milieu de chaque segment = ajout par glisser ; double-clic sur le lien (via
  `onEdgeDoubleClick` de BoardView) = ajout à la position cliquée (segment le plus
  proche). Le glissement écoute au niveau `window` (les ronds SVG sont recréés à chaque
  écriture Yjs, comme les nœuds pendant un déplacement — la capture de pointeur sur
  l'élément ne survivrait pas). Écriture continue pendant le glissement (même approche
  que `moveNodes`).
- **Ancrage** : réglage DÉTERMINISTE via le panneau Détails (deux sélecteurs
  Départ/Arrivée : Auto/Haut/Bas/Gauche/Droite → `setEdgeAnchor`), doublé du **tirer-
  déposer** de l'extrémité sur une autre poignée du même nœud (`onReconnect` de React
  Flow → fixe l'ancre ; les dépôts vers un autre nœud sont ignorés — la source/cible
  d'un lien reste immuable ; aucun `onReconnectStart/End` de suppression, donc pas de
  suppression accidentelle). L'ancrage est aux **4 côtés** (poignées exposées par le
  nœud) ; le « point précis du bord » n'est pas retenu (discret = robuste). Quand des
  waypoints existent, l'ancre AUTO vise le premier/dernier waypoint (le fil part du bon
  côté).
- **Réinitialiser** (« Tracé automatique ») : bouton dans le panneau Détails ET entrée
  du menu contextuel (clic droit) du lien.
- **Export** : le chemin SVG (waypoints compris) est rendu par `<BaseEdge>` → capturé
  tel quel dans le PNG ; les poignées ne s'affichent que `selected` (donc jamais à
  l'export, `selected` étant forcé à false). Inclus au JSON via la sérialisation.

### §5 — Bloc de code (`lib/prism.ts`, `components/nodes/CodeNode.tsx`)

- **Bibliothèque retenue : Prism.js** (`prismjs` 1.30), et NON Monaco/CodeMirror.
  Justification : Prism est léger (le renderer packagé passe de ~2,3 à ~2,6 Mio — Monaco
  ajouterait plusieurs Mio et des web-workers), empaqueté depuis `node_modules` (donc
  conforme à la **CSP stricte** `script-src 'self'`, aucun accès réseau : les grammaires
  sont importées STATIQUEMENT dans l'ordre de leurs dépendances, pas d'autoloader). La
  « coloration en direct » exigée est obtenue par la technique du **textarea transparent
  superposé à un `<pre>` colorié** aux mêmes métriques (police, interligne, tabulation) :
  on tape dans le textarea (caret visible, texte transparent), le `<pre>` en dessous
  montre les couleurs, le conteneur défile en bloc (pas de synchro de scroll manuelle).
  CodeMirror 6 n'était nécessaire que si cette technique ne suffisait pas — elle suffit.
- **Aucun thème Prism importé** : les couleurs des jetons passent par des variables CSS
  (`code.css`) déclinées pour le thème sombre (défaut) et clair — cohérence avec l'app.
- **Modèle** : nouveau `NodeKind` `'code'` (le `Record<NodeKind,…>` de `nodeTypes`,
  `DEFAULT_SIZES`, `NODE_KINDS` force à tout renseigner). Code dans `content` (donc
  couvert par la recherche plein texte Ctrl+F automatiquement), titre optionnel dans
  `title`, langage dans un nouveau champ optionnel `language` (persisté model + trace).
  ≥ 20 langages (JS/TS/JSX/TSX, Python, HTML, CSS, JSON, SQL, Bash, PHP, Java, C, C++,
  C#, Go, Rust, YAML, Markdown, texte brut). Menu de langage cherchable, bouton
  « Copier » (IPC presse-papier existant `copyText`), bouton plein écran (Modal). Nœud
  redimensionnable, scroll interne au-delà (PAS auto-hauteur React Flow : le code peut
  être volumineux). Numéros de ligne dans une gouttière collée à gauche (visible au
  scroll horizontal), indentation préservée (Tab = 2 espaces).
- **Présentation** : le bloc apparaît comme une nouvelle **catégorie « Code »** dans le
  sélecteur d'entités (à côté de Business, Internet — via une sentinelle
  `CODE_BLOCK_PICK` que BoardView reconnaît pour créer un nœud `code` et non une
  entité), ET comme entrée directe dans le menu double-clic et la barre d'outils.

### §3 — Gestionnaire de raccourcis clavier (`lib/shortcuts.ts`, `store/shortcuts.ts`)

- **Centralisation d'abord.** Un module unique `lib/shortcuts.ts` déclare toutes les
  ACTIONS raccourciables (id stable, catégorie, libellé, combinaison par défaut, `null`
  = sans défaut) et les utilitaires de combinaison. Le répartiteur clavier de BoardView
  (auparavant une cascade de `if` codés en dur) dérive une table `combinaison → action`
  de la configuration et appelle le gestionnaire correspondant. Plus aucun raccourci
  codé en dur dispersé (sauf Échap, cas d'UI non réassignable).
- **Modèle de configuration** : `store/shortcuts.ts` (zustand + persist localStorage,
  « par poste ») ne stocke que les **écarts** au défaut (`overrides`) — clé absente =
  défaut, chaîne = réassignée, `null` = SUPPRIMÉE. Le raccourci EFFECTIF combine défauts
  et overrides. Format d'une combinaison : chaîne normalisée `Mod+Shift+K` (`Mod` = Ctrl
  ou Cmd), ordre des modificateurs fixe pour l'égalité. `Ctrl++` et `Ctrl+=` normalisés
  pareil (zoom). Fonctions pures testées : `bindingFromEvent`, `effectiveBinding`,
  `findConflict`, `bindingToActionMap`, `exportBindings`, `sanitizeImportedBindings`.
- **UI** (`components/home/ShortcutsSettings.tsx`, section des Paramètres) : liste
  groupée par catégorie, filtre de recherche, réassignation par **capture en direct**
  (on presse la combinaison ; l'écoute est en phase de **capture** + `stopPropagation`
  pour que la touche — dont Échap qui annule — ne remonte PAS au gestionnaire Échap de
  la modale), réinitialisation / suppression par action, **détection de conflit**
  (prévient et propose de réassigner en retirant le raccourci à l'autre action),
  import/export JSON (téléchargement Blob / `<input type=file>` — pur renderer, sans IPC,
  compatible CSP) et « Tout réinitialiser aux valeurs par défaut ».
- **Limite assumée** : les accélérateurs du menu natif (processus principal,
  `src/main/menu.ts` : export, import, paramètres) restent codés côté main et ne passent
  pas par ce gestionnaire (ils échappent au keydown du renderer). Documenté ; les
  raccourcis du CANVAS sont, eux, entièrement configurables. La suppression est reliée à
  « Suppr » (Retour arrière n'y est plus mappé par défaut — réassignable).

### Migration & tests

- **Migration** : tous les nouveaux champs (routage de liens, langage de code) sont
  optionnels et lus défensivement → un tableau/fichier v1.5 s'ouvre sans erreur, les
  liens existants reçoivent le tracé par défaut (aucun waypoint). `TRACE_VERSION` = 4,
  `SUPPORTED_VERSIONS` = [1,2,3,4].
- **Tests ajoutés** (34) : `edgeRouting.test.ts` (aller-retour Y.Map + `.trace` des
  waypoints/ancrages, migration v3→v4, construction du tracé, waypoints malformés
  ignorés), `codeNode.test.ts` (langage + contenu round-trip, repli plaintext,
  coloration réelle avec jetons `.token` — y compris PHP), `shortcuts.test.ts`
  (normalisation dont AltGr, effectif défaut/réassigné/supprimé, conflit, table
  inverse, import/export).

## Correctifs issus de la revue v1.6 (revue multi-agents adversariale)

Chaque candidat de la revue a été confirmé par un second agent (falsification) avant
correction. 6 défauts réels corrigés (0 réfuté après vérification).

1. **[HIGH] §5 — Coloration entièrement désactivée par un hook PHP.** `prism-php`
   enregistre un hook GLOBAL « après-tokenisation » qui déréférence
   `Prism.languages['markup-templating']`. Sans l'import préalable de
   `prism-markup-templating`, CHAQUE appel à `Prism.highlight` (tous langages) levait
   une `TypeError` avalée par le `try/catch` de `highlightCode` → tous les blocs
   s'affichaient en texte brut, sans erreur visible. Corrigé : import de
   `prismjs/components/prism-markup-templating` AVANT `prism-php`. (Un test le
   verrouille — la coloration produit désormais des jetons, PHP compris.)
2. **[MEDIUM] §2 — Ancrage des liens décalé par la mise à l'échelle des poignées.** Le
   `scale:` posé sur `.nd-handle` se compose « en dedans » du `transform: translate(...)`
   de React Flow : le décalage `-50%` était multiplié par l'échelle, et surtout React
   Flow mesure la poignée via `getBoundingClientRect` (échelle comprise) mais sa largeur
   via `offsetWidth` (hors échelle) → `handleBounds` faux, ancres des liens décalées de
   ~11·(échelle−1) px (jusqu'à 22 px au dézoom) après remesure (création/agrandissement
   d'un nœud auto-hauteur). Corrigé : agrandissement par `width`/`height` (mesure
   cohérente, centre invariant), survol par anneau (plus de `scale`/`transform`). Idem
   pour les poignées de redimensionnement.
3. **[MEDIUM] §1 — Reconnexion : ancrage figé de la mauvaise extrémité.** `onReconnect`
   écrivait les DEUX ancres alors qu'une seule extrémité est tirée (React Flow reporte
   le handle « auto » courant sur l'extrémité non déplacée). Corrigé : mémorisation de
   l'extrémité tirée via `onReconnectStart`, on ne fixe que celle-là.
4. **[MEDIUM] §3 — Raccourcis déclenchés malgré une modale ouverte.** Le garde du
   répartiteur ne testait que `target.closest('.cm-modal-overlay')` : si le focus
   retombait sur `<body>` (hors de la modale), les raccourcis du canvas s'exécutaient.
   Corrigé : sortie anticipée si `document.querySelector('.cm-modal-overlay')` (comme la
   branche Échap).
5. **[MEDIUM] §3 — AltGr traité comme une vraie touche.** `bindingFromEvent` ne filtrait
   pas `AltGraph` (ni CapsLock/NumLock…) → capture d'une combinaison parasite. Corrigé
   par un ensemble `MODIFIER_KEYS`.
6. **[LOW] §5 — Échap inopérant dans l'éditeur de code plein écran.** L'éditeur passait
   `onEscape` à vide et `stopPropagation` sur Échap empêchait la modale de se fermer.
   Corrigé : `onEscape` ferme et committe (comme le bouton ✕).

---

## v1.7 — Import/export CSV, copier-coller, recherche, chronologie, correctifs

### Format de fichier & migration

1. **`TRACE_VERSION` passe de 4 à 5.** Seul champ nouveau : `eventDate?: number` (date
   d'événement d'un nœud, §4). C'est un champ **optionnel** : aucun script de migration
   n'est nécessaire — un fichier v4 s'ouvre tel quel (`eventDate` reste `undefined`). La
   lecture est défensive dans les **trois** chemins qui recopient le modèle champ par
   champ : `sanitizeNode` (fichiers `.trace`), `yMapToNode` (persistance Yjs/IndexedDB)
   et l'écriture symétrique `nodeToYMap`. Oublier l'un des trois ferait disparaître le
   champ selon la provenance (fichier vs doc local). Les tableaux v1.6 s'ouvrent donc
   sans erreur (migration transparente, comme `status`/`waypoints`/`language`).
2. **Version applicative → 1.7.0** dans `package.json` (source unique, propagée au
   renderer via `__APP_VERSION__` et au main via `app.getVersion()`). Le garde-fou de
   compatibilité P2P (`lobby.ts`) refusera automatiquement les pairs strictement
   antérieurs à 1.7.0.

### §1 — Import/export CSV

3. **Parseur CSV maison (RFC 4180), pas de dépendance.** `lib/csv.ts` : champs entre
   guillemets, guillemet doublé `""` échappé, séparateur/retour à la ligne à l'intérieur
   des guillemets, fins de ligne CRLF/LF. Détection du séparateur par comptage **hors
   guillemets** sur la 1re ligne (`,` `;` tabulation). Détection d'en-tête heuristique :
   première ligne « en-tête » si toutes ses cellules sont non vides et non purement
   numériques (surchargeable en mode assisté). BOM UTF-8 retiré à la lecture, ajouté à
   l'écriture (Excel), sortie en CRLF.
4. **Détection d'encodage côté main (`file:open-csv`).** Le fichier est lu en **buffer**
   puis décodé selon son BOM : UTF-16 LE/BE (BOM `FF FE` / `FE FF`, `swap16` pour le BE)
   ou UTF-8 par défaut. L'encodage détecté est renvoyé au renderer (affiché dans
   l'assistant). Choix : couvrir UTF-8 (avec/sans BOM) et UTF-16 — les cas Excel les plus
   fréquents — sans embarquer de bibliothèque de détection lourde ; les autres encodages
   mono-octet sont lus en UTF-8 au mieux.
5. **Heuristiques de type (colonne → type d'entité + type de champ).** Table
   `HEADER_RULES` (`lib/csvSchema.ts`), match **insensible aux accents/casse** (réutilise
   `fold()` de `lib/search.ts`) et **partiel** sur le nom d'en-tête plié : email/mail →
   `email_address` (champ `email`) ; tel/phone/mobile → `phone_number` (`phone`) ;
   domaine → `domain_name`, url/site/web/lien → `website` (`url`) ; ip → `ip` ;
   adresse/ville/pays → `address` ; société/entreprise/org → `company` ;
   pseudo/username/login/alias → `username` ; nom/prénom/name/personne/contact →
   `person` ; date/événement/créé → champ `date`. **Affinage par le contenu** quand
   l'en-tête est neutre : une valeur avec `@` → email, `http`/`www.` → url, suite de
   chiffres (≥ 7) → téléphone. Type indéterminé → `generic_other` (repli officiel de
   `normalizeEntityType`). Le **type d'une ligne** (mode auto) est choisi par priorité
   `person > company > email_address > phone_number > domain_name > website > ip >
   address > username`, sinon `generic_other` ; le **titre** vient de la colonne « titre »/
   « nom » (ou 1re valeur de champ renseignée).
6. **Deux modes de liaison auto-détectés.** Si des colonnes **source** ET **cible**
   existent → mode « liste de liens » : chaque valeur distincte devient une entité, chaque
   ligne un lien (relation depuis une colonne « relation » / libellé traduit ; défaut
   `associated`). Sinon → mode « liste d'entités » : une entité par ligne, colonnes =
   champs. Option facultative « relier par valeur clé partagée » (même e-mail, même
   entreprise…) : liens en **étoile** depuis la 1re entité du groupe (évite l'explosion
   quadratique). Les champs **multi-valeurs** (cellule `a;b;c`) deviennent plusieurs
   champs frères de même libellé/type (symétrique de l'export).
7. **Disposition automatique.** `layoutGraph` : **grille aérée** par défaut (colonnes ≈
   √n, espacement confortable = taille du nœud + marge) ; **graphe force-directed léger**
   pour l'option « graphe » — algorithme **déterministe** (aucun `Math.random`) partant de
   la grille, ~120 itérations de répulsion entre paires + attraction le long des liens, pas
   borné par itération, puis recadrage au coin haut-gauche de l'origine. Choix : pas de
   dépendance de layout (d3-force) — un force-directed maison de ~40 lignes suffit pour de
   petits/moyens graphes et reste reproductible (testable). L'import « ici » recadre la vue
   sur le résultat (`fitView` sur les nœuds importés) ; l'import « nouveau tableau » profite
   du `fitView` de montage.
8. **Import non destructif + garde-fou.** L'assistant ajoute au tableau courant (recentré)
   **ou** crée un nouveau tableau ; jamais d'écrasement. Un seul **`createGraph`** (une
   transaction Yjs) → **un seul Ctrl+Z** annule tout l'import (au lieu d'un pas par nœud).
   Au-delà de **2000 lignes**, confirmation avant génération.
9. **Export CSV = deux fichiers.** Entités : colonnes `type`, `titre`, puis une colonne
   par libellé de champ présent (valeurs multiples jointes par `;`). Liens : `source`,
   `cible`, `relation`, `label` (source/cible = **titre** des nœuds, relisible et
   ré-importable en « liste de liens »). BOM UTF-8. **Aller-retour testé** : réimporter
   l'export des entités reconstruit type + titre + champs (`type`/`titre` reconnus comme
   colonnes spéciales).

### §2 — Copier-coller natif

10. **Événements presse-papiers du DOM (copy/cut/paste), pas le répartiteur de
    raccourcis.** Raison : (a) ils donnent accès au `clipboardData` (lecture impossible
    autrement — `navigator.clipboard.read` est neutralisé par le refus global de
    permissions, §8) ; (b) quand le focus est dans un champ, le navigateur applique son
    copier-coller de **texte** natif et nos gardes le laissent passer. Ainsi Ctrl+C/X/V
    agit sur le texte en édition et sur les nœuds sinon, sans double insertion.
11. **Format `cosint-clip` + presse-papiers interne.** Une sélection est sérialisée en JSON
    (`nodes` + liens **internes** + data-URL des images référencées, sous budget de 4 Mo)
    avec un **nonce**. On écrit ce JSON dans le presse-papiers **système** (interop, coller
    externe) ET on garde une copie **au niveau module** (variable qui survit au remontage
    de `BoardView` → copier-coller **entre tableaux**, alors qu'un seul document Yjs est
    ouvert à la fois). Au collage, si le nonce du presse-papiers correspond à la copie
    interne, on préfère cette dernière (pleine fidélité, images incluses). Le collage
    régénère tous les ids (nœuds ET champs), décale au **centre sous la souris** (sinon
    léger offset), translate les waypoints, remappe les liens et ré-enregistre les images
    absentes du tableau cible. Écriture en un seul `createGraph` (un Ctrl+Z).
12. **Coller du texte externe.** Détection : e-mail → entité `email_address`, téléphone →
    entité `phone_number` (valeur dans le 1er champ + titre), URL → nœud **lien**, sinon
    **note texte**. Choix : l'auto-détection *est* la proposition de type (mode autonome,
    non bloquant) ; un toast indique le type retenu. Un texte multi-lignes reste une note.

### §3 — Recherche

13. **Insensibilité aux accents ajoutée (`fold`).** `lib/search.ts` : décomposition NFD +
    suppression des diacritiques + minuscules (par défaut). Option « sensible à la casse »
    (accents toujours ignorés) ; option « mot entier » (bornes de mot Unicode via
    lookarounds `\p{L}\p{N}`, repli `\b`). Filtre facultatif par **catégorie d'entité**.
14. **Liens désormais cherchés.** La recherche indexe aussi `label` + type de relation
    **traduit** des liens ; résultats **nœuds ET liens** dans une liste combinée, avec
    surlignage (halo `drop-shadow` sur le tracé) et **centrage** sur le milieu des deux
    extrémités. Les métadonnées de type d'entité et de source (type/fiabilité/crédibilité)
    sont ajoutées au texte indexé. On réutilise l'existant (compteur, navigation
    Entrée/Maj+Entrée, exclusion des nœuds masqués par filtre).

### §4 — Chronologie & date d'événement

15. **Modèle : `eventDate?: number` (epoch ms) sur `BoardNodeData`.** Distinct de
    `createdAt` : en OSINT, il date le **fait** observé, pas la saisie. La frise utilise
    `eventDate ?? createdAt`. Édité dans le panneau Détails (`<input type="date">` +
    effacement) ; l'effacement passe par une op dédiée `setEventDate(..., null, ...)` car
    `updateNode` ne peut pas **supprimer** une clé (il ignore `undefined`).
16. **Frise = overlay au-dessus du canvas, React Flow reste monté.** Choix (cf. bug §1d
    v1.6) : ne pas démonter `<ReactFlow>` en basculant en vue Chronologie, sinon perte des
    mesures réinjectées et disparition des nœuds auto-hauteur au retour. La frise est un
    panneau `position:absolute` (z-index 19, sous la Toolbar en 20 pour garder la bascule).
17. **Placement & échelle.** `lib/timeline.ts` (pur, testé) : dérivation des éléments datés
    triés, **voies (lanes)** greedy pour éviter tout chevauchement horizontal (les éléments
    proches dans le temps s'empilent en colonne = regroupement visuel), et pas d'échelle
    **adaptatif** (heure → jour → mois → année) choisi pour ~110 px entre graduations.
    Zoom `px/jour` ajustable, défilement horizontal. Clic → retour au canvas + `locateNode`.
    Export **PNG** (`html-to-image` sur le DOM de la frise) et **CSV** (élément, date ISO,
    type, auteur). Mise à jour temps réel : la frise dérive de `nodes` (source Yjs).

### §5 — Correctifs

18. **§5a bloc de code déplaçable.** Cause : le `<textarea>` plein cadre prenait le focus
    au simple clic (édition implicite) et toutes les surfaces (barre + corps) étaient
    `nodrag`. Correctif : la barre de titre n'est plus `nodrag` (zone de drag dédiée, les
    contrôles restent `nodrag`) ; hors édition le textarea est neutralisé
    (`pointer-events:none`, `tabIndex -1`, `readOnly`) → le simple clic sélectionne/déplace ;
    l'édition démarre au **double-clic** dans le code (ou bouton « Éditer »), se termine au
    blur/Échap. Curseur adapté (déplacement en aperçu, texte en édition).
19. **§5b label/badge de lien ↔ poignée de tracé.** Cause : sans waypoint, le milieu du
    segment (poignée d'ajout) coïncide avec `labelX/labelY`, et le libellé (couche HTML
    `EdgeLabelRenderer`, `pointer-events:all`) recouvre le cercle SVG. Correctif : libellé
    décalé **au-dessus** de la ligne, badge **en dessous** ; surtout, quand les poignées
    sont visibles (lien sélectionné éditable) on met `pointer-events:none` sur libellé et
    badge → le clic atteint toujours la poignée, quel que soit le zoom (un z-index seul ne
    marche pas entre couches SVG et HTML).
20. **§5c poignées de resize & badge.** Poignées de redimensionnement : bornes de
    compensation zoom resserrées (base 9 px, facteur borné `[0,75 ; 2]` → ~7 à 18 px écran ;
    l'ancien plafond ×3 donnait 30 px envahissants) et **z-index 5** pour passer au-dessus
    du contenu et des badges. Badge de statut déplacé du coin **haut-droit** au coin
    **haut-gauche** et passé **sous** les poignées de resize (z-index 2 < 5) → la poignée du
    coin n'est plus jamais masquée ni « volée ». Le texte des entités est déjà confiné par
    `.nd-clip` (overflow hidden) + padding.

### v1.7 — Corrections issues de la revue adversariale

Une revue multi-agents du diff v1.7 a confirmé plusieurs bugs de correctness, corrigés :

21. **Heuristiques CSV — clés courtes en sous-chaîne.** `matchKeys` faisait `includes()`
    pour toutes les clés : une clé de 2-3 lettres piégeait des en-têtes ordinaires
    (`description`/`code`/`adresse de livraison` → « source » via `de` ; `photo`/`total`
    → « cible » via `to` ; `zip`/`participant` → `ip`), faisant basculer à tort un CSV
    d'entités en mode « liste de liens » et jetant les colonnes de données. Corrigé : les
    clés **courtes (≤ 3)** ne matchent que sur un **mot entier** (jeton) de l'en-tête, les
    longues par sous-chaîne. Testé (non-régression).
22. **CSV — colonne relation volée / label perdu.** En liste de liens `from,to,type`, la
    colonne `type` était classée « type d'entité » (inutilisée en edge-list) → toutes les
    relations devenaient `associated`. Corrigé : en edge-list, une colonne `type`/`relation`
    devient la colonne de **relation**. De plus `labelColumn` n'était jamais affecté (code
    mort) → labels de liens perdus à chaque aller-retour ; corrigé en détectant une colonne
    `label`/`libellé`. Les **lignes entièrement vides** ne créent plus d'entité fantôme.
23. **Recherche — caméra détournée à chaque tick Yjs.** L'effet de centrage dépendait de
    l'objet `currentMatch` (recréé à chaque recalcul du memo, donc à chaque modification du
    tableau) → la vue se re-centrait pendant un drag ou l'édition d'un pair. Corrigé : la
    dépendance est une **clé stable** `type:id` — on ne re-centre que si la cible change.
24. **Presse-papiers — gardes de contexte.** Les handlers copy/cut/paste ignoraient les
    modales et panneaux : Ctrl+X pouvait couper la sélection du canvas depuis le panneau
    Détails ou l'assistant CSV. Corrigé : mêmes gardes que le répartiteur de raccourcis
    (modale ouverte, `.bd-side`/`.et-bar`/`.bd-toolbar`). Images dédupliquées par hash dans
    le fragment. Import CSV « ici » et couper gated par `canEdit` (visiteur en lecture
    seule). `detectPastedText` n'assimile plus une **IPv4** ni une **date ISO** à un
    téléphone.
25. **Dates locales.** L'éditeur de date d'événement affichait la date en UTC mais
    l'écrivait à **minuit local** → décalage d'un jour en fuseau positif (FR) ; l'affichage
    utilise désormais un format **local** cohérent. Idem pour les bornes du filtre de dates
    de la frise. `eventDate` est borné à la plage `Date` valide (±8,64e15 ms) dans les trois
    chemins de lecture (évite une `Date` invalide qui planterait le rendu).
26. **Correctifs §5.** Le bouton « Terminer l'édition » du bloc de code ne sortait jamais
    de l'édition (le blur repassait `editing` à false, puis le clic le rebasculait à true) —
    corrigé par `preventDefault` sur `mousedown` + pilotage explicite. Les poignées de tracé
    de lien filtrent désormais le bouton (clic gauche seul) et écoutent `pointercancel` (plus
    de poignée « collante » ni de fuite d'écouteurs). `decodeCsvBuffer` gère un CSV UTF-16 BE
    de longueur impaire sans lever d'erreur.

## v1.7.1 — Tracé des liens dessiné à la main & mode réseau « 100 % local »

### §1 — Mode « Dessiner le tracé » (`flow/RouteDrawOverlay.tsx`, `BoardView.tsx`, `boardOps.setEdgeRouting`)

- **Problème produit** : le routage v1.6 existait mais en pièces détachées (waypoints au
  double-clic, ancres dans le panneau Détails ou par drag d'extrémité) — peu découvrable,
  et le ressenti restait « le logiciel force le côté par lequel le lien entre/sort ».
  v1.7.1 ajoute un **mode intégré** : *Dessiner le tracé* (barre du lien ✏ + menu
  contextuel) : choisir le côté de **départ** (4 pastilles sur le nœud source, ou le nœud
  = auto), **cliquer** les points du trajet (clic droit = retirer le dernier, aperçu
  pointillé animé qui suit la souris), choisir le côté d'**arrivée** (pastilles du nœud
  cible ; Entrée = auto ; Échap = annulation totale). Les côtés Départ/Arrivée sont aussi
  exposés dans la **barre du lien** (deux sélecteurs Auto/Haut/Bas/Gauche/Droite).
- **Une seule transaction** : le tracé dessiné s'applique par `setEdgeRouting`
  (waypoints + 2 ancres + traçabilité en une transaction Yjs) → **une seule étape
  d'undo** ; `null`/liste vide SUPPRIME les clés (retour à l'auto). Le mode REMPLACE le
  routage manuel antérieur du lien (sémantique « je redessine »).
- **Capture des clics** : le canvas capte pointerdown/contextmenu en phase **capture**
  (`fl-canvas-wrap`) quand le mode est actif — React Flow ne voit ni sélection, ni lasso,
  ni drag ; les éléments du mode portent la classe `fl-route-ui` et gèrent leurs propres
  clics. Molette/zoom et Espace-pan restent actifs (rien n'est bloqué au niveau wheel).
- **Aperçu** : couche `<ViewportPortal>` (repère du tableau) ; le suivi souris vit DANS
  l'overlay (state local) — chaque mousemove ne re-rend que cette petite couche, jamais
  BoardCanvas. Pastilles/points compensés en zoom (`--fl-inv-zoom`, comme les poignées
  v1.6). Rectangles de nœuds lus via `useInternalNode` (mesures réelles, y compris
  auto-hauteur ; suit un nœud déplacé par un pair pendant le dessin).
- **Garde-fous** : lien supprimé par un pair ou rôle rétrogradé en visiteur pendant le
  dessin → sortie propre du mode sans écriture ; `finishRouteDraw` re-vérifie `canEdit`.

### §2 — Mode réseau « 100 % local » (`store/settings.ts`, `sync/network.ts`, `main/updater.ts`, Paramètres)

- **Objectif** : le grand public garde le comportement « ça marche tout seul » (serveurs
  publics par défaut) ; une organisation (administration…) doit pouvoir passer TOUT en
  interne **sans recompiler**, avec une garantie visible. Paramètres → **Réseau &
  confidentialité** : deux cartes, `standard` / `local` (persisté, migration settings
  v4→v5).
- **Contrat du mode local (fail-closed)** : `effectiveNetworkConfig()` est la **source de
  vérité unique** — signalisation = UNIQUEMENT les adresses saisies (vide/invalide →
  listes **vides**, tableaux partagés hors ligne avec toast explicite, **jamais** de
  repli vers les défauts publics — le repli silencieux du champ v1.3 était précisément le
  piège) ; ICE = UNIQUEMENT les STUN/TURN saisis (vide = aucun : sur un même sous-réseau
  les host candidates suffisent) ; `updateCheck = false` toujours.
- **STUN/TURN configurables** : `ICE_SERVERS` n'est plus figé — `buildPeerOpts(ice)` est
  injecté dans les trois providers (document, lobby client, lobby serveur). Saisie une
  entrée/ligne : `stun:hôte[:port]` ou `turn(s):hôte[:port] utilisateur motdepasse`
  (identifiants REQUIS pour turn : Chromium rejette un TURN sans credentials — mieux vaut
  refuser la ligne à la saisie qu'échouer silencieusement à la connexion). Lignes
  invalides bloquées à l'enregistrement avec le détail.
- **Mise à jour** : `updater.ts` ne lance PLUS `checkForUpdates()` au démarrage. Le
  renderer envoie la politique (`update:set-check`) une fois les Paramètres chargés :
  `true` (mode standard, case cochée) → une vérification par session ; `false` ou aucun
  appel → **zéro requête GitHub**. Sûr par défaut, même si le renderer plante avant l'envoi.
- **Garantie affichée = comportement réel** : le récapitulatif « Ce que l'application
  contactera » (signalisation, STUN/TURN, mises à jour, contenu des tableaux + verdict
  « aucun service public ne sera contacté ») est calculé par la MÊME
  `effectiveNetworkConfig` sur les valeurs en cours de saisie ; le panneau de diagnostic
  rappelle le mode actif. Testé : `tests/networkConfig.test.ts` (garantie de non-repli
  sur saisie vide ET invalide, remplacement des défauts en standard, parsing ICE strict).

### §2b — Correctif v1.7.1 : application immédiate des réglages réseau (retour terrain)

- **Bug constaté** : passer en « 100 % local » avec un tableau OUVERT laissait ses
  connexions de signalisation publiques établies (le provider WebRTC n'est configuré
  qu'à l'ouverture) — le diagnostic affichait « mode 100 % local » ET
  `y-webrtc.fly.dev connecté`, contradiction inacceptable pour une garantie de
  confidentialité. Correctif : App observe la configuration effective (clé
  mode+signalisation+ICE) et **rouvre la connexion du tableau courant**
  (`reconfigureShare`, même code/secret, état préservé) dès qu'elle change, avec toast.
- **Défense en profondeur** : le panneau de diagnostic compare désormais les serveurs
  réellement connectés à `effectiveNetworkConfig(settings)` et signale en avertissement
  toute connexion « héritée d'une configuration précédente » (état transitoire pendant
  la reconnexion ; persistant = anomalie à rouvrir).

## v1.8.0 — Entité « Événement », datation en fenêtre, types personnalisés, frise des événements, export CSV à la carte

Version « radicale mais additive » : quatre chantiers, tous rétro-compatibles (champs
optionnels, migrations transparentes). Le format `.trace` passe en **version 6**
(`TRACE_VERSION = 6`, `SUPPORTED_VERSIONS = [1..6]`) pour transporter les types
personnalisés du tableau ; tout fichier v1→v5 se relit et se remonte à 6 à l'ouverture.
La barrière de compatibilité entre pairs (§compat v1.4) bloque comme prévu un client
1.7.x sur un tableau ouvert en 1.8 (il ne comprendrait pas les types perso ni la fenêtre
de datation).

### §1 — Datation d'événement : date exacte OU fenêtre « au plus tôt / au plus tard »

1. **Le FAIT, pas la saisie.** v1.7 avait déjà `eventDate` (l'instant d'un fait observé,
   distinct de `createdAt`, prioritaire sur la frise). v1.8 étend la datation à
   l'INCERTITUDE, courante en OSINT : quand l'instant exact est inconnu, on renseigne une
   FENÊTRE `eventEarliest`/`eventLatest` (« le fait s'est produit quelque part entre ces
   deux bornes »). Les trois champs sont optionnels et indépendants ; `eventHasTime`
   indique si l'heure est significative (sinon jour seul à l'affichage). Ils vivent sur
   `BoardNodeData` — n'importe quel nœud peut en porter — mais visent surtout l'entité
   « Événement ».
2. **Entité « Événement » de premier rang.** Nouveau type de taxonomie `event` (catégorie
   générique, icône `Calendar`, `T('event', 'generic', 'Calendar', true)`). Créé et
   manipulé comme tout autre type ; son éditeur met la datation en avant.
3. **Éditeur dédié (`SidePanel`).** Bloc « Datation de l'événement » : date exacte, OU
   fenêtre (deux bornes), case « préciser l'heure », bouton « effacer ». Saisie/affichage
   en heure LOCALE (correctif v1.7 §25 conservé, `eventDate` borné à la plage `Date`
   valide). Garde-fou : « au plus tôt » doit précéder « au plus tard ». L'effacement passe
   par une op dédiée — `updateNode` ne peut pas SUPPRIMER une clé Yjs (il ignore
   `undefined`).
4. **Migration transparente.** Un fichier ≤ v5 sans ces champs s'ouvre inchangé (champs
   `undefined`), remonté à la v6.

### §2 — Types d'entité personnalisés, par tableau et synchronisés

5. **Chaque affaire ses types.** Au-delà de la taxonomie intégrée, un tableau peut définir
   SES propres types d'entité (`CustomEntityType` : nom, icône Lucide, couleur, gabarit de
   champs par défaut). Stockés dans le document Yjs (`customTypes`) → synchronisés avec
   tous les participants et embarqués dans l'export `.trace` (d'où le format v6).
6. **Id `custom:` réservé.** L'id porte le préfixe `custom:` : jamais de collision avec un
   id de taxonomie, reconnaissable sans consulter le document. Résolution UNIFIÉE
   (`lib/entityTypes.ts`, `resolveType`) : taxonomie et types perso passent par les mêmes
   fonctions (libellé, icône, couleur, gabarit) pour que l'affichage traite un type perso
   comme un type de premier rang.
7. **Type inconnu = repli lisible.** Un `custom:` référencé mais absent de ce tableau
   (copié-collé d'ailleurs, définition pas encore synchronisée, ou type supprimé) retombe
   sur « Type personnalisé (supprimé) » (icône neutre) sans planter. Supprimer un type
   CONSERVE les entités existantes (affichées en repli).
8. **UI.** Section « Personnalisés (ce tableau) » dans le sélecteur d'entités
   (`EntityPicker`) ; dialogue de création/édition (`CustomTypeDialog`) avec recherche
   d'icône et champs par défaut.

### §3 — Frise des ÉVÉNEMENTS (en plus de la frise des AJOUTS)

9. **Deux frises complémentaires (`TimelinePanel`, onglets).**
   - **Ajouts** (existant) : QUAND les éléments ont été ajoutés au tableau.
   - **Événements** (nouveau) : QUAND les faits se sont déroulés (datation §1).
10. **Barres pour les fenêtres.** Un événement à date exacte est un point ; un événement à
    fenêtre (`eventEarliest`→`eventLatest`) est une BARRE couvrant sa durée d'incertitude.
11. **Tri & vue.** L'onglet Événements se trie par **date de début**, **date précise**,
    **nom** ou **type d'événement**, en vue **Frise** (barres/points) ou **Liste**
    (tableau trié : nom, type, début, date précise, fin).
12. **Pureté.** La dérivation (éléments datés, tri, placement) reste dans `lib/timeline.ts`
    (pur, testé) ; la frise reste un overlay au-dessus du canvas (React Flow monté — choix
    v1.6/v1.7 conservé pour ne pas perdre les mesures auto-hauteur).

### §4 — Export CSV : choix des colonnes

13. **Cocher ce qu'on exporte.** Les actions « Exporter les entités / les liens » ouvrent
    désormais un dialogue (`CsvExportDialog`) : une case par colonne — **structurelles**
    (type, titre, statut, tags, datation d'événement en ISO 8601, traçabilité) et
    **champs** (une par libellé présent) — plus le choix du séparateur. Tout est coché par
    défaut (l'export historique exportait tout) ; l'utilisateur DÉ-coche ce qu'il exclut.
14. **Pur, ordre stable, ré-importable.** `lib/csvExport.ts` expose des colonnes
    déclaratives (`entityColumns`/`edgeColumns` → `{ id, header, group, get }`) ; l'export
    conserve l'ORDRE d'origine des colonnes (pas l'ordre de cochage). `type` + `titre` en
    tête reproduisent l'export ré-importable. Les anciennes fonctions « tout exporter »
    (`exportEntitiesCsv`/`exportEdgesCsv`) restent pour la compat et les tests.

### §5 — Finalisation

15. **Tests.** Nouvelle couverture des colonnes CSV (sélection, ordre inversé, datation
    ISO, séparateur `;`). Tests de format `.trace` mis à la **v6** (round-trip, migrations
    v1/v3/v4 remontées à la version courante, rejet d'une version non supportée = 7). Suite
    complète au vert (typecheck + 233 tests).

## v1.8.2 — Frises retravaillées, datation en durée, fenêtre de mise à jour

### §1 — Frise « Ajouts » = date d'AJOUT stricte (`lib/timeline.ts`)

1. **Séparation nette des deux frises.** La frise **Ajouts** plaçait un élément à sa date
   d'ÉVÉNEMENT si elle était renseignée (elle retombait sur `createdAt` sinon) — une
   entité datée du 8 mars mais saisie le 20 juillet apparaissait donc au 8 mars dans les
   DEUX frises. Corrigé : **Ajouts** utilise TOUJOURS `createdAt` (quand l'élément a été
   ajouté au tableau) ; **Événements** garde la datation d'événement résolue. `isEventDate`
   est donc toujours faux dans Ajouts. `toTimelineItems` ne dépend plus de `timelineDate`.
2. **Tests.** `toTimelineItems` vérifie qu'un élément à date d'événement très antérieure
   mais ajouté en dernier figure bien EN FIN de la frise Ajouts (tri par `createdAt`).

### §2 — Datation en DURÉE précise (de/à), en plus de la fenêtre d'incertitude

3. **Deux natures distinctes.** La v1.8 offrait la date exacte OU une **fenêtre
   d'incertitude** (`eventEarliest`/`eventLatest`, « le fait s'est produit quelque part
   entre »). On ajoute la **DURÉE** (`eventFrom`/`eventTo`, « de … à … ») : un fait qui
   S'ÉTEND réellement sur une plage (séjour, campagne). Nouveaux champs optionnels sur
   `BoardNodeData`, persistés (Yjs + `.trace` + CSV `evenement_duree_de/a`).
4. **Éditeur mutuellement exclusif (`SidePanel`).** Une bascule **Instant / Durée** :
   « Instant » = exact + fenêtre au plus tôt/tard ; « Durée » = de/à. Changer de mode
   efface les champs de l'autre nature en UNE op annulable (jamais de donnée mixte).
   `eventTimingOf` donne la priorité à la durée si l'un des deux bouts est présent (robuste
   à une donnée importée mixte). Garde-fou « de doit précéder à ».
5. **Format `.trace` v7.** Ajout de `eventFrom`/`eventTo` (optionnels, bornés à la plage
   Date valide comme les autres dates). Rétro-compatible : un fichier ≤ v6 s'ouvre sans
   ces champs ; un v7 s'ouvre dans une version antérieure en les ignorant. Tests de format
   remontés à la v7 (rejet d'une version non supportée = 8).

### §3 — Refonte visuelle de la frise (barres claires, moins « générique »)

6. **Une durée n'est plus un pointillé qui s'arrête net.** Les plages sont désormais
   dessinées selon leur nature : **durée** = trait plein semi-opaque à **embouts nets**
   (début/fin francs) ; **incertitude** = trait **estompé aux deux extrémités** (masque en
   dégradé — les bornes sont floues). Fini la barre hachurée. Rendu à plat, cohérent avec
   les jetons de thème (pas de dégradés/lueurs superflus).

### §4 — Barre d'outils HORIZONTALE en bas de la frise + ajout DATÉ

7. **La barre verticale de gauche laisse place à une barre horizontale en bas** quand on
   est sur la frise (`TimelinePanel`) ; la barre verticale du canvas n'est rendue qu'en vue
   canvas. La barre du bas regroupe l'ajout d'éléments, le zoom et le recentrage.
8. **Ajout uniquement APRÈS une date.** Cliquer un outil d'ajout ouvre un petit sélecteur
   de date ; **sans date validée, RIEN n'est créé**. La date saisie est la date
   d'ÉVÉNEMENT (l'élément apparaît aussitôt sur la frise Événements). Une entité passe par
   le sélecteur de type existant, puis la date est appliquée (`BoardView.addDatedFromTimeline`
   + `pendingTimingRef`, réutilisant `EntityPicker` — modale au-dessus de la frise).

### §5 — Pan libre + bouton « Recentrer »

9. **Déplacement au-delà des éléments.** Le contenu est encadré d'une **marge de pan**
   (`PAN_PAD`) de part et d'autre : on peut se déplacer à gauche/droite « même s'il n'y a
   plus d'éléments plus loin ». Un bouton **Recentrer** (comme le « recentrer » du canvas)
   réajuste le zoom sur la plage et ramène le défilement au début des éléments.

### §6 — Fenêtre de mise à jour GitHub (`UpdatePopup`)

10. **Annonce visible.** À la publication d'une nouvelle version GitHub, une **petite
    fenêtre** (non bloquante, refermable) indique la version et propose le **lien vers la
    release GitHub** (ouvert dans le navigateur externe via le pont preload). Une fois la
    version téléchargée, elle propose « Redémarrer pour installer » ; la bannière discrète
    subsiste ensuite comme rappel. Remplace l'ancien simple toast « disponible ».

### §7 — Finalisation

11. **Tests & build.** Nouveaux tests de datation (`eventTimingOf` : instant vs fenêtre vs
    durée) et de la frise Ajouts (tri par date d'ajout). Format `.trace` en **v7**. Suite
    complète au vert (typecheck node + web, **244 tests**), build de production OK.
