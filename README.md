# MonAlternance

Site personnel (usage individuel, pas de login) pour piloter une recherche
d'emploi/alternance :

- **Profil** : informations personnelles + import de CV au format PDF +
  **photo de profil** (import, recadrage/zoom avant enregistrement,
  remplacement, suppression), affichee dans l'en-tete du site et sur la
  page Profil. Stockee via Vercel Blob (URL a suffixe aleatoire non
  devinable, jamais en base Postgres directement) ; sans
  `BLOB_READ_WRITE_TOKEN`, l'import de photo affiche un message clair
  plutot que d'echouer silencieusement.
- **CV** : le texte du PDF est extrait et analysé pour en tirer les
  compétences (dictionnaire de mots-clés) et les sections (profil,
  expériences, formation, langues).
- **Critères de recherche** : intitulés de poste, localisations, types de
  contrat, mots-clés bonus/exclusion.
- **Offres** : ajout manuel ou récupération automatique depuis plusieurs
  **sources légales à API officielle** (France Travail, Adzuna — jamais de
  scraping de LinkedIn/Indeed/Welcome to the Jungle, contraire à leurs
  conditions d'utilisation), avec un **score de compatibilité en %** entre
  le CV et chaque offre, et le détail des **compétences manquantes**.
  Architecture : sources → normalisation → **déduplication** (identifiant
  externe, URL, empreinte de contenu titre+entreprise+description, et
  titre+entreprise exact — pour détecter les doublons même entre sources
  différentes) → matching pondéré avec tes critères → score → classement →
  affichage. Déclenchement **manuel** (bouton "Récupérer des offres") ou
  **automatique quotidien** (tâche planifiée Vercel, activable/désactivable
  dans la page Critères — la fréquence est limitée au quotidien par le plan
  Vercel Hobby). Chaque carte affiche
  le logo de l'entreprise (si fourni par la source), la date de publication
  et la source, avec des actions rapides (Voir l'offre, Voir le matching,
  Adapter mon CV, Postuler, Ignorer). **Filtres** disponibles : score
  minimum, entreprise, lieu, date de publication, statut de candidature,
  source.
- **Matching pondéré multi-critères** : le score combine les compétences du
  dictionnaire, le chevauchement de vocabulaire CV/offre, et des critères
  "durs" qui pénalisent fortement le score s'ils ne sont pas respectés :
  type de contrat, niveau d'expérience demandé (senior/confirmé), niveau de
  formation requis, localisation (distance réelle via géocodage gratuit,
  comparée à ton rayon de recherche), et mots-clés exclus (pénalité la plus
  forte). Chaque offre affiche une **recommandation** (🟢 À postuler / 🔵 À
  considérer / 🟠 Faible priorité / 🔴 À ignorer), la raison principale, les
  points forts/faibles et les critères respectés/non respectés. Le
  géocodage ne bloque jamais le calcul en cas de problème réseau (aucune
  pénalité appliquée si la distance ne peut pas être déterminée).
- **Analyse de CV notée** : depuis la page Profil ("Analyser et améliorer
  mon CV"), une note globale sur 100 et des sous-notes (impact, lisibilité,
  adéquation avec tes postes recherchés, compatibilité ATS, compétences,
  expériences) avec des observations concrètes, avant de passer à
  l'éditeur.
- **Éditeur de CV assisté par IA** : depuis une offre ("Adapter mon CV à
  cette offre") ou après l'analyse ci-dessus ("Créer une version
  améliorée"), propose des améliorations de formulation (accroche, résumé, expériences)
  et un réordonnancement des compétences pertinentes. Chaque proposition
  s'affiche en comparatif version actuelle / proposition IA, avec
  Accepter / Modifier / Refuser — rien n'est appliqué sans validation.
  Garde-fous anti-invention à plusieurs niveaux (prompt strict, filtrage
  programmatique des compétences proposées, rejet des réponses
  démesurément plus longues que l'original). Génère ensuite une nouvelle
  version de CV en PDF (template propre et professionnel).
- **Mes CV** : retrouve le CV original (fichier importé tel quel si Vercel
  Blob est configuré, sinon reconstruit depuis le texte extrait) ainsi que
  les versions améliorées ou adaptées à des offres précises (ex:
  `CV_Loreal_BusinessDeveloper`), téléchargement et suppression.
- **Statut de candidature** (non postulé / postulé / entretien / offre reçue
  / refusé), commentaires libres et lien direct vers l'offre originale.
- **Export Excel** : télécharge un fichier `.xlsx` (entreprise, poste,
  statut, score, commentaires, lien...) pour suivre tes candidatures.
- **Synchronisation Gmail** (optionnelle) : détecte automatiquement dans ta
  boîte mail les réponses à tes candidatures (refus, entretien, embauche) et
  met à jour le statut correspondant, avec un journal dans les commentaires.

## Stack technique

Next.js (App Router, TypeScript) + Tailwind CSS + Prisma/PostgreSQL.

## Base de données

Le site utilise PostgreSQL (necessaire pour persister les donnees une fois
deploye — Vercel et la plupart des hebergeurs serverless n'ont pas de disque
persistant, donc une base SQLite en fichier local ne survivrait pas aux
redeploiements).

**En local**, le plus simple est une base PostgreSQL locale (via
[Postgres.app](https://postgresapp.com/), `apt install postgresql`, ou
Docker : `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres`).

**Pour deployer** (ex: sur Vercel), utilise une base PostgreSQL hebergee.
[Neon](https://neon.tech) a un plan gratuit largement suffisant pour un usage
personnel et s'integre directement a Vercel (bouton "Add Integration" ->
Neon, dans les parametres du projet Vercel : ca cree la base et remplit
automatiquement `DATABASE_URL`). Alternatives : Supabase, Railway.

Dans les deux cas, renseigne l'URL de connexion dans `.env` :

```
DATABASE_URL="postgresql://user:password@host:5432/dbname"
```

**Sur Vercel**, le script `build` (`prisma generate && prisma migrate deploy
&& next build`) applique automatiquement les migrations en attente a chaque
deploiement, en utilisant la variable `DATABASE_URL` deja configuree dans
les parametres du projet — aucune commande manuelle a lancer apres le
premier deploiement. Ca implique que `DATABASE_URL` doit etre disponible au
moment du **build**, pas seulement a l'execution : dans les parametres
Vercel du projet, verifie que la variable est bien activee pour tous les
environnements ou tu deploies (Production, et Preview si tu deploies des
branches/PR comme celle-ci — sans quoi le build d'une preview echouera
faute de base de donnees accessible).

## Démarrage local

```bash
npm install
npx prisma migrate deploy   # cree les tables dans la base PostgreSQL (deja inclus dans `npm run build`)
npm run dev
```

Le site est disponible sur http://localhost:3000.

Aucune clé IA/API n'est necessaire pour commencer (seule une base PostgreSQL
est requise, voir ci-dessus) : tu peux tout de suite importer ton CV,
definir tes criteres, et ajouter des offres manuellement. Le score de
matching et l'adaptation de CV fonctionnent des le depart grace a un moteur
par mots-cles/competences (sans IA).

## Fonctionnalites optionnelles (cles a ajouter dans `.env`)

Copie `.env.example` en `.env` (deja fait dans ce depot) et complete au
besoin :

### 1. Adaptation de CV par IA (Claude / Anthropic)

```
ANTHROPIC_API_KEY=sk-ant-...
```

Sans cette cle : l'adaptation de CV reordonne et selectionne le contenu deja
present dans le CV original (aucune reformulation, aucune invention).

Avec cette cle : Claude reformule/reordonne le CV en respectant une regle
stricte de non-invention (le prompt interdit explicitement d'ajouter une
competence, experience ou donnee absente du CV source).

### 2. Recuperation automatique d'offres (API France Travail)

1. Cree un compte et une application sur https://francetravail.io
   (produit "Offres d'emploi v2").
2. Recupere l'identifiant client et la cle secrete de l'application.
3. Renseigne-les dans `.env` :

```
FRANCE_TRAVAIL_CLIENT_ID=...
FRANCE_TRAVAIL_CLIENT_SECRET=...
```

Sans ces cles, le bouton "Recuperer des offres" affiche un message
explicatif et l'ajout manuel d'offres reste disponible.

### 3. Synchronisation Gmail (detection automatique des reponses)

Permet au site de lire (en lecture seule) les emails recus dans ta boite
Gmail, de les associer a une offre pour laquelle tu as deja postule (par nom
d'entreprise/intitule de poste), puis de mettre a jour automatiquement le
statut de candidature (refus, entretien, embauche) quand un email
correspondant est detecte. Chaque mise a jour automatique est journalisee
dans les commentaires de l'offre (date, expediteur, objet du mail) pour que
tu puisses toujours verifier/corriger.

**Etape 1 — Creer le projet Google Cloud et les identifiants OAuth :**

1. Va sur https://console.cloud.google.com et cree un nouveau projet (ou
   utilise un projet existant).
2. Dans "API et services" > "Bibliotheque", cherche **Gmail API** et
   active-la.
3. Dans "API et services" > "Ecran de consentement OAuth" :
   - Type d'utilisateur : **Externe**.
   - Renseigne un nom d'application (ex: "MonAlternance") et ton email.
   - Dans la section "Utilisateurs test" (l'app reste en mode "Test", pas
     besoin de validation Google pour un usage personnel), ajoute **ta
     propre adresse Gmail**.
4. Dans "API et services" > "Identifiants" > "Creer des identifiants" >
   **ID client OAuth** :
   - Type d'application : **Application Web**.
   - URI de redirection autorisee : `http://localhost:3000/api/gmail/callback`
     (adapte le domaine/port si tu deploies le site ailleurs — l'URI doit
     correspondre EXACTEMENT a `GOOGLE_REDIRECT_URI`).
5. Copie le **ID client** et le **Code secret du client** generes.

**Etape 2 — Configurer `.env` :**

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI="http://localhost:3000/api/gmail/callback"
```

Redemarre le serveur (`npm run dev`), va sur la page **Integrations** du
site, clique sur "Connecter Gmail", et autorise l'acces (lecture seule)
depuis l'ecran Google. Utilise ensuite le bouton "Synchroniser maintenant"
pour lancer une premiere verification.

**Etape 3 — Synchronisation automatique en arriere-plan (optionnel) :**

Le bouton "Synchroniser maintenant" fonctionne immediatement en local, mais
ne se declenche pas tout seul : pour une verification vraiment automatique
(ex: toutes les heures, sans que tu y penses), il faut que le site tourne en
continu quelque part et qu'une tache planifiee appelle
`POST /api/gmail/sync`. Plusieurs options :

- **Vercel Cron** : ce depot contient deja un `vercel.json` avec une tache
  planifiee quotidienne (6h du matin) et `"framework": "nextjs"` (force la
  detection du framework — sans ca, Vercel peut chercher un dossier
  `public/` statique et echouer au deploiement avec l'erreur "No Output
  Directory named public found" au lieu d'utiliser le runtime Next.js). Si
  cette erreur apparait quand meme, verifie dans les parametres du projet
  Vercel > "Build and Deployment" que le "Framework Preset" est bien
  "Next.js" et qu'aucun "Output Directory" personnalise n'est force. Le plan
  gratuit "Hobby" de Vercel limite par ailleurs les cron jobs a une
  execution par jour maximum ; passe a une frequence plus rapprochee (ex:
  toutes les heures, `0 * * * *`) uniquement si tu passes au plan Pro. Si tu
  deploies sur Vercel, definis une variable d'environnement `CRON_SECRET`
  (n'importe quelle chaine aleatoire) dans les parametres du projet Vercel —
  Vercel l'enverra automatiquement en en-tete
  `Authorization: Bearer <CRON_SECRET>` a chaque declenchement.
  (La base PostgreSQL hebergee, voir "Base de donnees" plus haut, persiste
  normalement entre les redeploiements Vercel.)
- **Serveur/VPS** : deploie le site (`npm run build && npm start`) et
  ajoute une tache cron systeme, ex :
  ```
  0 * * * * curl -X POST https://ton-domaine/api/gmail/sync -H "Authorization: Bearer $CRON_SECRET"
  ```
- **GitHub Actions planifie** : un workflow `schedule` qui fait un simple
  `curl` vers `/api/gmail/sync` avec le meme en-tete, si le site est
  accessible publiquement.

Sans `CRON_SECRET` defini, l'endpoint `/api/gmail/sync` reste ouvert (pour
que le bouton manuel fonctionne sans configuration en local) : defini
toujours `CRON_SECRET` avant de deployer le site publiquement.

### 4. Conservation du fichier CV original (Vercel Blob)

Par defaut, seul le **texte** du CV importe est conserve (extrait a
l'import). Pour que la page **Mes CV** puisse aussi retelecharger le
fichier PDF original exactement tel qu'importe (plutot qu'une
reconstruction a partir du texte) :

1. Dans le projet Vercel, va dans **Storage** > **Create Database** >
   **Blob**, et cree un store (plan gratuit largement suffisant pour un
   usage personnel).
2. La variable `BLOB_READ_WRITE_TOKEN` est ajoutee automatiquement aux
   variables d'environnement du projet.
3. En local, copie cette meme valeur dans `.env` si tu veux tester cette
   fonctionnalite en developpement.

Sans cette configuration, tout continue de fonctionner normalement : le CV
"original" affiche sur la page Mes CV est simplement reconstruit (mise en
page propre, meme contenu texte) plutot que d'etre le fichier exact importe.

## Structure du projet

```
prisma/schema.prisma       Modeles Profile / Criteria / Offer / GmailAccount /
                            ProcessedEmail / CvVersion
src/lib/
  cvParser.ts               Analyse heuristique du texte du CV
  skills.ts                 Dictionnaire de competences + extraction
  matching.ts                Calcul du score de compatibilite
  ai.ts                      Propositions d'edition de CV + classification d'emails (IA ou fallback)
  cvVersion.ts                Application des decisions accepter/modifier/refuser + nommage des versions
  franceTravail.ts           Adaptateur API France Travail
  gmail.ts                   Client OAuth Gmail + lecture des messages
  emailMatcher.ts             Association email <-> offre + classification du statut
  gmailSync.ts                Orchestration de la synchronisation Gmail
  excelExport.ts              Generation du fichier Excel de suivi
  storage.ts                  Stockage de fichiers (Vercel Blob)
  pdfText.ts                  Extraction du texte d'un PDF importe
  cvTemplate.ts                Template PDF (design soigne) pour toutes les versions de CV
src/app/
  profile/, criteria/, offers/, cv-editor/, cv-history/, integrations/  Pages
  api/                        Routes API (profile, criteria, offers, cv/upload,
                               cv-versions, offers/export, gmail/...)
```

## Notes

- Base de donnees PostgreSQL (locale ou hebergee) — voir "Base de donnees".
  Aucun fichier de base n'est commite dans le depot.
- Application mono-utilisateur : aucune authentification.
- Le dictionnaire de competences (`src/lib/skills.ts`) peut etre complete
  facilement pour ameliorer la detection selon ton domaine.
- Le refresh token Gmail est stocke en clair dans la base de donnees (usage
  personnel, base non partagee). Si tu deploies le site publiquement,
  protege l'acces a la base de donnees en consequence.
- L'integration Gmail utilise `@googleapis/gmail` (client cible, ~1 Mo) et
  non le paquet `googleapis` complet (qui embarque ~300 API Google pour
  ~200 Mo et fait echouer le deploiement des fonctions serverless Vercel en
  depassant la limite de taille).
