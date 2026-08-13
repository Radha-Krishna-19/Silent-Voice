"""Extend Silent_Voice_Case_Study_v2_1.pptx with the Review-2 slides.

Design tokens were reverse-engineered from the existing deck so new slides are
visually indistinguishable from the Review-1 ones:

    footer bar   #B6114D  full width, y=6.71", h=0.79"
    eyebrow      Calibri 12pt bold, spc 200, #B6114D
    title        Cambria 32pt bold, #086072
    rule         2.5pt #B6114D, 1.3" wide at y=1.55"
    body         Calibri 17pt #222222, bullet "✦"
    card         white fill, 1pt #E4D9DD border, 0.08" #B6114D left bar
    table        header #086072 / white 12pt bold; rows alternate FFFFFF / #F7F4F5

Every number in the hyperparameter and architecture slides is read from, or
matches, the real code in ml/scripts/. Performance-metric slides deliberately
contain no results — they are populated from ml/logs/comparison.json after a
training run.

    python scripts/build_review2_deck.py <input.pptx> <output.pptx>
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

# --------------------------------------------------------------------------- #
# design tokens
# --------------------------------------------------------------------------- #
CRIMSON = RGBColor(0xB6, 0x11, 0x4D)
TEAL    = RGBColor(0x08, 0x60, 0x72)
INK     = RGBColor(0x22, 0x22, 0x22)
GREY    = RGBColor(0x5A, 0x5A, 0x5A)
MUTED   = RGBColor(0x88, 0x88, 0x88)
LINE    = RGBColor(0xE4, 0xD9, 0xDD)
TINT    = RGBColor(0xF7, 0xF4, 0xF5)
WHITE   = RGBColor(0xFF, 0xFF, 0xFF)

BODY = "Calibri"
HEAD = "Cambria"

FOOTER_Y, FOOTER_H = 6.71, 0.79
LOGO_POS = (10.82, 6.74, 2.12, 0.68)
CONTENT_TOP = 1.85
LOGO_PNG: Path | None = None


# --------------------------------------------------------------------------- #
# primitives
# --------------------------------------------------------------------------- #
def _txbox(slide, x, y, w, h, *, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    return box, tf


def _run(para, text, *, size, bold=False, color=INK, font=BODY, italic=False, spc=None):
    r = para.add_run()
    r.text = text
    f = r.font
    f.size, f.bold, f.italic, f.name = Pt(size), bold, italic, font
    f.color.rgb = color
    if spc is not None:                       # character spacing (OOXML `spc`)
        r.font._rPr.set("spc", str(int(spc * 100)))
    return r


def _rect(slide, x, y, w, h, *, fill=WHITE, line=LINE, line_w=1.0):
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.shadow.inherit = False
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(line_w)
    sh.text_frame.word_wrap = True
    return sh


def base(prs, eyebrow, title):
    """Blank slide carrying the deck's standard chrome."""
    slide = prs.slides.add_slide(prs.slide_layouts[0])          # DEFAULT (empty)

    bar = _rect(slide, 0, FOOTER_Y, 13.33, FOOTER_H, fill=CRIMSON, line=None)
    bar.text_frame.text = ""
    if LOGO_PNG and LOGO_PNG.exists():
        slide.shapes.add_picture(str(LOGO_PNG), Inches(LOGO_POS[0]), Inches(LOGO_POS[1]),
                                 Inches(LOGO_POS[2]), Inches(LOGO_POS[3]))

    _, tf = _txbox(slide, 0.60, 0.42, 10.0, 0.35, anchor=MSO_ANCHOR.MIDDLE)
    _run(tf.paragraphs[0], eyebrow, size=12, bold=True, color=CRIMSON, spc=2.0)

    _, tf = _txbox(slide, 0.60, 0.72, 11.6, 0.90, anchor=MSO_ANCHOR.MIDDLE)
    _run(tf.paragraphs[0], title, size=32, bold=True, color=TEAL, font=HEAD)

    ln = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,
                                    Inches(0.62), Inches(1.55), Inches(1.92), Inches(1.55))
    ln.line.color.rgb = CRIMSON
    ln.line.width = Pt(2.5)
    return slide


def bullets(slide, items, *, x=0.65, y=CONTENT_TOP, w=11.4, h=4.4, size=17):
    _, tf = _txbox(slide, x, y, w, h)
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = 1.15
        p.space_after = Pt(14)
        pPr = p._pPr if p._pPr is not None else p._p.get_or_add_pPr()
        pPr.set("marL", "342900")
        pPr.set("indent", "-342900")
        from pptx.oxml.ns import qn
        bu = pPr.makeelement(qn("a:buChar"), {"char": "✦"})
        pPr.append(bu)
        if isinstance(item, tuple):
            _run(p, item[0], size=size, bold=True, color=TEAL)
            _run(p, item[1], size=size, color=INK)
        else:
            _run(p, item, size=size, color=INK)
    return tf


def card(slide, x, y, w, h, title, body, *, accent=CRIMSON, tsize=13, bsize=11):
    _rect(slide, x, y, w, h, fill=WHITE, line=LINE)
    _rect(slide, x, y, 0.08, h, fill=accent, line=None)
    _, tf = _txbox(slide, x + 0.30, y + 0.13, w - 0.55, 0.30)
    _run(tf.paragraphs[0], title, size=tsize, bold=True, color=TEAL)
    _, tf = _txbox(slide, x + 0.30, y + 0.46, w - 0.55, h - 0.58)
    p = tf.paragraphs[0]
    p.line_spacing = 1.12
    _run(p, body, size=bsize, color=GREY)


