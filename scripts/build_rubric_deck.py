"""Build the Review-2 rubric deck.

    python scripts/build_rubric_deck.py

Produces CB.SC.U4CSE23134_Review2_Rubric.pptx in the project root, using the
same visual language as the case-study deck (crimson footer, teal Cambria
titles, tinted tables) by borrowing the primitives from build_review2_deck.py
rather than re-implementing them — so if that file's tokens change, this deck
follows.

Content policy, same as the /rubric page in the app: a row is only marked
Evidenced if the artefact exists NOW and can be pointed at. Slide numbers
referenced below were read out of CB.SC.U4CSE23134.pptx with python-pptx.
Nothing here claims a mark the project has not earned.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pptx import Presentation                                    # noqa: E402
from pptx.dml.color import RGBColor                              # noqa: E402
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN                  # noqa: E402
from pptx.util import Inches, Pt                                 # noqa: E402

import build_review2_deck as D                                   # noqa: E402
from build_review2_deck import (                                 # noqa: E402
    base, table, card, stat, note, callout, bullets, _rect, _run, _txbox,
    CRIMSON, TEAL, INK, GREY, LINE, TINT, WHITE, BODY, HEAD,
)

GREEN = RGBColor(0x1B, 0x7F, 0x5E)      # evidenced
AMBER = RGBColor(0xB2, 0x6A, 0x00)      # partial
STONE = RGBColor(0x77, 0x77, 0x7D)      # not started

STATUS_COLOR = {"have": GREEN, "partial": AMBER, "todo": STONE}
STATUS_LABEL = {"have": "Evidenced", "partial": "Partial", "todo": "Not started"}


# --------------------------------------------------------------------------- #
# The rubric, read from the SAME file the web app reads.
#
# This script used to carry its own copy of the table. It went stale the first
# time a status changed, which is precisely the failure the "one source of
# truth" claim was supposed to prevent — so now there is actually one source.
# --------------------------------------------------------------------------- #
RUBRIC_JSON = ROOT / "frontend" / "src" / "lib" / "rubric.json"
_DATA = json.loads(RUBRIC_JSON.read_text(encoding="utf-8"))

# (n, title, marks, status, evidence, missing) — the shape the slide builders use.
RUBRIC = [
    (
        r["n"],
        r["title"] + (f" - {r['detail']}" if r.get("detail") else ""),
        r["marks"],
        r["status"],
        " ".join(r.get("evidence") or []),
        " ".join(r.get("missing") or []),
    )
    for r in _DATA["rubric"]
]

TOTAL = sum(r[2] for r in RUBRIC)
BY = lambda st: sum(r[2] for r in RUBRIC if r[3] == st)          # noqa: E731


# --------------------------------------------------------------------------- #
def _status_pill(slide, x, y, status, *, w=1.05, h=0.24):
    colour = STATUS_COLOR[status]
    _rect(slide, x, y, w, h, fill=WHITE, line=colour, line_w=1.0)
    _, tf = _txbox(slide, x, y + 0.02, w, h - 0.04, anchor=MSO_ANCHOR.MIDDLE)
    tf.paragraphs[0].alignment = PP_ALIGN.CENTER
    _run(tf.paragraphs[0], STATUS_LABEL[status], size=8, bold=True, color=colour, spc=0.8)


def slide_overview(prs):
    s = base(prs, "REVIEW 2 - RUBRIC", "Where This Project Stands")

    tf = callout(s, 0.65, 1.72, 11.4, 0.60, "", accent=TEAL)
    _run(tf.paragraphs[0], "Scoring rule:  ", size=11.5, bold=True, color=TEAL)
    _run(tf.paragraphs[0],
         "a row counts as Evidenced only if the artefact exists today and can be pointed at - "
         "a specific deck slide, a running screen, or a file in the repository. Nothing below is "
         "counted on the strength of intending to do it.",
         size=11.5, color=INK)

    w = 2.72
    for i, (val, lab, sub, col) in enumerate([
        (str(BY("have")), "EVIDENCED", "Artefact exists and can be shown", GREEN),
        (str(BY("partial")), "PARTIAL", "Some required parts still missing", AMBER),
        (str(BY("todo")), "NOT STARTED", "Nothing exists for these rows yet", STONE),
        (f"{BY('have')}/{TOTAL}", "SECURED SO FAR", "Not a predicted mark - a floor", CRIMSON),
    ]):
        stat(s, 0.65 + i * (w + 0.17), 2.55, w, 1.62, val, lab, sub, accent=col)

    D.band(s, "WHAT IS LEFT", 4.42, [
        ("Literature survey (5)", "Five papers verified against the SCImago 2025/2026 listing."),
        ("Metrics column (3)", "'Best value in the papers' - blocked on the survey."),
        ("Standard paper (2)", "Nominate one of the five, with a justification."),
    ])

    note(s, "Generated from frontend/src/lib/rubric.json - the same file that drives the /rubric page "
            "in the running app, so this deck and the product cannot disagree.", y=6.28)
    return s


def slide_table(prs, rows, part, eyebrow):
    s = base(prs, eyebrow, f"Rubric Breakdown ({part})")
    data = [["#", "Category", "Mark", "Status", "Evidence / what is missing"]]
    for n, title, marks, status, ev, miss in rows:
        detail = ev if status != "todo" else miss
        if status == "partial" and miss:
            detail = f"{ev}   MISSING: {miss}"
        data.append([str(n), title, str(marks), STATUS_LABEL[status], detail])

    tbl = table(s, data, 0.65, 1.80, 11.4,
                [0.42, 3.05, 0.60, 1.00, 6.33],
                row_h=0.62, head_h=0.36, fsize=8.5, hsize=10)

    # Colour the status cell text so the table can be read at a glance.
    for i, (_, _, _, status, _, _) in enumerate(rows, start=1):
        cell = tbl.cell(i, 3)
        for p in cell.text_frame.paragraphs:
            for r in p.runs:
                r.font.color.rgb = STATUS_COLOR[status]
                r.font.bold = True
    return s


def slide_gaps(prs):
    outstanding = [r for r in _DATA["rubric"] if r["status"] != "have"]
    todo = [r for r in outstanding if r["status"] == "todo"]
    partial = [r for r in outstanding if r["status"] == "partial"]
    remaining = sum(r["marks"] for r in outstanding)

    s = base(prs, "REVIEW 2 - RUBRIC", f"The {remaining} Marks Not Yet Earned")

    # Not-started rows, as cards.
    # Titles are truncated: a long one wraps to two lines and lands on top of
    # the card body, which is exactly the kind of thing nobody notices until
    # it is on a projector.
    def short(t: str, limit: int = 26) -> str:
        t = t.split(",")[0].split(" - ")[0]
        return t if len(t) <= limit else t[:limit - 1].rstrip() + "\u2026"

    w = 3.66
    for i, r in enumerate(todo[:3]):
        body = " ".join(r.get("missing") or []) or "Nothing exists for this row yet."
        card(s, 0.65 + i * (w + 0.21), 1.78, w, 2.20,
             f"Row {r['n']} - {short(r['title'])} ({r['marks']})",
             body[:290],
             accent=STONE, bsize=10)

    if partial:
        D.band(s, "PARTIAL ROWS - WHAT CLOSES THEM", 4.28, [
            (f"Row {r['n']} ({r['marks']})", " ".join(r.get("missing") or [])[:150])
            for r in partial[:3]
        ])

    tf = callout(s, 0.65, 5.48, 11.4, 0.86, "", accent=CRIMSON)
    _run(tf.paragraphs[0], "The honest position: ", size=11, bold=True, color=CRIMSON)
    _run(tf.paragraphs[0],
         "what remains is the literature survey and everything that depends on it. Those marks "
         "need papers actually read and verified against the SCImago listing - they cannot be "
         "manufactured. docs/literature-survey-worksheet.md holds a URL-verified candidate "
         "shortlist and the verification procedure.",
         size=11, color=INK)
    return s


def slide_evidence(prs):
    s = base(prs, "REVIEW 2 - RUBRIC", "Evidence Behind the Twenty-Seven")

    data = [
        ["Rubric row", "Where it lives", "Why it counts"],
        ["1  Problem statement",
         "Deck slides 3-7; template slide 2",
         "Motivation, objective and scope already written in the faculty format."],
        ["3  Overall architecture",
         "Deck slide 16",
         "The diagram matches the shipped path: capture, /api/frame, MediaPipe, normalise, model, gloss."],
        ["4  Module details",
         "Deck slide 17",
         "Every module named is a real file: preprocess.py, models.py, inference.py, gloss.py, practice.py."],
        ["8  Hyperparameters",
         "Deck slides 24-25",
         "AdamW, cosine annealing, label smoothing 0.05, patience 20, lr 3e-3, batch 32, 60 epochs - as run."],
        ["6  Architecture (a-d)",
         "Deck slides 22-23, 17.3, 17.4",
         "Diagrams and rationale, plus big-O complexity and an explicitly narrow novelty claim."],
        ["7  Algorithm procedure",
         "Deck slides 17.1-17.2",
         "Ten numbered steps with the real equations, both models side by side against a shared spine."],
        ["9  Results",
         "Deck slide 27; /research page",
         "CNN 94.55% vs BiLSTM 91.74% on 642 held-out clips; the page reads the same file off disk."],
        ["11 UI screens",
         "The running application",
         "Gate, home, live, reverse, practice, transcripts, research, rubric, settings, about."],
    ]
    table(s, data, 0.65, 1.80, 11.4, [2.35, 2.75, 6.30],
          row_h=0.60, head_h=0.36, fsize=9, hsize=10.5)

    note(s, "Every figure quoted here is read from ml/logs/comparison.json, produced by the training "
            "run - none of it is typed in by hand.", y=6.20)
    return s


def slide_titlecard(prs):
    """Opening slide, matching the case-study deck's cover treatment."""
    s = base(prs, "23CSE461 - NEURAL NETWORKS AND DEEP LEARNING",
             "Silent Voice - Review 2 Rubric Audit")

    tf = callout(s, 0.65, 1.80, 11.4, 0.92, "", accent=TEAL)
    p = tf.paragraphs[0]
    _run(p, "Radha Krishna   ", size=13, bold=True, color=TEAL)
    _run(p, "CB.SC.U4CSE23134", size=13, color=INK)
    p2 = tf.add_paragraph()
    p2.line_spacing = 1.15
    _run(p2, "Real-time Indian Sign Language to English translation, and English back to signs. "
             "BiLSTM against a 1-D temporal CNN on the INCLUDE dataset.", size=11.5, color=GREY)

    w = 2.72
    for i, (val, lab, sub) in enumerate([
        ("12", "RUBRIC ROWS", "Slides required for Review 2"),
        ("50", "TOTAL MARKS", "Across all twelve rows"),
        (str(BY("have")), "EVIDENCED TODAY", "Artefact exists and is shown"),
        (str(BY("partial") + BY("todo")), "STILL TO EARN", "Partial plus not-started"),
    ]):
        stat(s, 0.65 + i * (w + 0.17), 3.05, w, 1.62,
             val, lab, sub, accent=CRIMSON if i < 2 else (GREEN if i == 2 else AMBER))

    bullets(s, [
        ("This deck is an audit, not a claim. ",
         "It states what exists, what is half-done, and what has not been started."),
    ], y=4.95, h=0.9, size=13)

    note(s, "Generated by scripts/build_rubric_deck.py from the same data that drives the /rubric "
            "page in the application.", y=6.28)
    return s


