"""Generate the frontend's vocabulary from the trained label map.

Why this exists
---------------
The UI used to carry a hand-written vocabulary: PAIN, HELP, AMBULANCE, WATER,
"I need water, please", "My name is Aarav". None of those exist in the dataset —
17 of the 26 words shown on the Practice page were not classes the model had
ever seen, and every demo sentence used out-of-vocabulary words. The interface
was advertising capabilities the system does not have.

Rather than hand-correct the lists (which drift again the moment the dataset
changes), the frontend's vocabulary is now GENERATED from
backend/models/label_map.json — the exact label list the model was trained on.
Re-run this after any retraining and the UI follows automatically.

    python scripts/export_ui_vocab.py
"""
from __future__ import annotations

import json
from pathlib import Path

LABELS = Path("../backend/models/label_map.json")
OUT = Path("../frontend/src/lib/vocabulary.js")

# Semantic groupings. Every entry is FILTERED against the real label list, so a
# word that is not in the dataset simply never reaches the UI.
GROUPS = {
    "greetings": ("Greetings & social", [
        "hello", "good_morning", "good_afternoon", "good_evening", "good_night",
        "how_are_you", "thank_you", "pleased", "sorry", "good", "bad", "happy", "sad",
    ]),
    "people": ("People & family", [
        "i", "you", "he", "she", "we", "they", "mother", "father", "brother", "sister",
        "daughter", "son", "husband", "wife", "friend", "neighbour", "child", "baby",
        "man", "woman", "boy", "girl", "adult", "grandfather", "grandmother", "parent",
    ]),
    "medical": ("Health", [
        "doctor", "hospital", "medicine", "sick", "healthy", "patient", "death", "dead",
        "deaf", "blind", "weak", "strong", "energy",
    ]),
    "school": ("School & work", [
        "teacher", "student", "school", "university", "library", "book", "paper", "pen",
        "pencil", "page", "science", "job", "office", "manager", "team", "lawyer",
        "secretary", "artist", "author", "reporter", "player", "soldier", "police",
    ]),
    "time": ("Time", [
        "today", "tomorrow", "yesterday", "morning", "afternoon", "evening", "night",
        "hour", "minute", "second", "week", "month", "year", "time", "season",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "summer", "winter", "spring", "monsoon",
    ]),
    "places": ("Places & travel", [
        "house", "home", "school", "market", "store_or_shop", "restaurant", "bank",
        "temple", "park", "city", "india", "street_or_road", "train_station", "location",
        "car", "bus", "train", "truck", "plane", "boat", "bicycle", "transportation",
        "train_ticket", "court",
    ]),
    "everyday": ("Everyday objects", [
        "money", "key", "bag", "box", "chair", "table", "bed", "door", "window", "lamp",
        "clock", "telephone", "cell_phone", "computer", "laptop", "camera", "radio",
        "television", "screen", "newspaper", "letter", "card", "gift", "ring", "soap",
        "clothing", "shirt", "t_shirt", "pant", "dress", "skirt", "suit", "shoes", "hat",
    ]),
    "descriptive": ("Describing things", [
        "big_large", "small_little", "long", "short", "tall", "high", "low", "wide",
        "narrow", "thick", "flat", "deep", "shallow", "heavy", "light", "fast", "slow",
        "hot", "cold", "warm", "cool", "wet", "dry", "clean", "dirty", "new", "old",
        "cheap", "expensive", "rich", "poor", "hard", "soft", "loud", "quiet",
        "beautiful", "ugly", "famous", "alive",
    ]),
    "colours": ("Colours", [
        "colour", "black", "white", "red", "blue", "green", "yellow", "orange",
        "pink", "brown", "grey",
    ]),
    "animals": ("Animals", [
        "animal", "dog", "cat", "cow", "horse", "bird", "fish", "mouse",
    ]),
}


def main() -> None:
    if not LABELS.exists():
        raise SystemExit(f"{LABELS} not found — train first, then rerun this.")
    labels = json.load(open(LABELS, encoding="utf-8"))
    vocab = set(labels)

    packs = []
    used: set[str] = set()
    for pid, (name, words) in GROUPS.items():
        present = [w for w in dict.fromkeys(words) if w in vocab]
        if len(present) < 4:
            continue
        packs.append({"id": pid, "name": name, "words": present})
        used.update(present)

    uncategorised = sorted(vocab - used)

    def js_arr(xs, indent=4):
        pad = " " * indent
        return "[\n" + "".join(f'{pad}  "{x}",\n' for x in xs) + pad + "]"

    lines = [
        "// GENERATED FILE — do not edit by hand.",
        "// Produced by ml/scripts/export_ui_vocab.py from backend/models/label_map.json,",
        "// so the interface can only ever offer words the model was actually trained on.",
        "// Re-run that script after retraining.",
        "",
        f"export const VOCAB_SIZE = {len(labels)};",
        "",
        f"export const ALL_WORDS = {js_arr(sorted(labels), 0)};",
        "",
        "/** Words grouped by topic. Every entry is verified present in the label map. */",
        "export const DOMAIN_PACKS = [",
    ]
    for p in packs:
        lines.append(f'  {{ id: "{p["id"]}", name: "{p["name"]}", count: {len(p["words"])},')
        lines.append(f'    words: {js_arr(p["words"], 6)} }},')
    lines += [
        "];",
        "",
        f"export const UNCATEGORISED_COUNT = {len(uncategorised)};",
        "",
        "/** Human-readable form of a label. */",
        "export const pretty = (w) => (w || '').replace(/_/g, ' ').toUpperCase();",
        "",
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")

    covered = sum(len(p["words"]) for p in packs)
    print(f"OK {len(labels)} labels -> {OUT}")
    print(f"   {len(packs)} topic packs covering {covered} words; {len(uncategorised)} uncategorised")
    for p in packs:
        print(f"     {p['name']:<22} {len(p['words'])}")


if __name__ == "__main__":
    main()
