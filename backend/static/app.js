/* Silent Voice — single-page app, hash routed, no build step.
   Real: /live (webcam -> word) and /results (reads training output).
   Mocked UI: reverse, practice, transcripts, settings, about, auth. */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const word = w => esc(String(w).replace(/_/g, ' '));
const pct = v => (v * 100).toFixed(1) + '%';

const state = { status:null, comparison:null, transcript:[], settings:{
  domain:'everyday', voice:'warm', rate:1, reducedMotion:false, landmarksOnly:false, saveTranscripts:true
}};

const PRETTY = { bilstm:'BiLSTM', cnn:'1D-CNN', transformer:'Transformer' };
const BARC   = { bilstm:'bar-cyan', cnn:'bar-copper', transformer:'bar-violet' };
const LINEC  = { bilstm:'#6EE7F2', cnn:'#C97B4A', transformer:'#9d7bff' };

/* Sign groups whose meaning lives in movement direction/order rather than
   handshape. This is precisely where a recurrent model should beat a CNN. */
const TEMPORAL_GROUPS = [
  ['Time triple — direction of movement is the only cue', ['today','tomorrow','yesterday']],
  ['Face-location pair — same motion, different place',   ['mother','father']],
  ['Pointing pair — direction only',                       ['i','you']],
  ['Semantic neighbours (control — visually distinct)',     ['sick','hospital','medicine']],
];

const NAV = [
  ['#/','Home'], ['#/live','Live'], ['#/results','Results'], ['#/reverse','Reverse'],
  ['#/practice','Practice'], ['#/transcripts','Transcripts'], ['#/settings','Settings'], ['#/about','About'],
];

/* ========================================================================== */
/* data                                                                        */
/* ========================================================================== */
async function getStatus(){
  if (state.status) return state.status;
  try { state.status = await (await fetch('/api/status')).json(); }
  catch { state.status = { error:true, num_labels:0, vocabulary:[] }; }
  return state.status;
}
async function getComparison(){
  if (state.comparison) return state.comparison;
  try { state.comparison = await (await fetch('/api/comparison')).json(); }
  catch { state.comparison = { available:false, error:'server unreachable' }; }
  return state.comparison;
}

/* ========================================================================== */
/* shared fragments                                                            */
/* ========================================================================== */
function svgCurve(histories, key, title, ylabel){
  const series = {};
  for (const [a,h] of Object.entries(histories||{})){
    const v = (h.history||[]).map(e => e[key]).filter(x => typeof x === 'number');
    if (v.length) series[a] = v;
  }
  const archs = Object.keys(series);
  if (!archs.length) return '';

  const W=560,H=250,P=46;
  const maxEp = Math.max(...archs.map(a=>series[a].length));
  let lo = Math.min(...archs.flatMap(a=>series[a]));
  let hi = Math.max(...archs.flatMap(a=>series[a]));
  if (hi - lo < 1e-9) hi = lo + 1;

  const X = (i,n) => P + (W-P-14) * (i/Math.max(n-1,1));
  const Y = v => H-P - (H-2*P) * ((v-lo)/(hi-lo));

  let g = '';
  for (let i=0;i<5;i++){
    const y = P + (H-2*P)*i/4, val = hi-(hi-lo)*i/4;
    g += `<line class="grid-l" x1="${P}" y1="${y}" x2="${W-14}" y2="${y}"/>`
       + `<text class="ax" x="${P-7}" y="${y+3}" text-anchor="end">${val.toFixed(2)}</text>`;
  }
  let paths='', leg='';
  archs.forEach((a,k)=>{
    const v = series[a];
    paths += `<path d="${v.map((p,i)=>`${i?'L':'M'}${X(i,v.length).toFixed(1)},${Y(p).toFixed(1)}`).join(' ')}"
              fill="none" stroke="${LINEC[a]||'#888'}" stroke-width="2" stroke-linejoin="round"/>`;
    const lx = P + k*120;
    leg += `<rect x="${lx}" y="${H-26}" width="10" height="10" rx="2" fill="${LINEC[a]||'#888'}"/>`
         + `<text class="ax" x="${lx+15}" y="${H-17}">${PRETTY[a]||a}</text>`;
  });

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
    <text class="ct" x="${W/2}" y="18" text-anchor="middle">${esc(title)}</text>
    ${g}<text class="ax" x="14" y="${P-14}">${esc(ylabel)}</text>
    <text class="ax" x="${W/2}" y="${H-4}" text-anchor="middle">epoch (max ${maxEp})</text>
    ${paths}${leg}</svg>`;
}

const bar = (label, val, cls, right) => `
  <div class="bar-row">
    <div class="bar-top"><span>${label}</span><span class="num">${right}</span></div>
    <div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(0,Math.min(1,val))*100}%"></div></div>
  </div>`;

const confClass = c => c > 0.7 ? 'hi' : c > 0.4 ? 'mid' : 'lo';
const confLabel = c => c > 0.7 ? 'High confidence' : c > 0.4 ? 'Medium confidence' : 'Low confidence';

function trainFirst(msg){
  return `<div class="card"><h3>No training output yet</h3>
    <p style="margin-bottom:14px">${esc(msg||'Train the models to populate this page.')}</p>
    <pre class="mono" style="background:var(--ink-2);border:1px solid var(--line);
      border-radius:9px;padding:14px 16px;overflow-x:auto;color:var(--cream-dim)">cd ml