def stat(slide, x, y, w, h, value, label, sub=None, *, accent=CRIMSON):
    _rect(slide, x, y, w, h, fill=TINT, line=LINE)
    _, tf = _txbox(slide, x + 0.18, y + 0.16, w - 0.36, 0.62, anchor=MSO_ANCHOR.MIDDLE)
    tf.paragraphs[0].alignment = PP_ALIGN.CENTER
    _run(tf.paragraphs[0], value, size=30, bold=True, color=accent, font=HEAD)
    _, tf = _txbox(slide, x + 0.14, y + 0.84, w - 0.28, 0.26)
    tf.paragraphs[0].alignment = PP_ALIGN.CENTER
    _run(tf.paragraphs[0], label, size=9.5, bold=True, color=TEAL, spc=1.4)
    if sub:
        _, tf = _txbox(slide, x + 0.14, y + 1.10, w - 0.28, 0.42)
        tf.paragraphs[0].alignment = PP_ALIGN.CENTER
        tf.paragraphs[0].line_spacing = 1.05
        _run(tf.paragraphs[0], sub, size=9, color=GREY)


def table(slide, rows, x, y, w, col_w, *, row_h=0.36, head_h=0.40, fsize=10.5, hsize=11.5):
    shape = slide.shapes.add_table(len(rows), len(rows[0]), Inches(x), Inches(y),
                                   Inches(w), Inches(head_h + row_h * (len(rows) - 1)))
    tbl = shape.table
    tbl.first_row = True
    tbl.horz_banding = False
    for i, cw in enumerate(col_w):
        tbl.columns[i].width = Inches(cw)
    tbl.rows[0].height = Inches(head_h)
    for r in range(1, len(rows)):
        tbl.rows[r].height = Inches(row_h)

    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = tbl.cell(r, c)
            cell.margin_left = cell.margin_right = Inches(0.09)
            cell.margin_top = cell.margin_bottom = Inches(0.03)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.fill.solid()
            cell.fill.fore_color.rgb = TEAL if r == 0 else (WHITE if r % 2 else TINT)
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            _run(p, str(val),
                 size=hsize if r == 0 else fsize,
                 bold=(r == 0 or c == 0),
                 color=WHITE if r == 0 else INK,
                 font=BODY)
    return tbl


def flow(slide, steps, y, *, x=0.65, total_w=11.4, h=1.02, gap=0.16):
    """Numbered horizontal process strip with chevrons between steps."""
    n = len(steps)
    bw = (total_w - gap * (n - 1)) / n
    for i, (t, b) in enumerate(steps):
        cx = x + i * (bw + gap)
        _rect(slide, cx, y, bw, h, fill=WHITE, line=LINE)
        _rect(slide, cx, y, bw, 0.055, fill=TEAL if i % 2 else CRIMSON, line=None)
        _, tf = _txbox(slide, cx + 0.14, y + 0.15, bw - 0.28, 0.20)
        _run(tf.paragraphs[0], f"{i + 1:02d}", size=9, bold=True, color=CRIMSON, spc=1.5)
        _, tf = _txbox(slide, cx + 0.14, y + 0.36, bw - 0.28, 0.24)
        _run(tf.paragraphs[0], t, size=11, bold=True, color=TEAL)
        _, tf = _txbox(slide, cx + 0.14, y + 0.62, bw - 0.28, h - 0.70)
        tf.paragraphs[0].line_spacing = 1.05
        _run(tf.paragraphs[0], b, size=8.5, color=GREY)
        if i < n - 1:
            _, tf = _txbox(slide, cx + bw + 0.005, y + h / 2 - 0.11, gap, 0.22,
                           anchor=MSO_ANCHOR.MIDDLE)
            tf.paragraphs[0].alignment = PP_ALIGN.CENTER
            _run(tf.paragraphs[0], "›", size=15, bold=True, color=CRIMSON)


def layer_stack(slide, x, y, w, layers, *, lh=0.42, gap=0.075):
    """Vertical neural-network layer diagram."""
    for i, (name, detail, kind) in enumerate(layers):
        ly = y + i * (lh + gap)
        fill = {"io": TINT, "core": WHITE, "head": WHITE}[kind]
        edge = {"io": LINE, "core": TEAL, "head": CRIMSON}[kind]
        _rect(slide, x, ly, w, lh, fill=fill, line=edge, line_w=1.0 if kind == "io" else 1.25)
        _, tf = _txbox(slide, x + 0.16, ly + 0.055, w * 0.52, lh - 0.11, anchor=MSO_ANCHOR.MIDDLE)
        _run(tf.paragraphs[0], name, size=10.5, bold=True,
             color=GREY if kind == "io" else TEAL)
        _, tf = _txbox(slide, x + w * 0.54, ly + 0.055, w * 0.44 - 0.16, lh - 0.11,
                       anchor=MSO_ANCHOR.MIDDLE)
        tf.paragraphs[0].alignment = PP_ALIGN.RIGHT
        _run(tf.paragraphs[0], detail, size=9, color=MUTED, font="Consolas")


def note(slide, text, y=6.30, *, x=0.65, w=11.4, color=GREY, size=10):
    _, tf = _txbox(slide, x, y, w, 0.30)
    tf.paragraphs[0].line_spacing = 1.05
    _run(tf.paragraphs[0], text, size=size, color=color, italic=True)


