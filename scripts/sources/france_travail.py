"""Source : API France Travail - Offres d'emploi v2.

Necessite un compte gratuit sur https://francetravail.io et un abonnement
a l'API "Offres d'emploi v2" (FT_CLIENT_ID / FT_CLIENT_SECRET).
Filtre nativement sur alternance=true et les departements d'Ile-de-France.
"""

import os
import sys
import time

import requests

from . import base

NAME = "France Travail"
REQUIRED_ENV = ["FT_CLIENT_ID", "FT_CLIENT_SECRET"]

TOKEN_URL = (
    "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
    "?realm=%2Fpartenaire"
)
SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"

# France Travail cherche deja finement par mots-cles ; pas besoin du prefixe
# "alternance" puisque le parametre dedie alternance=true s'en charge.
QUERIES = [
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


def is_configured() -> bool:
    return all(os.environ.get(v) for v in REQUIRED_ENV)


def _get_access_token() -> str:
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": os.environ["FT_CLIENT_ID"],
            "client_secret": os.environ["FT_CLIENT_SECRET"],
            "scope": "api_offresdemploiv2 o2dsoffre",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _search(token: str, mots_cles: str) -> list:
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "motsCles": mots_cles,
        "departement": ",".join(base.IDF_DEPARTEMENTS),
        "alternance": "true",
        "sort": "1",
        "range": "0-49",
    }

    resp = None
    for attempt in range(3):
        resp = requests.get(SEARCH_URL, headers=headers, params=params, timeout=30)
        if resp.status_code == 429 and attempt < 2:
            time.sleep(5 * (attempt + 1))
            continue
        break

    if resp.status_code == 204:
        return []
    resp.raise_for_status()
    return resp.json().get("resultats", [])


def fetch() -> list:
    if not is_configured():
        print(f"[skip] {NAME} : identifiants absents.")
        return []

    try:
        token = _get_access_token()
    except requests.RequestException as exc:
        print(f"[warn] {NAME} : authentification echouee ({exc})", file=sys.stderr)
        return []

    offers = {}
    for query in QUERIES:
        try:
            for offre in _search(token, query):
                lieu = (offre.get("lieuTravail") or {}).get("libelle", "")
                origine = offre.get("origineOffre") or {}
                url = origine.get("urlOrigine") or (
                    f"https://candidat.francetravail.fr/offres/recherche/detail/{offre['id']}"
                )
                offers[offre["id"]] = base.make_offer(
                    source="france_travail",
                    raw_id=offre["id"],
                    title=offre.get("intitule", ""),
                    company=(offre.get("entreprise") or {}).get("nom", ""),
                    location=lieu,
                    description=offre.get("description", ""),
                    contract=offre.get("typeContratLibelle") or offre.get("natureContrat", ""),
                    url=url,
                    date=offre.get("dateCreation", ""),
                )
        except requests.RequestException as exc:
            print(f"[warn] {NAME} : requete '{query}' echouee ({exc})", file=sys.stderr)

    print(f"[info] {NAME} : {len(offers)} offre(s) brute(s).")
    return list(offers.values())
