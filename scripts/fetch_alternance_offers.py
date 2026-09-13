#!/usr/bin/env python3
"""
Cherche chaque jour des offres d'alternance / apprentissage en Ile-de-France
dans les secteurs Commerce / Vente / Marketing ayant une dimension
internationale ou exigeant un niveau d'anglais, puis envoie un e-mail
avec les nouvelles offres trouvees depuis la derniere execution.

Source: API France Travail "Offres d'emploi v2" (inscription gratuite sur
https://francetravail.io), filtree avec le parametre alternance=true.
"""

import json
import os
import smtplib
import sys
import time
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

TOKEN_URL = (
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
    "?realm=%2Fpartenaire"
)
SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"

# Departements d'Ile-de-France
IDF_DEPARTEMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"]

# Requetes en texte libre couvrant Commerce / Vente / Marketing.
# On multiplie les requetes plutot que de s'appuyer sur un seul mot-cle
# afin de couvrir un vocabulaire varie sans dependre de codes ROME precis.
SEARCH_QUERIES = [
    "commerce international",
    "vente export",
    "marketing international",
    "commerce anglais",
    "vente anglais",
    "marketing anglais",
    "business developer",
    "account manager",
    "commerce",
    "vente",
    "marketing",
]

# Mots-cles utilises pour ne garder que les offres avec une dimension
# internationale ou exigeant un niveau d'anglais. La recherche se fait
# sur le titre + la description de l'offre, insensible a la casse.
INTERNATIONAL_KEYWORDS = [
    "anglais",
    "english",
    "bilingue",
    "international",
    "export",
    "a l'etranger",
    "a l'international",
    "groupe international",
    "toeic",
    "toefl",
    "ielts",
    "multinational",
    "global",
    "worldwide",
    "overseas",
    "etranger",
]

MAX_OFFERS_IN_EMAIL = 40
SEEN_RETENTION_DAYS = 45

REPO_ROOT = Path(__file__).resolve().parent.parent
SEEN_FILE = REPO_ROOT / "data" / "seen_offers.json"


def strip_accents(text: str) -> str:
    replacements = {
        "à": "a", "â": "a", "ä": "a",
        "é": "e", "è": "e", "ê": "e", "ë": "e",
        "î": "i", "ï": "i",
        "ô": "o", "ö": "o",
        "ù": "u", "û": "u", "ü": "u",
        "ç": "c",
    }
    for accented, plain in replacements.items():
        text = text.replace(accented, plain)
    return text


def normalize(text: str) -> str:
    return strip_accents((text or "").lower())


# --------------------------------------------------------------------------
# France Travail API
# --------------------------------------------------------------------------


def get_access_token() -> str:
    client_id = os.environ["FT_CLIENT_ID"]
    client_secret = os.environ["FT_CLIENT_SECRET"]

    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "api_offresdemploiv2 o2dsoffre",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def search_offers(token: str, mots_cles: str) -> dict:
    """Retourne un dict {id_offre: offre} pour une requete donnee."""
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "motsCles": mots_cles,
        "departement": ",".join(IDF_DEPARTEMENTS),
        "alternance": "true",
        "sort": "1",
        "range": "0-49",
    }

    for attempt in range(3):
        resp = requests.get(SEARCH_URL, headers=headers, params=params, timeout=30)
        if resp.status_code == 429 and attempt < 2:
            time.sleep(5 * (attempt + 1))
            continue
        break

    if resp.status_code == 204:
        return {}
    resp.raise_for_status()

    data = resp.json()
    return {offre["id"]: offre for offre in data.get("resultats", [])}


def fetch_all_offers(token: str) -> dict:
    all_offers: dict = {}
    for query in SEARCH_QUERIES:
        try:
            all_offers.update(search_offers(token, query))
        except requests.HTTPError as exc:
            print(f"[warn] requete '{query}' echouee: {exc}", file=sys.stderr)
    return all_offers


# --------------------------------------------------------------------------
# Filtrage
# --------------------------------------------------------------------------


def matched_keywords(offre: dict) -> list:
    text = normalize(offre.get("intitule", "") + " " + offre.get("description", ""))
    return [kw for kw in INTERNATIONAL_KEYWORDS if strip_accents(kw) in text]