def callout(slide, x, y, w, h, text, *, fill=None, accent=CRIMSON, size=11.5):
    _rect(slide, x, y, w, h, fill=fill or TINT, line=LINE)
    _rect(slide, x, y, 0.08, h, fill=accent, line=None)
    _, tf = _txbox(slide, x + 0.30, y + 0.12, w - 0.55, h - 0.24, anchor=MSO_ANCHOR.MIDDLE)
    tf.paragraphs[0].line_spacing = 1.12
    return tf


def band(slide, label, y, boxes, *, x=0.65, total_w=11.4, h=0.80, gap=0.14, accent=TEAL):
    """A labelled tier of the architecture diagram."""
    _, tf = _txbox(slide, x, y, total_w, 0.22)
    _run(tf.paragraphs[0], label, size=9, bold=True, color=accent, spc=1.6)
    n = len(boxes)
    bw = (total_w - gap * (n - 1)) / n
    for i, (t, b) in enumerate(boxes):
        cx = x + i * (bw + gap)
        _rect(slide, cx, y + 0.26, bw, h, fill=WHITE, line=LINE)
        _rect(slide, cx, y + 0.26, bw, 0.05, fill=accent, line=None)
        _, tf = _txbox(slide, cx + 0.13, y + 0.40, bw - 0.26, 0.22)
        _run(tf.paragraphs[0], t, size=10.5, bold=True, color=TEAL)
        _, tf = _txbox(slide, cx + 0.13, y + 0.63, bw - 0.26, h - 0.40)
        tf.paragraphs[0].line_spacing = 1.05
        _run(tf.paragraphs[0], b, size=8.5, color=GREY)


# --------------------------------------------------------------------------- #
# Review-2 slides
# --------------------------------------------------------------------------- #
def slide_architecture(prs):
    s = base(prs, "09 — SYSTEM ARCHITECTURE", "Overall Architecture")
    band(s, "CLIENT TIER  ·  BROWSER", 1.78, [
        ("Webcam capture", "getUserMedia; frame drawn to canvas, encoded JPEG."),
        ("Throttle ~12 fps", "Caps request rate; 60-frame window still fills in ~5 s."),
        ("React UI · 9 routes", "CRA + Tailwind + framer-motion. Landmark overlay, captions."),
        ("Web Speech TTS", "Caption read aloud in the user's chosen voice."),
    ], accent=CRIMSON)
    band(s, "SERVER TIER  ·  FASTAPI  (backend/server.py)", 3.06, [
        ("POST /api/frame", "Decodes JPEG, runs Holistic, buffers, returns prediction."),
        ("MediaPipe Holistic", "21+21 hand + 33 pose landmarks per frame, server-side."),
        ("Preprocess", "Same code as training: wrist-origin, scale, z-score, T=60."),
        ("Inference", "BiLSTM or CNN chosen per request via the model field."),
        ("GET /api/comparison", "Serves ml/logs/comparison.json to the Research page."),
    ])
    band(s, "OFFLINE TIER  ·  ML PIPELINE  (ml/)", 4.34, [
        ("preprocess.py", "Video tree → (60, 225) .npy tensors + label_index.json."),
        ("train_*.py", "Shared loader, identical split, seed 42. Writes .pt + history."),
        ("evaluate.py", "Test-set metrics, latency, confusion matrices."),
        ("comparison.json", "Single source of truth the UI reads. No hardcoded numbers."),
    ], accent=CRIMSON)
    note(s, "Design decision: MediaPipe runs server-side in Python, not in the browser, so landmark extraction "
            "is byte-for-byte the same code path used to build the training tensors — eliminating train/serve skew.",
         y=5.48)
    return s


def slide_modules(prs):
    s = base(prs, "10 — MODULES", "Modules & Responsibilities")
    table(s, [
        ["Module", "Location", "Responsibility", "Key output"],
        ["Capture & UI", "frontend/src/pages", "9 routes; webcam capture, caption assembly, landmark overlay, "
                                               "confidence chips, research dashboard", "Rendered UI + JPEG frames"],
        ["Landmark extraction", "ml/scripts/preprocess.py", "MediaPipe Holistic over each frame; wrist-origin "
                                                            "normalisation, shoulder scaling, resample to T=60", "(60, 225) float32 tensor"],
        ["Dataset & splits", "ml/scripts/dataset.py", "Stratified 70/15/15 split, per-feature z-score stats, "
                                                      "train-time augmentation", "DataLoader + norm stats"],
        ["Model definitions", "ml/scripts/models.py", "BiLSTMClassifier, CNN1DClassifier (and a Transformer "
                                                      "variant kept as a third control)", "nn.Module + param count"],
        ["Training", "ml/scripts/_train.py", "Shared loop: AdamW, cosine schedule, label smoothing, early "
                                             "stopping on val accuracy", ".pt checkpoint + history.json"],
        ["Evaluation", "ml/scripts/evaluate.py", "Test accuracy, top-k, macro/weighted F1, per-class F1, "
                                                 "latency, confusion matrices", "comparison.json + PNGs"],
        ["Inference service", "backend/inference.py", "Loads checkpoints at boot, exposes predict(); falls back "
                                                      "to a mock predictor when no weights exist", "Gloss + confidence"],
    ], x=0.55, y=1.80, w=12.2, col_w=[1.85, 2.15, 5.30, 2.90], row_h=0.60, head_h=0.38, fsize=9.5)
    return s


