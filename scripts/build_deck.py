"""Generate Silent_Voice_Deck.pptx — cinematic dark-editorial theme.

Palette:
  ink    = #0B0B0D
  cream  = #F2ECE0
  copper = #C97B4A
  cyan   = #6EE7F2
"""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

INK = RGBColor(0x0B, 0x0B, 0x0D)
CREAM = RGBColor(0xF2, 0xEC, 0xE0)
CREAM_DIM = RGBColor(0xA5, 0xA1, 0x96)
COPPER = RGBColor(0xC9, 0x7B, 0x4A)
CYAN = RGBColor(0x6E, 0xE7, 0xF2)
BORDER = RGBColor(0x2A, 0x27, 0x22)
CARD_BG = RGBColor(0x14, 0x14, 0x16)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = prs.slide_width, prs.slide_height
BLANK = prs.slide_layouts[6]


def add_bg(slide, color=INK):
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, SH)
    bg.fill.solid()
    bg.fill.fore_color.rgb = color
    bg.line.fill.background()
    bg.shadow.inherit = False
    return bg


def add_text(slide, text, left, top, width, height, size=14, color=CREAM,
             bold=False, italic=False, font="Inter", align=PP_ALIGN.LEFT,
             tracking=None, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.name = font
    r.font.size = Pt(size)
    r.font.color.rgb = color
    r.font.bold = bold
    r.font.italic = italic
    if tracking is not None:
        rPr = r._r.get_or_add_rPr()
        rPr.set("spc", str(tracking))
    return box, p, r


def add_kicker(slide, text, left, top, width=Inches(6), color=COPPER):
    return add_text(slide, text.upper(), left, top, width, Inches(0.3),
                    size=9, color=color, bold=True, tracking=400)


def add_rule(slide, left, top, width, color=COPPER, height=Inches(0.02)):
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    line.fill.solid()
    line.fill.fore_color.rgb = color
    line.line.fill.background()
    return line


def add_card(slide, left, top, width, height, fill=CARD_BG, border=BORDER):
    card = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = fill
    card.line.color.rgb = border
    card.line.width = Pt(0.5)
    card.shadow.inherit = False
    return card


def add_page_number(slide, n, total):
    add_text(slide, f"{n:02d} / {total:02d}", Inches(12.4), Inches(7.05),
             Inches(0.85), Inches(0.3), size=9, color=CREAM_DIM, tracking=300, bold=True)
    add_text(slide, "SILENT VOICE", Inches(0.5), Inches(7.05),
             Inches(3), Inches(0.3), size=9, color=CREAM_DIM, tracking=400, bold=True)


def add_running_logo(slide):
    dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(0.5), Inches(0.4),
                                 Inches(0.22), Inches(0.22))
    dot.fill.solid(); dot.fill.fore_color.rgb = COPPER
    dot.line.fill.background()
    add_text(slide, "Silent Voice", Inches(0.8), Inches(0.35),
             Inches(4), Inches(0.4), size=14, color=CREAM,
             font="Fraunces", bold=False)


TOTAL = 14

# ============================================================
# SLIDE 1 — TITLE
# ============================================================
s = prs.slides.add_slide(BLANK)
add_bg(s)

# subtle vignette right side
vig = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(8), Inches(-2),
                         Inches(10), Inches(10))
vig.fill.solid(); vig.fill.fore_color.rgb = RGBColor(0x1E, 0x14, 0x0C)
vig.line.fill.background(); vig.shadow.inherit = False

# small landmark-glyph in top right (5 dots + connecting lines)
def add_glyph_dots(slide, cx, cy, scale=1.0, color=CYAN):
    dots = [
        (0, 0), (0.5, -0.4), (1.0, -0.7),
        (1.4, -0.3), (0.4, 0.3), (0.9, 0.5),
    ]
    for dx, dy in dots:
        d = slide.shapes.add_shape(MSO_SHAPE.OVAL,
            int(cx + Emu(dx * 720000 * scale)),
            int(cy + Emu(dy * 720000 * scale)),
            Emu(int(0.12 * 720000 * scale)),
            Emu(int(0.12 * 720000 * scale)))
        d.fill.solid(); d.fill.fore_color.rgb = color
        d.line.fill.background(); d.shadow.inherit = False


from pptx.util import Emu
add_glyph_dots(s, Inches(10.5), Inches(1.2))

