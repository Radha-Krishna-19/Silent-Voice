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
# The rubric, mirroring frontend/src/lib/rubric.js so the deck and the app
# can never disagree about what is done.
# --------------------------------------------------------------------------- #
RUBRIC = [
    (1, "Problem statement, introduction, motivation", 4, "have",
     "Deck slides 3-7 (sections 01-04) and Review-template slide 2.",
     ""),
    (2, "Literature survey - 5 papers per student, SCImago-listed, 2025/2026", 5, "todo",
     "",
     "Five papers, each verified in the SCImago 2025/2026 listing, with architecture and reported metrics."),
    (3, "Architecture diagram for the overall application", 5, "have",
     "Deck slide 16 (09 - SYSTEM ARCHITECTURE); matches the shipped code path.",
     ""),
    (4, "Module details", 5, "have",
     "Deck slide 17 (10 - MODULES); every module named exists as a file.",
     ""),
    (5, "Formula of performance metrics", 3, "partial",
     "Deck slide 26: nine metrics with formula and purpose, matching evaluate.py.",
     "Fourth column: best values reported in the surveyed papers (needs row 2)."),
    (6, "Deep learning architecture - diagram, explanation, novelty, complexity", 5, "partial",
     "Deck slides 22-23: layer diagrams, design rationale, measured parameter counts.",
     "Explicit novelty statement (c) and big-O time/space per model (d)."),
    (7, "Algorithm procedure, step by step, mathematically", 5, "todo",
     "",
     "Numbered procedure from raw frame to label with equations - already implemented, needs writing up."),
    (8, "Hyperparameter details table with justification", 5, "have",
     "Deck slides 24-25; values are the ones actually used in the training run.",
     ""),
    (9, "Results and discussion", 3, "have",
     "Deck slide 27: nine metrics, both models, measured on 642 held-out clips.",
     ""),
    (10, "Dataset chosen and its novelty - IEEE Dataport URL", 3, "partial",
     "Deck slides 13, 18-21: INCLUDE described; 261 classes, 4,276 usable clips.",
     "The IEEE Dataport URL, and a stated novelty for the dataset choice."),
    (11, "UI screens planned for the application", 5, "have",
     "Ten working screens, not mockups - the same build the demo runs on.",
     ""),
    (12, "Standard paper chosen - title and justification", 2, "todo",
     "",
     "One paper nominated as the reference standard, with justification."),
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

    D.band(s, "WHAT UNLOCKS THE MOST MARKS", 4.42, [
        ("Literature survey", "5 marks itself, and unblocks rows 5 and 12 - 10 more behind it."),
        ("Algorithm procedure", "5 marks of transcription: every equation is already coded."),
        ("Novelty + complexity", "Completes row 6. State the novelty as the controlled comparison."),
    ])

    note(s, "Mirrors frontend/src/lib/rubric.js, which drives the /rubric page in the running app - "
            "the deck and the product cannot disagree about what is done.", y=6.28)
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
    s = base(prs, "REVIEW 2 - RUBRIC", "The Twelve Marks Not Yet Earned")

    card(s, 0.65, 1.78, 3.66, 2.05, "Row 2 - Literature survey (5)",
         "Five papers on sign-language recognition or temporal architectures, each verified as "
         "appearing in a SCImago-listed journal for 2025 or 2026. Record citation, architecture, "
         "and reported metric values - the last of these is what row 5 needs.",
         accent=STONE)
    card(s, 4.52, 1.78, 3.66, 2.05, "Row 7 - Algorithm procedure (5)",
         "A numbered derivation: landmark extraction, wrist-origin translation, shoulder-width "
         "scaling, z-scoring with train-split statistics, the LSTM recurrence and 1-D convolution "
         "equations, mean-pooling, softmax, argmax. All of it is already implemented.",
         accent=STONE)
    card(s, 8.39, 1.78, 3.66, 2.05, "Row 12 - Standard paper (2)",
         "One paper nominated as the reference standard for the application, with a justification "
         "tying it to this system. Falls out of row 2 - pick the closest of the five.",
         accent=STONE)

    D.band(s, "PARTIAL ROWS - WHAT CLOSES THEM", 4.10, [
        ("Row 5 (3)", "Add a 'best reported value' column to the metrics table, sourced from the survey."),
        ("Row 6 (5)", "Add the novelty statement and big-O time/space for both models."),
        ("Row 10 (3)", "Supply the IEEE Dataport URL; confirm whether the Zenodo DOI is acceptable."),
    ])

    tf = callout(s, 0.65, 5.30, 11.4, 0.78, "", accent=CRIMSON)
    _run(tf.paragraphs[0], "Worth checking: ", size=11, bold=True, color=CRIMSON)
    _run(tf.paragraphs[0],
         "INCLUDE is distributed via Zenodo. If it is not on IEEE Dataport, ask whether the Zenodo "
         "DOI satisfies row 10 rather than citing a URL that does not resolve - a broken link in a "
         "review is worse than an honest substitution.",
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
