# Release notes — v1.9.0

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

**A big release for the investigation board: image copy that finally works on Windows,
image galleries inside entities, document previews, complete link presets — plus file
attachments, a toolbar you place yourself and per-entity icons.**

> **Installed the early 1.9.0 test build?** Reinstall this version over it (same
> installer, nothing to uninstall): the test build had the broken image copy.

### 🖼️ Copy an image — and really get the image

**Ctrl+C** on an image node now puts the **actual picture** on the clipboard: paste it into
an image editor, a word processor, a chat or an email and you get the image.

**Why it failed before, simply put:** COSINT stores images in WebP, and the system image
API cannot read WebP — so an *empty* image was written, with no visible error. On Windows,
the clipboard was also being cleared, then held for a moment by clipboard listeners such as
**Windows clipboard history (Win+V)**, so a second write could silently be lost. COSINT now
converts the picture to PNG, **writes it once, reads the clipboard back to verify**, retries
if another program got in the way — and the message you see tells you what really happened.

- **Right-click › Copy image / Save image as…** on any image.
- **Drag an image out of the board** straight onto the desktop or into another app.
- **Pasting it back into COSINT** recreates the same node — title, tags and size kept.
- Copying several nodes (or an entity) still copies the full in-app fragment, as before.

### 🧷 Images inside entities (gallery)

An entity can now carry a **gallery of up to 12 images** — a profile photo, screenshots of
posts, a document scan. The first one is the **cover** shown on the node, with a **+N**
badge when there are more.

- **Add images** from the Details panel (picker, drop, or Ctrl+V), the right-click menu, the
  node toolbar, or simply **drop image files onto the entity** on the board.
- Click the cover to open a **lightbox**: browse with ← →, **set as cover**, **copy** or
  **save**. The Details panel also lets you **reorder** and remove images.
- Images are compressed and shared peer-to-peer like any image. Standalone image nodes are
  unchanged.

### 📄 Document preview (PDF, office, audio, video, code)

Imported files are no longer blind boxes:

- a **PDF** shows a thumbnail of its **first page** and its **page count**; double-click to
  open a **viewer** with page navigation and zoom (fit to width, + / −);
- **Word, Excel and PowerPoint** files (`.docx`, `.xlsx`, `.pptx`) show their text, tables,
  sheets and slides; the **legacy formats** (`.doc`, `.xls`, `.ppt`) are read on a
  best-effort basis (text only, flagged as approximate);
- **LibreOffice / OpenOffice** documents (`.odt`, `.ods`, `.odp`, `.odg`) and **RTF** files
  are previewed the same way; **Apple iWork** files (Pages, Numbers, Keynote) show their
  embedded thumbnail;
