"""Source : API publique "La Bonne Alternance" (Ministere du Travail).

https://labonnealternance.apprentissage.beta.gouv.fr - agregateur officiel
dedie a l'alternance, qui remonte aussi des offres directes d'entreprises
("matchas") non presentes sur France Travail. Aucune inscription requise,
un simple identifiant texte libre ("caller") suffit.

NB: c'est une API tierce dont le format de reponse peut evoluer. Ce module
essaie plusieurs noms de champs possibles pour rester robuste ; activez
DEBUG_SOURCES=1 pour afficher un exemple brut si le mapping doit etre
ajuste (voir README).
"""

import os
import sys

import requests

from . import base

NAME = "La Bonne Alternance"

SEARCH_URL = "https://labonnealternance.apprentissage.beta.gouv.fr/api/v1/jobs"

# Codes ROME Commerce / Vente / Marketing
ROMES = "D1401,D1402,D1403,D1404,D1406,D1407,D1408,M1705,M1703,E1103"

# Centre Paris + rayon large pour couvrir toute l'Ile-de-France
LATITUDE = 48.8566
LONGITUDE = 2.3522
RADIUS_KM = 100


def is_configured() -> bool:
    # Pas d'inscription necessaire : source activee par defaut.
    return True


def _get(d: dict, *keys, default=""):
    for key in keys:
        value = d.get(key)
        if value not in (None, ""):
            return value
    return default


def fetch() -> list:
    params = {
        "romes": ROMES,
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "radius": RADIUS_KM,
        "caller": os.environ.get("LBA_CALLER", "outil-alternance-perso"),
    }

    try:
        resp = requests.get(SEARCH_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        print(f"[warn] {NAME} : requete echouee ({exc})", file=sys.stderr)
        return []
    except ValueError as exc:
        print(f"[warn] {NAME} : reponse invalide ({exc})", file=sys.stderr)
        return []

    # Seules les offres directes d'entreprises partenaires ("matchas") sont
    # gardees : les "peJobs" sont deja couvertes par la source France Travail,
    # et "lbaCompanies" ne sont pas de vraies offres mais des entreprises a
    # demarcher spontanement.
    raw_results = (data.get("matchas") or {}).get("results", [])

    if os.environ.get("DEBUG_SOURCES") and raw_results:
        print(f"[debug] {NAME} exemple brut : {raw_results[0]}", file=sys.stderr)

    offers = []
    for item in raw_results:
        company = item.get("company") or {}
        place = item.get("place") or {}
        contract = item.get("contract") or {}

        raw_id = _get(item, "id", "_id", "jobId", default="")
        if not raw_id:
            continue

        title = _get(item, "title", "label", "romeLabel")
        company_name = _get(company, "name", default=_get(item, "companyName"))
        location = _get(
            place,
            "fullAddress",
            "city",
            default=_get(item, "location"),
        )
        description = _get(item, "description", "romeDetails")
        contract_label = _get(contract, "type", "duration", default="Alternance")
        url = _get(item, "url", "applicationUrl")

        offers.append(
            base.make_offer(
                source="la_bonne_alternance",
                raw_id=str(raw_id),
                title=title,
                company=company_name,
                location=location,
                description=description,
                contract=contract_label,
                url=url,
                date=_get(item, "createdAt", "updatedAt"),
            )
        )

    print(f"[info] {NAME} : {len(offers)} offre(s) brute(s).")
    return offers
