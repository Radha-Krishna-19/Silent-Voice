"""Gloss stream -> fluent English sentence.

WHAT THIS IS
------------
The forward-translation counterpart to gloss.py's English->ISL rule engine.
Same philosophy, inverse direction: a recognized sign sequence (e.g.
["yesterday", "i", "hospital", "go"]) is not yet a sentence — ISL gloss order
and grammar differ from English (no copula, no articles, time-fronted,
question-final). This module reconstructs a fluent English sentence from that
gloss stream, exactly as ml/ROADMAP.md ("Step 3 — gloss -> fluent English")
describes: a rule-based pass for the common cases, with an optional LLM pass
for the long tail.

Two paths, in priority order:
  1. Gemini (LLM), only if GEMINI_API_KEY is set — robust to gloss streams the
     rules below don't cover.
  2. Rule-based fallback — deterministic, debuggable, works with no API key.
     Reuses gloss.py's TIME_WORDS/QUESTION_WORDS tables rather than
     duplicating them, so the two directions stay in sync.

The app must never go silent because a sentence couldn't be formed — if
nothing else matches, the rule-based path still returns *something*
(capitalized, joined, punctuated), same "never breaks" philosophy as
inference.py's mock predictor.
"""
from __future__ import annotations

import logging
import os
import re

from gloss import QUESTION_WORDS, SYNONYMS, TIME_WORDS

logger = logging.getLogger(__name__)

# Words that already read naturally as a noun/adjective after a pronoun +
# copula, e.g. "I" + "sick" -> "I am sick" rather than "I am going to sick".
STATE_WORDS = {
    "sick", "happy", "sad", "pleased", "good", "bad", "hungry", "tired",
    "fine", "well", "busy", "free", "ready", "late", "early", "afraid",
    "angry", "confused", "sure", "hot", "cold",
}
STATE_WORDS |= {"doctor", "teacher", "student", "friend"}  # "I am a doctor"

# Places that pair with "go" as "going to <the> <place>".
PLACE_WORDS = {
    "hospital", "school", "university", "store_or_shop", "market", "house",
    "office", "restaurant", "street_or_road",
}

PRONOUNS = {"i", "you", "he", "she", "we", "they"}
COPULA = {"i": "am", "you": "are", "he": "is", "she": "is", "we": "are", "they": "are"}

_WORD_RE = re.compile(r"[a-z_]+")


def _canon(word: str) -> str:
    """Lowercase + map through gloss.py's SYNONYMS so casing/aliases from the
    classifier's label set line up with the tables above."""
    w = (word or "").strip().lower()
    return SYNONYMS.get(w, w)


def _display(word: str) -> str:
    return word.replace("_", " ")


def _rule_based(glosses: list[str]) -> str:
    words = [_canon(w) for w in glosses if _WORD_RE.fullmatch((w or "").strip().lower())]
    if not words:
        return ""

    time_part = [w for w in words if w in TIME_WORDS]
    question_part = [w for w in words if w in QUESTION_WORDS]
    body = [w for w in words if w not in TIME_WORDS and w not in QUESTION_WORDS]

    tense = "past" if any(t == "yesterday" for t in time_part) else (
        "future" if any(t == "tomorrow" for t in time_part) else "present")

    pieces: list[str] = []

    # Pronoun + "go" + place  ->  "I am going to the hospital."
    if len(body) >= 2 and body[0] in PRONOUNS and "go" in body[1:]:
        pronoun = body[0]
        rest = [w for w in body[1:] if w != "go"]
        place = next((w for w in rest if w in PLACE_WORDS), None)
        verb = {"past": "went", "future": "am going", "present": "am going"}[tense]
        if pronoun != "i":
            verb = verb.replace("am going", f"{COPULA[pronoun]} going")
        clause = f"{pronoun} {verb}"
        if place:
            clause += f" to the {_display(place)}"
        pieces.append(clause)

    # Pronoun + state/noun  ->  "I am sick." / "I am a doctor."
    elif len(body) >= 2 and body[0] in PRONOUNS and body[1] in STATE_WORDS:
        pronoun, state = body[0], body[1]
        article = "a " if state in {"doctor", "teacher", "student", "friend"} else ""
        pieces.append(f"{pronoun} {COPULA[pronoun]} {article}{_display(state)}")
        pieces.extend(_display(w) for w in body[2:])

    else:
        pieces.append(" ".join(_display(w) for w in body))

    sentence = " ".join(p for p in pieces if p).strip()

    if time_part:
        sentence = f"{_display(time_part[0]).capitalize()}, {sentence}" if sentence else _display(time_part[0]).capitalize()

    if question_part:
        qword = _display(question_part[0]).capitalize()
        # "you name" -> "what is your name?" — crude but consistent: front the
        # question word, keep the rest, always end with "?".
        rest = sentence[0].lower() + sentence[1:] if sentence else ""
        sentence = f"{qword} {rest}".strip()
        sentence = sentence.rstrip(".") + "?"
    elif sentence and not sentence.endswith((".", "?", "!")):
        sentence += "."

    if not sentence:
        return ""
    sentence = sentence[0].upper() + sentence[1:]
    # The pronoun "I" is capitalized everywhere, not just at sentence-start.
    sentence = re.sub(r"\bi\b", "I", sentence)
    return sentence


_gemini_client = None
_gemini_checked = False


def _get_gemini():
    global _gemini_client, _gemini_checked
    if _gemini_checked:
        return _gemini_client
    _gemini_checked = True
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        _gemini_client = genai.Client(api_key=api_key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gemini client unavailable, using rule-based NLG only: %s", exc)
        _gemini_client = None
    return _gemini_client


def _llm_based(glosses: list[str]) -> str | None:
    client = _get_gemini()
    if client is None:
        return None
    words = ", ".join(g.upper() for g in glosses if g)
    if not words:
        return None
    prompt = (
        "You are converting a stream of recognized Indian Sign Language (ISL) "
        "glosses into one fluent, natural English sentence. ISL has no "
        "articles, no copula, and fronts time words. The glosses, in the "
        f"order they were signed: {words}\n\n"
        "Reply with ONLY the English sentence — no quotes, no explanation, "
        "no markdown. If the glosses don't form a coherent sentence, do your "
        "best reasonable interpretation rather than refusing."
    )
    try:
        response = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        text = (response.text or "").strip().strip('"')
        return text or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gemini NLG call failed, falling back to rule-based: %s", exc)
        return None


def glosses_to_sentence(glosses: list[str]) -> dict:
    """Ordered recognized-sign list -> {sentence, source}. Never raises."""
    glosses = [g for g in (glosses or []) if isinstance(g, str) and g.strip()]
    if not glosses:
        return {"sentence": "", "source": "rule-based", "glosses": []}

    llm_sentence = _llm_based(glosses)
    if llm_sentence:
        return {"sentence": llm_sentence, "source": "llm", "glosses": glosses}

    return {"sentence": _rule_based(glosses), "source": "rule-based", "glosses": glosses}
