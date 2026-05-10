// Vendored from https://github.com/KilledByAPixel/ZzFX (ZzFXMicro v1.3.2)
// Original by Frank Force. MIT License.
//
// ZzFX is a tiny procedural sound generator (~1KB). We use it for all in-game
// SFX (Phase 6c) so the repo stays binary-free. Sound parameters live in
// AudioSystem; this file is just the synthesis core.
//
// Modifications vs. upstream:
//   • Wrapped as an ES module with explicit exports.
//   • AudioContext is created lazily and exposed so callers can route through
//     a master GainNode (master-volume slider in Settings).
//   • Output destination is overridable per call.

/* eslint-disable */

let _ctx: AudioContext | null = null;
let _vol = 0.3;

export function zzfxContext(): AudioContext {
  if (!_ctx) {
    const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const Ctor = W.webkitAudioContext ?? AudioContext;
    _ctx = new Ctor();
  }
  return _ctx;
}

export function zzfxSetVolume(v: number): void {
  _vol = v;
}

// prettier-ignore
export function zzfx(
  params: number[],
  destination?: AudioNode,
): AudioBufferSourceNode {
  const [
    p0 = 1, k0 = 0.05, b0 = 220, e0 = 0, r0 = 0, t0 = 0.1,
    q  = 0, D  = 1,    u0 = 0,   y0 = 0, v0 = 0, z0 = 0, l0 = 0,
    E  = 0, A0 = 0,    F  = 0,   c0 = 0, w  = 1, m0 = 0, B  = 0, N = 0,
  ] = params;

  const X = zzfxContext();
  const M = Math;
  const d = 2 * M.PI;
  const R = 44100;

  let p = p0;
  let b = b0;
  let u = u0;
  let y = y0;
  let v = v0;
  let A = A0;
  const z = z0 * R;
  let l = l0;
  let e = e0;
  let m = m0;
  let r = r0;
  let t = t0;
  let c = c0;

  const G = (u *= 500 * d / R / R);
  const k: number[] = [];
  const C = (b *= (1 - k0 + 2 * k0 * M.random()) * d / R);
  let g = 0, H = 0, a = 0, n = 1, I = 0, J = 0, f = 0;
  const hSign = N < 0 ? -1 : 1;
  const xInit = d * hSign * N * 2 / R;
  const L = M.cos(xInit);
  const Z = M.sin;
  const K = Z(xInit) / 4;
  const O = 1 + K;
  const Xc = -2 * L / O;
  const Yc = (1 - K) / O;
  const Pc = (1 + hSign * L) / 2 / O;
  const Qc = -(hSign + L) / O;
  const S = Pc;
  let T = 0, U = 0, V = 0, W = 0;

  e = R * e + 9;
  m *= R; r *= R; t *= R; c *= R;
  y *= 500 * d / R ** 3;
  A *= d / R;
  v *= d / R;
  l = (R * l) | 0;
  p *= _vol;

  const total = (e + m + r + t + c) | 0;
  while (a < total) {
    const skip = F !== 0 && (++J % ((100 * F) | 0)) !== 0;
    if (!skip) {
      // Waveform
      if (q) {
        if (q < 2)      f = 1 - 4 * M.abs(M.round(g / d) - g / d); // triangle
        else if (q < 3) f = 1 - ((2 * g / d) % 2 + 2) % 2;          // saw
        else if (q < 4) f = M.max(M.min(M.tan(g), 1), -1);          // tan
        else if (q < 5) f = Z(g ** 3);                              // tan2
        else            f = (((g / d) % 1) < D / 2 ? 1 : 0) * 2 - 1; // square
      } else {
        f = Z(g);                                                    // sine
      }

      // Tremolo + shape curve + ADSR
      const trem = l ? 1 - B + B * Z(d * a / l) : 1;
      const curved = q > 4 ? f : (f < 0 ? -1 : 1) * M.abs(f) ** D;
      let env: number;
      if (a < e)             env = a / e;
      else if (a < e + m)    env = 1 - (a - e) / m * (1 - w);
      else if (a < e + m + r) env = w;
      else if (a < total - c) env = (total - a - c) / t * w;
      else                    env = 0;
      f = trem * curved * env;

      // Delay
      if (c) {
        f = f / 2 + (c > a ? 0 : ((a < total - c ? 1 : (total - a) / c) * k[(a - c) | 0] / 2 / p));
      }

      // Resonant filter
      if (N) {
        const next = S * T + Qc * (T = U) + Pc * (U = f) - Yc * V - Xc * (V = W);
        W = next;
        f = W;
      }
    }

    k[a++] = f * p;

    // Phase advance (always, even when bit-crush holds the sample)
    const xx = (b += u += y) * M.cos(A * H++);
    g += xx + xx * E * Z(a ** 5);
    if (n && ++n > z) { b += v; n = 0; }
    if (l && (++I % l) === 0) { b = C; u = G; n = n || 1; }
  }

  const buffer = X.createBuffer(1, total || 1, R);
  buffer.getChannelData(0).set(k);
  const source = X.createBufferSource();
  source.buffer = buffer;
  source.connect(destination ?? X.destination);
  source.start();
  return source;
}
