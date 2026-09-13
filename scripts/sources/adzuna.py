"""Source : API Adzuna (agregateur generaliste, France).

Cle gratuite immediate sur https://developer.adzuna.com
Necessite ADZUNA_APP_ID et ADZUNA_APP_KEY.
"""

import os
import sys

import requests

from . import base

NAME = "Adzuna"
REQUIRED_ENV = ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"]

SEARCH_URL = "https://api.adzuna.com/v1/api/jobs/fr/search/1"


def is_configured() -> bool:
    return all(os.environ.get(v) for v in REQUIRED_ENV)


def fetch() -> list:
    if not is_configured():
        print(f"[skip] {NAME} : identifiants absents.")
        return []

    offers = {}
    for query in base.SEARCH_QUERIES:
        params = {
            "app_id": os.environ["ADZUNA_APP_ID"],
            "app_key": os.environ["ADZUNA_APP_KEY"],
            "what": query,
            "where": "Ile-de-France",
            "results_per_page": 50,
            "max_days_old": 3,
            "content-type": "application/json",
        }
        try:
            resp = requests.get(SEARCH_URL, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            print(f"[warn] {NAME} : requete '{query}' echouee ({exc})", file=sys.stderr)
            continue
        except ValueError as exc:
            print(f"[warn] {NAME} : reponse invalide ({exc})", file=sys.stderr)
            continue

        results = data.get("results", [])
        if os.environ.get("DEBUG_SOURCES") and results:
            print(f"[debug] {NAME} exemple brut : {results[0]}", file=sys.stderr)

        for item in results:
            raw_id = item.get("id")
            if not raw_id:
                continue
            offers[raw_id] = base.make_offer(
                source="adzuna",
                raw_id=raw_id,
                title=item.get("title", ""),
                company=(item.get("company") or {}).get("display_name", ""),
                location=(item.get("location") or {}).get("display_name", ""),
                description=item.get("description", ""),
                contract=item.get("contract_time", "Alternance"),
                url=item.get("redirect_url", ""),
                date=item.get("created", ""),
            )

    print(f"[info] {NAME} : {len(offers)} offre(s) brute(s).")
    return list(offers.values())