add_kicker(s, "Indian Sign Language ↔ English", Inches(0.9), Inches(2.1))
add_rule(s, Inches(0.9), Inches(2.45), Inches(0.5), COPPER)

add_text(s, "Silent Voice.", Inches(0.9), Inches(2.65), Inches(12), Inches(1.4),
         size=72, color=CREAM, font="Fraunces", bold=False)
add_text(s, "Every gesture,", Inches(0.9), Inches(3.9), Inches(12), Inches(1.1),
         size=54, color=CREAM, font="Fraunces")
add_text(s, "heard.", Inches(4.9), Inches(3.9), Inches(6), Inches(1.1),
         size=54, color=COPPER, font="Fraunces", italic=True)

add_text(s, "A real-time Indian Sign Language ↔ English translator — built accessibility-first.",
         Inches(0.9), Inches(5.35), Inches(11), Inches(0.5),
         size=15, color=CREAM_DIM, font="Inter")

# footer three-column
add_text(s, "PROJECT", Inches(0.9), Inches(6.6), Inches(2), Inches(0.25),
         size=9, color=CREAM_DIM, tracking=400, bold=True)
add_text(s, "Phase 1 · UI shell + ML scaffolding", Inches(0.9), Inches(6.85),
         Inches(4), Inches(0.3), size=11, color=CREAM)

add_text(s, "STACK", Inches(5.2), Inches(6.6), Inches(2), Inches(0.25),
         size=9, color=CREAM_DIM, tracking=400, bold=True)
add_text(s, "React · FastAPI · MongoDB · PyTorch", Inches(5.2), Inches(6.85),
         Inches(5), Inches(0.3), size=11, color=CREAM)

add_text(s, "DATASET", Inches(9.5), Inches(6.6), Inches(2), Inches(0.25),
         size=9, color=CREAM_DIM, tracking=400, bold=True)
add_text(s, "INCLUDE-50 (Kaggle)", Inches(9.5), Inches(6.85),
         Inches(4), Inches(0.3), size=11, color=CREAM)

# ============================================================
# SLIDE 2 — WHAT WE'RE BUILDING
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 2, TOTAL)
add_kicker(s, "01 · Problem & Product", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "What we're building.", Inches(0.5), Inches(1.65), Inches(12), Inches(1),
         size=42, color=CREAM, font="Fraunces")

body = ("Silent Voice is a web app that lets an ISL signer be understood by a non-signer "
        "in real time — the webcam feed becomes landmark skeletons in-browser, a compact "
        "deep-learning model turns those into gloss, and an NLP layer shapes the gloss "
        "into natural spoken English. Non-signers can reply back in sign through a curated "
        "clip library, and learners can practice against reference clips with feedback.")
add_text(s, body, Inches(0.5), Inches(3.0), Inches(6.2), Inches(3),
         size=14, color=CREAM_DIM)

# right column: three feature cards
cards = [
    ("LIVE TRANSLATION", "ISL → English", "Webcam → landmark skeleton → gloss → captions + TTS."),
    ("REVERSE MODE", "English → ISL", "Text/mic input → gloss reorder → cinematic sign-clip playback."),
    ("PRACTICE MODE", "Reference vs. attempt", "Similarity score + actionable feedback — no shame, just signal."),
]
for i, (k, t, b) in enumerate(cards):
    top = Inches(3.0 + i * 1.15)
    add_card(s, Inches(7.0), top, Inches(5.8), Inches(1.0))
    add_text(s, k, Inches(7.2), top + Inches(0.15), Inches(3), Inches(0.25),
             size=8, color=COPPER, tracking=400, bold=True)
    add_text(s, t, Inches(7.2), top + Inches(0.4), Inches(4), Inches(0.35),
             size=15, color=CREAM, font="Fraunces")
    add_text(s, b, Inches(7.2), top + Inches(0.7), Inches(5.4), Inches(0.3),
             size=10, color=CREAM_DIM)

# ============================================================
# SLIDE 3 — CURRENT WORKING STACK (overview)
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 3, TOTAL)
add_kicker(s, "02 · Current Working Stack", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "What's running right now.", Inches(0.5), Inches(1.65), Inches(12), Inches(1),
         size=38, color=CREAM, font="Fraunces")
add_text(s, "Frontend, backend, and mock ML endpoints — all live at the preview URL.",
         Inches(0.5), Inches(2.55), Inches(12), Inches(0.4),
         size=13, color=CREAM_DIM)

