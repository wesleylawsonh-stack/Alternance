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
  / refusé) et lien direct vers l'offre originale.

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

## Structure du projet

```
prisma/schema.prisma       Modeles Profile / Criteria / Offer (SQLite)
src/lib/
  cvParser.ts               Analyse heuristique du texte du CV
  skills.ts                 Dictionnaire de competences + extraction
  matching.ts                Calcul du score de compatibilite
  ai.ts                      Adaptation de CV (IA ou mode template)
  franceTravail.ts           Adaptateur API France Travail
  pdfText.ts / pdfGenerate.ts  Lecture et generation de PDF
src/app/
  profile/, criteria/, offers/  Pages
  api/                        Routes API (profile, criteria, offers, cv/upload...)
```

## Notes

- Base de donnees SQLite en fichier local (`data/dev.db`), ignoree par git.
- Application mono-utilisateur : aucune authentification.
- Le dictionnaire de competences (`src/lib/skills.ts`) peut etre complete
  facilement pour ameliorer la detection selon ton domaine.
