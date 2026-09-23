"""Tests for the gloss -> English sentence rule-based path.

Run:  cd backend && python test_nlg.py

Only exercises the rule-based path (no GEMINI_API_KEY set), same reasoning as
test_auth.py: this must work with zero external dependencies, since that's
the fallback every other path degrades to.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "ml" / "scripts"))

os.environ.pop("GEMINI_API_KEY", None)  # force rule-based path

import nlg  # noqa: E402

PASSED = 0
FAILED = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  PASS  {name}")
    else:
        FAILED += 1
        print(f"  FAIL  {name}  {detail}")


print("\n=== empty / degenerate input never raises ===")
r = nlg.glosses_to_sentence([])
check("empty list returns empty sentence, not an error", r["sentence"] == "" and r["source"] == "rule-based")
r = nlg.glosses_to_sentence([None, "", "   "])
check("junk-only list returns empty sentence, not an error", r["sentence"] == "")

print("\n=== pronoun + go + place ===")
r = nlg.glosses_to_sentence(["yesterday", "i", "hospital", "go"])
check("time-fronted 'go to hospital' forms a past-tense sentence", "hospital" in r["sentence"].lower())
check("time word is fronted", r["sentence"].lower().startswith("yesterday"))
check("source is rule-based with no API key", r["source"] == "rule-based")

r = nlg.glosses_to_sentence(["i", "school", "go"])
check("present-tense 'go to school'", "going" in r["sentence"].lower() and "school" in r["sentence"].lower())

print("\n=== pronoun + state/noun (copula insertion) ===")
r = nlg.glosses_to_sentence(["i", "sick"])
check("'i sick' -> copula inserted", r["sentence"].lower() == "i am sick.")

r = nlg.glosses_to_sentence(["you", "doctor"])
check("'you doctor' -> 'you are a doctor.'", r["sentence"].lower() == "you are a doctor.")

print("\n=== question fronting ===")
r = nlg.glosses_to_sentence(["you", "name", "what"])
check("question word moves to the front", r["sentence"].lower().startswith("what"))
check("sentence ends with a question mark", r["sentence"].endswith("?"))

print("\n=== pronoun 'I' is always capitalized, not just at sentence-start ===")
r = nlg.glosses_to_sentence(["yesterday", "i", "hospital", "go"])
check("'I' capitalized mid-sentence", " I " in f" {r['sentence']} ", r["sentence"])

print("\n=== synonym mapping stays in sync with gloss.py ===")
# "mom" isn't a raw label but SYNONYMS maps it to "mother" in gloss.py; nlg.py
# must resolve the same way so the two directions never disagree.
r = nlg.glosses_to_sentence(["i", "mom"])
check("synonym table is reused, not duplicated", "mother" in r["sentence"].lower())

print("\n=== unrecognised words never crash the pipeline ===")
r = nlg.glosses_to_sentence(["xyzzy123", "!!!"])
check("garbage input degrades to an empty sentence rather than raising", isinstance(r["sentence"], str))

print("\n=== fallback join for anything the templates don't cover ===")
r = nlg.glosses_to_sentence(["hello", "friend"])
check("untemplated word pairs still produce a capitalized, punctuated sentence",
      r["sentence"][:1].isupper() and r["sentence"].endswith("."))

print(f"\n{'=' * 52}")
print(f"  {PASSED} passed, {FAILED} failed")
print("=" * 52)

raise SystemExit(1 if FAILED else 0)