- **audio** (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`…) gets a **player** with its duration
  and tags (title, artist, album, cover); **video** (`.mp4`, `.webm`…) plays in the viewer;
- **code and scripts** (`.bat`, `.ps1`, `.sh`, `.py`, `.js`…) are shown **highlighted** —
  and **never executed**;
- a **text file** (`.txt`, `.csv`, `.json`, `.log`…) shows an excerpt, with the full
  text in the viewer;
- any **other file** gets a clean card with its type and size, and a **Save** button.

Previews are **rendered locally on each machine** — nothing extra is synced. Files from
peers are treated as untrusted: office documents are read by built-in parsers with hard
limits on size, entries, depth and time (no macros, no embedded HTML or scripts rendered),
PDFs run without scripts or external resources, and media only plays from local data.

### 🔗 Complete link presets

A preset can now capture **every setting of a link**: relation type (including the free
**"Other"**), label, colour, thickness, line style (solid, dashes, dots), arrows, path type,
status and anchor sides. Any setting can be left out, so a preset only changes what it defines.

- **Manage presets** in Settings with a **live preview**: create, edit, duplicate, reorder.
- From the **link toolbar**: **apply** a preset, or **save the current link as a preset**.
- **Apply to several links at once** from a multi-selection.
- After connecting two entities, a **chooser** offers "Automatic" plus your presets (↑ ↓, Enter).

Presets are per machine; the resulting style is written on the link, so your peers see it.

### 📎 Also in 1.9.0

- **Import any file** (drag and drop, toolbar paperclip, add menu), shared peer-to-peer,
  with a **Save** button on the node — 25 MB per file.
- **Toolbar position**: left (default), right, top or bottom — Settings › Appearance.
- **Per-entity icon**, from a searchable icon picker, reset to the type icon in one click.
- **Multi-line entity fields**: line breaks are kept on the node.

### Under the hood

- Image copy goes through the **main process** at the keystroke, not the page's copy event,
  so nothing else writes to the clipboard in parallel; drag-out uses a temporary PNG file
  that is cleaned up when the app closes.
- pdf.js is **loaded on demand** with its worker under the unchanged strict CSP.
- The `.trace` format stays **v7**: a 1.9.0 board opens in 1.8.9, which simply ignores what it
  does not know (galleries, presets are local anyway). A 1.8.9 peer can still join a 1.9.0
  board, but shows entities without their gallery and file nodes as plain notes containing
  a 64-character code (the file's fingerprint): **do not edit those notes in 1.8.9** — it
  would detach the file for everyone — and export `.trace` files from a 1.9 station (a 1.8.9
  export keeps only the fingerprint, not the file). Update every station for the full experience.
- **578 tests total**, production build OK.

---

## 🇫🇷 Français

**Une grosse mise à jour du tableau d'investigation : une copie d'image qui marche enfin sous
Windows, des galeries d'images dans les entités, l'aperçu des documents, des préréglages de
lien complets — plus les pièces jointes, une barre d'outils que l'on place soi-même et une
icône par entité.**

> **Vous aviez installé la première version de test 1.9.0 ?** Réinstallez celle-ci
> par-dessus (même installeur, rien à désinstaller) : la version de test avait la copie
> d'image défaillante.

### 🖼️ Copier une image — et obtenir vraiment l'image

**Ctrl+C** sur un nœud image pose désormais **l'image elle-même** dans le presse-papiers :
collée dans un logiciel de dessin, un traitement de texte, une messagerie ou un e-mail, c'est
bien l'image qui arrive.

**Pourquoi ça ne marchait pas, en clair :** COSINT stocke les images en WebP, et l'interface
image du système ne sait pas lire le WebP — une image *vide* était donc écrite, sans erreur
visible. Sous Windows, le presse-papiers était en plus vidé, puis retenu un instant par les
programmes qui le surveillent, comme **l'historique du presse-papiers (Win+V)** : une seconde
écriture pouvait se perdre sans bruit. COSINT convertit maintenant l'image en PNG, **l'écrit
une seule fois, relit le presse-papiers pour vérifier**, réessaie si un autre programme s'est
interposé — et le message affiché dit ce qui s'est réellement passé.

- **Clic droit › Copier l'image / Enregistrer l'image sous…** sur n'importe quelle image.
- **Glissez une image hors du tableau**, directement sur le bureau ou dans une autre application.
- **La recoller dans COSINT** recrée le même nœud — titre, étiquettes et taille conservés.
- Copier plusieurs nœuds (ou une entité) copie toujours le fragment complet, comme avant.

### 🧷 Des images dans les entités (galerie)

Une entité peut maintenant porter une **galerie de 12 images au plus** — une photo de profil,
des captures de publications, un document scanné. La première est la **couverture** affichée
sur le nœud, avec un badge **+N** s'il y en a d'autres.

- **Ajoutez des images** depuis le panneau Détails (sélecteur, dépôt ou Ctrl+V), le clic droit,
  la barre d'outils du nœud, ou tout simplement en **déposant des fichiers image sur l'entité**.
- Un clic sur la couverture ouvre une **visionneuse** : parcourir avec ← →, **définir comme
  couverture**, **copier** ou **enregistrer**. Le panneau Détails permet aussi de **réordonner**
  et de retirer les images.
- Les images sont compressées et partagées en pair-à-pair comme les autres. Les nœuds image
  indépendants ne changent pas.

### 📄 Aperçu des documents (PDF, bureautique, audio, vidéo, code)

Les fichiers importés ne sont plus des boîtes noires :

- un **PDF** affiche la miniature de sa **première page** et son **nombre de pages** ; un
  double-clic ouvre une **visionneuse** avec navigation entre les pages et zoom (ajuster à la
  largeur, + / −) ;
- les fichiers **Word, Excel et PowerPoint** (`.docx`, `.xlsx`, `.pptx`) montrent leur texte,
  leurs tableaux, leurs feuilles et leurs diapositives ; les **anciens formats** (`.doc`,
  `.xls`, `.ppt`) sont lus au mieux (texte seul, signalé comme approximatif) ;
- les documents **LibreOffice / OpenOffice** (`.odt`, `.ods`, `.odp`, `.odg`) et les fichiers
  **RTF** ont le même aperçu ; les fichiers **Apple iWork** (Pages, Numbers, Keynote)
  affichent leur miniature intégrée ;
- l'**audio** (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`…) a un **lecteur** avec sa durée et
  ses tags (titre, artiste, album, pochette) ; la **vidéo** (`.mp4`, `.webm`…) se lit dans la
  visionneuse ;