python scripts/verify_setup.py --videos "../archive (3)"
python run_pipeline.py --videos "../archive (3)"</pre>
    <p style="margin-top:14px;font-size:13px">The pipeline writes <span class="mono">ml/logs/comparison.json</span>
    and copies checkpoints into <span class="mono">backend/models/</span>. Reload this page afterwards.</p>
  </div>`;
}

/* ========================================================================== */
/* PAGE — landing                                                              */
/* ========================================================================== */
const FEATURES = [
  ['◈','Skeleton, not video','MediaPipe extracts 75 landmarks per frame. Background, lighting and identity never reach the model.'],
  ['◆','BiLSTM sequence model','Bidirectional recurrence reads a completed sign end-to-end, so movement order carries meaning.'],
  ['◇','Measured, not asserted','Every architecture trains on one split with one seed. Results page shows the whole comparison.'],
  ['○','Privacy by design','Frames are processed and discarded. Only landmark coordinates are ever classified.'],
  ['◐','Confidence, surfaced','Low-confidence predictions show alternatives rather than guessing silently.'],
  ['◑','Accessibility-first','Keyboard navigable, 4.5:1 contrast, reduced-motion respected throughout.'],
];

function pageHome(){
  return `<div class="page">
    <section class="hero">
      <div class="micro" style="margin-bottom:16px">Indian Sign Language → English</div>
      <h1>Every gesture, heard.</h1>
      <p class="lead">Silent Voice turns Indian Sign Language into English captions in real time —
      so a Deaf signer can be understood by someone who has never signed in their life.</p>
      <div class="hero-cta">
        <a class="btn btn-copper" href="#/live">Open live translation</a>
        <a class="btn" href="#/results">See the model comparison</a>
      </div>
      <div class="pipeline">
        <span class="step">Webcam</span><span class="arr">→</span>
        <span class="step">MediaPipe Holistic</span><span class="arr">→</span>
        <span class="step">225 landmarks / frame</span><span class="arr">→</span>
        <span class="step">BiLSTM</span><span class="arr">→</span>
        <span class="step">English caption</span>
      </div>
    </section>

    <div class="hair"></div>

    <div class="grid g3">
      ${FEATURES.map(([ic,t,d]) => `<div class="card feat">
        <div class="ic">${ic}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}
    </div>

    <div class="hair"></div>

    <div class="note">
      <b>Scope, stated honestly.</b> This recognises <em>isolated</em> signs — one word at a time —
      from a fixed vocabulary. It is an assistive and triage tool for short, high-frequency exchanges,
      and a practice partner for learners. It is not a replacement for a human interpreter, and
      medical or legal settings need one in the loop.
    </div>
  </div>`;
}

/* ========================================================================== */
/* PAGE — live (REAL)                                                          */
/* ========================================================================== */
let live = null;

function pageLive(){
  return `<div class="page">
    <div class="head">
      <div class="micro">Live translation</div>
      <h2>Sign, and be read.</h2>
      <p>Hold <b>Space</b> (or the button) while you sign, then release. The skeleton overlay is
      everything the model sees.</p>
    </div>

    <div class="banner" id="liveBanner"></div>

    <div class="side">
      <div>
        <div class="stage" id="stage">
          <video id="video" autoplay playsinline muted></video>
          <canvas id="overlay"></canvas>
          <div class="empty" id="camEmpty">
            <div class="micro">Camera</div>
            <p style="max-width:34ch">Allow camera access to begin. Nothing is uploaded — frames are
            processed locally and discarded.</p>
            <button class="btn-copper" id="btnCam">Enable camera</button>
          </div>
          <div class="rec-badge" id="recBadge"><i></i><span id="recTxt">Recording</span></div>
          <div class="stage-hint" id="stageHint">hold Space to sign</div>
          <div class="caption-bar">
            <div class="caption lo" id="caption">—</div>
            <div class="caption-meta">
              <span class="conf-chip conf-lo" id="confChip">Waiting</span>
              <span class="micro" id="capMeta"></span>
              <span class="wave" id="wave">${'<i></i>'.repeat(11)}</span>
            </div>
            <div class="chips" id="alts" style="margin-top:12px"></div>
          </div>
        </div>
      </div>

      <aside>
        <div class="card" style="margin-bottom:16px">
          <h3>Capture</h3>
          <button class="btn-copper full" id="btnRec" disabled>Hold to sign · Space</button>
          <div style="height:10px"></div>
          <div class="seg">
            <button id="mCapture" class="sel">Capture</button>
            <button id="mCont">Continuous</button>
          </div>
          <p style="font-size:12.5px;margin-top:10px" id="modeNote">
            Capture matches training: one complete sign per window.</p>
        </div>

        <div class="card" style="margin-bottom:16px">
          <h3>Model</h3>
          <div class="seg" id="modelSeg"><span class="micro">loading…</span></div>
        </div>

        <div class="card" style="margin-bottom:16px">
          <h3>Session</h3>
          <div class="switch"><span class="t">Hands detected</span><b id="sHands">no</b></div>
          <div class="switch"><span class="t">Round trip</span><b id="sRtt">—</b></div>
          <div class="switch"><span class="t">Frames sent</span><b id="sFrames">0</b></div>
        </div>

        <div class="card">
          <h3>Transcript</h3>
          <div class="log" id="log"><div class="empty-note">Nothing yet.</div></div>
        </div>
      </aside>
    </div>

    <div class="hair"></div>
    <div class="card">
      <h3>Vocabulary</h3>
      <p style="margin-bottom:12px;font-size:13.5px">The model can only return one of these words.
      Anything else will come back as the nearest match.</p>
      <div class="chips" id="vocab"><span class="micro">loading…</span></div>
    </div>
  </div>`;
}

async function mountLive(){
  const st = await getStatus();
  const banner = $('#liveBanner');
  const loaded = ['bilstm','cnn','transformer'].filter(a => st[a + '_loaded']);

  live = { mode:'capture', model: loaded.includes('bilstm') ? 'bilstm' : (loaded[0]||'bilstm'),
           recording:false, busy:false, running:false, stream:null, frames:0, rtt:0, last:null };

  if (st.error){
    banner.className = 'banner warn on';
    banner.textContent = 'Cannot reach the server. Start it with: cd backend && python server.py';
  } else if (!loaded.length){
    banner.className = 'banner warn on';
    banner.innerHTML = '<b>Mock mode.</b> No trained checkpoints in backend/models/, so predictions ' +
      'are placeholders. Run the training pipeline, then reload.';
  }

  $('#modelSeg').innerHTML = loaded.length
    ? loaded.map(a => `<button data-m="${a}" class="${a===live.model?'sel':''}">${PRETTY[a]||a}</button>`).join('')
    : '<button class="sel" disabled>mock</button>';
  $$('#modelSeg button[data-m]').forEach(b => b.onclick = () => {
    live.model = b.dataset.m;
    $$('#modelSeg button').forEach(x => x.classList.toggle('sel', x === b));
  });

  const vocab = st.vocabulary || [];
  $('#vocab').innerHTML = vocab.length
    ? vocab.map(w => `<span class="chip">${word(w)}</span>`).join('')
    : '<span class="micro">no vocabulary loaded</span>';

  $('#btnCam').onclick = startCam;

  const btn = $('#btnRec');
  const down = e => { if (live.mode === 'capture' && !btn.disabled){ e.preventDefault(); setRec(true);} };
  const up   = () => live.recording && setRec(false);
  btn.addEventListener('mousedown', down);
  btn.addEventListener('touchstart', down, {passive:false});
  addEventListener('mouseup', up); addEventListener('touchend', up);
  live.onKeyDown = e => { if (e.code==='Space' && !e.repeat && live.mode==='capture' && !btn.disabled
                           && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){ e.preventDefault(); setRec(true);} };
  live.onKeyUp   = e => { if (e.code==='Space' && live.mode==='capture'){ e.preventDefault(); if(live.recording) setRec(false);} };
  addEventListener('keydown', live.onKeyDown); addEventListener('keyup', live.onKeyUp);
  live.onUp = up;

  $('#mCapture').onclick = () => setMode('capture');
  $('#mCont').onclick    = () => setMode('continuous');
}

function setMode(m){
  live.mode = m; setRec(false);
  $('#mCapture').classList.toggle('sel', m==='capture');
  $('#mCont').classList.toggle('sel', m==='continuous');
  $('#btnRec').disabled = m==='continuous' || !live.running;
  $('#stageHint').textContent = m==='capture' ? 'hold Space to sign' : 'continuous — always predicting';
  $('#modeNote').textContent = m==='capture'
    ? 'Capture matches training: one complete sign per window.'
    : 'Continuous slides a window over the stream. Most windows hold half a sign, so accuracy drops — that is expected.';
  fetch('/api/reset', {method:'POST'}).catch(()=>{});
}

function setRec(on){
  if (!live) return;
  live.recording = on;
  $('#recBadge').classList.toggle('on', on);
  const b = $('#btnRec');
  b.classList.toggle('btn-rec', on); b.classList.toggle('btn-copper', !on);
  b.textContent = on ? 'Release to translate' : 'Hold to sign · Space';
  if (on){ $('#recTxt').textContent = 'Recording'; setCaption('…', 0, null); }
}

async function startCam(){
  const v = $('#video');
  try{
    live.stream = await navigator.mediaDevices.getUserMedia({ video:{ width:960, height:720 } });
    v.srcObject = live.stream; await v.play();
    $('#camEmpty').style.display = 'none';
    $('#btnRec').disabled = live.mode === 'continuous';
    $('#confChip').textContent = 'Ready';
    live.running = true; loopLive();
  }catch(e){
    const b = $('#liveBanner');
    b.className = 'banner warn on';
    b.textContent = 'Camera blocked: ' + e.message + '. Use http://localhost:8000 — browsers only trust localhost without HTTPS.';
  }
}

async function loopLive(){
  if (!live || !live.running) return;
  const v = $('#video'), cv = $('#overlay');
  if (!v || !cv){ return; }

  if (!live.busy && v.readyState >= 2){
    live.busy = true;
    try{
      if (cv.width !== v.videoWidth){ cv.width = v.videoWidth||960; cv.height = v.videoHeight||720; }
      const shot = live.shot || (live.shot = document.createElement('canvas'));
      shot.width = 480; shot.height = Math.round(480 * cv.height / cv.width);
      const sx = shot.getContext('2d');
      sx.save(); sx.scale(-1,1); sx.drawImage(v, -shot.width, 0, shot.width, shot.height); sx.restore();

      const t0 = performance.now();
      const r = await fetch('/api/frame', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ image: shot.toDataURL('image/jpeg', .6),
                               record: live.recording, mode: live.mode, model: live.model })
      });
      const d = await r.json();
      live.frames++;
      live.rtt = live.rtt ? live.rtt*.8 + (performance.now()-t0)*.2 : performance.now()-t0;

      const f = $('#sFrames'), rt = $('#sRtt'), hd = $('#sHands');
      if (f) f.textContent = live.frames;
      if (rt) rt.textContent = Math.round(live.rtt) + ' ms';
      if (hd) hd.textContent = d.hands_visible ? 'yes' : 'no';

      drawSkeleton(cv, d.landmarks);
      if (d.recording) $('#recTxt').textContent = 'Recording · ' + d.recorded_frames + ' frames';
      if (d.prediction) showPrediction(d.prediction, d.finished);
    }catch{ /* drop the frame; keep the loop alive */ }
    live.busy = false;
  }
  setTimeout(() => requestAnimationFrame(loopLive), 80);   // ~12 fps
}