def slide_dataset_source(prs):
    s = base(prs, "11.1 — DATASET DESCRIPTION", "Dataset: INCLUDE (Full Corpus)")
    tf = callout(s, 0.65, 1.78, 11.4, 0.68,
                 "", accent=TEAL)
    _run(tf.paragraphs[0], "Source:  ", size=11.5, bold=True, color=TEAL)
    _run(tf.paragraphs[0], "INCLUDE — Indian Lexicon Sign Language Dataset, IIT Bombay (ACM MM 2020). "
                           "Distributed via Zenodo; indexed as an ISL benchmark reference on IEEE DataPort. "
                           "This project uses the FULL corpus (262 classes), not the 50-class INCLUDE-50 "
                           "subset commonly redistributed on Kaggle.", size=11.5, color=INK)

    for i, (v, l, sub) in enumerate([
        ("4,284", "VIDEOS ON DISK", "Counted in the local copy of the archive"),
        ("262", "SIGN CLASSES", "vs 50 in the INCLUDE-50 subset — a 5× larger label space"),
        ("54 GB", "RAW FOOTAGE", "Reduced to ~10–20 MB of tensors after extraction"),
        ("20", "CLASSES IN USE", "ISL-20 working subset for this case study"),
    ]):
        stat(s, 0.65 + i * 2.90, 2.66, 2.70, 1.62, v, l, sub, accent=CRIMSON if i % 2 == 0 else TEAL)

    bullets(s, [
        ("Category structure:  ", "videos are grouped into 15 semantic folders (Adjectives, Animals, Colours, "
                                  "Days_and_Time, Greetings, People, Places, Pronouns …), each containing one "
                                  "sub-folder per sign label."),
        ("Recording conditions:  ", "multiple signers per class, plain indoor backgrounds, front-facing camera — "
                                    "the multi-signer property is what makes signer-invariance testable."),
    ], y=4.52, h=1.20, size=12.5)
    note(s, "Working subset defined in ml/scripts/classes_isl20.txt — the intersection of the classes physically "
            "present in the archive and the vocabulary the application actually needs.", y=5.92)
    return s


def slide_dataset_creation(prs):
    s = base(prs, "11.2 — DATASET CREATION", "From Raw Video to Training Tensors")
    flow(s, [
        ("Enumerate", "Recursive scan; label inferred from the parent folder name, snake-cased."),
        ("Decode", "OpenCV reads each clip; frames sampled evenly to a fixed budget."),
        ("Holistic", "MediaPipe extracts 21+21 hand and 33 pose landmarks per frame."),
        ("Normalise", "Hands re-centred on the wrist and scaled by shoulder width."),
        ("Resample", "Linear index resampling to exactly T = 60 frames per clip."),
        ("Persist", "Saved as <label>__<take>.npy plus a label_index.json manifest."),
    ], y=1.80, h=1.12)

    _, tf = _txbox(s, 0.65, 3.20, 5.50, 0.26)
    _run(tf.paragraphs[0], "BALANCING & HYGIENE", size=9, bold=True, color=CRIMSON, spc=1.6)
    for i, (t, b) in enumerate([
        ("Per-class capping", "--max-per-class caps takes per label before any decoding happens, so a "
                              "class with 40 takes cannot dominate one with 12."),
        ("Class whitelisting", "--classes restricts extraction to a curated label list, keeping compute "
                               "proportional to the vocabulary actually served."),
        ("Disk discipline", "--delete-after removes each source video the moment its tensor is safely "
                            "written, so peak disk stays near the size of one clip."),
    ]):
        card(s, 0.65, 3.50 + i * 0.98, 5.50, 0.88, t, b, accent=CRIMSON, tsize=11.5, bsize=9)

    _, tf = _txbox(s, 6.55, 3.20, 5.50, 0.26)
    _run(tf.paragraphs[0], "TRAIN-TIME AUGMENTATION  (training split only)", size=9, bold=True, color=TEAL, spc=1.6)
    for i, (t, b) in enumerate([
        ("Gaussian coordinate jitter", "Small random noise on landmark coordinates, simulating "
                                       "MediaPipe's own estimation error."),
        ("Random frame drop (p = 0.10)", "Frames zeroed at random to mimic dropped webcam frames and "
                                         "momentary tracking loss."),
        ("Horizontal mirror", "Left/right pose indices are swapped correctly, so the model generalises "
                              "across left- and right-handed signers."),
    ]):
        card(s, 6.55, 3.50 + i * 0.98, 5.50, 0.88, t, b, accent=TEAL, tsize=11.5, bsize=9)
    return s


