import { motion } from "framer-motion";
import { GitCompare, Database, Cpu, Waves, MessageSquareQuote, Download, ExternalLink, AlertTriangle } from "lucide-react";
import Nav from "../components/Nav";
import { MODEL_COMPARISON, PIPELINE_STEPS, DATASET_BREAKDOWN, NLP_STEPS, DATA_WORKFLOW } from "../lib/researchData";
import useComparison, { metric } from "../hooks/useComparison";

/** Renders a measured value, or an em-dash when nothing has been measured. */
function Stat({ value, suffix, tone, label }) {
  const missing = value === null || value === undefined;
  return (
    <div>
      <div className={`font-display text-3xl ${missing ? "text-cream/25" : tone}`}>
        {missing ? "—" : value}
        {!missing && suffix ? <span className="text-lg">{suffix}</span> : null}
      </div>
      <div className="micro-caps mt-1">{label}</div>
    </div>
  );
}

export default function Research() {
  const comparison = useComparison();
  const trained = comparison.status === "ready";

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="research-page">
      <Nav />
      <main className="pt-28 pb-16 px-6 md:px-12 lg:px-24 max-w-[1400px] mx-auto">
        {/* HEADER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-20">
          <div className="lg:col-span-5">
            <div className="micro-caps mb-3">Research · Phase 3 preview</div>
            <h1 className="font-display text-4xl md:text-6xl tracking-tight leading-[1.05]">
              Two models, <span className="italic text-copper">one honest comparison.</span>
            </h1>
          </div>
          <div className="lg:col-span-7 text-cream/70 text-lg leading-relaxed space-y-4">
            <p>
              Sign recognition here operates on <span className="text-cream">landmark tensors</span>, not pixels &mdash; a clip becomes a 60&times;225 array of joint coordinates. The architectural question is therefore how best to read the <span className="text-cream">time axis</span> of that array.
            </p>
            <p>
              Two answers, trained on identical inputs and identical splits: <span className="text-cream">recurrence</span> (BiLSTM) and <span className="text-cream">convolution</span> (1D CNN). Neither sees raw video. Only the architecture differs, so any gap between them is attributable to that choice alone.
            </p>
          </div>
        </div>

        {/* TRAINING STATE BANNER — the page must never imply results it does not have */}
        {!trained && (
          <div
            data-testid="untrained-banner"
            className="mb-12 rounded-sm border border-copper/40 bg-copper/[0.06] p-5 flex items-start gap-3"
          >
            <AlertTriangle className="w-4 h-4 text-copper mt-0.5 flex-shrink-0" strokeWidth={1.5} />
            <div>
              <div className="text-sm text-cream/90">
                {comparison.status === "offline"
                  ? "Backend unreachable — no results to display."
                  : "No training run has been executed yet."}
              </div>
              <div className="text-xs text-cream/50 mt-1 leading-relaxed">
                {comparison.status === "offline" ? (
                  <>
                    Start the API with <code className="font-mono bg-cream/[0.05] px-1.5 py-0.5 rounded-sm">cd backend &amp;&amp; python server.py</code>.
                  </>
                ) : (
                  <>
                    Metrics below are intentionally blank. Run{" "}
                    <code className="font-mono bg-cream/[0.05] px-1.5 py-0.5 rounded-sm">cd ml &amp;&amp; python run_pipeline.py</code>{" "}
                    to populate them. Architecture and hypotheses are design decisions and are shown regardless.
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODEL COMPARISON */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <GitCompare className="w-4 h-4 text-copper" strokeWidth={1.5} />
            <span className="micro-caps">Architecture comparison</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {MODEL_COMPARISON.map((m, i) => {
              const rec = comparison.models?.[m.id];
              const acc = metric(rec, "val_acc", "valAcc", "accuracy");
              const lat = metric(rec, "latency_ms", "latencyMs");
              const par = metric(rec, "params", "num_params");
              const f1 = metric(rec, "macro_f1", "f1");

              return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                data-testid={`model-card-${m.id}`}
                className="glass-card rounded-sm p-8"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="micro-caps">{m.kicker}</div>
                  {!rec && (
                    <span className="text-[10px] uppercase tracking-widest text-copper border border-copper/40 px-2 py-0.5 rounded-sm">
                      Not trained
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="font-display text-3xl">{m.name}</h3>
                  <span className="text-sm text-cream/50">
                    {par ? `${(par / 1e6).toFixed(2)}M params` : "params pending"}
                  </span>
                </div>
                <p className="text-cream/60 italic mb-6">{m.tagline}</p>

                <div className="mb-8 pl-3 border-l border-cream/10">
                  <div className="micro-caps mb-1 text-cream/40">Hypothesis</div>
                  <p className="text-sm text-cream/70 leading-relaxed">{m.hypothesis}</p>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-8 pb-6 border-b border-cream/10">
                  <Stat
                    value={acc === null ? null : `${(acc * 100).toFixed(1)}%`}
                    tone="text-copper"
                    label="Val acc."
                  />
                  <Stat
                    value={f1 === null ? null : (f1 * 100).toFixed(1)}
                    tone="text-cream"
                    label="Macro F1"
                  />
                  <Stat
                    value={lat === null ? null : Math.round(lat)}
                    suffix="ms"
                    tone="text-cyan"
                    label="Latency"
                  />
                  <Stat
                    value={par === null ? null : `${(par / 1e6).toFixed(1)}M`}
                    tone="text-cream"
                    label="Weights"
                  />
                </div>

                <div className="micro-caps mb-3 text-cream/50">Architecture</div>
                <ul className="space-y-2 mb-6">
                  {m.architecture.map((a) => (
                    <li key={a} className="text-sm text-cream/80 flex items-start gap-2">
                      <span className="flex-shrink-0 mt-1.5 w-1 h-1 rounded-full bg-copper" />
                      <code className="font-mono text-xs bg-cream/[0.03] px-1.5 py-0.5 rounded-sm">{a}</code>
                    </li>
                  ))}
                </ul>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="micro-caps mb-2 text-cyan/80">Strengths</div>
                    <ul className="space-y-1.5">
                      {m.strengths.map((s) => (
                        <li key={s} className="text-xs text-cream/70 leading-relaxed">+ {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="micro-caps mb-2 text-cream/50">Trade-offs</div>
                    <ul className="space-y-1.5">
                      {m.weaknesses.map((w) => (
                        <li key={w} className="text-xs text-cream/50 leading-relaxed">− {w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
              );
            })}
          </div>

          <div className="mt-6 glass-panel rounded-sm p-5 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div className="flex items-start gap-3">
              <Cpu className="w-4 h-4 text-copper mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <div className="text-sm text-cream/90">
                  A/B swap via the <code className="font-mono text-xs bg-cream/[0.05] px-1.5 py-0.5 rounded-sm">model: &quot;bilstm&quot; | &quot;cnn&quot;</code> field on <code className="font-mono text-xs bg-cream/[0.05] px-1.5 py-0.5 rounded-sm">POST /api/frame</code>.
                </div>
                <div className="text-xs text-cream/50 mt-1">
                  Both checkpoints load at boot and live behind one endpoint, so switching architectures is a request field, not a redeploy.
                </div>
              </div>
            </div>
            <div className="text-xs text-cream/40 uppercase tracking-widest text-right">
              {trained
                ? `Measured on the held-out split${comparison.meta?.numClasses ? ` · ${comparison.meta.numClasses} classes` : ""}`
                : "Identical data · identical splits · architecture is the only variable"}
            </div>
          </div>
        </section>

        {/* DATASET */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <Database className="w-4 h-4 text-copper" strokeWidth={1.5} />
            <span className="micro-caps">Dataset</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {[DATASET_BREAKDOWN.base, DATASET_BREAKDOWN.gap].map((d, i) => (
              <div key={d.name} className={`glass-card rounded-sm p-8 ${i === 0 ? "lg:col-span-7" : "lg:col-span-5"}`}>
                <div className="micro-caps mb-2">{d.kicker}</div>
                <h3 className="font-display text-2xl mb-6">{d.name}</h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div>
                    <div className="font-display text-3xl text-copper">{d.videos.toLocaleString()}</div>
                    <div className="micro-caps mt-1">Videos</div>
                  </div>
                  <div>
                    <div className="font-display text-3xl text-cream">{d.labels}</div>
                    <div className="micro-caps mt-1">Labels</div>
                  </div>
                  <div>
                    <div className="font-display text-3xl text-cyan">{d.signers}</div>
                    <div className="micro-caps mt-1">Signers</div>
                  </div>
                </div>
                <p className="text-sm text-cream/60 leading-relaxed">{d.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 glass-panel rounded-sm p-8">
            <div className="micro-caps mb-4">Split · stratified by signer</div>
            <div className="flex h-3 rounded-sm overflow-hidden border border-cream/10">
              {DATASET_BREAKDOWN.split.map((s, i) => (
                <div
                  key={s.name}
                  style={{ width: `${s.pct * 100}%` }}
                  className={i === 0 ? "bg-copper" : i === 1 ? "bg-cyan" : "bg-cream/40"}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3">
              {DATASET_BREAKDOWN.split.map((s, i) => (
                <div key={s.name} className="text-xs">
                  <span className={`inline-block w-2 h-2 rounded-sm mr-2 align-middle ${i === 0 ? "bg-copper" : i === 1 ? "bg-cyan" : "bg-cream/40"}`} />
                  <span className="text-cream/80">{s.name}</span>
                  <span className="text-cream/40 ml-2">{Math.round(s.pct * 100)}%</span>
                </div>
              ))}
            </div>
            <div className="hair-divider my-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-cream/70 leading-relaxed">
              <div>
                <div className="micro-caps mb-2 text-cream/50">Preprocessing</div>
                <ul className="space-y-1.5">
                  <li>• Extract landmarks with MediaPipe Holistic (21 hand × 2 + 33 pose)</li>
                  <li>• Normalize to wrist origin, scale to shoulder width</li>
                  <li>• Pad or truncate to fixed T = 60 frames</li>
                  <li>• Per-keypoint z-score using train-set statistics</li>
                </ul>
              </div>
              <div>
                <div className="micro-caps mb-2 text-cream/50">Augmentations (train only)</div>
                <ul className="space-y-1.5">
                  <li>• Gaussian jitter (σ=0.01) on keypoint xyz</li>
                  <li>• Random frame drop (p=0.1) then re-pad</li>
                  <li>• Horizontal mirror for symmetric signs</li>
                  <li>• Time-warp ±15% for signer-speed variance</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* PIPELINE */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <Waves className="w-4 h-4 text-copper" strokeWidth={1.5} />
            <span className="micro-caps">End-to-end pipeline</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PIPELINE_STEPS.map((s) => (
              <div key={s.n} className="glass-card rounded-sm p-6" data-testid={`pipeline-step-${s.n}`}>
                <div className="font-display text-4xl text-copper mb-3">{s.n}</div>
                <div className="font-medium mb-2">{s.t}</div>
                <div className="text-sm text-cream/55 leading-relaxed">{s.b}</div>
              </div>
            ))}
          </div>
        </section>

        {/* NLP LAYER */}
        <section className="mb-24">
          <div className="flex items-center gap-3 mb-8">
            <MessageSquareQuote className="w-4 h-4 text-copper" strokeWidth={1.5} />
            <span className="micro-caps">NLP layer · where and when</span>
          </div>
          <p className="text-cream/70 leading-relaxed max-w-3xl mb-8">
            The deep-learning model outputs a <span className="text-cream">gloss sequence</span> &mdash; not English. NLP sits between the gloss and every human-facing surface: turning it into a readable sentence forward, converting typed English back into gloss for reverse mode, and generating correction chips when the model isn&apos;t sure.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {NLP_STEPS.map((s, i) => (
              <motion.div
                key={s.stage}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.08 }}
                data-testid={`nlp-step-${i}`}
                className="glass-card rounded-sm p-7 flex flex-col"
              >
                <div className="micro-caps mb-2">{s.kicker}</div>
                <h3 className="font-display text-2xl mb-4 leading-snug">{s.stage}</h3>
                <div className="space-y-4 text-sm text-cream/75 leading-relaxed flex-1">
                  <div>
                    <div className="micro-caps mb-1 text-cream/50">When</div>
                    <div>{s.where}</div>
                  </div>
                  <div>
                    <div className="micro-caps mb-1 text-cream/50">What it does</div>
                    <div>{s.what}</div>
                  </div>
                  {s.prompt && s.prompt !== "(no LLM — pure math on model output)" && (
                    <div>
                      <div className="micro-caps mb-1 text-cream/50">Prompt shape</div>
                      <pre className="font-mono text-[11px] bg-cream/[0.03] border border-cream/10 rounded-sm p-3 whitespace-pre-wrap leading-relaxed text-cream/70">{s.prompt}</pre>
                    </div>
                  )}
                  {s.prompt === "(no LLM — pure math on model output)" && (
                    <div className="text-xs italic text-cream/50">No LLM here — pure math on softmax logits.</div>
                  )}
                  <div>
                    <div className="micro-caps mb-1 text-cream/50">Fallback</div>
                    <div className="text-cream/60">{s.fallback}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* DATA WORKFLOW */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <Download className="w-4 h-4 text-copper" strokeWidth={1.5} />
            <span className="micro-caps">Data &amp; training workflow · who does what</span>
          </div>
          <p className="text-cream/70 leading-relaxed max-w-3xl mb-8">
            The dataset is public &mdash; you download it once, we handle everything after. Training happens on Colab or your GPU (not in the web app); the app just serves the resulting <code className="font-mono text-xs bg-cream/[0.05] px-1.5 py-0.5 rounded-sm">.pt</code> weights. Datasets are large (INCLUDE + augmentations can exceed 30&nbsp;GB extracted) &mdash; drop them into <code className="font-mono text-xs bg-cream/[0.05] px-1.5 py-0.5 rounded-sm">/app/ml/data/</code> whenever ready.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DATA_WORKFLOW.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                data-testid={`workflow-step-${s.n}`}
                className="glass-card rounded-sm p-6 flex flex-col"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="font-display text-4xl text-copper leading-none">{s.n}</div>
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm border ${
                    s.who.startsWith("You") ? "border-copper/40 text-copper" :
                    s.who === "Automatic" ? "border-cyan/40 text-cyan" :
                    "border-cream/20 text-cream/60"
                  }`}>
                    {s.who}
                  </span>
                </div>
                <div className="font-medium mb-2">{s.t}</div>
                <div className="text-sm text-cream/60 leading-relaxed flex-1">{s.b}</div>
                {s.link && (
                  <a
                    href={s.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-flex items-center gap-1.5 mt-4 text-xs text-cyan hover:text-copper transition-colors"
                    data-testid={`workflow-link-${s.n}`}
                  >
                    Open Zenodo <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                  </a>
                )}
              </motion.div>
            ))}
          </div>

          <div className="mt-6 glass-panel rounded-sm p-5 flex items-start gap-3">
            <Cpu className="w-4 h-4 text-copper mt-0.5 flex-shrink-0" strokeWidth={1.5} />
            <div className="text-sm text-cream/80 leading-relaxed">
              <span className="text-cream">TL;DR</span> &mdash; download INCLUDE once (public link above, plan for 30+&nbsp;GB extracted) and record 18 short phrase clips. Everything else &mdash; preprocessing, training, serving &mdash; is scripted. The web app runs unchanged in the meantime.
            </div>
          </div>

          {/* Placement folder card */}
          <div className="mt-6 glass-card rounded-sm p-6">
            <div className="micro-caps mb-3">Where to drop the data (when you have it)</div>
            <pre className="font-mono text-[11px] leading-relaxed text-cream/75 bg-cream/[0.03] border border-cream/10 rounded-sm p-4 overflow-x-auto">{`/app/ml/
├── data/
│   ├── include/     ← extract INCLUDE dataset here (raw MP4/MOV per label folder)
│   ├── custom/      ← your 18 self-recorded phrase clips (one folder per label)
│   └── processed/   ← .npy landmark tensors (auto-generated)
├── models/          ← trained .pt weights land here
└── scripts/         ← preprocess.py · train_bilstm.py · train_transformer.py · evaluate.py

/app/backend/models/ ← copy trained .pt + label_map.json here to serve them`}</pre>
            <div className="text-xs text-cream/50 mt-3 leading-relaxed">
              Folders already exist &mdash; just drop files in. If any expected file is missing, the backend logs a warning and falls back to the mock predictor. The UI stays functional either way.
            </div>
          </div>

          {/* Storage strategy — the honest picture */}
          <div className="mt-6 glass-card rounded-sm p-8">
            <div className="micro-caps mb-3 text-cream/50">The dataset is huge · how to survive it</div>
            <h3 className="font-display text-2xl mb-4">Full INCLUDE is ~57&nbsp;GB compressed, ~120&nbsp;GB extracted. You almost never need all of it.</h3>
            <p className="text-sm text-cream/60 leading-relaxed mb-6">
              Pick the strategy that matches your machine. All four are supported out-of-the-box by <code className="font-mono text-xs bg-cream/[0.05] px-1.5 py-0.5 rounded-sm">preprocess.py</code>.
            </p>

            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-cream/50 uppercase tracking-widest text-[10px] border-b border-cream/10">
                    <th className="py-3 pr-4 font-medium">Strategy</th>
                    <th className="py-3 pr-4 font-medium">Peak disk</th>
                    <th className="py-3 pr-4 font-medium">Permanent</th>
                    <th className="py-3 pr-4 font-medium">Classes</th>
                    <th className="py-3 font-medium">Best for</th>
                  </tr>
                </thead>
                <tbody className="text-cream/80">
                  <tr className="border-b border-cream/5">
                    <td className="py-3 pr-4">Full INCLUDE, keep videos</td>
                    <td className="py-3 pr-4 font-mono text-cream/60">~120 GB</td>
                    <td className="py-3 pr-4 font-mono text-cream/60">~120 GB</td>
                    <td className="py-3 pr-4 font-mono">263</td>
                    <td className="py-3 text-cream/60">Beefy workstations only</td>
                  </tr>
                  <tr className="border-b border-cream/5">
                    <td className="py-3 pr-4">Full INCLUDE + <code className="font-mono text-xs">--delete-after</code></td>
                    <td className="py-3 pr-4 font-mono text-cream/60">~120 GB</td>
                    <td className="py-3 pr-4 font-mono text-cyan">~230 MB</td>
                    <td className="py-3 pr-4 font-mono">263</td>
                    <td className="py-3 text-cream/60">Colab / Kaggle (100 GB ephemeral)</td>
                  </tr>
                  <tr className="border-b border-cream/5 bg-copper/[0.04]">
                    <td className="py-3 pr-4 text-copper font-medium">INCLUDE-50 (official subset)</td>
                    <td className="py-3 pr-4 font-mono text-copper">~15 GB</td>
                    <td className="py-3 pr-4 font-mono text-copper">~50 MB</td>
                    <td className="py-3 pr-4 font-mono text-copper">50</td>
                    <td className="py-3 text-copper">Recommended for laptops</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4">Class whitelist (curated)</td>
                    <td className="py-3 pr-4 font-mono text-cream/60">~30 GB</td>
                    <td className="py-3 pr-4 font-mono text-cyan">~150 MB</td>
                    <td className="py-3 pr-4 font-mono">~90</td>
                    <td className="py-3 text-cream/60">Best vocab coverage for this app</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="hair-divider my-6" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="micro-caps mb-2 text-cream/50">Shrink flag 1</div>
                <code className="font-mono text-xs text-cyan block mb-1">--classes classes_locked.txt</code>
                <div className="text-xs text-cream/60 leading-relaxed">Only extract landmarks for whitelisted classes. Curated file already at <code className="text-[10px]">scripts/classes_locked.txt</code>.</div>
              </div>
              <div>
                <div className="micro-caps mb-2 text-cream/50">Shrink flag 2</div>
                <code className="font-mono text-xs text-cyan block mb-1">--max-per-class 8</code>
                <div className="text-xs text-cream/60 leading-relaxed">Cap takes per class. Trades a bit of signer variance for way less compute.</div>
              </div>
              <div>
                <div className="micro-caps mb-2 text-cream/50">Shrink flag 3</div>
                <code className="font-mono text-xs text-cyan block mb-1">--delete-after</code>
                <div className="text-xs text-cream/60 leading-relaxed">Delete each source video the moment its <code className="text-[10px]">.npy</code> tensor is safely written. Peak disk stays low.</div>
              </div>
            </div>

            <div className="hair-divider my-6" />
            <div className="flex items-start gap-3">
              <div className="text-copper font-display text-xl leading-none pt-1">?</div>
              <div className="text-sm text-cream/80 leading-relaxed">
                <span className="text-cream">Can I skip INCLUDE and use only ISL-CSLTR?</span>
                <div className="text-cream/60 mt-1">
                  Not for this app. ISL-CSLTR is a <span className="text-cream">continuous</span> sign-language dataset (sentences, ~700 samples, ~9 GB) built for sequence-to-sequence translation with CTC. Our BiLSTM / Transformer classifiers work on <span className="text-cream">isolated</span> signs &mdash; different problem shape, way fewer samples per class. Use INCLUDE-50 as your base. Layer ISL-CSLTR on later if you want more signer variance.
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
