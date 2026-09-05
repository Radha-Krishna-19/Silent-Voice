/**
 * A 3-D hand, rigged on the same 21-landmark topology the recogniser consumes.
 *
 * Two ways it can be driven, and the distinction is deliberate:
 *
 *   PROCEDURAL  — forward kinematics over five fingers with three flexion
 *                 joints each. Used for reactions: typing, waving, pointing.
 *                 This motion is invented, and the caption says so.
 *   REPLAY      — the 21 points are set directly from sign-bank frames, i.e.
 *                 from a real person's recorded landmarks. Nothing is
 *                 interpolated or stylised. Those frames are 2-D (MediaPipe
 *                 x,y), so during replay the hand is a flat constellation
 *                 rotating in 3-D space, not a depth reconstruction. Claiming
 *                 otherwise would be inventing a z axis we never measured.
 *
 * Architecture: the render loop lives entirely outside React. Typing at 100 wpm
 * must not schedule 500 re-renders, so keystrokes go in through an imperative
 * handle and mutate the rig in place.
 */
import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from "react";
import * as THREE from "three";
import { useReducedMotionPref } from "./motion/preference";
import {
  EDGES, TIP_INDICES, KEY_FINGER, KEY_X, REST_CURL,
  solveHand, makeBuffer, applyFrame, clamp,
} from "./handModel";

const CYAN = 0x6ee7f2;
const COPPER = 0xc97b4a;
const CREAM = 0xf2ece0;
const TIPS = new Set(TIP_INDICES);