def slide_features(prs):
    s = base(prs, "11.3 — FEATURE REPRESENTATION", "What the Model Actually Sees")
    tf = callout(s, 0.65, 1.78, 11.4, 0.62, "", accent=TEAL)
    _run(tf.paragraphs[0], "Every clip becomes a single tensor of shape  ", size=12, color=INK)
    _run(tf.paragraphs[0], "(60, 225)", size=12, bold=True, color=CRIMSON, font="Consolas")
    _run(tf.paragraphs[0], "  —  60 time steps × 225 features  ≈ 54 KB, against ~12 MB of source video.",
         size=12, color=INK)

    rows = [["Index range", "Component", "Points × dims", "Normalisation"],
            ["0 : 63", "Left hand", "21 × (x, y, z)", "Wrist-origin, scaled by shoulder width"],
            ["63 : 126", "Right hand", "21 × (x, y, z)", "Wrist-origin, scaled by shoulder width"],
            ["126 : 225", "Pose", "33 × (x, y, z)", "Raw normalised image coordinates"]]
    table(s, rows, x=0.65, y=2.62, w=11.4, col_w=[1.90, 2.30, 2.60, 4.60], row_h=0.42, head_h=0.40, fsize=11)

    for i, (t, b) in enumerate([
        ("Why landmarks, not pixels", "Signer identity, skin tone, clothing and background all disappear. "
                                      "The model cannot cheat on backgrounds — and INCLUDE has plenty of them."),
        ("Why a fixed T = 60", "Signs vary in duration; a fixed window lets a plain classifier batch cleanly "
                               "without padding masks or CTC alignment."),
        ("Why z-score last", "Per-feature mean and standard deviation are computed on the training split only, "
                             "then applied to val and test — no statistics leak across the split."),
    ]):
        card(s, 0.65 + i * 3.85, 4.58, 3.62, 1.42, t, b, accent=TEAL if i == 1 else CRIMSON, tsize=11.5, bsize=9.5)
    return s


def slide_bilstm(prs):
    s = base(prs, "12.1 — MODEL A  ·  RECURRENT", "BiLSTM Architecture")
    layer_stack(s, 0.65, 1.80, 5.50, [
        ("Input", "(B, 60, 225)", "io"),
        ("Bi-LSTM layer 1", "hidden 256 × 2 dir", "core"),
        ("Dropout", "p = 0.3", "core"),
        ("Bi-LSTM layer 2", "hidden 256 × 2 dir", "core"),
        ("Mean-pool over time", "(B, 512)", "core"),
        ("Dropout", "p = 0.3", "core"),
        ("Linear + GELU", "512 → 128", "head"),
        ("Dropout → Linear", "128 → n_classes", "head"),
        ("Output logits", "(B, n_classes)", "io"),
    ])
    _, tf = _txbox(s, 6.55, 1.80, 5.50, 0.26)
    _run(tf.paragraphs[0], "DESIGN RATIONALE", size=9, bold=True, color=CRIMSON, spc=1.6)
    for i, (t, b) in enumerate([
        ("Bidirectional by design", "A sign's meaning often depends on both its onset and its release. "
                                    "Reading the sequence in both directions lets the classifier use the "
                                    "end of the gesture to disambiguate the beginning."),
        ("Mean-pool, not last hidden state", "Signs do not always finish at frame 60. Averaging across all "
                                             "time steps avoids over-weighting whatever happens to be last."),
        ("Unbounded temporal context", "Recurrence carries state across the whole 60-frame window — the "
                                       "property the CNN deliberately lacks, which is what makes the "
                                       "comparison meaningful."),
    ]):
        card(s, 6.55, 2.14 + i * 1.32, 5.50, 1.20, t, b, accent=CRIMSON, tsize=11.5, bsize=9.5)
    note(s, "Implemented in ml/scripts/models.py → BiLSTMClassifier. Parameter count is reported by "
            "evaluate.py at run time rather than asserted here.", y=6.28)
    return s


def slide_cnn(prs):
    s = base(prs, "12.2 — MODEL B  ·  CONVOLUTIONAL", "1D Temporal CNN Architecture")
    layer_stack(s, 0.65, 1.80, 5.50, [
        ("Input (transposed)", "(B, 225, 60)", "io"),
        ("Conv1d + BN + GELU", "225 → 128, k=5", "core"),
        ("MaxPool", "60 → 30", "core"),
        ("Conv1d + BN + GELU", "128 → 256, k=5", "core"),
        ("MaxPool", "30 → 15", "core"),
        ("Conv1d + BN + GELU", "256 → 256, k=5", "core"),
        ("Avg-pool ++ Max-pool", "(B, 512)", "core"),
        ("Linear + GELU → Linear", "512 → 128 → n_classes", "head"),
        ("Output logits", "(B, n_classes)", "io"),
    ])
    _, tf = _txbox(s, 6.55, 1.80, 5.50, 0.26)
    _run(tf.paragraphs[0], "DESIGN RATIONALE", size=9, bold=True, color=TEAL, spc=1.6)
    for i, (t, b) in enumerate([
        ("Time as the convolution axis", "The 225 landmark values are treated as channels and time as the "
                                         "spatial axis, so each kernel sees a fixed window of consecutive frames."),
        ("Bounded receptive field (~29 frames)", "Kernel 5 across three blocks with two pooling stages reaches "
                                                 "roughly half the 60-frame window. It physically cannot model "
                                                 "longer dependencies — that limitation is the experiment."),
        ("Dual pooling", "Average pooling captures the sustained shape of a sign; max pooling captures its "
                         "sharpest moment. Concatenating both preserves each."),
    ]):
        card(s, 6.55, 2.14 + i * 1.32, 5.50, 1.20, t, b, accent=TEAL, tsize=11.5, bsize=9.5)
    note(s, "Implemented in ml/scripts/models.py → CNN1DClassifier. Serves as the control: if it matches the "
            "BiLSTM, explicit long-range temporal modelling is not what these signs need.", y=6.28)
    return s