# Six pillars in a 3x2 grid
pillars = [
    ("FRONTEND",     "React 19",       "SPA · 9 routes · dark editorial UI"),
    ("BACKEND",      "FastAPI (Py)",   "12 REST endpoints · async · Pydantic v2"),
    ("DATABASE",     "MongoDB",        "Motor async driver · transcripts + clip index"),
    ("STYLING",      "Tailwind + shadcn/ui", "Fraunces + Inter · 4 custom colors · Radix"),
    ("ANIMATION",    "Framer Motion",  "Assemble caption · gloss reorder · reveals"),
    ("ML INFERENCE", "PyTorch stub",   "Mock predictor · A/B via X-Model header · ready"),
]
for i, (k, name, sub) in enumerate(pillars):
    col = i % 3
    row = i // 3
    left = Inches(0.5 + col * 4.25)
    top = Inches(3.2 + row * 1.85)
    add_card(s, left, top, Inches(4.0), Inches(1.65))
    add_text(s, k, left + Inches(0.3), top + Inches(0.2), Inches(3), Inches(0.25),
             size=8, color=COPPER, tracking=400, bold=True)
    add_text(s, name, left + Inches(0.3), top + Inches(0.5), Inches(3.5), Inches(0.5),
             size=22, color=CREAM, font="Fraunces")
    add_text(s, sub, left + Inches(0.3), top + Inches(1.1), Inches(3.5), Inches(0.5),
             size=10, color=CREAM_DIM)

