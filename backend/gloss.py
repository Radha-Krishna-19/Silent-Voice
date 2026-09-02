"""English → ISL gloss, and gloss → playable sign animation.

WHAT THIS IS
------------
A deterministic rule engine, not a learned translation model. It applies the
grammatical differences between English and Indian Sign Language that are
well documented and easy to encode:

  * ISL has **no articles and no copula** — "the", "a", "is", "are" are dropped.
  * ISL is broadly **SOV / topic-comment**, where English is SVO.
  * **Time markers come first**: "yesterday I went" not "I went yesterday".
  * **Question words come last**: "you name what?" not "what is your name?".
  * There is no inflection — "going", "went", "goes" all gloss to GO.

WHAT THIS IS NOT
----------------
It is not a grammar model and it does not handle non-manual markers (facial
expression, head tilt, mouthing), classifiers, spatial agreement, or
directional verbs — all of which carry real meaning in ISL. A deaf ISL user
would find output from this engine understandable but stilted, in the same way
word-by-word English from a phrasebook is understandable but stilted.

That limitation is inherent to gloss-based reverse translation and is stated
plainly rather than hidden.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

BANK_PATH = Path(__file__).parent / "models" / "sign_bank.json"

# Dropped entirely: ISL marks none of these.
STOPWORDS = {
    "a", "an", "the",
    "is", "am", "are", "was", "were", "be", "been", "being",
    "do", "does", "did", "will", "would", "shall", "should",
    "may", "might", "must", "of", "to", "at", "in", "on", "for",
    "and", "or", "but", "so", "very", "just", "please",
}

# Fronted: ISL puts the time frame first.
TIME_WORDS = {
    "today", "tomorrow", "yesterday", "now", "morning", "afternoon", "evening",
    "night", "week", "month", "year", "hour", "minute", "second", "time",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "summer", "winter", "spring", "monsoon", "season",
}

# Moved to the end: ISL question words are clause-final.
QUESTION_WORDS = {"what", "who", "where", "when", "why", "how", "which", "whose"}

# Morphology and synonyms mapped onto the 261-word vocabulary we can actually
# render. Keys are what people type; values are labels in the sign bank.
SYNONYMS = {
    "hi": "hello", "hey": "hello", "hellow": "hello",
    "thanks": "thank_you", "thankyou": "thank_you", "thx": "thank_you",
    "goodmorning": "good_morning", "goodnight": "good_night",
    "goodevening": "good_evening", "goodafternoon": "good_afternoon",
    "me": "i", "my": "i", "mine": "i", "myself": "i",
    "your": "you", "yours": "you", "u": "you",
    "his": "he", "him": "he", "her": "she", "hers": "she",
    "our": "we", "ours": "we", "us": "we", "their": "they", "them": "they",
    "mom": "mother", "mum": "mother", "mummy": "mother", "ma": "mother",
    "dad": "father", "papa": "father", "daddy": "father",
    "kid": "child", "kids": "child", "children": "child",
    "physician": "doctor", "medic": "doctor",
    "hospitals": "hospital", "clinic": "hospital",
    "medicines": "medicine", "tablet": "medicine", "pill": "medicine",
    "ill": "sick", "unwell": "sick", "sickness": "sick",
    "instructor": "teacher", "professor": "teacher", "sir": "teacher",
    "students": "student", "pupil": "student",
    "books": "book", "notebook": "book",
    "friends": "friend", "buddy": "friend",
    "phone": "telephone", "mobile": "cell_phone", "cellphone": "cell_phone",
    "auto": "car", "vehicle": "car", "bike": "bicycle", "cycle": "bicycle",
    "money": "money", "cash": "money", "rupees": "money",
    "food": "restaurant", "eat": "restaurant",
    "school": "school", "college": "university", "univ": "university",
    "shop": "store_or_shop", "store": "store_or_shop", "market": "market",
    "road": "street_or_road", "street": "street_or_road",
    "home": "house", "residence": "house",
    "job": "job", "work": "job", "office": "office",
    "big": "big_large", "large": "big_large", "huge": "big_large",
    "small": "small_little", "little": "small_little", "tiny": "small_little",
    "happy": "happy", "glad": "pleased", "sad": "sad",
    "good": "good", "nice": "good", "bad": "bad",
    "howareyou": "how_are_you",
}

_PUNCT = re.compile(r"[^\w\s']+")


@lru_cache(maxsize=1)
def load_bank() -> dict:
    if not BANK_PATH.exists():
        return {"words": {}, "fps": 12, "quant": 1000}
    with open(BANK_PATH, encoding="utf-8") as f:
        return json.load(f)


def vocabulary() -> list[str]:
    return sorted(load_bank().get("words", {}))


def _normalise(token: str, vocab: set[str]) -> str | None:
    """Map one English token onto a vocabulary label, or None if unmapped."""
    w = token.lower().strip("'")
    if not w or w in STOPWORDS:
        return None
    if w in vocab:
        return w
    if w in SYNONYMS and SYNONYMS[w] in vocab:
        return SYNONYMS[w]
    # crude morphology: plurals and common verb endings
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            stem = w[: -len(suf)]
            if stem in vocab:
                return stem
            if stem in SYNONYMS and SYNONYMS[stem] in vocab:
                return SYNONYMS[stem]
    return None


def text_to_gloss(text: str) -> dict:
    """English sentence -> ISL gloss ordering + which words we can actually sign."""
    vocab = set(vocabulary())
    raw = _PUNCT.sub(" ", text or "").split()

    # try two-word phrases first ("good morning", "thank you", "how are you")
    tokens: list[str] = []
    i = 0
    while i < len(raw):
        joined3 = "".join(raw[i:i + 3]).lower()
        joined2 = "".join(raw[i:i + 2]).lower()
        if i + 2 < len(raw) and (joined3 in SYNONYMS or joined3 in vocab):
            tokens.append(SYNONYMS.get(joined3, joined3)); i += 3
        elif i + 1 < len(raw) and (joined2 in SYNONYMS or joined2 in vocab):
            tokens.append(SYNONYMS.get(joined2, joined2)); i += 2
        else:
            tokens.append(raw[i]); i += 1

    time_part, question_part, body, unmapped = [], [], [], []
    for tok in tokens:
        label = _normalise(tok, vocab)
        low = tok.lower()
        if label is None:
            if low in STOPWORDS:
                continue                      # intentionally dropped
            if low in QUESTION_WORDS:
                question_part.append(low.upper())   # keep it, even if unsignable
            unmapped.append(tok)
            continue
        if label in TIME_WORDS:
            time_part.append(label)
        elif low in QUESTION_WORDS:
            question_part.append(label)
        else:
            body.append(label)

    order = time_part + body + question_part
    return {
        "input": text,
        "gloss": [g.upper() for g in order],
        "labels": order,
        "unmapped": unmapped,
        "dropped_function_words": [t for t in raw if t.lower() in STOPWORDS],
    }


def build_sequence(text: str) -> dict:
    """Full reverse-translation payload: gloss + the frames needed to play it."""
    bank = load_bank()
    words = bank.get("words", {})
    g = text_to_gloss(text)

    items = []
    for label in g["labels"]:
        entry = words.get(label)
        items.append({
            "label": label,
            "gloss": label.upper(),
            "available": entry is not None,
            "hands": entry["hands"] if entry else None,
            "takes": entry["takes"] if entry else 0,
            "frames": entry["frames"] if entry else None,
        })

    return {
        "input": text,
        "gloss": g["gloss"],
        "items": items,
        "unmapped": g["unmapped"],
        "dropped": g["dropped_function_words"],
        "fps": bank.get("fps", 12),
        "quant": bank.get("quant", 1000),
        "pose_indices": bank.get("pose_indices", [0, 11, 12, 13, 14, 15, 16]),
        "vocabulary_size": len(words),
        # Honest signal to the UI: nothing here is fingerspelled, because the
        # project has no ISL manual-alphabet data. Unknown words are reported,
        # not faked.
        "fingerspelling_supported": False,
    }