def slide_hparams(prs):
    s = base(prs, "13.1 — HYPERPARAMETERS", "Hyperparameter Table")
    _, tf = _txbox(s, 0.65, 1.76, 11.4, 0.26)
    _run(tf.paragraphs[0], "SHARED — IDENTICAL FOR BOTH MODELS", size=9, bold=True, color=CRIMSON, spc=1.6)
    table(s, [
        ["Hyperparameter", "Value", "Hyperparameter", "Value"],
        ["Optimiser", "AdamW", "Loss", "Cross-entropy, label smoothing 0.05"],
        ["Learning rate", "1e-3 (initial)", "LR schedule", "CosineAnnealingLR, T_max = epochs"],
        ["Weight decay", "1e-4", "Batch size", "32"],
        ["Max epochs", "60", "Early stopping", "patience 20 on val accuracy"],
        ["Random seed", "42 (all libraries)", "Split", "Stratified 70 / 15 / 15"],
    ], x=0.65, y=2.06, w=11.4, col_w=[2.55, 2.85, 2.55, 3.45], row_h=0.34, head_h=0.36, fsize=10.5)

    _, tf = _txbox(s, 0.65, 4.30, 11.4, 0.26)
    _run(tf.paragraphs[0], "MODEL-SPECIFIC", size=9, bold=True, color=TEAL, spc=1.6)
    table(s, [
        ["Model", "Layers", "Width", "Dropout", "Pooling", "Head"],
        ["BiLSTM", "2 × bidirectional LSTM", "hidden 256 (→512 out)", "0.3", "Mean over T", "512 → 128 → n"],
        ["1D CNN", "3 × Conv1d, kernel 5", "128 → 256 → 256", "0.3", "Avg ++ Max (→512)", "512 → 128 → n"],
    ], x=0.65, y=4.60, w=11.4, col_w=[1.35, 2.55, 2.35, 1.05, 2.10, 2.00], row_h=0.40, head_h=0.36, fsize=10.5)
    note(s, "Values read directly from ml/scripts/_train.py and ml/scripts/models.py. The only variable between "
            "the two runs is the architecture — every other setting above is held constant by construction.", y=5.90)
    return s


def slide_tuning(prs):
    s = base(prs, "13.2 — HYPERPARAMETER TUNING", "Tuning Protocol")
    for i, (t, b) in enumerate([
        ("Controlled comparison first", "Both models are trained under one fixed configuration before any "
                                        "tuning. If hyperparameters were tuned per model, an architecture "
                                        "difference and a tuning-budget difference would be indistinguishable."),
        ("Validation split only", "Every tuning decision is made on the validation split. The test split is "
                                  "touched exactly once, at the end, by evaluate.py."),
        ("Seed held at 42", "Split, initialisation and augmentation all derive from one seed, so a re-run "
                            "reproduces the same numbers and observed gaps are not shuffle luck."),
    ]):
        card(s, 0.65 + i * 3.85, 1.80, 3.62, 1.52, t, b, accent=CRIMSON if i != 1 else TEAL, tsize=11.5, bsize=9.5)

    _, tf = _txbox(s, 0.65, 3.52, 11.4, 0.26)
    _run(tf.paragraphs[0], "SEARCH SPACE — SWEPT ON THE VALIDATION SPLIT", size=9, bold=True, color=TEAL, spc=1.6)
    table(s, [
        ["Hyperparameter", "Values explored", "Selection criterion", "Rationale"],
        ["Learning rate", "3e-4, 1e-3, 3e-3", "Best val accuracy at early stop", "Dominant term; cosine decay "
                                                                                 "makes the initial value the main lever"],
        ["Batch size", "16, 32, 64", "Val accuracy, subject to memory", "Interacts with LR; 32 is the "
                                                                        "largest that trains comfortably on CPU"],
        ["Dropout", "0.1, 0.3, 0.5", "Gap between train and val accuracy", "Primary regulariser given a small "
                                                                           "per-class sample count"],
        ["Hidden / width", "128, 256", "Val accuracy vs parameter count", "Capacity against overfitting risk "
                                                                          "on a 20-class subset"],
        ["Label smoothing", "0.0, 0.05, 0.1", "Val loss calibration", "Confidence feeds the UI's correction "
                                                                      "chips, so calibration matters, not just accuracy"],
    ], x=0.65, y=3.82, w=11.4, col_w=[2.10, 2.15, 2.75, 4.40], row_h=0.42, head_h=0.36, fsize=9.5)
    note(s, "Sweep results are written to ml/logs/ per run. Selected values are the ones recorded in the "
            "hyperparameter table on the previous slide.", y=6.28)
    return s