# ============================================================
# SLIDE 4 — FRONTEND STACK
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 4, TOTAL)
add_kicker(s, "03 · Frontend", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "Cinematic dark-editorial UI.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=38, color=CREAM, font="Fraunces")

# Two column table
left_col = [
    ("Framework",    "React 19 (Create React App)"),
    ("Routing",      "react-router-dom v7"),
    ("Language",     "JavaScript (JSX)"),
    ("Styling",      "Tailwind CSS + custom tokens"),
    ("UI kit",       "shadcn/ui (Radix primitives)"),
    ("Animation",    "Framer Motion"),
]
right_col = [
    ("Icons",        "Lucide React (no emoji)"),
    ("Fonts",        "Fraunces · Inter · JetBrains Mono"),
    ("HTTP",         "Axios"),
    ("Toasts",       "Sonner (dark)"),
    ("Landmark viz", "Custom SVG · two-handed 21-pt skeleton"),
    ("Package mgr",  "yarn"),
]
def draw_row(slide, left, top, k, v):
    add_text(slide, k.upper(), left, top, Inches(2), Inches(0.3),
             size=9, color=COPPER, tracking=300, bold=True)
    add_text(slide, v, left + Inches(2), top, Inches(4), Inches(0.35),
             size=13, color=CREAM)
    add_rule(slide, left, top + Inches(0.5), Inches(5.8), BORDER, height=Inches(0.008))

for i, (k, v) in enumerate(left_col):
    draw_row(s, Inches(0.5), Inches(2.7 + i * 0.62), k, v)
for i, (k, v) in enumerate(right_col):
    draw_row(s, Inches(6.9), Inches(2.7 + i * 0.62), k, v)

# ============================================================
# SLIDE 5 — BACKEND STACK
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 5, TOTAL)
add_kicker(s, "04 · Backend", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "FastAPI + async MongoDB.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=38, color=CREAM, font="Fraunces")

left_col = [
    ("Server",     "FastAPI (Python 3.11+)"),
    ("ASGI",       "Uvicorn (supervisor-managed)"),
    ("DB driver",  "Motor — async MongoDB"),
    ("Database",   "MongoDB"),
    ("Validation", "Pydantic v2"),
    ("Config",     "python-dotenv · .env files"),
]
right_col = [
    ("CORS",       "Starlette middleware"),
    ("Endpoints",  "12 REST + WSS-ready"),
    ("A/B switch", "X-Model: bilstm | transformer header"),
    ("Process",    "supervisor (backend + frontend)"),
    ("Ingress",    "Kubernetes · /api/* → :8001"),
    ("Env vars",   "REACT_APP_BACKEND_URL · MONGO_URL"),
]
for i, (k, v) in enumerate(left_col):
    draw_row(s, Inches(0.5), Inches(2.7 + i * 0.62), k, v)
for i, (k, v) in enumerate(right_col):
    draw_row(s, Inches(6.9), Inches(2.7 + i * 0.62), k, v)

# ============================================================
# SLIDE 6 — DEEP LEARNING (A/B STRATEGY)
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 6, TOTAL)
add_kicker(s, "05 · Deep Learning", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "Two models, one honest A/B.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=38, color=CREAM, font="Fraunces")
add_text(s, "Both consume MediaPipe landmark tensors. CNN is deliberately excluded — landmarks are already spatially structured.",
         Inches(0.5), Inches(2.5), Inches(12.4), Inches(0.6),
         size=12, color=CREAM_DIM)

# Two model cards
def model_card(slide, left, top, width, height, kicker, name, tagline,
               arch, params, acc, latency):
    add_card(slide, left, top, width, height)
    inner = left + Inches(0.4)
    add_text(slide, kicker, inner, top + Inches(0.3), Inches(4), Inches(0.25),
             size=9, color=COPPER, tracking=400, bold=True)
    add_text(slide, name, inner, top + Inches(0.6), Inches(5), Inches(0.6),
             size=32, color=CREAM, font="Fraunces")
    add_text(slide, tagline, inner, top + Inches(1.35), Inches(5), Inches(0.35),
             size=12, color=CREAM_DIM, italic=True)

    # metrics row
    metric_top = top + Inches(1.85)
    def metric(x, val, lbl, col):
        add_text(slide, val, x, metric_top, Inches(1.5), Inches(0.55),
                 size=26, color=col, font="Fraunces")
        add_text(slide, lbl.upper(), x, metric_top + Inches(0.55),
                 Inches(1.5), Inches(0.25), size=8, color=CREAM_DIM,
                 tracking=300, bold=True)
    metric(inner, params, "params", CREAM)
    metric(inner + Inches(1.7), acc, "val acc", COPPER)
    metric(inner + Inches(3.4), latency, "latency", CYAN)

    # architecture lines
    for i, line in enumerate(arch):
        add_text(slide, "• " + line, inner, top + Inches(3.05 + i * 0.35),
                 Inches(5.5), Inches(0.3), size=10, color=CREAM)

model_card(s, Inches(0.5), Inches(3.2), Inches(6.2), Inches(4.0),
           "MODEL A · RECURRENT", "BiLSTM",
           "Fast, honest baseline.",
           ["2× Bidirectional LSTM (hidden=256)",
            "Dropout 0.3 between layers",
            "Dense 128 → softmax over vocab"],
           "3.2M", "87%", "42ms")

model_card(s, Inches(7.0), Inches(3.2), Inches(5.8), Inches(4.0),
           "MODEL B · ATTENTION", "Transformer",
           "Long-range context, higher ceiling.",
           ["Learned positional embed (T=60)",
            "4 layers × 4 heads · d_model=256",
            "CLS token → softmax over vocab"],
           "5.8M", "91%", "58ms")

# ============================================================
# SLIDE 7 — NLP LAYER
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 7, TOTAL)
add_kicker(s, "06 · NLP Layer", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "Where language shows up.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=38, color=CREAM, font="Fraunces")
add_text(s, "The DL model outputs gloss tokens — not English. NLP bridges gloss ↔ natural language across three touchpoints.",
         Inches(0.5), Inches(2.5), Inches(12.4), Inches(0.6),
         size=12, color=CREAM_DIM)

nlp_cards = [
    ("FORWARD", "Gloss → English", "Gemini 3 Flash",
     "After the DL model emits gloss (e.g. [TODAY, YOU, HOW]) → LLM produces \"How are you today?\" with natural punctuation.",
     "Rule-based template map · article insertion heuristics."),
    ("REVERSE", "English → Gloss", "Rules + LLM fallback",
     "Tokenize → drop articles/copulas → reorder to ISL (SOV) → mark OOV words for fingerspelling.",
     "Deterministic rules handle ~80% of vocab. LLM only for unusual structures."),
    ("SAFETY NET", "Correction chips", "Top-k logits",
     "When confidence < 70%, take top-3 gloss candidates from softmax, route each through forward step, surface as chips.",
     "No LLM here — pure math on model output. It IS the safety net."),
]
for i, (k, name, engine, what, fallback) in enumerate(nlp_cards):
    left = Inches(0.5 + i * 4.25)
    top = Inches(3.3)
    add_card(s, left, top, Inches(4.0), Inches(3.7))
    add_text(s, k, left + Inches(0.3), top + Inches(0.25), Inches(3.5), Inches(0.25),
             size=8, color=COPPER, tracking=400, bold=True)
    add_text(s, name, left + Inches(0.3), top + Inches(0.55), Inches(3.5), Inches(0.5),
             size=20, color=CREAM, font="Fraunces")
    add_text(s, engine, left + Inches(0.3), top + Inches(1.15), Inches(3.5), Inches(0.3),
             size=11, color=CYAN, italic=True)
    add_text(s, "What it does", left + Inches(0.3), top + Inches(1.55), Inches(3), Inches(0.22),
             size=8, color=CREAM_DIM, tracking=300, bold=True)
    add_text(s, what, left + Inches(0.3), top + Inches(1.8), Inches(3.5), Inches(1.3),
             size=10, color=CREAM)
    add_text(s, "Fallback", left + Inches(0.3), top + Inches(2.95), Inches(3), Inches(0.22),
             size=8, color=CREAM_DIM, tracking=300, bold=True)
    add_text(s, fallback, left + Inches(0.3), top + Inches(3.15), Inches(3.5), Inches(0.6),
             size=9, color=CREAM_DIM)

# ============================================================
# SLIDE 8 — DATASET (INCLUDE-50 on Kaggle)
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 8, TOTAL)
add_kicker(s, "07 · Dataset", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "INCLUDE-50 · Kaggle.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=38, color=CREAM, font="Fraunces")

add_text(s, "Public, curated 50-class subset of the IIT Bombay INCLUDE corpus — the right size for a student project.",
         Inches(0.5), Inches(2.55), Inches(12.4), Inches(0.5),
         size=13, color=CREAM_DIM)

# metadata card
add_card(s, Inches(0.5), Inches(3.3), Inches(6.2), Inches(3.6))
inner = Inches(0.85)
add_text(s, "SOURCE", inner, Inches(3.55), Inches(3), Inches(0.25),
         size=8, color=COPPER, tracking=400, bold=True)
add_text(s, "kaggle.com/datasets/", inner, Inches(3.85), Inches(6), Inches(0.3),
         size=12, color=CREAM, font="JetBrains Mono")
add_text(s, "yuvrajjoshi1110/include-50", inner, Inches(4.15), Inches(6), Inches(0.3),
         size=12, color=CYAN, font="JetBrains Mono")

add_rule(s, inner, Inches(4.7), Inches(5.5), BORDER, height=Inches(0.008))

meta = [
    ("Classes",      "50 isolated ISL signs"),
    ("Videos",       "~800+ clips (INCLUDE-50 subset)"),
    ("Signers",      "Multiple (for signer-invariance)"),
    ("Format",       "MP4 / MOV, one folder per class"),
    ("Peak disk",    "~15 GB extracted"),
    ("After preproc", "~50 MB (.npy tensors only)"),
]
for i, (k, v) in enumerate(meta):
    row_top = Inches(4.85 + i * 0.32)
    add_text(s, k, inner, row_top, Inches(1.5), Inches(0.25),
             size=9, color=CREAM_DIM, tracking=200, bold=True)
    add_text(s, v, inner + Inches(1.7), row_top, Inches(4), Inches(0.25),
             size=11, color=CREAM)

# right: why include-50
add_card(s, Inches(7.0), Inches(3.3), Inches(5.8), Inches(3.6))
add_text(s, "WHY INCLUDE-50 (NOT FULL INCLUDE)", Inches(7.3), Inches(3.55),
         Inches(5), Inches(0.25), size=8, color=COPPER, tracking=400, bold=True)
add_text(s, "Fits the scope. Fits the disk.", Inches(7.3), Inches(3.85),
         Inches(5), Inches(0.55), size=22, color=CREAM, font="Fraunces")

reasons = [
    "App vocabulary target is ~50–180 signs — INCLUDE-50 already covers it.",
    "Full INCLUDE is 57 GB compressed, ~120 GB extracted — impractical for a laptop.",
    "Kaggle version is pre-packaged, no split-zip archive shell scripts.",
    "Kaggle GPU notebooks give free ephemeral disk + GPU for training.",
    "After preprocessing to .npy tensors, permanent footprint is ~50 MB.",
]
for i, r in enumerate(reasons):
    top = Inches(4.7 + i * 0.42)
    add_text(s, "→", Inches(7.3), top, Inches(0.3), Inches(0.3),
             size=12, color=COPPER, bold=True)
    add_text(s, r, Inches(7.55), top, Inches(5.1), Inches(0.4),
             size=10, color=CREAM)

# ============================================================
# SLIDE 9 — DATA & TRAINING PIPELINE
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 9, TOTAL)
add_kicker(s, "08 · Training Pipeline", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "From raw video to served weights.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=36, color=CREAM, font="Fraunces")

steps = [
    ("01", "Download",  "Grab INCLUDE-50 from Kaggle. ~15 GB extracted."),
    ("02", "Preprocess", "scripts/preprocess.py — MediaPipe Holistic → .npy landmark tensors, T=60 frames."),
    ("03", "Train A",   "scripts/train_bilstm.py — BiLSTM classifier · CosineLR · 40 epochs · ~40 min on Colab T4."),
    ("04", "Train B",   "scripts/train_transformer.py — Transformer encoder · same data loader · ~40 min."),
    ("05", "Evaluate",  "scripts/evaluate.py — side-by-side val/test accuracy, per-class F1, confusion matrices."),
    ("06", "Serve",     "Copy .pt + label_map.json → backend/models/ → sudo supervisorctl restart backend."),
]
for i, (n, t, b) in enumerate(steps):
    top = Inches(2.75 + i * 0.72)
    # left col: big number
    add_text(s, n, Inches(0.5), top, Inches(1), Inches(0.7),
             size=32, color=COPPER, font="Fraunces")
    add_text(s, t.upper(), Inches(1.55), top + Inches(0.1),
             Inches(3), Inches(0.3), size=11, color=CREAM,
             tracking=300, bold=True)
    add_text(s, b, Inches(4.5), top + Inches(0.1), Inches(8.4), Inches(0.5),
             size=11, color=CREAM_DIM)
    if i < len(steps) - 1:
        add_rule(s, Inches(0.5), top + Inches(0.65), Inches(12.4),
                 BORDER, height=Inches(0.005))

# ============================================================
# SLIDE 10 — TECH STACK TO BE USED (full matrix)
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 10, TOTAL)
add_kicker(s, "09 · Full Tech Matrix", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "Every framework, one glance.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=36, color=CREAM, font="Fraunces")

groups = [
    ("FRONTEND", CYAN, [
        "React 19", "react-router-dom v7", "Tailwind CSS",
        "shadcn/ui + Radix", "Framer Motion", "Lucide React",
        "Axios", "Sonner", "MediaPipe Tasks-Vision (browser)"
    ]),
    ("BACKEND", COPPER, [
        "FastAPI", "Uvicorn", "Pydantic v2",
        "Motor (async MongoDB)", "python-dotenv", "Starlette CORS",
        "WebSocket (WSS)", "supervisor"
    ]),
    ("ML / DL", CYAN, [
        "PyTorch ≥ 2.2", "MediaPipe Holistic", "OpenCV",
        "NumPy", "scikit-learn", "BiLSTM (custom)",
        "Transformer encoder (custom)", "TensorBoard"
    ]),
    ("NLP", COPPER, [
        "Gemini 3 Flash (via emergentintegrations)",
        "Rule engine (SOV reorder)",
        "Top-k logit expansion",
        "Web Speech API (TTS + STT)"
    ]),
    ("DATA & STORAGE", CYAN, [
        "INCLUDE-50 (Kaggle)",
        "MongoDB",
        "Object storage (sign clips)",
        "Local filesystem (.pt + .npy)"
    ]),
    ("INFRA", COPPER, [
        "yarn / pip", "Kubernetes ingress",
        ".env config", "supervisor process mgmt"
    ]),
]
for i, (name, col, items) in enumerate(groups):
    r = i // 3; c = i % 3
    left = Inches(0.5 + c * 4.25)
    top = Inches(2.6 + r * 2.35)
    add_card(s, left, top, Inches(4.0), Inches(2.1))
    add_text(s, name, left + Inches(0.3), top + Inches(0.2),
             Inches(3.5), Inches(0.25), size=9, color=col, tracking=400, bold=True)
    add_rule(s, left + Inches(0.3), top + Inches(0.55),
             Inches(0.4), col, height=Inches(0.02))
    for j, it in enumerate(items):
        col_o = j % 2
        row_o = j // 2
        add_text(s, "· " + it,
                 left + Inches(0.3 + col_o * 1.85),
                 top + Inches(0.7 + row_o * 0.28),
                 Inches(1.9), Inches(0.3),
                 size=9, color=CREAM)

# ============================================================
# SLIDE 11 — PIPELINE DIAGRAM
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 11, TOTAL)
add_kicker(s, "10 · End-to-End Pipeline", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "Frame in, sentence out.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=36, color=CREAM, font="Fraunces")

pipe = [
    ("BROWSER",  "Webcam capture",       "getUserMedia"),
    ("BROWSER",  "MediaPipe Holistic",   "21 hand × 2 + 33 pose landmarks"),
    ("BROWSER",  "Preprocess",           "wrist-origin · pad to T=60 · z-score"),
    ("BACKEND",  "Inference (A/B)",      "BiLSTM or Transformer · X-Model header"),
    ("BACKEND",  "NLP · gloss → English", "Gemini 3 Flash + rule fallback"),
    ("BROWSER",  "Caption + TTS",        "Web Speech API · character-assemble"),
]
for i, (env, t, b) in enumerate(pipe):
    top = Inches(2.9 + i * 0.7)
    # env tag
    tag_color = CYAN if env == "BROWSER" else COPPER
    tag = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.5), top + Inches(0.05),
                             Inches(1.4), Inches(0.4))
    tag.fill.solid(); tag.fill.fore_color.rgb = INK
    tag.line.color.rgb = tag_color; tag.line.width = Pt(1); tag.shadow.inherit = False
    add_text(s, env, Inches(0.5), top + Inches(0.13),
             Inches(1.4), Inches(0.3), size=8, color=tag_color,
             tracking=400, bold=True, align=PP_ALIGN.CENTER)

    # step number
    add_text(s, f"{i+1:02d}", Inches(2.1), top, Inches(0.8), Inches(0.6),
             size=26, color=CREAM_DIM, font="Fraunces")
    # step title + body
    add_text(s, t, Inches(3.0), top + Inches(0.05), Inches(4), Inches(0.4),
             size=16, color=CREAM, font="Fraunces")
    add_text(s, b, Inches(7.0), top + Inches(0.1), Inches(6), Inches(0.4),
             size=11, color=CREAM_DIM)
    if i < len(pipe) - 1:
        add_rule(s, Inches(0.5), top + Inches(0.58), Inches(12.4),
                 BORDER, height=Inches(0.005))

