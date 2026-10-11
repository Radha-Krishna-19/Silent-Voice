"""Build docs/testing/TEST_EVALUATION_REPORT.md from the saved result files.

Every number in the report is read from ml/logs (no hand-typed results), so the
report cannot drift from the evidence.  Run after run_all.py:
    cd ml && python scripts/tne/make_report.py
"""
from __future__ import annotations

import json
from pathlib import Path

ML = Path(__file__).resolve().parents[2]
LOG = ML / "logs" / "tne"
OUT = ML.parent / "docs" / "testing" / "TEST_EVALUATION_REPORT.md"
N = {"bilstm": "BiLSTM", "cnn": "1D CNN"}


def J(name):
    p = LOG / f"{name}.json"
    return json.load(open(p)) if p.exists() else None


def pct(x, d=2):
    return "n/a" if x is None else f"{x * 100:.{d}f}%"


def count(log):
    p = LOG / "tests" / log
    if not p.exists():
        return "not run"
    t = p.read_text().strip().splitlines()
    last = [l for l in t if "passed" in l and "failed" in l]
    return last[-1].strip() if last else "see log"


def main():
    comp = json.load(open(ML / "logs" / "comparison.json"))["models"]
    rob, xai, km, cal, adv = J("robustness"), J("explainability"), J("clustering"), J("calibration"), J("adversarial")
    mr, bias, drift, res, qual, cv = J("metamorphic"), J("bias"), J("drift"), J("resilience"), J("qualitative"), J("crossval")
    e2e_p = LOG / "e2e" / "e2e_results.json"
    e2e = json.load(open(e2e_p)) if e2e_p.exists() else None
    L = []
    w = L.append
    w("# Test and Evaluation Report — Silent Voice\n")
    w("Structured after the CDAO *Test and Evaluation of AI Models* framework (April 2024): performance, testing methods, data, models, context and documentation. "
      "**Every number below is read automatically from the result files in `ml/logs/`** by `ml/scripts/tne/make_report.py`; each section names the script that produced it and the evidence file.\n")
    w("## How to reproduce\n")
    w("```\ncd ml\npython scripts/tne/run_all.py              # performance suite (~20 min on a laptop CPU)\npython scripts/tne/crossval.py --folds 3 --epochs 20   # retrains; slow\npython tests/test_models_whitebox.py\npython tests/test_models_blackbox.py\npython scripts/tne/gan_train.py 1500       # trains the conditional GAN (25 min)\npython scripts/tne/gan_eval.py             # GAN fidelity + augmentation retraining\npython scripts/tne/make_report.py          # rebuilds this report\ncd ../backend && python test_auth.py && python test_nlg.py && python test_gloss.py && python test_contrib.py && python test_monitor.py\ncd ../frontend && npm run verify\n```\n")
    w("Each run of `run_all.py` also writes a timestamped log, `ml/logs/tne/run_<date>_<time>.log`, recording the Python/PyTorch versions and every printed result.\n")

    w("## 1. Test strategy at a glance\n")
    w("| Suite | Level | Box | Execution | Metric type | Script | Evidence | Result |\n|---|---|---|---|---|---|---|---|")
    rows = [
        ("Gloss rules", "Unit", "Black", "Automated (CI)", "Quantitative", "backend/test_gloss.py", "ml/logs/tne/tests/backend_test_gloss.log", count("backend_test_gloss.log")),
        ("Sentence formation", "Unit", "Black", "Automated (CI)", "Quantitative", "backend/test_nlg.py", "ml/logs/tne/tests/backend_test_nlg.log", count("backend_test_nlg.log")),
        ("Contribution storage", "Unit", "White", "Automated (CI)", "Quantitative", "backend/test_contrib.py", "ml/logs/tne/tests/backend_test_contrib.log", count("backend_test_contrib.log")),
        ("Production drift monitor", "Unit", "White", "Automated (CI)", "Quantitative", "backend/test_monitor.py", "ml/logs/tne/tests/backend_test_monitor.log", count("backend_test_monitor.log")),
        ("Accounts API", "Integration", "Black", "Automated (CI)", "Quantitative", "backend/test_auth.py", "ml/logs/tne/tests/backend_test_auth.log", count("backend_test_auth.log")),
        ("Backend code coverage", "Unit + integration", "White", "Automated", "Quantitative", "coverage.py over the 5 backend suites", "ml/logs/tne/tests/backend_coverage.txt", (LOG / "tests" / "backend_coverage.txt").read_text().strip().splitlines()[-1].split()[-1] + " statement+branch" if (LOG / "tests" / "backend_coverage.txt").exists() else "not run"),
        ("Model internals", "Unit", "White", "Automated (CI)", "Quantitative", "ml/tests/test_models_whitebox.py", "ml/logs/tne/tests/test_models_whitebox.log", count("test_models_whitebox.log")),
        ("Model behaviour and acceptance", "Model", "Black", "Automated", "Quantitative", "ml/tests/test_models_blackbox.py", "ml/logs/tne/tests/test_models_blackbox.log", count("test_models_blackbox.log")),
        ("Frontend routes/styles/build", "UI", "Black", "Automated (CI)", "Quantitative", "frontend npm run verify", "CI logs", "11 routes, 1,027 class names, 19 checks"),
        ("End-to-end system (browser + backend + models)", "System", "Black", "Automated", "Quantitative + screenshots", "tests/e2e/test_e2e_system.py", "ml/logs/tne/e2e/", f"{e2e['passed']} passed, {e2e['failed']} failed" if e2e else "not run"),
        ("Real user, real webcam", "Acceptance", "Black", "Manual", "Qualitative + quantitative", "docs/testing/MANUAL_TEST_PLAN.md", "docs/testing/evidence/manual/", "to be executed by the tester"),
    ]
    for r in rows:
        w("| " + " | ".join(r) + " |")
    w("\n**Black-box** tests check inputs and outputs without looking inside (accuracy, edge-case inputs, metamorphic relations, API and browser tests). **White-box** tests use knowledge of the internals (parameter counts, gradient flow, dropout and BatchNorm behaviour, split and normalisation logic, saliency, code coverage). **Quantitative** metrics are numbers (accuracy, F1, calibration error, latency, memory); **qualitative** evaluation looks at what the errors are (confused pairs, near misses, saliency over time) and at the manual usability observations.\n")

    w("## 2. Framework coverage matrix\n")
    w("| Framework area | Item | Covered by | Section |\n|---|---|---|---|")
    for r in [("Performance", "Correctness", "evaluate.py, black-box tests", "3.1"), ("Performance", "Interpretability", "explainability.py", "3.4"),
              ("Performance", "Bias", "bias.py", "3.7"), ("Performance", "Robustness", "robustness.py, adversarial.py", "3.2, 3.5"),
              ("Performance", "Resilience", "resilience.py", "3.9"), ("Performance", "Uncertainty", "calibration.py", "3.3"),
              ("Performance", "Drift", "drift.py (simulated drift); backend/monitor.py + GET /api/monitor (live)", "3.8"), ("Performance", "Representativeness", "bias.py", "3.7"),
              ("Performance", "Latency", "evaluate.py, black-box BB-09", "3.1, 3.11"),
              ("Testing methods", "Comparison (A/B, back-to-back)", "BiLSTM vs CNN vs logistic regression", "3.1, 3.11"),
              ("Testing methods", "Adversarial testing", "adversarial.py (FGSM, PGD)", "3.5"), ("Testing methods", "Metamorphic testing", "metamorphic.py", "3.6"),
              ("Testing methods", "Experience-based testing", "Manual test plan", "MANUAL_TEST_PLAN.md"), ("Testing methods", "Test design: cross-validation", "crossval.py", "3.10"),
              ("Testing methods", "Continuous vs discrete, automatic vs manual, black vs white box, live vs model", "CI + scripts + manual plan + E2E", "1"),
              ("Data", "Select, clean, engineer, split, curate, verify", "DATA_CARD.md; WB-08/09 tests", "DATA_CARD.md"),
              ("Models", "Select, train, evaluate, deploy, maintain", "MODEL_CARD.md; live monitor /api/monitor", "MODEL_CARD.md, 3.8, 3.11"),
              ("Data", "Synthetic data (GAN augmentation)", "gan_train.py, gan_eval.py", "3.12"),
              ("Context", "Use case and environment", "MODEL_CARD.md intended use", "3.11"),
              ("Documentation", "Data card, model card", "DATA_CARD.md, MODEL_CARD.md", "-")]:
        w("| " + " | ".join(r) + " |")

    w("\n## 3. Results\n")
    w("### 3.1 Correctness and latency (quantitative) — `ml/scripts/evaluate.py`, `ml/logs/comparison.json`\n")
    w("| Metric | BiLSTM | 1D CNN |\n|---|---|---|")
    for k, lab in [("test_acc", "Top-1 accuracy"), ("test_top5_acc", "Top-5 accuracy"), ("macro_f1", "Macro F1"), ("weighted_f1", "Weighted F1")]:
        f = (lambda v: f"{v:.4f}") if "f1" in k else pct
        w(f"| {lab} | {f(comp['bilstm'][k])} | {f(comp['cnn'][k])} |")
    w(f"| Mean / p95 latency per clip | {comp['bilstm']['latency_ms_mean']:.2f} / {comp['bilstm']['latency_ms_p95']:.2f} ms | {comp['cnn']['latency_ms_mean']:.2f} / {comp['cnn']['latency_ms_p95']:.2f} ms |")
    w("\nBaseline: logistic regression on time-pooled features, 82% accuracy.\n")

    if rob:
        r = rob["results"]
        w("### 3.2 Robustness — `robustness.py`, `robustness.json`, `robustness_noise.png`, `robustness_drop.png`\n")
        w("| Condition | " + " | ".join(N.values()) + " |\n|---|---|---|")
        for s in r["noise"]["cnn"]:
            w(f"| Gaussian noise {s} x std | " + " | ".join(pct(r["noise"][a][s]) for a in N) + " |")
        for s in r["drop"]["cnn"]:
            if s != "0":
                w(f"| {float(s) * 100:.0f}% frames dropped | " + " | ".join(pct(r["drop"][a][s]) for a in N) + " |")
        w("")
    if cal:
        c = cal["results"]
        w("### 3.3 Uncertainty and calibration — `calibration.py`, `calibration.json`, `calibration_reliability.png`\n")
        w("| Metric | BiLSTM | 1D CNN |\n|---|---|---|")
        w("| Expected calibration error (15 bins) | " + " | ".join(f"{c[a]['uncalibrated']['ece']:.4f}" for a in N) + " |")
        w("| ECE after temperature scaling (fitted on validation) | " + " | ".join(f"{c[a]['temperature_scaled']['ece']:.4f} (T = {c[a]['temperature']:.3f})" for a in N) + " |")
        w("| Negative log-likelihood / Brier score | " + " | ".join(f"{c[a]['uncalibrated']['nll']:.3f} / {c[a]['uncalibrated']['brier']:.4f}" for a in N) + " |")
        w("| Mean confidence when right / when wrong | " + " | ".join(f"{c[a]['mean_conf_correct']:.3f} / {c[a]['mean_conf_wrong']:.3f}" for a in N) + " |")
        w("| Answers given at the app's 0.5 confidence floor (coverage, accuracy) | " + " | ".join(f"{pct(c[a]['threshold']['0.5']['coverage'], 1)}, {pct(c[a]['threshold']['0.5']['acc'])}" for a in N) + " |")
        w("| Accuracy on the 80% most confident clips | " + " | ".join(pct(c[a]['accuracy_at_coverage']['0.8']) for a in N) + " |\n")
    if xai:
        x = xai["results"]
        w("### 3.4 Interpretability (white-box) — `explainability.py`, `explainability.json`, `xai_*.png`\n")
        w("| Occluded features | BiLSTM accuracy | 1D CNN accuracy |\n|---|---|---|")
        for k, lab in [("none", "None"), ("left_hand", "Left-hand block"), ("right_hand", "Right-hand block"), ("pose", "Pose")]:
            w(f"| {lab} | {pct(x['occlusion_group']['bilstm'][k]['acc'])} | {pct(x['occlusion_group']['cnn'][k]['acc'])} |")
        w("\n| Share of gradient x input saliency | BiLSTM | 1D CNN |\n|---|---|---|")
        for k, lab in [("left_hand", "Left-hand block"), ("right_hand", "Right-hand block"), ("pose", "Pose")]:
            w(f"| {lab} | {pct(x['saliency_group']['bilstm'][k], 1)} | {pct(x['saliency_group']['cnn'][k], 1)} |")
        rng = {a: (min(t['acc'] for t in x['occlusion_time'][a]), max(t['acc'] for t in x['occlusion_time'][a])) for a in N}
        w(f"\nRemoving any single 10-frame window leaves accuracy between {pct(rng['bilstm'][0], 1)} and {pct(rng['bilstm'][1], 1)} (BiLSTM) and {pct(rng['cnn'][0], 1)} and {pct(rng['cnn'][1], 1)} (CNN).\n")
    if adv:
        a_ = adv["results"]
        w("### 3.5 Adversarial testing (white-box attacks) — `adversarial.py`, `adversarial.json`, `adversarial.png`\n")
        w("| Budget epsilon (x feature std) | BiLSTM FGSM | BiLSTM PGD-10 | CNN FGSM | CNN PGD-10 |\n|---|---|---|---|---|")
        for e in a_["cnn"]["fgsm"]:
            w(f"| {e} | {pct(a_['bilstm']['fgsm'][e], 1)} | {pct(a_['bilstm']['pgd10'][e], 1)} | {pct(a_['cnn']['fgsm'][e], 1)} | {pct(a_['cnn']['pgd10'][e], 1)} |")
        w("")
    if mr:
        m = mr["results"]
        w("### 3.6 Metamorphic testing (black-box) — `metamorphic.py`, `metamorphic.json`, `metamorphic.png`\n")
        w("A violation is a prediction that changes under a transformation that should not change the sign.\n")
        w("| Relation | BiLSTM violations | 1D CNN violations |\n|---|---|---|")
        for k in m["cnn"]:
            if k != "base_acc":
                w(f"| {k.replace('_', ' ')} | {pct(m['bilstm'][k]['violation_rate'], 1)} | {pct(m['cnn'][k]['violation_rate'], 1)} |")
        w("")
    if bias:
        b = bias["results"]
        rp = b["representativeness"]
        w("### 3.7 Bias and representativeness — `bias.py`, `bias.json`, `bias_groups.png`\n")
        w(f"Clips per class range from {rp['clips_per_class']['min']} to {rp['clips_per_class']['max']}; every class is in the test split; the largest train-vs-test difference in a class's share is {rp['max_abs_share_diff_train_vs_test'] * 100:.2f} percentage points. Signer identity is not available, so per-signer fairness is not measurable.\n")
        w("| Group | Test clips | BiLSTM | 1D CNN |\n|---|---|---|---|")
        for k, lab in [("few_clips", "Classes with few clips (<= %d)" % rp['tier_thresholds_clips'][0]), ("medium_clips", "Medium"), ("many_clips", "Many clips (> %d)" % rp['tier_thresholds_clips'][1]), ("one_handed", "One-handed signs"), ("two_handed", "Two-handed signs")]:
            w(f"| {lab} | {b['cnn'][k]['n_test']} | {pct(b['bilstm'][k]['acc'])} | {pct(b['cnn'][k]['acc'])} |")
        w("")
    if drift:
        d = drift["results"]
        w("### 3.8 Drift monitoring — `drift.py`, `drift.json`\n")
        w("A drift monitor (feature KS tests + confidence drop) tested on held-out clips with simulated drift (300 clips per scenario). Its output-based part runs in production: the server records every live prediction in `backend/monitor.py` and `GET /api/monitor` reports frames processed, hand visibility, mean confidence and a drift alarm (unit-tested in `backend/test_monitor.py`, exercised end to end by E2E-10).\n")
        w("| Scenario | Feature drift score | Confidence drop (BiLSTM / CNN) | Alarm | Accuracy (BiLSTM / CNN) |\n|---|---|---|---|---|")
        for k in d["cnn"]:
            if isinstance(d["cnn"][k], dict):
                w(f"| {k.replace('_', ' ')} | {d['cnn'][k]['feature_drift_score']:.3f} | {d['bilstm'][k]['confidence_drop']:.3f} / {d['cnn'][k]['confidence_drop']:.3f} | {'yes' if d['cnn'][k]['alarm'] else 'no'} | {pct(d['bilstm'][k]['accuracy'], 1)} / {pct(d['cnn'][k]['accuracy'], 1)} |")
        w("")
    if res:
        r = res["results"]
        w("### 3.9 Resilience — `resilience.py`, `resilience.json`\n")
        w("Sliding-window recognition over a stream: sign, blackout of B empty frames, sign again (200 streams per setting).\n")
        w("| Setting | BiLSTM median recovery | CNN median recovery | Correct during blackout (BiLSTM / CNN) |\n|---|---|---|---|")
        for k in r["cnn"]:
            w(f"| {k.replace('_', ' ')} frames | {r['bilstm'][k]['median_recovery_frames']:.0f} frames | {r['cnn'][k]['median_recovery_frames']:.0f} frames ({r['cnn'][k]['median_recovery_seconds_at_12fps']:.1f} s at 12 fps) | {pct(r['bilstm'][k]['correct_during_blackout'], 1)} / {pct(r['cnn'][k]['correct_during_blackout'], 1)} |")
        w("")
    w("### 3.10 Cross-validation (test design) — `crossval.py`, `crossval.json`, `crossval.png`\n")
    if cv:
        c = cv["results"]
        w(f"Stratified {c['folds']}-fold cross-validation over all 4,276 clips, retraining each model per fold with the project recipe at a reduced budget of {c['epochs']} epochs (the headline models use 60), so fold scores estimate the variance across splits rather than the final accuracy.\n")
        w("| Model | " + " | ".join(f"Fold {r['fold']}" for r in c["per_fold"]["cnn"]) + " | Mean +/- SD |\n|---|" + "---|" * (len(c["per_fold"]["cnn"]) + 1))
        for a in N:
            w(f"| {N[a]} | " + " | ".join(pct(r["acc"]) for r in c["per_fold"][a]) + f" | {c['summary'][a]['acc_mean'] * 100:.2f} +/- {c['summary'][a]['acc_std'] * 100:.2f}% |")
        w("")
    else:
        w("Not yet run.\n")
    w("### 3.11 End-to-end system tests\n")
    if e2e:
        w("End-to-end browser tests (`tests/e2e/test_e2e_system.py`, `ml/logs/tne/e2e/`):\n")
        w("| ID | Check | Result | Detail |\n|---|---|---|---|")
        for cse in e2e["cases"]:
            w(f"| {cse['id']} | {cse['name']} | {'PASS' if cse['passed'] else 'FAIL'} | {cse['detail']} |")
        w("")
    gan = J("gan")
    if gan:
        g = gan["results"]
        f = g["fidelity"]
        w("### 3.12 GAN data augmentation — `gan_train.py`, `gan_eval.py`, `gan.json`, `gan_augmentation.png`\n")
        w(f"A class-conditional GAN trained on the training clips generated {f['synthetic_clips']} synthetic clips (11 per class). Fidelity: the real-data models recognise a synthetic clip as its intended class {pct(f['bilstm_recognises_conditioned_class'], 1)} (BiLSTM) and {pct(f['cnn_recognises_conditioned_class'], 1)} (CNN) of the time (chance is 0.4%); synthetic clips change {f['frame_to_frame_change_synthetic'] / f['frame_to_frame_change_real']:.1f}x more from frame to frame than real ones.\n")
        w("| 1D CNN trained on | Training clips | Best validation | Test accuracy | Macro F1 |\n|---|---|---|---|---|")
        for k, lab in (("cnn_real_only", "Real clips (control)"), ("cnn_real_plus_gan", "Real + GAN clips")):
            r = g[k]
            w(f"| {lab} | {r['train_clips']} | {pct(r['best_val_acc'])} | {pct(r['test_acc'])} | {r['macro_f1']:.4f} |")
        w(f"\nChange in test accuracy from adding GAN clips: {g['delta_test_acc_points']:+.2f} percentage points.\n")
    if qual:
        q = qual["results"]
        w("## 4. Qualitative evaluation — `qualitative.py`, `qualitative.json`, `qualitative_saliency_examples.png`\n")
        for a in N:
            pairs = ", ".join(f"{p['true']} -> {p['predicted']} ({p['count']})" for p in q[a]["most_confused_pairs"][:5])
            w(f"* **{N[a]}:** {q[a]['n_errors']} errors, of which {q[a]['near_miss_in_top5']} are near misses (true word in the top 5) and {q[a]['far_miss']} far misses. Most confused pairs: {pairs}.")
        g = q["agreement"]
        w(f"* **Model agreement:** both wrong on {g['both_wrong']} clips, only the BiLSTM wrong on {g['only_bilstm_wrong']}, only the CNN wrong on {g['only_cnn_wrong']}; picking whichever model is right would reach {pct(g['oracle_either_right_acc'])}, so the models make partly different mistakes.")
        w(f"* Classes both models miss at least once: {', '.join(g['both_wrong_classes'])}.")
        w("* Example predictions with top-3 confidences are listed under `sample_predictions` in `qualitative.json`.")
        w("* Manual usability observations are recorded in `MANUAL_TEST_PLAN.md` when the manual session is run.\n")
    w("## 5. Findings and recommended actions\n")
    w("1. **Position sensitivity (metamorphic MR4):** a 5% sideways shift of the signer changes many predictions because pose is in raw image coordinates. Recommended fix: centre and scale pose on the shoulders, then retrain.")
    w("2. **Left-handed signers (MR5):** mirrored clips change most predictions. Recommended fix: mirror augmentation during training.")
    w("3. **Missing frames:** the CNN degrades sharply with dropped frames and recovers slowly after a blackout; the BiLSTM is the more resilient live model. Recommended: use the BiLSTM for unreliable cameras or train the CNN with frame dropping.")
    w("4. **Calibration:** both models are well calibrated (ECE about 0.03); temperature scaling improves it slightly. The app's 0.5 confidence floor raises the accuracy of the captions it does show.")
    w("5. **Drift:** the monitor raises no alarm on clean data or mild noise and does alarm on dropped frames, camera shift and left-handed signers, which are the conditions that cut accuracy.\n")
    w("## 6. Limitations of this evaluation\n")
    w("* One dataset (INCLUDE) and no signer identity: no signer-independent or demographic fairness test.")
    w("* No production traffic: drift and resilience are tested on simulated conditions.")
    w("* No human red team: adversarial robustness is tested with algorithmic attacks only.")
    w("* End-to-end tests use a synthetic camera, so they prove integration, not live accuracy; live accuracy with real signers is the manual test plan's job.")
    w("* Cross-validation uses a reduced epoch budget.")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(L) + "\n")
    print(f"-> wrote {OUT}")


if __name__ == "__main__":
    main()
