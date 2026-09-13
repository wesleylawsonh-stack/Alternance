# Alternance — alertes offres Commerce / Vente / Marketing international

Cet outil envoie chaque jour, par e-mail, les nouvelles offres d'alternance
(apprentissage) en **Ile-de-France**, dans les secteurs **Commerce, Vente,
Marketing**, qui ont soit une **dimension internationale**, soit exigent un
**niveau d'anglais**.

Il agrège **plusieurs sources** pour maximiser la couverture, tourne
automatiquement via une GitHub Action planifiée (pas besoin de laisser un
ordinateur allumé), et ne renvoie jamais deux fois la même offre (un fichier
`data/seen_offers.json` garde la mémoire des offres déjà vues, y compris
quand la même offre apparaît sur plusieurs sources).

## Sources agrégées

| Source | Type | Config requise |
|---|---|---|
| **France Travail** (Offres d'emploi v2) | API officielle, filtre natif `alternance=true` | `FT_CLIENT_ID` + `FT_CLIENT_SECRET` (gratuit) |
| **La Bonne Alternance** | Agrégateur officiel du Ministère du Travail, remonte aussi des offres directes d'entreprises absentes de France Travail | Aucune (activée par défaut) |
| **Adzuna** | Agrégateur généraliste couvrant des milliers de sites d'offres | `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` (gratuit) |
| **Jooble** | Agrégateur international, très large couverture FR | `JOOBLE_API_KEY` (gratuit) |

Chaque source est **optionnelle et indépendante** : si ses identifiants ne
sont pas configurés, elle est simplement ignorée sans bloquer les autres.
Vous pouvez démarrer avec juste France Travail + La Bonne Alternance, puis
ajouter Adzuna et Jooble plus tard.

### Pourquoi pas Welcome to the Jungle ?

Welcome to the Jungle ne propose **aucune API publique** et ses conditions
d'utilisation interdisent le scraping automatisé de son site. Faire tourner
un robot quotidien dessus serait à la fois une violation de leurs CGU et une
solution fragile (blocage anti-bot, changements de mise en page). Ce n'est
donc pas intégré ici. En complément, vous pouvez créer une **alerte e-mail
native** directement sur welcometothejungle.com (filtre "Commerce/Vente/
Marketing" + "Ile-de-France") — c'est gratuit et ça respecte leurs règles.

## Comment ça marche

1. `scripts/fetch_alternance_offers.py` interroge chaque source configurée
   (voir `scripts/sources/`) et normalise les résultats.
2. Un filtre géographique ne garde que les offres en Ile-de-France, un
   filtre sectoriel ne garde que Commerce/Vente/Marketing, puis un filtre
   final ne garde que les offres avec une dimension internationale ou un
   niveau d'anglais requis (anglais, bilingue, international, export,
   TOEIC, global...).
3. Les offres identiques trouvées sur plusieurs sources sont dédoublonnées
   (comparaison titre + entreprise + lieu).
4. Les offres déjà envoyées sont ignorées ; seules les nouvelles sont
   envoyées par e-mail.
5. `.github/workflows/daily-alternance.yml` exécute ce script chaque jour
   vers 7h-8h (heure de Paris) et committe la mise à jour du fichier de
   suivi des offres déjà vues.

## Configuration (à faire une seule fois)

### 1. France Travail (recommandé)

1. Créez un compte sur https://francetravail.io
2. Créez une "application", puis abonnez-la à l'API **"Offres d'emploi
   v2"** (accès gratuit en libre-service).
3. Récupérez l'`Identifiant client` et la `Clé secrète` générés.

### 2. Adzuna (optionnel, recommandé)

1. Créez un compte gratuit sur https://developer.adzuna.com
2. Récupérez immédiatement votre `App ID` et votre `App Key` dans le
   tableau de bord.

### 3. Jooble (optionnel)

1. Faites une demande de clé API sur https://fr.jooble.org/api/about
   (formulaire simple, clé reçue par e-mail).

### 4. Préparer l'envoi d'e-mail (SMTP)

Le plus simple est d'utiliser votre compte Gmail :

1. Activez la validation en 2 étapes sur votre compte Google.
2. Créez un **mot de passe d'application** :
   https://myaccount.google.com/apppasswords
3. Notez : hôte `smtp.gmail.com`, port `587`, utilisateur = votre adresse
   Gmail, mot de passe = le mot de passe d'application généré.

### 5. Ajouter les secrets sur GitHub

Dans le repo GitHub : **Settings → Secrets and variables → Actions → New
repository secret**, ajoutez (seuls `SMTP_*` et `MAIL_TO` sont obligatoires,
le reste est optionnel selon les sources que vous activez) :

| Secret             | Valeur                                              |
|--------------------|------------------------------------------------------|
| `FT_CLIENT_ID`     | Identifiant client France Travail                    |
| `FT_CLIENT_SECRET` | Clé secrète France Travail                           |
| `ADZUNA_APP_ID`    | App ID Adzuna                                        |
| `ADZUNA_APP_KEY`   | App Key Adzuna                                       |
| `JOOBLE_API_KEY`   | Clé API Jooble                                       |
| `SMTP_HOST`        | `smtp.gmail.com` (ou votre fournisseur)              |
| `SMTP_PORT`        | `587`                                                |
| `SMTP_USER`        | Votre adresse e-mail d'envoi                         |
| `SMTP_PASSWORD`    | Mot de passe d'application SMTP                      |
| `MAIL_FROM`        | Adresse d'envoi (peut être identique à `SMTP_USER`)  |
| `MAIL_TO`          | Adresse de réception (optionnel, défaut : `romane.mj972@gmail.com`) |

### 6. Tester manuellement

Dans l'onglet **Actions** du repo GitHub, choisissez le workflow
**"Alertes alternance quotidiennes"** puis **Run workflow** pour déclencher
un envoi tout de suite, sans attendre le lendemain. Consultez les logs de
l'étape "Fetch and send alternance offers" : chaque source affiche combien
d'offres brutes elle a trouvées, ou pourquoi elle a été ignorée.

Si le mapping des champs d'une source (surtout **La Bonne Alternance**, dont
le format de réponse est moins stable) semble incorrect dans les résultats,
ajoutez un secret `DEBUG_SOURCES=1` : le script affichera un exemple brut de
réponse dans les logs pour ajuster facilement le code dans
`scripts/sources/`.

