#!/usr/bin/env python3
"""
Cherche chaque jour des offres d'alternance / apprentissage en Ile-de-France
dans les secteurs Commerce / Vente / Marketing ayant une dimension
internationale ou exigeant un niveau d'anglais, en agregeant plusieurs
sources, puis envoie un e-mail avec les nouvelles offres trouvees depuis la
derniere execution.

Sources agregees (chacune desactivee automatiquement si non configuree) :
- France Travail (API officielle "Offres d'emploi v2")
- La Bonne Alternance (agregateur officiel du Ministere du Travail)
- Adzuna (agregateur generaliste couvrant de nombreux sites d'offres)
- Jooble (agregateur international, tres large couverture FR)

Welcome to the Jungle n'a pas d'API publique et interdit le scraping dans
ses CGU : ce n'est donc pas une source integree ici (voir README).
"""

import json
import os
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from sources import adzuna, base, france_travail, jooble, la_bonne_alternance

SOURCES = [france_travail, la_bonne_alternance, adzuna, jooble]

MAX_OFFERS_IN_EMAIL = 50
SEEN_RETENTION_DAYS = 45

REPO_ROOT = Path(__file__).resolve().parent.parent
SEEN_FILE = REPO_ROOT / "data" / "seen_offers.json"


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
    for fingerprint, seen_at in seen.items():
        try:
            seen_date = datetime.fromisoformat(seen_at)
        except ValueError:
            continue
        if seen_date >= cutoff:
            pruned[fingerprint] = seen_at
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
        keywords = ", ".join(
            base.matched_international_keywords(offre["title"], offre["description"])
        ) or "n/a"

        lines.append(
            "\n".join(
                [
                    f"- {offre['title']}  [{offre['source']}]",
                    f"  Entreprise : {offre['company']}",
                    f"  Lieu       : {offre['location']}",
                    f"  Contrat    : {offre['contract']}",
                    f"  Mots-cles  : {keywords}",
                    f"  Lien       : {offre['url']}",
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
        f"Sources : {', '.join(s.NAME for s in SOURCES)}.\n"
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


def collect_all_offers() -> list:
    all_offers = []
    for source in SOURCES:
        try:
            all_offers.extend(source.fetch())
        except Exception as exc:  # une source qui plante ne doit pas tout bloquer
            print(f"[error] {source.NAME} a leve une exception : {exc}", file=sys.stderr)
    return all_offers


def dedupe_across_sources(offers: list) -> list:
    """Garde une seule occurrence de la meme offre (memes agences republient
    parfois le meme intitule sur plusieurs villes/departements)."""
    by_fingerprint = {}
    for offre in offers:
        fp = base.fingerprint(offre["title"], offre["company"])
        if fp not in by_fingerprint:
            by_fingerprint[fp] = offre
    return list(by_fingerprint.values())


def main() -> int:
    raw_offers = collect_all_offers()
    print(f"[info] {len(raw_offers)} offre(s) brute(s) toutes sources confondues.")

    idf_offers = [o for o in raw_offers if base.is_idf_location(o["location"])]

    # On ecarte les offres d'agences/ecoles qui recrutent pour LEUR propre
    # cursus (Aurlom, ICademie, ISCOD...) et celles sans entreprise identifiee
    # (generalement le meme type d'annonces generiques republiees en masse).
    known_company_offers = [o for o in idf_offers if base.is_company_known(o["company"])]
    filtered_offers = [
        o
        for o in known_company_offers
        if not base.is_partner_school_offer(o["title"], o["company"], o["description"])
    ]
    print(
        f"[info] {len(idf_offers) - len(filtered_offers)} offre(s) ecartee(s) "
        "(entreprise inconnue ou ecole/agence partenaire)."
    )

    sector_offers = [
        o for o in filtered_offers if base.is_sector_relevant(o["title"], o["description"])
    ]
    relevant_offers = [
        o
        for o in sector_offers
        if base.matched_international_keywords(o["title"], o["description"])
    ]
    print(
        f"[info] {len(relevant_offers)} offre(s) IDF + Commerce/Vente/Marketing "
        "+ international/anglais."
    )

    deduped_offers = dedupe_across_sources(relevant_offers)
    print(f"[info] {len(deduped_offers)} offre(s) apres dedoublonnage inter-sources.")

    seen = load_seen()
    new_offers = [
        o
        for o in deduped_offers
        if base.fingerprint(o["title"], o["company"]) not in seen
    ]
    new_offers.sort(key=lambda o: o.get("date", ""), reverse=True)

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
    for offre in deduped_offers:
        fp = base.fingerprint(offre["title"], offre["company"])
        seen.setdefault(fp, now_iso)
    save_seen(seen)

    return 0


if __name__ == "__main__":
    sys.exit(main())
