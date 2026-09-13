"""Helpers et listes de mots-cles partages par toutes les sources."""

import re

# Requetes en texte libre utilisees par les sources "recherche par mots-cles"
# (Adzuna, Jooble). France Travail et La Bonne Alternance ont leurs propres
# filtres natifs (alternance=true / codes ROME) et n'en ont pas besoin.
SEARCH_QUERIES = [
    "alternance commerce international",
    "alternance vente export",
    "alternance marketing international",
    "alternance business developer",
    "alternance commerce anglais",
    "alternance marketing",
]

# Mots-cles qui definissent le secteur Commerce / Vente / Marketing.
# Sert de garde-fou sur les sources generalistes (Adzuna, Jooble) qui
# peuvent renvoyer du bruit hors-sujet.
SECTOR_KEYWORDS = [
    "commerce", "commercial", "commerciale", "vente", "vendeur", "vendeuse",
    "marketing", "business developer", "business development",
    "account manager", "sales", "charge de clientele", "chargee de clientele",
    "chef de produit", "brand", "retail", "export",
]

# Mots-cles qui definissent la dimension internationale / niveau d'anglais.
INTERNATIONAL_KEYWORDS = [
    "anglais", "english", "bilingue", "international", "export",
    "a l'etranger", "a l'international", "groupe international",
    "toeic", "toefl", "ielts", "multinational", "global", "worldwide",
    "overseas", "etranger",
]

# Departements d'Ile-de-France
IDF_DEPARTEMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"]

_IDF_DEPT_NAMES = [
    "ile de france",
    "paris",
    "seine-et-marne", "seine et marne",
    "yvelines",
    "essonne",
    "hauts-de-seine", "hauts de seine",
    "seine-saint-denis", "seine saint denis",
    "val-de-marne", "val de marne",
    "val-d'oise", "val d'oise", "val doise",
]

_POSTAL_CODE_RE = re.compile(r"\b(75|77|78|91|92|93|94|95)\d{3}\b")
_DEPT_PAREN_RE = re.compile(r"\((75|77|78|91|92|93|94|95)\)")


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


def is_idf_location(location_text: str) -> bool:
    """Verifie de facon heuristique qu'un lieu de travail est en Ile-de-France.

    Utile pour les sources dont le filtre de localisation est un texte libre
    (Adzuna, Jooble, La Bonne Alternance) et n'est pas fiable a 100%.
    """
    if not location_text:
        return False
    text = normalize(location_text)
    if any(name in text for name in _IDF_DEPT_NAMES):
        return True
    if _POSTAL_CODE_RE.search(text) or _DEPT_PAREN_RE.search(text):
        return True
    return False


def matched_keywords(text: str, keywords: list) -> list:
    normalized = normalize(text)
    return [kw for kw in keywords if strip_accents(kw) in normalized]


def is_sector_relevant(title: str, description: str) -> bool:
    text = f"{title} {description}"
    return bool(matched_keywords(text, SECTOR_KEYWORDS))


def matched_international_keywords(title: str, description: str) -> list:
    text = f"{title} {description}"
    return matched_keywords(text, INTERNATIONAL_KEYWORDS)


def fingerprint(title: str, company: str, location: str) -> str:
    """Cle approximative pour reperer la meme offre postee sur plusieurs sources."""
    parts = [normalize(title), normalize(company), normalize(location)]
    return "|".join(p.strip() for p in parts)


def make_offer(
    source: str,
    raw_id: str,
    title: str,
    company: str,
    location: str,
    description: str,
    contract: str,
    url: str,
    date: str,
) -> dict:
    return {
        "id": f"{source}:{raw_id}",
        "source": source,
        "title": title or "Sans titre",
        "company": company or "Entreprise non precisee",
        "location": location or "Lieu non precise",
        "description": description or "",
        "contract": contract or "",
        "url": url or "",
        "date": date or "",
    }
