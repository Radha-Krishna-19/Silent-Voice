"""Fill Review_Presentation_Template.pptx with Silent Voice content.

The template's empty shapes carry a red (#FF0000) endParaRPr — that is the
"you must fill this in" colour. Anything we actually write is set to a normal
ink colour, so anything still red in the output is a genuine TODO.

    python scripts/build_review_template.py <template.pptx> <out.pptx>
"""
from __future__ import annotations

import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR
from pptx.util import Inches, Pt

INK   = RGBColor(0x1A, 0x1A, 0x1A)
GREY  = RGBColor(0x5A, 0x5A, 0x6B)
NAVY  = RGBColor(0x1F, 0x2A, 0x55)
RED   = RGBColor(0xC0, 0x00, 0x00)      # kept for real TODOs only
BODY  = "Calibri"

# --------------------------------------------------------------------------- #
# facts — every number here is measured, from ml/logs/comparison.json
# --------------------------------------------------------------------------- #
COURSE   = "23CSE461 — Neural Networks and Deep Learning"
PRODUCT  = "Silent Voice — Real-Time Indian Sign Language ↔ English Translator"
GITHUB   = "https://github.com/Radha-Krishna-19/Silent-Voice"
ROLL     = "CB.SC.U4CSE23134"
EMAIL    = "pradhakrishna594@gmail.com"

TODO = "[ TO FILL ]"


def shape_by_name(slide, name):
    for sh in slide.shapes:
        if sh.name == name:
            return sh
    raise KeyError(f"{name} not on slide")


def settext(shape, lines, *, size=12, color=INK, bold=False, bullet=False, spacing=1.15):
    """Replace a shape's text. `lines` is a str or list of str / (text, bold) pairs."""
    if isinstance(lines, str):
        lines = [lines]
    tf = shape.text_frame
    tf.word_wrap = True
    # drop every paragraph but the first, then rewrite
    for p in list(tf.paragraphs)[1:]:
        p._p.getparent().remove(p._p)
    first = tf.paragraphs[0]
    for r in list(first.runs):
        r._r.getparent().remove(r._r)

    for i, item in enumerate(lines):
        para = first if i == 0 else tf.add_paragraph()
        para.line_spacing = spacing
        para.space_after = Pt(4)
        # The template shapes carry inherited bullet formatting. We render our
        # own "• " prefix, so suppress theirs or every line gets two bullets.
        from pptx.oxml.ns import qn
        pPr = para._p.get_or_add_pPr()
        for tag in ("a:buChar", "a:buAutoNum", "a:buNone"):
            for el in pPr.findall(qn(tag)):
                pPr.remove(el)
        pPr.append(pPr.makeelement(qn("a:buNone"), {}))
        if isinstance(item, tuple):
            text, is_bold = item
        else:
            text, is_bold = item, bold
        run = para.add_run()
        run.text = ("•  " if bullet else "") + text
        f = run.font
        f.size, f.bold, f.name = Pt(size), is_bold, BODY
        f.color.rgb = color
    return tf


def fill_cell(table, r, c, text, *, size=10, bold=False, color=INK):
    cell = table.cell(r, c)
    tf = cell.text_frame
    for p in list(tf.paragraphs)[1:]:
        p._p.getparent().remove(p._p)
    para = tf.paragraphs[0]
    for run in list(para.runs):
        run._r.getparent().remove(run._r)
    run = para.add_run()
    run.text = text
    run.font.size, run.font.bold, run.font.name = Pt(size), bold, BODY
    run.font.color.rgb = color


# --------------------------------------------------------------------------- #
def slide1(s):
    settext(shape_by_name(s, "Text 3"), PRODUCT, size=22, bold=True, color=NAVY)
    settext(shape_by_name(s, "Text 4"),
            f"Group No: {TODO}                                    "
            f"Category: Research-Product-Software", size=11, color=INK)
    settext(shape_by_name(s, "Text 7"),
            "Not applicable — no external collaborator", size=11, color=GREY)

    tbl = [sh for sh in s.shapes if sh.has_table][0].table
    hdr = ["Roll No", "Name", "Photo", "Email ID", "Mobile No", "GitHub URL"]
    for c, h in enumerate(hdr):
        fill_cell(tbl, 0, c, h, size=10, bold=True)
    fill_cell(tbl, 1, 0, ROLL, size=9)
    fill_cell(tbl, 1, 1, "Radha Krishna", size=9)
    fill_cell(tbl, 1, 2, "", size=9)
    fill_cell(tbl, 1, 3, EMAIL, size=8)
    fill_cell(tbl, 1, 4, TODO, size=9, color=RED)
    fill_cell(tbl, 1, 5, "github.com/Radha-Krishna-19", size=8)
    for r in (2, 3):
        for c, w in enumerate([TODO, TODO, "", TODO, TODO, TODO]):
            fill_cell(tbl, r, c, w, size=9, color=RED if w else INK)

    settext(shape_by_name(s, "Text 13"),
            f"LinkedIn Product Demo:  {TODO}          GitHub Repository:  {GITHUB}",
            size=11, color=INK)
    settext(shape_by_name(s, "TextBox 19"),
            [f"This presentation is prepared for Course:  {COURSE}"],
            size=11, color=INK)