# ============================================================
# SLIDE 12 — CURRENT STATUS + DATA FOOTPRINT
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 12, TOTAL)
add_kicker(s, "11 · Where We Are", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "Status board.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=42, color=CREAM, font="Fraunces")

# Two columns: DONE vs NEXT
col_l_top = Inches(2.8)
add_text(s, "DONE (PHASE 1)", Inches(0.5), col_l_top, Inches(4), Inches(0.3),
         size=10, color=COPPER, tracking=400, bold=True)
done = [
    "All 9 screens shipped with mock data",
    "Two-handed animated landmark skeleton",
    "Character-assemble caption animation",
    "Backend: 12 REST endpoints",
    "Backend: A/B model endpoint (mocked)",
    "MongoDB wired · Motor async driver",
    "ML scripts: preprocess · train · evaluate",
    "Dataset folder structure in place",
    "Research page documenting the plan",
]
for i, d in enumerate(done):
    add_text(s, "✓", Inches(0.5), col_l_top + Inches(0.4 + i * 0.36),
             Inches(0.3), Inches(0.3), size=12, color=CYAN, bold=True)
    add_text(s, d, Inches(0.8), col_l_top + Inches(0.42 + i * 0.36),
             Inches(5.5), Inches(0.3), size=11, color=CREAM)

add_text(s, "NEXT (PHASE 2 → 3)", Inches(6.9), col_l_top, Inches(5), Inches(0.3),
         size=10, color=COPPER, tracking=400, bold=True)
nxt = [
    "Download INCLUDE-50 → run preprocess.py",
    "Train BiLSTM + Transformer on Colab",
    "Drop .pt weights → backend auto-serves",
    "Wire real MediaPipe in browser",
    "WebSocket transport for live captions",
    "Gemini 3 Flash for gloss → English",
    "Record 15–18 phrase clips for reverse mode",
    "Upload MP4s to object storage",
    "Deploy (WSS + HTTPS)",
]
for i, d in enumerate(nxt):
    add_text(s, "→", Inches(6.9), col_l_top + Inches(0.4 + i * 0.36),
             Inches(0.3), Inches(0.3), size=12, color=COPPER, bold=True)
    add_text(s, d, Inches(7.2), col_l_top + Inches(0.42 + i * 0.36),
             Inches(5.5), Inches(0.3), size=11, color=CREAM)

# ============================================================
# SLIDE 13 — WHY THIS STACK (design rationale)
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 13, TOTAL)
add_kicker(s, "12 · Design Rationale", Inches(0.5), Inches(1.1))
add_rule(s, Inches(0.5), Inches(1.45), Inches(0.5))
add_text(s, "Why this stack, not another.", Inches(0.5), Inches(1.65),
         Inches(12), Inches(1), size=36, color=CREAM, font="Fraunces")

