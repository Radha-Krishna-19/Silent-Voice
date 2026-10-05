"""Tests for the English -> ISL gloss rules (backend/gloss.py).

Run:  cd backend && python test_gloss.py

Uses a small in-memory sign bank, so it does not need the (git-ignored,
training-generated) models/sign_bank.json. Each check is one of the grammar
rules documented in gloss.py's docstring.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import gloss  # noqa: E402

WORDS = ["i", "you", "he", "go", "school", "name", "what", "where", "today",
         "tomorrow", "yesterday", "hello", "thank_you", "good_morning",
         "how_are_you", "doctor", "mother", "book", "sick", "house"]
FRAME = [[0, 0]] * 3
bank = {"fps": 12, "quant": 1000, "pose_indices": [0, 11],
        "words": {w: {"hands": "both", "takes": 1, "frames": FRAME} for w in WORDS}}
tmp = Path(tempfile.mkdtemp()) / "sign_bank.json"
tmp.write_text(json.dumps(bank))
gloss.BANK_PATH = tmp
gloss.load_bank.cache_clear()

PASSED = FAILED = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  PASS  {name}")
    else:
        FAILED += 1
        print(f"  FAIL  {name}  {detail}")


def g(text: str) -> list[str]:
    return gloss.text_to_gloss(text)["labels"]


check("vocabulary comes from the bank", gloss.vocabulary() == sorted(WORDS))
check("articles and copula are dropped", g("the doctor is here") == ["doctor"], str(g("the doctor is here")))
check("dropped words are reported", "the" in gloss.text_to_gloss("the doctor")["dropped_function_words"])
check("time word is fronted", g("I go to school tomorrow") == ["tomorrow", "i", "go", "school"], str(g("I go to school tomorrow")))
check("question word goes last", g("what is your name") == ["you", "name", "what"], str(g("what is your name")))
check("time first AND question last", g("where did you go yesterday") == ["yesterday", "you", "go", "where"],
      str(g("where did you go yesterday")))
check("synonym maps onto the vocabulary", g("mom") == ["mother"] and g("hi") == ["hello"])
check("pronoun forms collapse (my -> i)", g("my book") == ["i", "book"])
check("inflection removed (going -> go)", g("going") == ["go"] and g("goes") == ["go"])
check("two-word phrase joined (thank you)", g("thank you") == ["thank_you"], str(g("thank you")))
check("three-word phrase joined (how are you)", g("how are you") == ["how_are_you"], str(g("how are you")))
check("punctuation and case ignored", g("Hello!!") == ["hello"] and g("DOCTOR?") == ["doctor"])
check("unknown word is reported, not invented", gloss.text_to_gloss("I zebra")["unmapped"] == ["zebra"]
      and "zebra" not in g("I zebra"))
check("empty and None input are safe", g("") == [] and g(None) == [])
check("gloss is upper-case labels", gloss.text_to_gloss("doctor")["gloss"] == ["DOCTOR"])

seq = gloss.build_sequence("I go tomorrow")
check("build_sequence marks every item available with frames",
      [i["label"] for i in seq["items"]] == ["tomorrow", "i", "go"] and all(i["available"] and i["frames"] for i in seq["items"]))
seq2 = gloss.build_sequence("sick doctor")
check("fps and quant carried through", seq2["fps"] == 12 and seq2["quant"] == 1000)

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
