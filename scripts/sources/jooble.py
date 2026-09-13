"""Source : API Jooble (agregateur international, tres large couverture FR).

Cle gratuite obtenue par simple formulaire sur https://fr.jooble.org/api/about
Necessite JOOBLE_API_KEY.
"""

import os
import sys

import requests

from . import base

NAME = "Jooble"
REQUIRED_ENV = ["JOOBLE_API_KEY"]


def is_configured() -> bool:
    return all(os.environ.get(v) for v in REQUIRED_ENV)


def fetch() -> list:
    if not is_configured():
        print(f"[skip] {NAME} : identifiant absent.")
        return []

    url = f"https://jooble.org/api/{os.environ['JOOBLE_API_KEY']}"
    offers = {}

    for query in base.SEARCH_QUERIES:
        payload = {"keywords": query, "location": "Ile-de-France"}
        try:
            resp = requests.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            print(f"[warn] {NAME} : requete '{query}' echouee ({exc})", file=sys.stderr)
            continue
        except ValueError as exc:
            print(f"[warn] {NAME} : reponse invalide ({exc})", file=sys.stderr)
            continue

        jobs = data.get("jobs", [])
        if os.environ.get("DEBUG_SOURCES") and jobs:
            print(f"[debug] {NAME} exemple brut : {jobs[0]}", file=sys.stderr)

        for item in jobs:
            raw_id = item.get("id") or item.get("link")
            if not raw_id:
                continue
            offers[raw_id] = base.make_offer(
                source="jooble",
                raw_id=str(raw_id),
                title=item.get("title", ""),
                company=item.get("company", ""),
                location=item.get("location", ""),
                description=item.get("snippet", ""),
                contract=item.get("type", "Alternance"),
                url=item.get("link", ""),
                date=item.get("updated", ""),
            )

    print(f"[info] {NAME} : {len(offers)} offre(s) brute(s).")
    return list(offers.values())