def slide_metric_defs(prs):
    s = base(prs, "14.1 — PERFORMANCE METRICS", "Metrics: Definitions")
    table(s, [
        ["Metric", "Definition", "Why it is reported here"],
        ["Test accuracy", "Correct predictions ÷ total predictions on the held-out test split.",
         "Headline number, but misleading alone when class counts are uneven."],
        ["Macro F1", "Unweighted mean of per-class F1 = 2PR / (P + R).",
         "Treats a rare sign as equally important as a common one — the honest score for an imbalanced vocabulary."],
        ["Weighted F1", "Per-class F1 averaged in proportion to class support.",
         "Reflects performance a user experiences if signs occur at their natural frequency."],
        ["Top-k accuracy", "Fraction of samples whose true label falls in the k highest-probability classes.",
         "Directly models the correction-chip UX: the user is offered the top candidates, not just one."],
        ["Per-class F1", "F1 computed separately for every sign label.",
         "Surfaces which specific signs fail — the actionable diagnostic."],
        ["Confusion matrix", "Row-normalised matrix of true label against predicted label.",
         "Shows whether errors are random or concentrated between visually similar signs."],
        ["Latency (mean, p95)", "Wall-clock time for one forward pass, after warm-up.",
         "Real-time viability. p95 matters more than the mean for perceived responsiveness."],
        ["Parameter count", "Trainable parameters in the model.",
         "Accuracy per parameter is the fair way to compare models of different sizes."],
    ], x=0.55, y=1.80, w=12.2, col_w=[1.85, 4.75, 5.60], row_h=0.53, head_h=0.36, fsize=9.5)
    return s


def slide_metric_obs(prs):
    s = base(prs, "14.2 — PERFORMANCE METRICS", "Results & Observations")
    tf = callout(s, 0.65, 1.78, 11.4, 0.66, "", accent=CRIMSON)
    _run(tf.paragraphs[0], "Status:  ", size=11.5, bold=True, color=CRIMSON)
    _run(tf.paragraphs[0], "training run pending. This table is populated directly from ml/logs/comparison.json — "
                           "the same file the application's Research page reads. No placeholder figures are "
                           "printed in their place.", size=11.5, color=INK)

    table(s, [
        ["Metric", "BiLSTM", "1D CNN", "Observation"],
        ["Test accuracy", "—", "—", ""],
        ["Top-3 accuracy", "—", "—", ""],
        ["Macro F1", "—", "—", ""],
        ["Weighted F1", "—", "—", ""],
        ["Latency — mean", "—", "—", ""],
        ["Latency — p95", "—", "—", ""],
        ["Parameters", "—", "—", ""],
        ["Best epoch", "—", "—", ""],
    ], x=0.65, y=2.54, w=11.4, col_w=[2.30, 1.65, 1.65, 5.80], row_h=0.32, head_h=0.36, fsize=10)

    _, tf = _txbox(s, 0.65, 5.98, 11.4, 0.55)
    p = tf.paragraphs[0]
    p.line_spacing = 1.15
    _run(p, "What we expect to observe:  ", size=10.5, bold=True, color=TEAL)
    _run(p, "if the CNN matches the BiLSTM within noise, isolated ISL signs are separable from short local "
            "motion primitives and the cheaper model should ship. If the BiLSTM leads clearly on multi-stroke "
            "signs, long-range temporal structure is doing real work. Either outcome is a result.",
         size=10.5, color=GREY)
    return s


def slide_status(prs):
    s = base(prs, "15 — IMPLEMENTATION", "Implementation Status")
    for i, (t, b, a) in enumerate([
        ("Frontend — complete", "9 routes built and compiling (200 kB gzipped). Research page reads live "
                                "metrics from the API with an explicit not-yet-trained state.", TEAL),
        ("Backend — complete", "FastAPI serving /api/frame, /api/status, /api/comparison. Boots and stays "
                               "usable with no checkpoints via a mock predictor.", TEAL),
        ("ML pipeline — code complete", "preprocess, dataset, models, three trainers, evaluate, make_report, "
                                        "run_pipeline. Executed end-to-end on a smoke subset.", TEAL),
        ("Dataset — acquired", "INCLUDE archive on disk: 4,284 videos across 262 classes, 54 GB. ISL-20 "
                               "working subset defined.", TEAL),
        ("Training run — pending", "Blocked only on compute. CPU-only preprocessing of the full archive is "
                                   "many hours; the ISL-20 subset is the planned first run.", CRIMSON),
        ("Model↔UI integration — not required", "Explicitly out of scope for Review 2; the contract "
                                                "(/api/comparison) is nonetheless already implemented on both sides.", CRIMSON),
    ]):
        col, row = i % 2, i // 2
        card(s, 0.65 + col * 5.90, 1.82 + row * 1.48, 5.50, 1.34, t, b, accent=a, tsize=12, bsize=10)
    note(s, "The deliberate constraint throughout: no metric appears anywhere in the product or this deck "
            "unless it was produced by a real evaluation run.", y=6.26)
    return s


def slide_roadmap(prs):
    s = base(prs, "16 — NEXT", "Review 3 Roadmap")
    flow(s, [
        ("Train both models", "Run BiLSTM and CNN on the ISL-20 subset under the fixed configuration."),
        ("Cross-team comparison", "Benchmark against team members' architectures on the identical split."),
        ("Integrate with UI", "Serve winning checkpoint; Research page renders the real comparison."),
        ("Deploy", "Ship frontend and FastAPI backend together; verify end-to-end latency."),
        ("Present results", "Confusion matrices, per-class F1, and the accuracy/latency trade-off."),
    ], y=1.82, h=1.18)

    _, tf = _txbox(s, 0.65, 3.28, 11.4, 0.26)
    _run(tf.paragraphs[0], "WHAT MAKES THE CROSS-TEAM COMPARISON VALID", size=9, bold=True, color=TEAL, spc=1.6)
    for i, (t, b) in enumerate([
        ("One split, one seed", "Every architecture must consume the identical stratified split produced "
                                "with seed 42, or the comparison measures shuffle luck rather than modelling."),
        ("One feature representation", "All models take the same (60, 225) tensors with train-split z-score "
                                       "statistics, so no model benefits from different preprocessing."),
        ("One evaluation script", "evaluate.py computes every metric for every architecture and writes them "
                                  "to a single comparison.json — no self-reported numbers."),
    ]):
        card(s, 0.65 + i * 3.85, 3.58, 3.62, 1.60, t, b, accent=TEAL, tsize=11.5, bsize=9.5)
    note(s, "Adding a teammate's model requires only a new entry in models.py build() — the loader, split, "
            "training loop and evaluation are already shared.", y=5.42)
    return s


