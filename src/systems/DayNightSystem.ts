// Stretch goal §12 "Day/night cycle" — slow tint cycle with raids skewed
// toward night. We track sim time in seconds; daylight is a sinusoidal
// 0..1 scalar peaking at noon. RaidSystem multiplies its power roll by a
// night-bias factor read from this system; GameScene reads the daylight
// to update a fullscreen overlay rectangle. UI reads phase() for the clock.

const DEFAULT_DAY_LENGTH_SEC = 240; // 4 min wall-clock per in-game day

class _DayNightSystem {
  private timeSec = DEFAULT_DAY_LENGTH_SEC * 0.35; // start mid-morning so a
                                                   // fresh game opens in
                                                   // daylight
  private dayCount = 1;
  private dayLengthSec = DEFAULT_DAY_LENGTH_SEC;

  reset(): void {
    this.timeSec = this.dayLengthSec * 0.35;
    this.dayCount = 1;
  }

  hydrate(state: { timeSec?: number; dayCount?: number } | undefined): void {
    if (!state) return;
    if (typeof state.timeSec === 'number') this.timeSec = state.timeSec;
    if (typeof state.dayCount === 'number') this.dayCount = state.dayCount;
  }

  serialize(): { timeSec: number; dayCount: number } {
    return { timeSec: this.timeSec, dayCount: this.dayCount };
  }

  update(dtSec: number): void {
    this.timeSec += dtSec;
    while (this.timeSec >= this.dayLengthSec) {
      this.timeSec -= this.dayLengthSec;
      this.dayCount += 1;
    }
  }

  // 0..1 brightness, 0 = midnight, 1 = noon. Smooth sinusoid so the
  // overlay tween looks natural without per-frame easing.
  daylight(): number {
    const t = this.timeSec / this.dayLengthSec; // 0..1
    // sin(πt) peaks at t=0.5 (noon) and is 0 at t=0 (midnight) and t=1.
    return Math.max(0, Math.sin(Math.PI * t));
  }

  // Discrete phase label for the clock indicator.
  phase(): 'dawn' | 'day' | 'dusk' | 'night' {
    const t = this.timeSec / this.dayLengthSec;
    if (t < 0.2) return 'night';
    if (t < 0.35) return 'dawn';
    if (t < 0.65) return 'day';
    if (t < 0.8) return 'dusk';
    return 'night';
  }

  // Multiplier applied to RaidSystem's power roll. Daytime raids are
  // weaker, nighttime raids are stronger; the curve is smooth so dawn /
  // dusk get intermediate values.
  raidPowerMultiplier(): number {
    // daylight in [0,1]; map 1 -> 0.8 (day), 0 -> 1.4 (midnight).
    return 1.4 - 0.6 * this.daylight();
  }

  dayCountValue(): number {
    return this.dayCount;
  }
}

export const DayNightSystem = new _DayNightSystem();
