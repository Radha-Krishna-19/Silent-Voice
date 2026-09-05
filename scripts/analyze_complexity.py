"""Derive parameter counts, time and space complexity for both architectures.

    python scripts/analyze_complexity.py

Rubric row 6(d) asks for time and space complexity. Rather than assert big-O
from memory, this derives the counts from the layer shapes declared in
ml/scripts/models.py and then CHECKS the parameter totals against the numbers
in ml/logs/comparison.json, which came from torch counting real tensors after a
real training run. If the derivation is wrong, the assertion at the bottom
fails and nothing is written.

Writes ml/logs/complexity.json so the deck builder and the web UI read the same
numbers.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGS = ROOT / "ml" / "logs"
OUT = LOGS / "complexity.json"

# Shapes, matching ml/scripts/models.py exactly.
T = 60            # frames in the window
F = 225           # features per frame (21+21 hand + 33 pose, xyz)
H = 256           # LSTM hidden units per direction
L = 2             # LSTM layers
W = 256           # CNN width
K = 5             # conv kernel
C = 261           # classes
HEAD_HIDDEN = 128


# --------------------------------------------------------------------------- #
# parameters
# --------------------------------------------------------------------------- #
def lstm_params(input_size: int, hidden: int) -> int:
    """One LSTM direction, one layer.

    Four gates (input, forget, cell, output). Each gate has an input-to-hidden
    matrix, a hidden-to-hidden matrix and two bias vectors (PyTorch keeps
    b_ih and b_hh separately).
    """
    return 4 * (input_size * hidden + hidden * hidden + 2 * hidden)


def head_params(in_dim: int) -> int:
    return (in_dim * HEAD_HIDDEN + HEAD_HIDDEN) + (HEAD_HIDDEN * C + C)


def bilstm_params() -> dict:
    layer1 = 2 * lstm_params(F, H)          # 2 directions
    layer2 = 2 * lstm_params(2 * H, H)      # input is both directions of layer 1
    head = head_params(2 * H)
    return {"lstm_layer1": layer1, "lstm_layer2": layer2, "head": head,
            "total": layer1 + layer2 + head}


def conv_params(cin: int, cout: int) -> int:
    return cin * cout * K + cout


def bn_params(c: int) -> int:
    return 2 * c                            # weight + bias (running stats are buffers)


def cnn_params() -> dict:
    b1 = conv_params(F, W // 2) + bn_params(W // 2)
    b2 = conv_params(W // 2, W) + bn_params(W)
    b3 = conv_params(W, W) + bn_params(W)
    head = head_params(2 * W)               # avg-pool ++ max-pool concatenated
    return {"block1": b1, "block2": b2, "block3": b3, "head": head,
            "total": b1 + b2 + b3 + head}


# --------------------------------------------------------------------------- #
# multiply-accumulate operations, one forward pass, one sample
# --------------------------------------------------------------------------- #
def bilstm_macs() -> dict:
    # Every timestep does 4 gates x (input-to-hidden + hidden-to-hidden).
    l1 = 2 * 4 * T * (F * H + H * H)
    l2 = 2 * 4 * T * (2 * H * H + H * H)
    head = 2 * H * HEAD_HIDDEN + HEAD_HIDDEN * C
    return {"lstm_layer1": l1, "lstm_layer2": l2, "head": head, "total": l1 + l2 + head}


def cnn_macs() -> dict:
    # Conv output length halves at each pool, so later blocks are cheaper even
    # though they are wider.
    b1 = T * K * F * (W // 2)               # length 60
    b2 = (T // 2) * K * (W // 2) * W        # length 30
    b3 = (T // 4) * K * W * W               # length 15
    head = 2 * W * HEAD_HIDDEN + HEAD_HIDDEN * C
    return {"block1": b1, "block2": b2, "block3": b3, "head": head,
            "total": b1 + b2 + b3 + head}


# --------------------------------------------------------------------------- #
def main() -> None:
    bp, cp = bilstm_params(), cnn_params()
    bm, cm = bilstm_macs(), cnn_macs()

    # Activation memory held for backprop, dominant terms only.
    bilstm_act = L * 2 * T * H              # both directions, every layer, every step
    cnn_act = T * (W // 2) + (T // 2) * W + (T // 4) * W

    report = {
        "shapes": {"T": T, "F": F, "H": H, "layers": L, "W": W, "K": K, "classes": C},
        "bilstm": {
            "params": bp,
            "macs": bm,
            "activations_per_sample": bilstm_act,
            "time": "O(L · T · H · (F + H))",
            "time_note": (
                "Sequential in T: timestep t cannot start until t-1 finishes, so the "
                "critical path is Θ(L·T) regardless of how many cores are available."
            ),
            "space_params": "O(L · H · (F + H))",
            "space_activations": "O(L · T · H)",
        },
        "cnn": {
            "params": cp,
            "macs": cm,
            "activations_per_sample": cnn_act,
            "time": "O(K · Σ_b T_b · C_in,b · C_out,b)",
            "time_note": (
                "Every timestep is independent, so the critical path is Θ(number of "
                "blocks) — constant in T. This is why it parallelises and the LSTM does not."
            ),
            "space_params": "O(K · W²)",
            "space_activations": "O(T · W)",
        },
        "ratios": {
            "params_bilstm_over_cnn": round(bp["total"] / cp["total"], 2),
            "macs_bilstm_over_cnn": round(bm["total"] / cm["total"], 2),
        },
    }

    # ---- check the derivation against the trained checkpoints ----------
    comp_path = LOGS / "comparison.json"
    checked = False
    if comp_path.exists():
        comp = json.loads(comp_path.read_text(encoding="utf-8"))
        # models is a dict keyed by arch: {"bilstm": {...}, "cnn": {...}}
        measured = {arch: m.get("params") for arch, m in comp.get("models", {}).items()}
        for arch, derived in (("bilstm", bp["total"]), ("cnn", cp["total"])):
            got = measured.get(arch)
            if got is None:
                print(f"  ! {arch}: no measured parameter count in comparison.json")
                continue
            status = "OK " if got == derived else "MISMATCH"
            print(f"  {status} {arch:<7} derived {derived:>10,}   torch {got:>10,}")
            assert got == derived, (
                f"{arch}: derived {derived:,} but the trained model has {got:,}. "
                "The formulas above no longer match ml/scripts/models.py."
            )
            checked = True
        report["verified_against_checkpoints"] = checked

    print()
    print(f"  BiLSTM   {bp['total']:>10,} params   {bm['total'] / 1e6:>7.1f} M MACs")
    print(f"  1-D CNN  {cp['total']:>10,} params   {cm['total'] / 1e6:>7.1f} M MACs")
    print(f"  ratio    {report['ratios']['params_bilstm_over_cnn']:>10.2f}x params  "
          f"{report['ratios']['macs_bilstm_over_cnn']:>7.2f}x MACs")

    LOGS.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n  wrote {OUT.relative_to(ROOT)}")
    if not checked:
        print("  (not verified against checkpoints — comparison.json missing entries)")


if __name__ == "__main__":
    main()