reasons = [
    ("REACT + TAILWIND", "Ships fast, keeps a strong design system without fighting the framework. shadcn gives us accessible primitives without a heavy library lock-in."),
    ("FASTAPI + PYDANTIC", "Type-safe request/response models, async by default, WebSocket-ready — same language as the ML side, so no serialization layer between them."),
    ("PYTORCH (BILSTM + TRANSFORMER)", "Landmark tensors need sequence models, not CNNs. LSTM = fast baseline. Transformer = higher ceiling. A/B via a header lets us swap without redeploy."),
    ("MEDIAPIPE (BROWSER-SIDE)", "Landmarks extracted locally means no raw video ever leaves the browser. That's not a feature — it's the privacy story."),
    ("GEMINI 3 FLASH", "Small, fast, cheap. Gloss → English is a low-token task; we don't need GPT-scale. Rule fallback keeps the app alive when quota hits."),
    ("INCLUDE-50", "Right size for the app's vocabulary. Kaggle-packaged so no split-archive pain. Fits on a laptop. Trains in an hour."),
]
for i, (k, b) in enumerate(reasons):
    row = i // 2; col = i % 2
    left = Inches(0.5 + col * 6.35)
    top = Inches(2.7 + row * 1.55)
    add_card(s, left, top, Inches(6.1), Inches(1.4))
    add_text(s, k, left + Inches(0.3), top + Inches(0.2),
             Inches(5), Inches(0.3), size=9, color=COPPER,
             tracking=400, bold=True)
    add_text(s, b, left + Inches(0.3), top + Inches(0.55),
             Inches(5.7), Inches(0.8), size=11, color=CREAM)

