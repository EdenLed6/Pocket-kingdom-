// Procedural SFX via ZzFX (vendored from GitHub, MIT). No binary audio assets:
// every sound is a parameter list synthesized on demand.
//
// Why no BGM? Eden chose ZzFX-only for Phase 6c. A music track would mean
// either a binary blob in git or a much larger procedural tracker; we can
// revisit in a later phase.

import { zzfx, zzfxContext, zzfxSetVolume } from '../lib/zzfx';

// ZzFX parameter order:
// volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
// slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation,
// bitCrush, delay, sustainVolume, decay, tremolo, filter
const PRESETS: Record<string, number[]> = {
  chop:           [1.6, 0.1, 180, 0.01, 0.04, 0.22, 4, 1.4, 0, 0, 0, 0, 0, 0, 2],
  mine:           [1.6, 0.1, 320, 0.01, 0.04, 0.18, 4, 1.6, 0, 0, 0, 0, 0, 0, 1.5],
  place:          [0.9, 0,   420, 0.02, 0.05, 0.15, 1, 1.5, -3],
  build_complete: [0.9, 0,   600, 0.02, 0.1,  0.28, 0, 1.5, 0, 0, 220, 0.08],
  sword:          [1.3, 0,   260, 0.01, 0.03, 0.1,  4, 2,   0, 0, 0, 0, 0, 1.8],
  arrow:          [0.8, 0,   320, 0.02, 0.05, 0.15, 2, 2,  -40, 0, 0, 0, 0, 0, 1.2],
  hurt:           [1.4, 0,   380, 0.01, 0.03, 0.18, 1, 1.5, -12],
  die:            [1.7, 0,   220, 0.02, 0.05, 0.45, 1, 1.5, -90, 0, 0, 0, 0, 0, 1],
  raid_warning:   [1.5, 0.05,200, 0.05, 0.4,  0.5,  1, 1,    0, 0, 0, 0, 0.1, 0, 0, 0, 0.05],
  button_tap:     [0.5, 0,   1500,0.005,0.005,0.05, 1, 2],
};

export type SfxId =
  | 'chop'
  | 'mine'
  | 'place'
  | 'build_complete'
  | 'sword'
  | 'arrow'
  | 'hurt'
  | 'die'
  | 'raid_warning'
  | 'button_tap';

const STORAGE_KEY = 'pocket_kingdom_audio_v1';

interface AudioSettings {
  master: number; // 0..1
  sfx: number;    // 0..1
  enabled: boolean;
}

const DEFAULTS: AudioSettings = { master: 0.7, sfx: 0.8, enabled: true };

class _AudioSystem {
  private settings: AudioSettings = { ...DEFAULTS };
  private masterGain: GainNode | null = null;
  private unlocked = false;
  // Per-id throttle so spammy events (many workers chopping at once) don't
  // pile up into a buzz.
  private lastPlayed = new Map<SfxId, number>();
  private throttleMs = 60;

  init(): void {
    this.loadSettings();
    this.applyVolume();
    // Unlock the context on the first pointer/key event (browser autoplay
    // policy). After that, sounds can fire from any handler.
    const tryUnlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      const ctx = zzfxContext();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', tryUnlock, { once: false });
    window.addEventListener('keydown', tryUnlock, { once: false });
    window.addEventListener('touchstart', tryUnlock, { once: false, passive: true });
  }

  play(id: SfxId): void {
    if (!this.settings.enabled) return;
    if (!this.unlocked) return; // pre-gesture: ignore silently
    const now = performance.now();
    const last = this.lastPlayed.get(id) ?? 0;
    if (now - last < this.throttleMs) return;
    this.lastPlayed.set(id, now);

    const params = [...PRESETS[id]];
    // Apply the SFX volume to ZzFX's first param (which is per-sound volume)
    // so master and sfx sliders are independently controllable.
    params[0] = (params[0] ?? 1) * this.settings.sfx;
    try {
      zzfx(params, this.masterGain ?? undefined);
    } catch {
      // Some browsers throw if the context is closed; swallow.
    }
  }

  setMasterVolume(v: number): void {
    this.settings.master = clamp01(v);
    this.applyVolume();
    this.saveSettings();
  }

  setSfxVolume(v: number): void {
    this.settings.sfx = clamp01(v);
    this.saveSettings();
  }

  setEnabled(on: boolean): void {
    this.settings.enabled = on;
    this.saveSettings();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  private applyVolume(): void {
    const ctx = zzfxContext();
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.connect(ctx.destination);
    }
    this.masterGain.gain.value = this.settings.master;
    // ZzFX has its own internal volume scalar; we keep it at 1 and rely on
    // the master GainNode + per-call sfx multiplier.
    zzfxSetVolume(1);
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      this.settings = {
        master: clamp01(parsed.master ?? DEFAULTS.master),
        sfx: clamp01(parsed.sfx ?? DEFAULTS.sfx),
        enabled: parsed.enabled ?? DEFAULTS.enabled,
      };
    } catch {
      // Corrupt JSON or storage disabled — keep defaults.
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage disabled — settings are session-local; no-op.
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export const AudioSystem = new _AudioSystem();
