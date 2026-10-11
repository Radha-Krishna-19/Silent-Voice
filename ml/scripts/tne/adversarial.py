"""T&E: adversarial testing (white-box attacks) — FGSM and PGD.

Worst-case perturbations of the normalised landmark inputs, bounded in the
L-infinity norm by epsilon (in units of each feature's standard deviation),
applied only to the 219 non-constant features. PGD uses 10 steps of size
epsilon/4 with a random start. This measures how fragile the decision boundary
is to deliberately crafted input changes, not to natural noise.
"""
from __future__ import annotations

import numpy as np
import torch
import torch.nn.functional as F

from common import ARCHS, COLORS, NAMES, data, load_model, norm, plt, save

EPS = [0.0, 0.01, 0.02, 0.05, 0.1, 0.2]


def attack(m, x, y, eps, steps, mask):
    if eps == 0:
        return x
    delta = (torch.rand_like(x) * 2 - 1) * eps * mask if steps > 1 else torch.zeros_like(x)
    alpha = eps if steps == 1 else eps / 4
    for _ in range(steps):
        delta.requires_grad_(True)
        loss = F.cross_entropy(m(x + delta), y)
        g, = torch.autograd.grad(loss, delta)
        delta = (delta.detach() + alpha * g.sign() * mask).clamp(-eps, eps)
    return (x + delta).detach()


def main():
    d = data()
    X, y = d["test"]
    Xn = torch.from_numpy(norm(X))
    Y = torch.from_numpy(y)
    mask = torch.from_numpy(d["live"].astype(np.float32))[None, None, :]
    torch.manual_seed(42)
    res = {}
    for a in ARCHS:
        m = load_model(a)
        res[a] = {"fgsm": {}, "pgd10": {}}
        for eps in EPS:
            for name, steps in (("fgsm", 1), ("pgd10", 10)):
                correct = 0
                for i in range(0, len(Xn), 64):
                    xa = attack(m, Xn[i:i + 64], Y[i:i + 64], eps, steps, mask)
                    with torch.no_grad():
                        correct += (m(xa).argmax(1) == Y[i:i + 64]).sum().item()
                res[a][name][str(eps)] = correct / len(Y)
            print(f"{a} eps {eps}: FGSM {res[a]['fgsm'][str(eps)]:.4f}  PGD {res[a]['pgd10'][str(eps)]:.4f}")
    p = plt()
    f, ax = p.subplots(figsize=(3.4, 1.95))
    for a in ARCHS:
        for name, ls in (("fgsm", "--"), ("pgd10", "-")):
            ax.plot(range(len(EPS)), [res[a][name][str(e)] * 100 for e in EPS], ls, marker="o", ms=3, lw=1.1, color=COLORS[a],
                    label=f"{NAMES[a]} {name.upper().replace('10', '-10')}")
    ax.set_xticks(range(len(EPS)))
    ax.set_xticklabels([str(e) for e in EPS])
    ax.set_xlabel("Attack budget epsilon (x feature std)")
    ax.set_ylabel("Test accuracy (%)")
    ax.set_ylim(0, 100)
    ax.legend(frameon=False, fontsize=6, ncol=2)
    f.tight_layout()
    f.savefig("logs/tne/adversarial.png", dpi=300)
    save("adversarial", res)
    return res


if __name__ == "__main__":
    main()
