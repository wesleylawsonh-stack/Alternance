# MonAlternance

Site personnel (usage individuel, pas de login) pour piloter une recherche
d'emploi/alternance :

- **Profil** : informations personnelles + import de CV au format PDF.
- **CV** : le texte du PDF est extrait et analysé pour en tirer les
  compétences (dictionnaire de mots-clés) et les sections (profil,
  expériences, formation, langues).
- **Critères de recherche** : intitulés de poste, localisations, types de
  contrat, mots-clés bonus/exclusion.
- **Offres** : ajout manuel ou récupération automatique (API France
  Travail), avec un **score de compatibilité en %** entre le CV et chaque
  offre, et le détail des **compétences manquantes**.
- **Adapter mon CV** : génère un nouveau CV orienté pour l'offre choisie
  (réordonnancement des compétences/expériences existantes, jamais
  d'invention de compétence absente du CV original), téléchargeable en PDF.
- **Statut de candidature** (non postulé / postulé / entretien / offre reçue
  / refusé), commentaires libres et lien direct vers l'offre originale.
- **Export Excel** : télécharge un fichier `.xlsx` (entreprise, poste,
  statut, score, commentaires, lien...) pour suivre tes candidatures.
- **Synchronisation Gmail** (optionnelle) : détecte automatiquement dans ta
  boîte mail les réponses à tes candidatures (refus, entretien, embauche) et
  met à jour le statut correspondant, avec un journal dans les commentaires.

## Stack technique

Next.js (App Router, TypeScript) + Tailwind CSS + Prisma/SQLite (base de
données locale, un seul fichier `data/dev.db`).

## Démarrage local

```bash
npm install
npx prisma migrate deploy   # cree la base SQLite locale (data/dev.db)
npm run dev
```

Le site est disponible sur http://localhost:3000.

Aucune clé n'est necessaire pour commencer : tu peux tout de suite importer
ton CV, definir tes criteres, et ajouter des offres manuellement. Le score de
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
  planifiee quotidienne (6h du matin). Le plan gratuit "Hobby" de Vercel
  limite les cron jobs a une execution par jour maximum ; passe a une
  frequence plus rapprochee (ex: toutes les heures, `0 * * * *`) uniquement
  si tu passes au plan Pro. Si tu deploies sur Vercel, definis une variable
  d'environnement `CRON_SECRET` (n'importe quelle chaine aleatoire) dans les
  parametres du projet Vercel — Vercel l'enverra automatiquement en
  en-tete `Authorization: Bearer <CRON_SECRET>` a chaque declenchement.
  **Attention** : Vercel ne fournit pas de disque persistant, donc la base
  SQLite actuelle (`data/dev.db`) ne survivrait pas aux redeploiements —
  il faudrait migrer vers une base hebergee (Postgres via Neon/Supabase,
  Turso, etc.) avant de deployer sur Vercel. Ce n'est pas fait dans ce depot.
- **Serveur/VPS avec disque persistant** (recommande avec la configuration
  SQLite actuelle) : deploie le site (`npm run build && npm start`) et
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

## Structure du projet

```
prisma/schema.prisma       Modeles Profile / Criteria / Offer / GmailAccount / ProcessedEmail
src/lib/
  cvParser.ts               Analyse heuristique du texte du CV
  skills.ts                 Dictionnaire de competences + extraction
  matching.ts                Calcul du score de compatibilite
  ai.ts                      Adaptation de CV + classification d'emails (IA ou fallback)
  franceTravail.ts           Adaptateur API France Travail
  gmail.ts                   Client OAuth Gmail + lecture des messages
  emailMatcher.ts             Association email <-> offre + classification du statut
  gmailSync.ts                Orchestration de la synchronisation Gmail
  excelExport.ts              Generation du fichier Excel de suivi
  pdfText.ts / pdfGenerate.ts  Lecture et generation de PDF
src/app/
  profile/, criteria/, offers/, integrations/  Pages
  api/                        Routes API (profile, criteria, offers, cv/upload,
                               offers/export, gmail/...)
```

## Notes

- Base de donnees SQLite en fichier local (`data/dev.db`), ignoree par git.
- Application mono-utilisateur : aucune authentification.
- Le dictionnaire de competences (`src/lib/skills.ts`) peut etre complete
  facilement pour ameliorer la detection selon ton domaine.
- Le refresh token Gmail est stocke en clair dans la base SQLite locale
  (usage personnel, base non partagee). Si tu deploies le site publiquement,
  protege l'acces a la base de donnees en consequence.