## Personnaliser

- `scripts/sources/base.py` : `SEARCH_QUERIES` (requêtes texte libre pour
  Adzuna/Jooble), `SECTOR_KEYWORDS` (définition du secteur Commerce/Vente/
  Marketing), `INTERNATIONAL_KEYWORDS` (définition de la dimension
  internationale/anglais), `IDF_DEPARTEMENTS`.
- `scripts/sources/*.py` : logique propre à chaque source (ROME codes,
  rayon de recherche, etc.).
- L'heure d'envoi se change dans `.github/workflows/daily-alternance.yml`
  (ligne `cron: "0 6 * * *"`, exprimée en heure UTC).
- Ajouter une nouvelle source : créez un module dans `scripts/sources/`
  exposant `NAME`, `is_configured()` et `fetch() -> list[dict]` (utilisez
  `base.make_offer(...)` pour normaliser), puis ajoutez-le à la liste
  `SOURCES` dans `scripts/fetch_alternance_offers.py`.

## Exécution locale (optionnel)

```bash
pip install -r requirements.txt
export FT_CLIENT_ID=...
export FT_CLIENT_SECRET=...
export ADZUNA_APP_ID=...
export ADZUNA_APP_KEY=...
export JOOBLE_API_KEY=...
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=...
export SMTP_PASSWORD=...
export MAIL_TO=romane.mj972@gmail.com
python scripts/fetch_alternance_offers.py
```