def architecture(s):
    """Three-tier block diagram in the empty right-hand column."""
    tiers = [
        ("CLIENT · BROWSER", "webcam → canvas → JPEG, throttled to 12 fps"),
        ("SERVER · FastAPI", "POST /api/frame  ·  MediaPipe Holistic, server-side"),
        ("MODEL", "BiLSTM 91.74%   |   1D CNN 94.55%   (per-request switch)"),
    ]
    y = 1.10
    for i, (title, sub) in enumerate(tiers):
        box = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(6.55), Inches(y),
                                 Inches(6.10), Inches(0.62))
        box.shadow.inherit = False
        box.fill.solid(); box.fill.fore_color.rgb = RGBColor(0xF4, 0xF6, 0xFC)
        box.line.color.rgb = RGBColor(0xD7, 0xDC, 0xEA); box.line.width = Pt(1)
        tf = box.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = Inches(0.12)
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        r = tf.paragraphs[0].add_run(); r.text = title
        r.font.size, r.font.bold, r.font.name = Pt(10), True, BODY
        r.font.color.rgb = NAVY
        p2 = tf.add_paragraph(); r2 = p2.add_run(); r2.text = sub
        r2.font.size, r2.font.name = Pt(8.5), BODY
        r2.font.color.rgb = GREY

        if i < len(tiers) - 1:
            a = s.shapes.add_textbox(Inches(9.35), Inches(y + 0.63), Inches(0.5), Inches(0.24))
            a.text_frame.margin_left = a.text_frame.margin_top = 0
            ar = a.text_frame.paragraphs[0].add_run(); ar.text = "▼"
            ar.font.size, ar.font.name = Pt(9), BODY
            ar.font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
        y += 0.88


def slide2(s):
    settext(shape_by_name(s, "Text 1"),
            "India has ~63 million people with disabling hearing loss and fewer than 300 certified "
            "ISL interpreters. Existing tools are audio-only, ASL-biased, hardware-heavy, or one-way, "
            "leaving Indian Sign Language users without real-time translation on ordinary devices.",
            size=11, color=INK)
    settext(shape_by_name(s, "Text 5"),
            "Build a browser-based, real-time ISL ↔ English translator that runs on any webcam, "
            "and determine empirically which sequence architecture reads landmark data best.",
            size=11, color=INK)
    settext(shape_by_name(s, "Text 9"), [
        "Convert ISL video to privacy-preserving landmark tensors (60 × 225) via MediaPipe Holistic",
        "Train and fairly compare BiLSTM vs 1D Temporal CNN on identical splits",
        "Serve the winning model in real time (< 5 ms inference) behind one API",
        "Report accuracy, macro F1, top-5 and latency on a held-out test split",
    ], size=10, color=INK, bullet=True)

    # The template puts the sub-objectives BODY (y=4.10) above its own HEADING
    # (y=4.43), so the two collide. Push the body below the heading.
    body = shape_by_name(s, "Text 9")
    body.top, body.height = Inches(4.95), Inches(1.45)

    architecture(s)

    for name, (title, sub) in zip(
        ("Text 13", "Text 16", "Text 19"),
        [("CAPTURE", "webcam frame"),
         ("LANDMARKS", "60 × 225 tensor"),
         ("CLASSIFY", "BiLSTM / CNN")],
    ):
        settext(shape_by_name(s, name), [(title, True), sub], size=8, color=NAVY, spacing=1.0)

    settext(shape_by_name(s, "Text 23"),
            "Webcam → MediaPipe Holistic (21+21 hand + 33 pose landmarks) → wrist-origin normalise, "
            "resample to T=60 → BiLSTM or 1D CNN → gloss → English caption + speech.",
            size=9, color=GREY)