const HAND_EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
                    [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const POSE_EDGES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]];

function drawSkeleton(cv, lm){
  const ctx = cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  if (!lm) return;
  const X = p => p[0]*cv.width, Y = p => p[1]*cv.height;

  if (lm.pose?.length){
    ctx.strokeStyle = 'rgba(124,124,135,.5)'; ctx.lineWidth = 3;
    for (const [a,b] of POSE_EDGES){
      const p = lm.pose[a], q = lm.pose[b];
      if (!p || !q || p[2] < .4 || q[2] < .4) continue;
      ctx.beginPath(); ctx.moveTo(X(p),Y(p)); ctx.lineTo(X(q),Y(q)); ctx.stroke();
    }
  }
  for (const k of ['left','right']){
    const h = lm[k]; if (!h?.length) continue;
    ctx.strokeStyle = '#6EE7F2'; ctx.lineWidth = 3;
    ctx.shadowColor = '#6EE7F2'; ctx.shadowBlur = 9;
    for (const [a,b] of HAND_EDGES){
      const p = h[a], q = h[b]; if (!p || !q) continue;
      ctx.beginPath(); ctx.moveTo(X(p),Y(p)); ctx.lineTo(X(q),Y(q)); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.fillStyle = '#F2ECE0';
    for (const p of h){ ctx.beginPath(); ctx.arc(X(p),Y(p),3.4,0,6.284); ctx.fill(); }
  }
}

function setCaption(text, conf, meta){
  const cap = $('#caption'); if (!cap) return;
  cap.className = 'caption ' + confClass(conf);
  cap.innerHTML = document.body.classList.contains('no-motion')
    ? esc(text)
    : [...String(text)].map((ch,i) =>
        `<span class="ch" style="animation-delay:${i*22}ms">${ch===' '?'&nbsp;':esc(ch)}</span>`).join('');
  const chip = $('#confChip');
  chip.className = 'conf-chip conf-' + confClass(conf);
  chip.textContent = conf ? confLabel(conf) + ' · ' + Math.round(conf*100) + '%' : 'Waiting';
  $('#capMeta').textContent = meta || '';
}

function showPrediction(p, finished){
  setCaption(String(p.label).replace(/_/g,' ').toUpperCase(), p.confidence,
             `${p.model}${p.mock ? ' · MOCK' : ''} · ${p.latency_ms.toFixed(1)} ms`);

  $('#wave').classList.toggle('on', p.confidence > 0.4);
  $('#alts').innerHTML = (p.alternatives||[]).map(a =>
    `<button class="chip" data-w="${esc(a.label)}">${word(a.label)} <b>${Math.round(a.confidence*100)}%</b></button>`
  ).join('');
  $$('#alts button').forEach(b => b.onclick = () => {
    setCaption(b.dataset.w.replace(/_/g,' ').toUpperCase(), 0.99, 'corrected by user');
    addTranscript(b.dataset.w, 1, true);
  });

  if (finished || (live.mode==='continuous' && p.label !== live.last && p.confidence > .55)){
    live.last = p.label;
    addTranscript(p.label, p.confidence, false);
  }
}

function addTranscript(w, c, corrected){
  const t = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  state.transcript.unshift({ w, c, t, corrected });
  const log = $('#log'); if (!log) return;
  log.innerHTML = state.transcript.slice(0,40).map(r =>
    `<div class="log-row"><span class="w">${word(r.w)}${r.corrected?' <span class="micro">corrected</span>':''}</span>
     <span class="t">${r.t} · ${Math.round(r.c*100)}%</span></div>`).join('');
}

function teardownLive(){
  if (!live) return;
  live.running = false;
  live.stream?.getTracks().forEach(t => t.stop());
  removeEventListener('keydown', live.onKeyDown); removeEventListener('keyup', live.onKeyUp);
  removeEventListener('mouseup', live.onUp); removeEventListener('touchend', live.onUp);
  live = null;
}

/* ========================================================================== */
/* PAGE — results (REAL)                                                       */
/* ========================================================================== */
async function pageResults(){
  const c = await getComparison();
  const head = `<div class="head">
      <div class="micro">Model comparison</div>
      <h2>BiLSTM vs CNN — measured, not asserted.</h2>
      <p>Every architecture trained through one shared function: same stratified split (seed 42),
      same train-only normalisation, same augmentation, same optimiser and epoch budget.
      Architecture is the only variable.</p>
    </div>`;

  if (!c.available) return `<div class="page">${head}${trainFirst(c.error)}</div>`;

  const models = c.models || {};
  const archs = Object.keys(models);
  if (!archs.length) return `<div class="page">${head}${trainFirst('No checkpoints were evaluated.')}</div>`;

  const best = archs.reduce((a,b) => models[a].test_acc >= models[b].test_acc ? a : b);
  const topkKey = Object.keys(models[archs[0]]).find(k => k.startsWith('test_top'));
  const chance = 1 / Math.max((c.labels||[]).length, 1);

  /* headline */
  const cards = `<div class="grid g4" style="margin-bottom:26px">
    <div class="card stat"><div class="n">${(c.labels||[]).length}</div><div class="l micro">ISL classes</div></div>
    <div class="card stat"><div class="n">${c.n_test||0}</div><div class="l micro">held-out test clips</div></div>
    <div class="card stat"><div class="n copper">${pct(chance)}</div><div class="l micro">chance accuracy</div></div>
    <div class="card stat"><div class="n">${pct(models[best].test_acc)}</div><div class="l micro">best · ${esc(PRETTY[best]||best)}</div></div>
  </div>`;

  /* table */
  const rows = archs.map(a => {
    const m = models[a];
    const tt = m.train_wall_seconds ? (m.train_wall_seconds/60).toFixed(1)+' min' : '—';
    return `<tr class="${a===best?'win':''}">
      <td><b>${esc(PRETTY[a]||a)}</b>${a===best?' <span class="conf-chip conf-hi" style="margin-left:8px">best</span>':''}</td>
      <td class="num">${pct(m.test_acc)}</td>
      <td class="num">${topkKey ? pct(m[topkKey]) : '—'}</td>
      <td class="num">${m.macro_f1.toFixed(3)}</td>
      <td class="num">${m.params.toLocaleString()}</td>
      <td class="num">${m.latency_ms_mean.toFixed(2)} ms</td>
      <td class="num">${tt}</td></tr>`;
  }).join('');

  /* head to head bars */
  const bars = `<div class="grid g2">
    <div class="card"><h3>Test accuracy</h3>
      ${archs.map(a => bar(PRETTY[a]||a, models[a].test_acc, BARC[a]||'bar-cyan', pct(models[a].test_acc))).join('')}
    </div>
    <div class="card"><h3>Macro F1</h3>
      ${archs.map(a => bar(PRETTY[a]||a, models[a].macro_f1, BARC[a]||'bar-cyan', models[a].macro_f1.toFixed(3))).join('')}
    </div>
  </div>`;

  /* temporal groups — the actual argument */
  const groupRows = TEMPORAL_GROUPS.map(([title, words]) => {
    const present = words.filter(w => (c.labels||[]).includes(w));
    if (present.length < 2) return '';
    const cells = archs.map(a => {
      const f1 = present.map(w => models[a].per_class_f1[w] ?? 0);
      const avg = f1.reduce((x,y)=>x+y,0) / f1.length;
      const d = avg - models[a].macro_f1;
      return `<td class="num"><b>${avg.toFixed(3)}</b><br>
        <span class="micro" style="color:${d>=0?'var(--cyan)':'var(--copper)'}">
        ${d>=0?'+':''}${d.toFixed(3)} vs own macro-F1</span></td>`;
    }).join('');
    return `<tr><td>${esc(title)}<br><span class="mono" style="color:var(--dim)">${present.map(word).join(' · ')}</span></td>${cells}</tr>`;
  }).join('');

  const groups = groupRows ? `<div class="card"><h3>Where temporal modelling should matter</h3>
      <p style="margin-bottom:14px;font-size:13.5px">Signs sharing a handshape whose meaning lives in the
      <b>direction and order</b> of movement. The CNN's receptive field spans roughly 29 of the 60 frames,
      so it structurally cannot relate the start of a sign to its end. This table is the measurement.</p>
      <div class="tw"><table><thead><tr><th>Sign group</th>
        ${archs.map(a=>`<th>${esc(PRETTY[a]||a)}</th>`).join('')}</tr></thead>
      <tbody>${groupRows}</tbody></table></div></div>`
    : `<div class="note">None of the movement-contrast sign groups
       (<span class="mono">today/tomorrow/yesterday</span>, <span class="mono">mother/father</span>)
       are in this trained vocabulary, so the temporal analysis is unavailable. Train with
       <span class="mono">scripts/classes_isl20.txt</span> to enable it.</div>`;

  /* curves */
  const curves = (svgCurve(c.histories,'val_acc','Validation accuracy per epoch','val acc') ||
                  svgCurve(c.histories,'train_loss','Training loss','loss'))
    ? `<div class="grid g2">
        <div>${svgCurve(c.histories,'val_acc','Validation accuracy per epoch','val acc')}</div>
        <div>${svgCurve(c.histories,'train_loss','Training loss per epoch','loss')}</div>
      </div>` : '';

  /* confusion */
  const cms = archs.filter(a => c.confusion?.[a]).map(a =>
    `<figure><img src="data:image/png;base64,${c.confusion[a]}" alt="Confusion matrix, ${esc(PRETTY[a]||a)}">
     <figcaption>${esc(PRETTY[a]||a)} — row-normalised</figcaption></figure>`).join('');

  /* weakest */
  const weak = archs.map(a => {
    const worst = Object.entries(models[a].per_class_f1).sort((x,y)=>x[1]-y[1]).slice(0,8);
    return `<div style="margin-bottom:16px"><div class="micro" style="margin-bottom:8px">${esc(PRETTY[a]||a)}</div>
      <div class="chips">${worst.map(([w,v])=>`<span class="chip">${word(w)} <b>${v.toFixed(2)}</b></span>`).join('')}</div></div>`;
  }).join('');

  return `<div class="page">${head}${cards}
    <div class="card" style="margin-bottom:20px"><div class="tw"><table>
      <thead><tr><th>Model</th><th>Test acc</th><th>Top-5 acc</th><th>Macro F1</th>
      <th>Params</th><th>Latency</th><th>Train time</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>

    <div style="margin-bottom:20px">${bars}</div>
    <div style="margin-bottom:20px">${groups}</div>
    ${curves ? `<div class="hair"></div><div style="margin-bottom:20px">${curves}</div>` : ''}
    ${cms ? `<div class="hair"></div><h3 style="margin-bottom:14px">Confusion matrices</h3>
             <div class="grid g2" style="margin-bottom:20px">${cms}</div>` : ''}
    <div class="hair"></div>
    <div class="card" style="margin-bottom:20px"><h3>Weakest classes</h3>
      <p style="font-size:13.5px;margin-bottom:14px">Lowest per-class F1 — the words to avoid in a live
      demo, and the ones most in need of extra takes.</p>${weak}</div>

    <div class="note"><b>Limitations, stated up front.</b> Isolated single signs only, not continuous
    sentences. Trained on studio footage, so a laptop webcam is a different distribution and live accuracy
    sits below these numbers. No facial landmarks, so ISL grammar carried by eyebrows and head movement is
    invisible. Test clips come from the same recording sessions as training clips — a signer-disjoint split
    would be harder and more honest, and is the natural next experiment.</div>
  </div>`;
}

/* ========================================================================== */
/* PAGES — mocked UI                                                           */
/* ========================================================================== */
const GLOSS_RULES = [
  [/\b(i am|i'm)\b/gi,'I'], [/\b(a|an|the|is|are|am|was|were|to|of|do|does)\b/gi,''],
  [/\byesterday\b/gi,'YESTERDAY'], [/\btomorrow\b/gi,'TOMORROW'], [/\btoday\b/gi,'TODAY'],
];
function toGloss(text){
  let t = ' ' + text + ' ';
  for (const [re, rep] of GLOSS_RULES) t = t.replace(re, ' ' + rep + ' ');
  const words = t.split(/\s+/).filter(Boolean).map(w => w.toUpperCase().replace(/[^A-Z']/g,''))
                 .filter(Boolean);
  // ISL leads with time, then topic — a rough demonstration of the reordering idea
  const time = words.filter(w => ['YESTERDAY','TODAY','TOMORROW','MORNING','NIGHT'].includes(w));
  const rest = words.filter(w => !time.includes(w));
  return [...time, ...rest];
}

function pageReverse(){
  return `<div class="page">
    <div class="head"><div class="micro">Reverse mode · English → ISL</div>
      <h2>Reply in sign.</h2>
      <p>Type English, watch it reorder into ISL gloss, then play the signs back.
      <b>Design preview</b> — clip playback is not wired to real footage yet.</p></div>

    <div class="side">
      <div>
        <div class="card" style="margin-bottom:16px">
          <label class="micro" for="revIn">English input</label>
          <textarea id="revIn" rows="3" placeholder="I went to the hospital yesterday">I went to the hospital yesterday</textarea>
          <div style="height:12px"></div>
          <button class="btn-copper" id="revGo">Translate to gloss</button>
        </div>
        <div class="card" style="margin-bottom:16px">
          <h3>ISL gloss</h3>
          <p style="font-size:13px;margin-bottom:12px">Articles and the copula are dropped; time moves
          to the front. ISL is topic-first, not English word order.</p>
          <div class="gloss" id="glossOut"></div>
        </div>
        <div class="player"><div class="lbl" id="playLbl">—</div></div>
        <div class="seg-bar" id="segBar"></div>
      </div>
      <aside>
        <div class="card"><h3>Queue</h3><div class="log" id="queue">
          <div class="empty-note">Translate something first.</div></div></div>
        <div class="card" style="margin-top:16px"><h3>Why a clip library</h3>
          <p style="font-size:13.5px">Recorded clips of real signers are correct by construction. A
          generative model could invent a plausible-looking sign that means nothing — worse than useless
          in a hospital. Retrieval first, synthesis much later.</p></div>
      </aside>
    </div></div>`;
}
function mountReverse(){
  const run = () => {
    const g = toGloss($('#revIn').value || '');
    $('#glossOut').innerHTML = g.length
      ? g.map((w,i)=>`<span style="animation-delay:${i*55}ms">${esc(w)}</span>`).join('')
      : '<span class="micro" style="border:0;background:none">nothing to translate</span>';
    $('#segBar').innerHTML = g.map((_,i)=>`<i class="${i===0?'now':''}"></i>`).join('');
    $('#playLbl').textContent = g[0] || '—';
    $('#queue').innerHTML = g.length
      ? g.map((w,i)=>`<div class="log-row"><span class="w">${esc(w)}</span><span class="t">${i+1}</span></div>`).join('')
      : '<div class="empty-note">Translate something first.</div>';
  };
  $('#revGo').onclick = run; run();
}

function pagePractice(){
  const words = ['hello','thank you','today','tomorrow','doctor','book'];
  return `<div class="page">
    <div class="head"><div class="micro">Practice mode</div><h2>Learn by doing.</h2>
      <p>Copy the reference sign and get a similarity score. <b>Design preview</b> — trajectory scoring
      is not implemented; the score shown is illustrative.</p></div>
    <div class="grid g2" style="margin-bottom:20px">
      <div class="card"><h3>Reference</h3>
        <div class="player" style="aspect-ratio:1/1"><div class="lbl">HELLO</div></div></div>
      <div class="card"><h3>You</h3>
        <div class="player" style="aspect-ratio:1/1">
          <svg width="150" height="150" viewBox="0 0 120 120" class="radial">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#26262f" stroke-width="9"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="#6EE7F2" stroke-width="9"
              stroke-linecap="round" stroke-dasharray="314" stroke-dashoffset="76"
              transform="rotate(-90 60 60)"/>
            <text x="60" y="67" text-anchor="middle" fill="#6EE7F2"
              style="font-family:Fraunces,serif;font-size:26px">76</text></svg></div></div>
    </div>
    <div class="card" style="margin-bottom:20px"><h3>Feedback</h3>
      <ul style="margin-left:18px;color:var(--cream-dim);font-size:14px">
        <li>Handshape matches the reference closely.</li>
        <li>Movement starts about 0.3s late — begin sooner after the beep.</li>
        <li>Keep your non-dominant hand in frame throughout.</li></ul></div>
    <div class="card"><h3>Lesson · Everyday greetings</h3>
      <div class="chips">${words.map((w,i)=>`<span class="chip" ${i===0?'style="border-color:var(--cyan);color:var(--cyan)"':''}>${word(w)}</span>`).join('')}</div></div>
  </div>`;
}

function pageTranscripts(){
  const rows = state.transcript.length ? state.transcript : [
    {w:'hello', c:.93, t:'—'}, {w:'doctor', c:.71, t:'—'}, {w:'today', c:.64, t:'—'}];
  return `<div class="page">
    <div class="head"><div class="micro">Transcripts</div><h2>Sessions, kept only if you ask.</h2>
      <p>Saving is opt-in. ${state.transcript.length ? 'Below is this session, live from the Live page.' :
      '<b>Sample data</b> — use the Live page to generate a real one.'}</p></div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px">
        <h3 style="margin:0">Current session</h3>
        <div class="seg" style="flex:0"><button id="expTxt">Export .txt</button><button id="expSrt">Export .srt</button></div>
      </div>
      <div class="log">${rows.map(r=>`<div class="log-row"><span class="w">${word(r.w)}</span>
        <span class="t">${esc(r.t)} · ${Math.round(r.c*100)}%</span></div>`).join('')}</div></div>
    <div class="note">Frames are never stored. A transcript holds recognised words and timestamps only —
    no video, no landmarks.</div></div>`;
}
function mountTranscripts(){
  const rows = state.transcript.length ? state.transcript
    : [{w:'hello',c:.93,t:'—'},{w:'doctor',c:.71,t:'—'},{w:'today',c:.64,t:'—'}];
  const dl = (name, body) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], {type:'text/plain'}));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#expTxt').onclick = () => dl('silent-voice-transcript.txt',
    rows.map(r => `[${r.t}] ${r.w} (${Math.round(r.c*100)}%)`).join('\n'));
  $('#expSrt').onclick = () => dl('silent-voice-transcript.srt',
    rows.map((r,i) => `${i+1}\n00:00:${String(i*2).padStart(2,'0')},000 --> 00:00:${String(i*2+2).padStart(2,'0')},000\n${r.w}\n`).join('\n'));
}

function pageSettings(){
  const sw = (id,t,d,on) => `<div class="switch"><div><div class="t">${t}</div><div class="d">${d}</div></div>
    <button class="toggle ${on?'on':''}" id="${id}" role="switch" aria-checked="${on}" aria-label="${t}"></button></div>`;
  return `<div class="page">
    <div class="head"><div class="micro">Settings</div><h2>Tune it to the room.</h2>
    <p>Reduced motion is applied for real. The rest is <b>design preview</b>.</p></div>
    <div class="grid g2">
      <div class="card"><h3>Recognition</h3>
        <div class="field"><label class="micro" for="dp">Domain pack</label>
          <select id="dp"><option>Everyday</option><option>Medical</option><option>Classroom</option></select></div>
        ${sw('tLand','Landmarks only','Hide the camera feed, show only the skeleton', state.settings.landmarksOnly)}
        ${sw('tSave','Save transcripts','Keep recognised words for this session', state.settings.saveTranscripts)}
      </div>
      <div class="card"><h3>Speech &amp; motion</h3>
        <div class="field"><label class="micro" for="voice">TTS voice</label>
          <select id="voice"><option>Warm</option><option>Neutral</option><option>Bright</option></select></div>
        <div class="field"><label class="micro" for="rate">Speech rate</label>
          <input type="range" id="rate" min="0.5" max="2" step="0.1" value="1" style="width:100%"></div>
        ${sw('tMotion','Reduced motion','Disable grain, caption assembly and transitions', state.settings.reducedMotion)}
      </div></div></div>`;
}
function mountSettings(){
  const bind = (id, key, fn) => {
    const el = $('#' + id); if (!el) return;
    el.onclick = () => {
      const on = !el.classList.contains('on');
      el.classList.toggle('on', on); el.setAttribute('aria-checked', on);
      state.settings[key] = on; fn?.(on);
    };
  };
  bind('tMotion','reducedMotion', on => document.body.classList.toggle('no-motion', on));
  bind('tLand','landmarksOnly'); bind('tSave','saveTranscripts');
}

function pageAbout(){
  return `<div class="page">
    <div class="head"><div class="micro">About</div><h2>Why this exists.</h2></div>
    <p class="lead" style="margin-bottom:28px">India has on the order of 300 certified ISL interpreters
    for a Deaf population in the millions. A Deaf patient at a district hospital today either brings a
    family member to interpret, or goes without. Silent Voice does not close that gap — but it makes
    short, high-frequency exchanges survivable without one.</p>

    <div class="hair"></div>
    <h3 style="margin-bottom:14px">How it works</h3>
    <div class="pipeline" style="margin-bottom:26px">
      <span class="step">Webcam frame</span><span class="arr">→</span>
      <span class="step">MediaPipe Holistic</span><span class="arr">→</span>
      <span class="step">21+21 hand · 33 pose landmarks</span><span class="arr">→</span>
      <span class="step">normalise · 60×225 tensor</span><span class="arr">→</span>
      <span class="step">BiLSTM</span><span class="arr">→</span>
      <span class="step">word + confidence</span>
    </div>

    <div class="grid g3">
      <div class="card"><h3>Privacy</h3><p>Frames are processed and discarded. Only landmark coordinates
      are classified, and nothing leaves your machine in this build.</p></div>
      <div class="card"><h3>Honesty</h3><p>Confidence is always shown. Low-confidence predictions offer
      alternatives instead of guessing silently.</p></div>
      <div class="card"><h3>Limits</h3><p>Isolated signs from a fixed vocabulary. Not sentences, not a
      substitute for a human interpreter.</p></div>
    </div>

    <div class="hair"></div>
    <div class="note"><b>Division of work.</b> BiLSTM and the 1D-CNN baseline are mine; the Transformer
    is my teammate's. All three run through one shared training function so the comparison on the
    <a href="#/results" style="color:var(--cyan)">Results</a> page is controlled.</div>
  </div>`;
}

/* ========================================================================== */
/* router                                                                      */
/* ========================================================================== */
const ROUTES = {
  '#/':            { t:'Home',        render: pageHome },
  '#/live':        { t:'Live',        render: pageLive,        mount: mountLive, teardown: teardownLive },
  '#/results':     { t:'Results',     render: pageResults },
  '#/reverse':     { t:'Reverse',     render: pageReverse,     mount: mountReverse },
  '#/practice':    { t:'Practice',    render: pagePractice },
  '#/transcripts': { t:'Transcripts', render: pageTranscripts, mount: mountTranscripts },
  '#/settings':    { t:'Settings',    render: pageSettings,    mount: mountSettings },
  '#/about':       { t:'About',       render: pageAbout },
};
let current = null;

async function route(){
  const hash = location.hash || '#/';
  const r = ROUTES[hash] || ROUTES['#/'];

  current?.teardown?.();
  current = r;

  $$('#navLinks a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === hash));
  document.title = `Silent Voice — ${r.t}`;

  const main = $('#main');
  main.innerHTML = '<div class="page"><p class="micro">Loading…</p></div>';
  try {
    main.innerHTML = await r.render();
    await r.mount?.();
  } catch (e) {
    main.innerHTML = `<div class="page"><div class="card"><h3>Something broke on this page</h3>
      <p class="mono" style="margin-top:10px;color:var(--copper)">${esc(e.message)}</p>
      <p style="margin-top:12px">Other pages still work — use the nav above.</p></div></div>`;
    console.error(e);
  }
  window.scrollTo(0,0);
}

$('#navLinks').innerHTML = NAV.map(([h,t]) => `<a href="${h}">${t}</a>`).join('');
addEventListener('hashchange', route);
route();