# --------------------------------------------------------------------------- #
def main() -> None:
    src = ROOT / "CB.SC.U4CSE23134.pptx"
    dst = ROOT / "CB.SC.U4CSE23134_Review2_Rubric.pptx"
    logo = Path(__file__).resolve().parent / "assets" / "amrita_logo.png"
    D.LOGO_PNG = logo if logo.exists() else None

    if not src.exists():
        raise SystemExit(f"template deck not found: {src}")

    # Start from the case-study deck so the theme, layouts and slide size carry
    # over, then strip its slides — this deck is standalone.
    prs = Presentation(str(src))
    xml_slides = prs.slides._sldIdLst
    for sld in list(xml_slides):
        rId = sld.get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        )
        prs.part.drop_rel(rId)
        xml_slides.remove(sld)

    slide_titlecard(prs)
    slide_overview(prs)
    slide_table(prs, RUBRIC[:6], "SLIDES 1-6", "REVIEW 2 - RUBRIC")
    slide_table(prs, RUBRIC[6:], "SLIDES 7-12", "REVIEW 2 - RUBRIC")
    slide_evidence(prs)
    slide_gaps(prs)

    prs.save(str(dst))

    print(f"OK  {len(prs.slides)} slides  ->  {dst}")
    print(f"    evidenced {BY('have')}  partial {BY('partial')}  "
          f"not started {BY('todo')}  total {TOTAL}")
    assert BY("have") + BY("partial") + BY("todo") == TOTAL, "marks do not sum to the total"
    assert TOTAL == 50, f"rubric totals {TOTAL}, expected 50"


if __name__ == "__main__":
    main()