def slide3(s):
    settext(shape_by_name(s, "Text 1"),
            "Three representative products from this area. None performs bidirectional Indian "
            "Sign Language translation in a browser without special hardware.", size=11, color=INK)
    tbl = [sh for sh in s.shapes if sh.has_table][0].table
    rows = [
        ("Product Name", "URL", "Features", "Limitation"),
        ("Google Live Transcribe", "g.co/livetranscribe",
         "Real-time speech → text captions on Android",
         "Audio-only; does not handle sign language at all"),
        ("SignAll", "signall.us",
         "ASL → English using a multi-camera rig",
         "ASL only, expensive hardware, not browser-based"),
        ("Ishaara / SLAIT AI", "slait.ai",
         "Browser-based sign recognition, no install",
         "One-directional, ASL-centric, no published model comparison"),
    ]
    for r, row in enumerate(rows[:len(tbl.rows)]):
        for c, val in enumerate(row):
            fill_cell(tbl, r, c, val, size=10 if r == 0 else 9, bold=(r == 0),
                      # header row is dark red — dark text on it is unreadable
                      color=RGBColor(0xFF, 0xFF, 0xFF) if r == 0 else INK)


def slide4(s):
    # Template cards are 4.05" tall from y=3.00, i.e. they end at 7.05" and run
    # straight through the footer bar. Invisible while empty; obvious once
    # filled. Trim the panels and their text frames to stop short of it.
    for nm in ("Shape 4", "Shape 9", "Shape 14", "Shape 19"):
        shape_by_name(s, nm).height = Inches(3.50)
    for nm in ("Text 8", "Text 13", "Text 18", "Text 23"):
        sh = shape_by_name(s, nm)
        sh.top, sh.height = Inches(3.85), Inches(2.55)

    settext(shape_by_name(s, "Text 2"),
            "Silent Voice turns any laptop webcam into an Indian Sign Language interpreter. "
            "MediaPipe Holistic reduces each clip to a 60 × 225 landmark tensor — 200× smaller than "
            "video and free of skin tone, clothing and background — which is classified by a neural "
            "network into one of 261 signs, then spoken aloud. Two architectures were trained on "
            "identical data and splits: a BiLSTM (2.67 M parameters) and a 1D temporal CNN (0.74 M). "
            "On a 642-clip held-out test set the CNN reached 94.55% accuracy, 0.9433 macro F1 and "
            "0.74 ms inference, beating the BiLSTM on every metric while being 3.6× smaller.",
            size=10.5, color=INK)

    settext(shape_by_name(s, "Text 8"), [
        "Published ISL work is mostly isolated-sign, one-way recognition on small vocabularies.",
        "Sign products either need special hardware (SignAll, KinTrans) or target ASL/Libras.",
        "Model choice is usually asserted, rarely measured under a controlled comparison.",
    ], size=9, color=INK, bullet=True)

    settext(shape_by_name(s, "Text 13"), [
        "Browser-native ISL translator — no install, no GPU, ordinary webcam.",
        "Landmarks-only pipeline: raw video never leaves the machine.",
        "261-class vocabulary from the full INCLUDE corpus, not a 50-class subset.",
    ], size=9, color=INK, bullet=True)

    settext(shape_by_name(s, "Text 18"), [
        "Live captions with confidence-gated correction chips (top-k alternatives).",
        "A/B model switching per request — BiLSTM or CNN, no redeploy.",
        "Research page reads metrics from disk; shows blanks when untrained.",
        "Practice mode and reverse (English → sign) designed for Phase 2.",
    ], size=9, color=INK, bullet=True)

    settext(shape_by_name(s, "Text 23"), [
        "Which sequence model actually suits isolated ISL signs — measured, not assumed.",
        "Result: the CNN dominates, so long-range temporal modelling is not what these signs need.",
        "Also found: with ~11 clips/class, standard augmentation held the BiLSTM at chance.",
    ], size=9, color=INK, bullet=True)


def slide5(s):
    tbl = [sh for sh in s.shapes if sh.has_table][0].table
    fill_cell(tbl, 0, 0, "Member Name", size=11, bold=True)
    fill_cell(tbl, 0, 1, "Contribution (Technical)", size=11, bold=True)
    fill_cell(tbl, 1, 0, f"Radha Krishna\n{ROLL}", size=10, bold=True)
    fill_cell(tbl, 1, 1,
              "End-to-end pipeline: MediaPipe Holistic landmark extraction over 4,284 INCLUDE clips "
              "(4,276 tensors, 0 failures); BiLSTM and 1D CNN implementation and training under an "
              "identical seed-42 stratified 70/15/15 split; evaluation (accuracy, macro/weighted F1, "
              "top-5, latency, confusion matrices); FastAPI inference server with per-request model "
              "switching; React front end wired to live webcam inference.", size=9)
    for r in (2, 3):
        fill_cell(tbl, r, 0, TODO, size=10, color=RED)
        fill_cell(tbl, r, 1, TODO, size=9, color=RED)


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    prs = Presentation(str(src))
    for fn, s in zip((slide1, slide2, slide3, slide4, slide5), prs.slides):
        fn(s)
    prs.save(str(dst))
    print(f"OK  filled {len(prs.slides)} slides -> {dst}")


if __name__ == "__main__":
    main()