/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */
const HandRig = forwardRef(function HandRig(
  { className = "", accent = COPPER, showCaption = true },
  ref
) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const reduced = useReducedMotionPref();
  const [failed, setFailed] = useState(false);
  const [caption, setCaption] = useState(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      // A context is only really proven when we can read it back.
      if (!renderer.getContext()) throw new Error("no webgl context");
    } catch {
      setFailed(true);            // jsdom, blocked GPU, ancient driver
      return undefined;
    }

    const W = () => mount.clientWidth || 480;
    const H = () => mount.clientHeight || 480;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W(), H());
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 100);
    camera.position.set(0, 0.75, 4.4);
    camera.lookAt(0, 0.72, 0);

    const group = new THREE.Group();
    scene.add(group);

    // ---- meshes -----------------------------------------------------
    const jointGeo = new THREE.SphereGeometry(1, 14, 12);
    const jointMat = new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0.95 });
    const joints = new THREE.InstancedMesh(jointGeo, jointMat, 21);
    joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    joints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(21 * 3), 3);
    group.add(joints);

    const glowGeo = new THREE.SphereGeometry(1, 10, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.InstancedMesh(glowGeo, glowMat, 21);
    glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(glow);

    const boneGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const boneMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55 });
    const bones = new THREE.InstancedMesh(boneGeo, boneMat, EDGES.length);
    bones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(bones);

    // Faint ground reflection: sells the idea that the hand is in a space.
    const shadowGeo = new THREE.CircleGeometry(1.15, 40);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.62;
    scene.add(shadow);

    // ---- rig state --------------------------------------------------
    // buf is the plain-array output of handModel (unit tested); pts mirrors it
    // as Vector3 for the matrix maths. Copying 21 triples a frame is free.
    const buf = makeBuffer();
    const pts = Array.from({ length: 21 }, () => new THREE.Vector3());
    const syncPts = () => {
      for (let i = 0; i < 21; i++) pts[i].set(buf[i][0], buf[i][1], buf[i][2]);
    };
    const curl = [REST_CURL, REST_CURL, REST_CURL, REST_CURL, REST_CURL];
    const curlV = [0, 0, 0, 0, 0];
    const curlT = [REST_CURL, REST_CURL, REST_CURL, REST_CURL, REST_CURL];
    const spread = [0, 0, 0, 0, 0];
    const spreadT = [0, 0, 0, 0, 0];

    const rig = {
      mood: "idle",
      moodUntil: 0,
      yaw: 0, pitch: 0, roll: 0,
      yawT: 0, pitchT: 0, rollT: 0,
      shiftX: 0, shiftXT: 0,
      shakeAmp: 0,
      pointer: { x: 0, y: 0 },
      replay: null,      // { frames, quant, fps, started, label, loop }
      lastKeyAt: 0,
    };

    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    const P = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);
    const dirV = new THREE.Vector3();
    const col = new THREE.Color();

    const IDENTITY = new THREE.Quaternion();

    function writeMeshes() {
      for (let i = 0; i < 21; i++) {
        const r = TIPS.has(i) ? 0.062 : i === 0 ? 0.075 : 0.048;
        M.compose(pts[i], IDENTITY, S.set(r, r, r));
        joints.setMatrixAt(i, M);
        const g = r * 3.1;
        M.compose(pts[i], IDENTITY, S.set(g, g, g));
        glow.setMatrixAt(i, M);
        col.setHex(TIPS.has(i) ? accent : CREAM);
        joints.setColorAt(i, col);
      }
      joints.instanceMatrix.needsUpdate = true;
      if (joints.instanceColor) joints.instanceColor.needsUpdate = true;
      glow.instanceMatrix.needsUpdate = true;

      for (let e = 0; e < EDGES.length; e++) {
        const a = pts[EDGES[e][0]];
        const b = pts[EDGES[e][1]];
        dirV.subVectors(b, a);
        const len = dirV.length() || 0.0001;
        P.addVectors(a, b).multiplyScalar(0.5);
        Q.setFromUnitVectors(UP, dirV.normalize());
        M.compose(P, Q, S.set(0.016, len, 0.016));
        bones.setMatrixAt(e, M);
      }
      bones.instanceMatrix.needsUpdate = true;
    }

    /* ---- animation loop -------------------------------------------- */
    let raf = 0;
    const clock = new THREE.Clock();

    function tick() {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();

      if (rig.mood !== "idle" && rig.moodUntil && now > rig.moodUntil) {
        rig.mood = "idle";
        rig.moodUntil = 0;
        setCaption(null);
        for (let i = 0; i < 5; i++) { curlT[i] = REST_CURL; spreadT[i] = 0; }
        rig.yawT = 0; rig.pitchT = 0; rig.rollT = 0; rig.shiftXT = 0;
      }

      let replayed = false;
      if (rig.replay) {
        const R = rig.replay;
        const idx = Math.floor(((now - R.started) / 1000) * R.fps);
        if (idx >= R.frames.length) {
          if (R.loop) R.started = now;
          else { rig.replay = null; setCaption(null); }
        }
        if (rig.replay) {
          const f = R.frames[Math.min(idx, R.frames.length - 1)];
          replayed = applyFrame(f, buf);
        }
      }

      if (!replayed) {
        // Spring every finger toward its target.
        for (let i = 0; i < 5; i++) {
          const k = 0.32;
          curlV[i] += (curlT[i] - curl[i]) * k;
          curlV[i] *= 0.62;
          curl[i] += curlV[i];
          spread[i] += (spreadT[i] - spread[i]) * 0.18;
        }
        if (rig.mood === "idle" && !reduced) {
          // Micro-tremor. A perfectly still hand looks like a dead render.
          for (let i = 0; i < 5; i++) {
            curl[i] += Math.sin(t * (1.1 + i * 0.27) + i * 2.1) * 0.012;
          }
        }
        solveHand(curl, spread, buf);
      }

      syncPts();
      writeMeshes();

      // ---- whole-hand transform
      if (rig.mood === "idle" && !reduced) {
        // Follow the pointer: presence, like eyes tracking a cursor.
        rig.yawT = rig.pointer.x * 0.55;
        rig.pitchT = -rig.pointer.y * 0.32;
        rig.rollT = rig.pointer.x * 0.12;
      }
      const ease = reduced ? 1 : 0.10;
      rig.yaw += (rig.yawT - rig.yaw) * ease;
      rig.pitch += (rig.pitchT - rig.pitch) * ease;
      rig.roll += (rig.rollT - rig.roll) * ease;
      rig.shiftX += (rig.shiftXT - rig.shiftX) * 0.12;

      rig.shakeAmp *= 0.88;
      const shake = rig.shakeAmp > 0.001 ? Math.sin(t * 46) * rig.shakeAmp : 0;

      group.rotation.set(rig.pitch, rig.yaw, rig.roll + shake);
      group.position.x = rig.shiftX + shake * 0.35;
      group.position.y = reduced ? 0 : Math.sin(t * 0.85) * 0.035;   // breathing
      shadow.scale.setScalar(1 + Math.sin(t * 0.85) * 0.03);

      renderer.render(scene, camera);
    }

    if (reduced) {
      // One static frame: honours the preference without a blank rectangle.
      solveHand(curl, spread, buf);
      syncPts();
      writeMeshes();
      renderer.render(scene, camera);
    } else {
      tick();
    }

    /* ---- imperative API -------------------------------------------- */
    apiRef.current = {
      press(key) {
        if (reduced) return;
        rig.lastKeyAt = performance.now();
        const f = KEY_FINGER[String(key).toLowerCase()] ?? 1;
        curlT[f] = 0.92;
        setTimeout(() => { if (rig.mood === "idle") curlT[f] = REST_CURL; }, 95);
        const kx = KEY_X[String(key).toLowerCase()];
        if (kx != null) rig.shiftXT = (kx - 0.5) * 0.5;
      },
      sweep() {                       // backspace: brush the character away
        if (reduced) return;
        rig.mood = "sweep";
        rig.moodUntil = performance.now() + 340;
        rig.rollT = 0.7;
        rig.yawT = -0.5;
        rig.shiftXT = -0.55;
        for (let i = 0; i < 5; i++) { curlT[i] = 0.05; spreadT[i] = -0.18; }
      },
      shy() {                         // password field focused: look away
        rig.mood = "shy";
        rig.moodUntil = 0;            // held until released
        rig.yawT = -1.15;
        rig.pitchT = 0.28;
        rig.rollT = -0.22;
        for (let i = 0; i < 5; i++) { curlT[i] = 0.62; spreadT[i] = 0.12; }
        if (showCaption) setCaption("not looking");
      },
      release() {
        if (rig.mood === "shy") {
          rig.mood = "idle";
          rig.moodUntil = 0;
          setCaption(null);
          for (let i = 0; i < 5; i++) { curlT[i] = REST_CURL; spreadT[i] = 0; }
        }
      },
      point(dx = 0, dy = 0) {         // index out, aimed at a UI target
        if (reduced) return;
        rig.mood = "point";
        rig.moodUntil = performance.now() + 900;
        curlT[0] = 0.55; curlT[1] = 0.0; curlT[2] = 0.95; curlT[3] = 0.95; curlT[4] = 0.95;
        rig.yawT = clamp(dx * 0.7, -0.8, 0.8);
        rig.pitchT = clamp(-dy * 0.5, -0.5, 0.5);
      },
      thumbsUp() {
        if (reduced) return;
        rig.mood = "thumb";
        rig.moodUntil = performance.now() + 1100;
        curlT[0] = 0.0; curlT[1] = 1.0; curlT[2] = 1.0; curlT[3] = 1.0; curlT[4] = 1.0;
        rig.rollT = -0.25; rig.yawT = 0.2;
        if (showCaption) setCaption("nice");
      },
      wave() {
        if (reduced) return;
        rig.mood = "wave";
        rig.moodUntil = performance.now() + 1500;
        for (let i = 0; i < 5; i++) { curlT[i] = 0.05; spreadT[i] = 0.10; }
        let n = 0;
        const id = setInterval(() => {
          rig.rollT = (n % 2 ? 1 : -1) * 0.38;
          if (++n > 5) { clearInterval(id); rig.rollT = 0; }
        }, 190);
      },
      shake() {
        rig.shakeAmp = 0.16;
        rig.mood = "error";
        rig.moodUntil = performance.now() + 600;
        for (let i = 0; i < 5; i++) curlT[i] = 0.75;
      },
      /** Replay real recorded landmarks. `frames` come from /api/text-to-sign. */
      playSign(frames, { fps = 12, quant = 1000, label = "", loop = false } = {}) {
        if (!frames?.length) return false;
        rig.replay = { frames, fps, quant, label, loop, started: performance.now() };
        rig.mood = "idle";
        rig.yawT = 0; rig.pitchT = 0; rig.rollT = 0; rig.shiftXT = 0;
        if (showCaption && label) setCaption(`signing “${label}”`);
        return true;
      },
      stopSign() { rig.replay = null; setCaption(null); },
      isReplaying() { return !!rig.replay; },
      setPointer(x, y) { rig.pointer.x = x; rig.pointer.y = y; },
      idleSince() { return performance.now() - rig.lastKeyAt; },
    };

    /* ---- resize ----------------------------------------------------- */
    const ro = new ResizeObserver(() => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      if (reduced) renderer.render(scene, camera);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      [jointGeo, glowGeo, boneGeo, shadowGeo].forEach((g) => g.dispose());
      [jointMat, glowMat, boneMat, shadowMat].forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, accent]);

  useImperativeHandle(ref, () => ({
    press: (k) => apiRef.current?.press(k),
    sweep: () => apiRef.current?.sweep(),
    shy: () => apiRef.current?.shy(),
    release: () => apiRef.current?.release(),
    point: (x, y) => apiRef.current?.point(x, y),
    thumbsUp: () => apiRef.current?.thumbsUp(),
    wave: () => apiRef.current?.wave(),
    shake: () => apiRef.current?.shake(),
    playSign: (f, o) => apiRef.current?.playSign(f, o) ?? false,
    stopSign: () => apiRef.current?.stopSign(),
    isReplaying: () => apiRef.current?.isReplaying() ?? false,
    setPointer: (x, y) => apiRef.current?.setPointer(x, y),
    idleSince: () => apiRef.current?.idleSince() ?? 0,
    ready: () => !!apiRef.current,
  }), []);

  if (failed) {
    // WebGL unavailable. Rather than an empty box, fall back to the 2-D
    // landmark overlay, which carries the same visual language.
    return (
      <div className={`relative ${className}`} data-testid="hand-rig-fallback">
        <FallbackHand />
        <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] uppercase tracking-widest text-cream/30">
          2-D fallback · WebGL unavailable
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} data-testid="hand-rig">
      <div ref={mountRef} className="absolute inset-0" />
      {showCaption && caption && (
        <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-[0.24em] text-copper/80">{caption}</span>
        </div>
      )}
    </div>
  );
});

/* Static SVG hand, used only when WebGL is missing. */
function FallbackHand() {
  const r = REST_CURL;
  const pts = solveHand([r, r, r, r, r], [0, 0, 0, 0, 0], makeBuffer());
  const px = (p) => 50 + p[0] * 34;
  const py = (p) => 88 - p[1] * 34;
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
      {EDGES.map(([a, b], i) => (
        <line key={i} x1={px(pts[a])} y1={py(pts[a])} x2={px(pts[b])} y2={py(pts[b])}
          stroke="#6EE7F2" strokeWidth="0.7" strokeLinecap="round" opacity="0.55" />
      ))}
      {pts.map((p, i) => (
        <circle key={i} cx={px(p)} cy={py(p)} r={TIPS.has(i) ? 1.5 : 1.1}
          fill={TIPS.has(i) ? "#C97B4A" : "#F2ECE0"} opacity="0.9" />
      ))}
    </svg>
  );
}

export default HandRig;