# ============================================================
# SLIDE 14 — CLOSING
# ============================================================
s = prs.slides.add_slide(BLANK); add_bg(s); add_running_logo(s); add_page_number(s, 14, TOTAL)

add_kicker(s, "Thank you", Inches(0.9), Inches(2.6))
add_rule(s, Inches(0.9), Inches(2.95), Inches(0.5))
add_text(s, "Every gesture,", Inches(0.9), Inches(3.2), Inches(12), Inches(1.1),
         size=64, color=CREAM, font="Fraunces")
add_text(s, "heard.", Inches(5.35), Inches(3.2), Inches(6), Inches(1.1),
         size=64, color=COPPER, font="Fraunces", italic=True)

add_text(s, "Silent Voice · Indian Sign Language ↔ English translator.",
         Inches(0.9), Inches(4.55), Inches(11), Inches(0.4),
         size=14, color=CREAM_DIM)

# footer three-col again
add_text(s, "REPO", Inches(0.9), Inches(6.4), Inches(2), Inches(0.25),
         size=9, color=CREAM_DIM, tracking=400, bold=True)
add_text(s, "/app", Inches(0.9), Inches(6.65), Inches(4), Inches(0.3),
         size=11, color=CREAM, font="JetBrains Mono")

add_text(s, "DATASET", Inches(5.2), Inches(6.4), Inches(3), Inches(0.25),
         size=9, color=CREAM_DIM, tracking=400, bold=True)
add_text(s, "kaggle.com/datasets/yuvrajjoshi1110/include-50",
         Inches(5.2), Inches(6.65), Inches(8), Inches(0.3),
         size=11, color=CYAN, font="JetBrains Mono")

# save
out_path = "/app/Silent_Voice_Deck.pptx"
prs.save(out_path)
print(f"✓ deck written to {out_path}")
print(f"  {len(prs.slides)} slides")