- le **code et les scripts** (`.bat`, `.ps1`, `.sh`, `.py`, `.js`…) sont affichés avec
  **coloration syntaxique** — et **jamais exécutés** ;
- un **fichier texte** (`.txt`, `.csv`, `.json`, `.log`…) affiche un extrait, et le texte
  complet dans la visionneuse ;
- **tout autre fichier** a une carte propre avec son type, sa taille et un bouton **Enregistrer**.

Les aperçus sont **calculés localement sur chaque poste** — rien de plus n'est synchronisé. Les
fichiers reçus sont traités avec méfiance : les documents bureautiques sont lus par des
lecteurs intégrés aux limites strictes (taille, entrées, profondeur, temps ; aucune macro, ni
HTML ni script affiché), les PDF sans script ni ressource externe, et les médias ne se lisent
qu'à partir des données locales.

### 🔗 Des préréglages de lien complets

Un préréglage peut désormais reprendre **chaque réglage d'un lien** : type de relation (y
compris le texte libre **« Autre »**), libellé, couleur, épaisseur, style de trait (plein,
tirets, pointillés), flèches, tracé, statut et côtés d'ancrage. Chaque réglage est facultatif :
un préréglage ne modifie que ce qu'il définit.

- **Gérez vos préréglages** dans les Paramètres, avec un **aperçu en direct** : créer, modifier,
  dupliquer, réordonner.
- Depuis la **barre d'outils du lien** : **appliquer** un préréglage, ou **enregistrer le lien
  courant comme préréglage**.
- **Appliquez-le à plusieurs liens d'un coup** depuis une sélection multiple.
- Après avoir relié deux entités, un **choix** propose « Automatique » et vos préréglages (↑ ↓, Entrée).

Les préréglages sont propres au poste ; le style obtenu est écrit sur le lien, donc visible des pairs.

### 📎 Aussi dans la 1.9.0

- **Import de n'importe quel fichier** (glisser-déposer, trombone de la barre d'outils, menu
  d'ajout), partagé en pair-à-pair, avec un bouton **Enregistrer** sur le nœud — 25 Mo par fichier.
- **Position de la barre d'outils** : à gauche (par défaut), à droite, en haut ou en bas —
  Paramètres › Apparence.
- **Icône par entité**, depuis un sélecteur cherchable, retour à l'icône du type en un clic.
- **Champs d'entité multi-lignes** : les retours à la ligne sont conservés sur le nœud.

### Sous le capot

- La copie d'image passe par le **processus principal**, dès l'appui sur la touche et non via
  l'évènement de copie de la page : rien d'autre n'écrit dans le presse-papiers en parallèle.
  Le glisser vers l'extérieur utilise un PNG temporaire, nettoyé à la fermeture.
- pdf.js est **chargé à la demande**, avec son worker, sous la CSP stricte inchangée.
- Le format `.trace` reste en **v7** : un tableau 1.9.0 s'ouvre en 1.8.9, qui ignore simplement
  ce qu'il ne connaît pas (galeries ; les préréglages sont locaux de toute façon). Un pair 1.8.9
  peut toujours rejoindre un tableau 1.9.0, mais affiche les entités sans leur galerie et les
  nœuds fichier comme de simples notes contenant un code de 64 caractères (l'empreinte du
  fichier) : **ne modifiez pas ces notes en 1.8.9**, cela détacherait le fichier pour tout le
  monde, et exportez les `.trace` depuis un poste 1.9 (un export 1.8.9 ne garde que
  l'empreinte, pas le fichier). Mettez tous les postes à jour pour profiter de tout.
- **578 tests au total**, build de production OK.