def offer_link(offre: dict) -> str:
    origine = offre.get("origineOffre") or {}
    url = origine.get("urlOrigine")
    if url:
        return url
    return f"https://candidat.francetravail.fr/offres/recherche/detail/{offre['id']}"


# --------------------------------------------------------------------------
# Etat "offres deja vues"
# --------------------------------------------------------------------------


def load_seen() -> dict:
    if not SEEN_FILE.exists():
        return {}
    try:
        return json.loads(SEEN_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_seen(seen: dict) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=SEEN_RETENTION_DAYS)
    pruned = {}
    for offer_id, seen_at in seen.items():
        try:
            seen_date = datetime.fromisoformat(seen_at)
        except ValueError:
            continue
        if seen_date >= cutoff:
            pruned[offer_id] = seen_at
    SEEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    SEEN_FILE.write_text(
        json.dumps(pruned, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


# --------------------------------------------------------------------------
# E-mail
# --------------------------------------------------------------------------


def build_email_body(new_offers: list) -> str:
    lines = []
    shown = new_offers[:MAX_OFFERS_IN_EMAIL]

    for offre in shown:
        entreprise = (offre.get("entreprise") or {}).get("nom") or "Entreprise non precisee"
        lieu = (offre.get("lieuTravail") or {}).get("libelle") or "Lieu non precise"
        contrat = offre.get("typeContratLibelle") or offre.get("natureContrat") or ""
        keywords = ", ".join(matched_keywords(offre)) or "n/a"

        lines.append(
            "\n".join(
                [
                    f"- {offre.get('intitule', 'Sans titre')}",
                    f"  Entreprise : {entreprise}",
                    f"  Lieu       : {lieu}",
                    f"  Contrat    : {contrat}",
                    f"  Mots-cles  : {keywords}",
                    f"  Lien       : {offer_link(offre)}",
                ]
            )
        )

    body = "\n\n".join(lines)
    if len(new_offers) > MAX_OFFERS_IN_EMAIL:
        body += f"\n\n... et {len(new_offers) - MAX_OFFERS_IN_EMAIL} autre(s) offre(s) non affichee(s)."

    body += (
        "\n\n---\n"
        "Offres d'alternance Commerce / Vente / Marketing (Ile-de-France) "
        "avec dimension internationale ou niveau d'anglais requis.\n"
        "Source : API France Travail.\n"
    )
    return body


def send_email(subject: str, body: str) -> None:
    smtp_host = os.environ["SMTP_HOST"]
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ["SMTP_USER"]
    smtp_password = os.environ["SMTP_PASSWORD"]
    mail_from = os.environ.get("MAIL_FROM", smtp_user)
    mail_to = os.environ["MAIL_TO"]

    msg = MIMEMultipart()
    msg["From"] = mail_from
    msg["To"] = mail_to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(mail_from, [mail_to], msg.as_string())


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main() -> int:
    token = get_access_token()
    all_offers = fetch_all_offers(token)
    print(f"[info] {len(all_offers)} offre(s) recuperee(s) au total (alternance, IDF).")

    relevant_offers = [o for o in all_offers.values() if matched_keywords(o)]
    print(f"[info] {len(relevant_offers)} offre(s) avec dimension internationale/anglais.")

    seen = load_seen()
    new_offers = [o for o in relevant_offers if o["id"] not in seen]
    new_offers.sort(key=lambda o: o.get("dateCreation", ""), reverse=True)

    if not new_offers:
        print("[info] Aucune nouvelle offre aujourd'hui, pas d'e-mail envoye.")
    else:
        today = datetime.now(timezone.utc).strftime("%d/%m/%Y")
        subject = (
            f"{len(new_offers)} nouvelle(s) offre(s) alternance "
            f"Commerce/Vente/Marketing international - {today}"
        )
        body = build_email_body(new_offers)
        send_email(subject, body)
        print(f"[info] E-mail envoye avec {len(new_offers)} nouvelle(s) offre(s).")

    now_iso = datetime.now(timezone.utc).isoformat()
    for offre in relevant_offers:
        seen.setdefault(offre["id"], now_iso)
    save_seen(seen)

    return 0


if __name__ == "__main__":
    sys.exit(main())
