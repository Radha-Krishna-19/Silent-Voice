"""Build a single self-contained results page from the training logs.

    cd ml
    python scripts/make_report.py
    # -> logs/report.html   (open in any browser, no server needed)

Everything is inlined — confusion-matrix PNGs are base64-embedded — so the file
can be emailed, put on a USB stick, or opened on a machine with no Python.
This is the "model rigour" half of the demo and it cannot fail live.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

LOG_DIR = Path("logs")
PRETTY = {"bilstm": "BiLSTM", "cnn": "1D-CNN (baseline)", "transformer": "Transformer"}

# Sign groups worth calling out: near-identical handshape, differing only in the
# direction/order of movement. This is where a recurrent model should beat a CNN.
TEMPORAL_GROUPS = {
    "Time triple (movement direction is the only cue)": ["today", "tomorrow", "yesterday"],
    "Face-location pair": ["mother", "father"],
    "Pointing pair (direction only)": ["i", "you"],
    "Semantic neighbours (control)": ["sick", "hospital", "medicine"],
}


def b64(path: Path) -> str | None:
    if not path.exists():
        return None
    return base64.b64encode(path.read_bytes()).decode("ascii")


def curve_svg(histories: dict[str, dict], key: str, title: str, ylabel: str) -> str:
    """Hand-rolled SVG line chart — no matplotlib dependency at report time."""
    series = {a: [e[key] for e in h.get("history", [])] for a, h in histories.items()}
    series = {a: v for a, v in series.items() if v}
    if not series:
        return ""

    W, H, PAD = 620, 260, 46
    max_ep = max(len(v) for v in series.values())
    lo = min(min(v) for v in series.values())
    hi = max(max(v) for v in series.values())
    if hi - lo < 1e-9:
        hi = lo + 1.0
    colors = {"bilstm": "#6EE7F2", "cnn": "#C97B4A", "transformer": "#9d7bff"}

    def pt(i: int, val: float, n: int) -> tuple[float, float]:
        x = PAD + (W - PAD - 12) * (i / max(n - 1, 1))
        y = H - PAD - (H - 2 * PAD) * ((val - lo) / (hi - lo))
        return x, y

    parts = [f'<svg viewBox="0 0 {W} {H}" class="chart">']
    parts.append(f'<text x="{W/2}" y="16" class="ct">{title}</text>')
    for g in range(5):
        y = PAD + (H - 2 * PAD) * g / 4
        val = hi - (hi - lo) * g / 4
        parts.append(f'<line x1="{PAD}" y1="{y}" x2="{W-12}" y2="{y}" class="grid"/>')
        parts.append(f'<text x="{PAD-6}" y="{y+3}" class="ax" text-anchor="end">{val:.2f}</text>')
    parts.append(f'<text x="{W/2}" y="{H-8}" class="ax" text-anchor="middle">epoch (max {max_ep})</text>')
    parts.append(f'<text x="12" y="{PAD-14}" class="ax">{ylabel}</text>')

    for arch, vals in series.items():
        pts = [pt(i, v, len(vals)) for i, v in enumerate(vals)]
        d = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(pts))
        parts.append(f'<path d="{d}" fill="none" stroke="{colors.get(arch, "#888")}" stroke-width="2"/>')

    for i, arch in enumerate(series):
        x = PAD + i * 130
        parts.append(f'<rect x="{x}" y="{H-30}" width="10" height="10" fill="{colors.get(arch,"#888")}"/>')
        parts.append(f'<text x="{x+15}" y="{H-21}" class="ax">{PRETTY.get(arch, arch)}</text>')

    parts.append("</svg>")
    return "".join(parts)


def main() -> None:
    comp_path = LOG_DIR / "comparison.json"
    if not comp_path.exists():
        raise SystemExit("logs/comparison.json missing — run scripts/evaluate.py first")

    comp = json.loads(comp_path.read_text())
    models: dict[str, dict] = comp["models"]
    labels: list[str] = comp["labels"]
    if not models:
        raise SystemExit("no models in comparison.json — did training produce checkpoints?")

    histories = {}
    for arch in models:
        p = LOG_DIR / f"{arch}_history.json"
        if p.exists():
            histories[arch] = json.loads(p.read_text())

    topk_key = next((k for k in list(models.values())[0] if k.startswith("test_top")), None)
    best = max(models.items(), key=lambda kv: kv[1]["test_acc"])[0]
    chance = 1.0 / max(len(labels), 1)

    # ---- headline table
    rows = []
    for arch, r in models.items():
        tt = f"{r['train_wall_seconds']/60:.1f} min" if r.get("train_wall_seconds") else "—"
        win = ' class="win"' if arch == best else ""
        topk_cell = f"{r[topk_key]*100:.1f}%" if topk_key else "—"
        rows.append(
            f"<tr{win}>"
            f"<td><b>{r['name']}</b></td>"
            f"<td>{r['test_acc']*100:.1f}%</td>"
            f"<td>{topk_cell}</td>"
            f"<td>{r['macro_f1']:.3f}</td>"
            f"<td>{r['params']:,}</td>"
            f"<td>{r['latency_ms_mean']:.2f}</td>"
            f"<td>{tt}</td>"
            f"</tr>"
        )

    # ---- temporal-group analysis: the BiLSTM-vs-CNN argument, with numbers
    group_html = []
    for title, words in TEMPORAL_GROUPS.items():
        present = [w for w in words if w in labels]
        if len(present) < 2:
            continue
        cells = []
        for arch, r in models.items():
            f1s = [r["per_class_f1"][w] for w in present]
            avg = sum(f1s) / len(f1s)
            delta = avg - r["macro_f1"]
            sign = "pos" if delta >= 0 else "neg"
            cells.append(
                f"<td><b>{avg:.3f}</b><span class='{sign}'> "
                f"{delta:+.3f} vs its own macro-F1</span></td>")
        group_html.append(
            f"<tr><td>{title}<br><span class='mono'>{' · '.join(present)}</span></td>"
            + "".join(cells) + "</tr>")

    # ---- weakest classes
    weak_html = []
    for arch, r in models.items():
        worst = sorted(r["per_class_f1"].items(), key=lambda kv: kv[1])[:8]
        chips = " ".join(f"<span class='chip'>{w} <b>{v:.2f}</b></span>" for w, v in worst)
        weak_html.append(f"<div class='weak'><h4>{r['name']}</h4>{chips}</div>")

    # ---- confusion matrices
    cms = []
    for arch in models:
        img = b64(LOG_DIR / f"confusion_{arch}.png")
        if img:
            cms.append(f"<figure><img src='data:image/png;base64,{img}' alt='confusion {arch}'>"
                       f"<figcaption>{models[arch]['name']}</figcaption></figure>")

    acc_curve = curve_svg(histories, "val_acc", "Validation accuracy per epoch", "val acc")
    loss_curve = curve_svg(histories, "train_loss", "Training loss per epoch", "loss")

    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Silent Voice — model comparison</title>
<style>
:root{{--ink:#0B0B0D;--cream:#F2ECE0;--cyan:#6EE7F2;--copper:#C97B4A;--dim:#8b8b93}}
*{{box-sizing:border-box}}
body{{margin:0;padding:48px 32px;background:var(--ink);color:var(--cream);
 font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif}}
.wrap{{max-width:1080px;margin:0 auto}}
h1{{font-size:30px;margin:0 0 6px;letter-spacing:-.02em}}
h2{{font-size:19px;margin:44px 0 12px;color:var(--cyan);letter-spacing:-.01em}}
h4{{margin:0 0 8px;font-size:13px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em}}
.sub{{color:var(--dim);margin:0 0 8px}}
table{{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}}
th,td{{padding:10px 12px;text-align:left;border-bottom:1px solid #24242b;vertical-align:top}}
th{{color:var(--dim);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:.08em}}
tr.win td{{background:rgba(110,231,242,.07)}}
tr.win td:first-child{{box-shadow:inset 3px 0 0 var(--cyan)}}
.pos{{color:var(--cyan);font-size:12px}} .neg{{color:var(--copper);font-size:12px}}
.mono{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--dim)}}
.chip{{display:inline-block;background:#17171c;border:1px solid #2a2a33;border-radius:999px;
 padding:3px 10px;margin:0 5px 6px 0;font-size:12px}}
.weak{{margin:16px 0}}
.cards{{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}}
.card{{flex:1;min-width:150px;background:#131318;border:1px solid #24242b;border-radius:10px;padding:16px}}
.card .n{{font-size:26px;font-weight:600;color:var(--cyan)}}
.card .l{{font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.07em}}
figure{{margin:0;flex:1;min-width:300px}} figure img{{width:100%;border-radius:8px;background:#fff}}
figcaption{{font-size:12px;color:var(--dim);text-align:center;margin-top:6px}}
.row{{display:flex;gap:18px;flex-wrap:wrap}}
.chart{{width:100%;max-width:620px;background:#131318;border:1px solid #24242b;border-radius:10px}}
.grid{{stroke:#24242b;stroke-width:1}}
.ax{{fill:#8b8b93;font-size:10px}} .ct{{fill:#F2ECE0;font-size:12px;text-anchor:middle}}
.note{{background:#131318;border-left:3px solid var(--copper);padding:14px 18px;
 border-radius:0 8px 8px 0;margin:16px 0;font-size:14px}}
</style></head><body><div class="wrap">

<h1>Silent Voice — forward translation</h1>
<p class="sub">Isolated Indian Sign Language recognition · INCLUDE dataset ·
MediaPipe Holistic skeletons → sequence classifier</p>

<div class="cards">
  <div class="card"><div class="n">{len(labels)}</div><div class="l">classes</div></div>
  <div class="card"><div class="n">{comp['n_test']}</div><div class="l">held-out test clips</div></div>
  <div class="card"><div class="n">{chance*100:.1f}%</div><div class="l">chance accuracy</div></div>
  <div class="card"><div class="n">{models[best]['test_acc']*100:.1f}%</div><div class="l">best ({models[best]['name']})</div></div>
</div>

<h2>Comparison</h2>
<table><thead><tr><th>Model</th><th>Test acc</th><th>Top-5 acc</th><th>Macro F1</th>
<th>Params</th><th>Latency (ms)</th><th>Train time</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>

<div class="note">
<b>Why these three are comparable.</b> Identical stratified 70/15/15 split (seed 42),
identical train-only normalisation statistics, identical augmentation, identical
optimiser and epoch budget. The architecture is the only variable. The CNN has no
recurrent state — its receptive field spans roughly 29 of the 60 frames — so the gap
between it and the BiLSTM is a direct measurement of what long-range temporal
modelling is worth on isolated signs.
</div>

<h2>Where temporal modelling should matter</h2>
<p class="sub">Signs whose handshape is near-identical and whose meaning lives in the
<em>order and direction</em> of movement. If the BiLSTM earns its extra parameters
anywhere, it is here.</p>
<table><thead><tr><th>Sign group</th>{''.join(f'<th>{r["name"]}</th>' for r in models.values())}</tr></thead>
<tbody>{''.join(group_html) or '<tr><td colspan=9>none of these groups are in the trained vocabulary</td></tr>'}</tbody></table>

<h2>Training curves</h2>
<div class="row">{acc_curve}{loss_curve}</div>

<h2>Confusion matrices</h2>
<div class="row">{''.join(cms) or '<p class="sub">no confusion images found</p>'}</div>

<h2>Weakest classes</h2>
<p class="sub">Lowest per-class F1. These are the words to avoid in a live demo,
and the ones that most need more takes.</p>
{''.join(weak_html)}

<h2>Honest limitations</h2>
<ul>
<li>Isolated single signs only — not continuous sentence translation.</li>
<li>Trained on studio footage; a laptop webcam is a different distribution, so live
accuracy will be below the table above.</li>
<li>No facial landmarks, so ISL grammar carried by eyebrows and head movement is invisible.</li>
<li>Test clips come from the same recording sessions as training clips. A signer-disjoint
split would be a harder and more honest benchmark — the natural next experiment.</li>
</ul>

</div></body></html>"""

    out = LOG_DIR / "report.html"
    out.write_text(html, encoding="utf-8")
    print(f"OK wrote {out.resolve()}")
    print("   open it in a browser — everything is inlined, no server needed")


if __name__ == "__main__":
    main()