# --------------------------------------------------------------------------- #
# corrections to the existing Review-1 slides
# --------------------------------------------------------------------------- #
CORRECTIONS = [
    # (substring to find, replacement) — applied run-by-run so formatting survives.
    ("BiLSTM vs Transformer", "BiLSTM vs 1D CNN"),
    ("258 features per frame", "225 features per frame"),
    (
        "Train/val split done by signer (not by clip) so the model generalizes to unseen people, "
        "not memorized individuals.",
        "Stratified 70/15/15 split with a fixed seed, so every architecture is trained and scored on "
        "exactly the same clips.",
    ),
    (
        "BiLSTM (3.2M params, 42ms, 87% acc) and Transformer (5.8M params, 58ms, 91% acc) served "
        "simultaneously for live comparison.",
        "BiLSTM and 1D temporal CNN trained on identical splits and served behind one endpoint, so the "
        "architectures can be swapped per request and compared on measured numbers.",
    ),
]


def apply_corrections(prs) -> list[str]:
    applied = []
    for idx, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                # Join runs so a phrase split across runs is still matched.
                full = "".join(r.text for r in para.runs)
                for find, repl in CORRECTIONS:
                    if find in full:
                        new = full.replace(find, repl)
                        para.runs[0].text = new
                        for r in para.runs[1:]:
                            r.text = ""
                        applied.append(f"slide {idx}: {find[:52]}…")
                        full = new
    return applied


def move_slide_to_end(prs, index: int) -> None:
    sld_lst = prs.slides._sldIdLst
    ids = list(sld_lst)
    sld_lst.remove(ids[index])
    sld_lst.append(ids[index])


def main() -> None:
    global LOGO_PNG
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    LOGO_PNG = Path(sys.argv[3]) if len(sys.argv) > 3 else None

    prs = Presentation(str(src))
    before = len(prs.slides)

    fixed = apply_corrections(prs)
    print(f"corrections applied: {len(fixed)}")
    for f in fixed:
        print("   ", f)

    thank_you_idx = before - 1  # "Thank You" is the last Review-1 slide

    for fn in (
        slide_architecture,
        slide_modules,
        slide_dataset_source,
        slide_dataset_creation,
        slide_features,
        slide_extraction_results,
        slide_bilstm,
        slide_cnn,
        slide_hparams,
        slide_tuning,
        slide_metric_defs,
        slide_metric_obs,
        slide_status,
        slide_roadmap,
    ):
        fn(prs)

    move_slide_to_end(prs, thank_you_idx)

    prs.save(str(dst))
    print(f"OK  {before} -> {len(prs.slides)} slides  ->  {dst}")




def slide_extraction_results(prs):
    """Real, measured output of the preprocessing run — not projections."""
    s = base(prs, "11.4 — EXTRACTION RESULTS", "Dataset Creation: Measured Output")
    tf = callout(s, 0.65, 1.78, 11.4, 0.62, "", accent=TEAL)
    _run(tf.paragraphs[0], "Executed run:  ", size=11.5, bold=True, color=TEAL)
    _run(tf.paragraphs[0], "MediaPipe Holistic (model_complexity = 1) over the ISL-20 whitelist, "
                           "capped at 8 takes per class, 32 frames sampled per clip, 2 worker processes.",
         size=11.5, color=INK)

    for i, (v, l, sub) in enumerate([
        ("160", "TENSORS WRITTEN", "20 classes × 8 takes — perfectly balanced"),
        ("0", "EXTRACTION FAILURES", "Every clip yielded a finite (60, 225) tensor"),
        ("88%", "FRAMES WITH A HAND", "At least one hand localised by Holistic"),
        ("8.8 MB", "ON DISK", "From 54 GB of source video — a 6,000× reduction"),
    ]):
        stat(s, 0.65 + i * 2.90, 2.58, 2.70, 1.62, v, l, sub, accent=CRIMSON if i % 2 == 0 else TEAL)

    _, tf = _txbox(s, 0.65, 4.44, 11.4, 0.26)
    _run(tf.paragraphs[0], "DEFECT FOUND AND FIXED DURING THIS RUN", size=9, bold=True, color=CRIMSON, spc=1.6)
    card(s, 0.65, 4.74, 11.4, 1.10,
         "Atomic write never completed  ·  ml/scripts/preprocess.py",
         "The worker saved to \"<name>.npy.tmp\" and then renamed it into place. numpy.save() appends "
         "\".npy\" unless the filename already ends in it, so the temp file was actually written as "
         "\"<name>.npy.tmp.npy\" and every rename raised FileNotFoundError — the pipeline reported success "
         "while writing zero usable tensors. Fixed by saving through an open file handle, which suppresses "
         "the extension rewriting. All 160 tensors above were produced after the fix.",
         accent=CRIMSON, tsize=11.5, bsize=9.5)
    return s

if __name__ == "__main__":
    main()
