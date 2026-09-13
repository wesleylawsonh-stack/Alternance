# Alternance — alertes offres Commerce / Vente / Marketing international

Cet outil envoie chaque jour, par e-mail, les nouvelles offres d'alternance
(apprentissage) en **Ile-de-France**, dans les secteurs **Commerce, Vente,
Marketing**, qui ont soit une **dimension internationale**, soit exigent un
**niveau d'anglais**.

Il tourne automatiquement via une GitHub Action planifiée (pas besoin de
laisser un ordinateur allumé). Il ne renvoie jamais deux fois la même offre
(un fichier `data/seen_offers.json` garde la mémoire des offres déjà vues).

## Comment ça marche

1. `scripts/fetch_alternance_offers.py` interroge l'API publique **France
   Travail — Offres d'emploi v2**, filtrée sur `alternance=true` et les
   départements d'Ile-de-France, avec plusieurs recherches en texte libre
   (commerce, vente, marketing, export, business developer...).
2. Un filtre secondaire ne garde que les offres dont le titre ou la
   description contiennent un mot-clé lié à l'international ou à l'anglais
   (anglais, bilingue, international, export, TOEIC, global...).
3. Les offres déjà envoyées sont ignorées ; seules les nouvelles sont
   envoyées par e-mail.
4. `.github/workflows/daily-alternance.yml` exécute ce script chaque jour
   vers 7h-8h (heure de Paris) et committe la mise à jour du fichier de
   suivi des offres déjà vues.

## Configuration (à faire une seule fois)

### 1. Obtenir des identifiants API France Travail (gratuit)

1. Créez un compte sur https://francetravail.io
2. Créez une "application", puis abonnez-la à l'API **"Offres d'emploi
   v2"** (accès gratuit en libre-service).
3. Récupérez l'`Identifiant client` et la `Clé secrète` générés.

### 2. Préparer l'envoi d'e-mail (SMTP)

Le plus simple est d'utiliser votre compte Gmail :

1. Activez la validation en 2 étapes sur votre compte Google.
2. Créez un **mot de passe d'application** :
   https://myaccount.google.com/apppasswords
3. Notez : hôte `smtp.gmail.com`, port `587`, utilisateur = votre adresse
   Gmail, mot de passe = le mot de passe d'application généré.

### 3. Ajouter les secrets sur GitHub

Dans le repo GitHub : **Settings → Secrets and variables → Actions → New
repository secret**, ajoutez :

| Secret            | Valeur                                              |
|-------------------|------------------------------------------------------|
| `FT_CLIENT_ID`    | Identifiant client France Travail                    |
| `FT_CLIENT_SECRET`| Clé secrète France Travail                           |
| `SMTP_HOST`       | `smtp.gmail.com` (ou votre fournisseur)              |
| `SMTP_PORT`       | `587`                                                |
| `SMTP_USER`       | Votre adresse e-mail d'envoi                         |
| `SMTP_PASSWORD`   | Mot de passe d'application SMTP                      |
| `MAIL_FROM`       | Adresse d'envoi (peut être identique à `SMTP_USER`)  |
| `MAIL_TO`         | Adresse de réception (optionnel, défaut : `romane.mj972@gmail.com`) |

### 4. Tester manuellement

Dans l'onglet **Actions** du repo GitHub, choisissez le workflow
**"Alertes alternance quotidiennes"** puis **Run workflow** pour déclencher
un envoi tout de suite, sans attendre le lendemain.

## Personnaliser

Tout se règle en haut de `scripts/fetch_alternance_offers.py` :

- `SEARCH_QUERIES` : les recherches en texte libre envoyées à l'API.
- `INTERNATIONAL_KEYWORDS` : les mots-clés qui définissent la "dimension
  internationale / anglais requis".
- `IDF_DEPARTEMENTS` : les départements ciblés (par défaut, toute l'Ile-de-
  France : 75, 77, 78, 91, 92, 93, 94, 95).
- L'heure d'envoi se change dans `.github/workflows/daily-alternance.yml`
  (ligne `cron: "0 6 * * *"`, exprimée en heure UTC).

## Exécution locale (optionnel)

```bash
pip install -r requirements.txt
export FT_CLIENT_ID=...
export FT_CLIENT_SECRET=...
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=...
export SMTP_PASSWORD=...
export MAIL_TO=romane.mj972@gmail.com
python scripts/fetch_alternance_offers.py
```
