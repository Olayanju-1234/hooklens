export type ClockMode = "live" | "timeshift" | "scrubbing" | "catchup";

export const REWIND_WINDOW = 120;

/**
 * Live head keeps moving while the viewer is rewound (DVR timeshift), so the world never pauses
 * just because someone is looking at the past.
 */
export class SimClock {
  live: number;
  view: number;
  mode: ClockMode = "live";
  frozen: boolean;
  private last: number | null = null;

  constructor(start: number, frozen = false) {
    this.live = start;
    this.view = start;
    this.frozen = frozen;
  }

  tick(nowMs: number) {
    const dt = this.last === null ? 0 : Math.min(0.1, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    if (!this.frozen) this.live += dt;
    if (this.mode === "live") this.view = this.live;
    else if (this.mode === "timeshift") this.view = Math.min(this.live, this.view + (this.frozen ? 0 : dt));
    else if (this.mode === "catchup") {
      this.view += Math.max(dt * 14, (this.live - this.view) * 0.18);
      if (this.view >= this.live - 0.02) this.mode = "live";
    }
    this.view = Math.max(this.live - REWIND_WINDOW, Math.min(this.view, this.live));
    if (this.mode === "timeshift" && this.view >= this.live - 0.02) this.mode = "live";
  }

  setFrozen(frozen: boolean) {
    this.frozen = frozen;
  }

  scrubTo(t: number) {
    this.mode = "scrubbing";
    this.view = Math.max(this.live - REWIND_WINDOW, Math.min(t, this.live));
  }

  release() {
    this.mode = this.view >= this.live - 0.05 ? "live" : "timeshift";
  }

  goLive() {
    this.mode = this.view >= this.live - 0.05 ? "live" : "catchup";
  }

  step(seconds: number) {
    if (this.frozen) {
      this.live += Math.max(0, seconds);
      this.view = this.mode === "live" ? this.live : Math.min(this.live, this.view + seconds);
      return;
    }
    this.scrubTo(this.view + seconds);
    this.release();
  }

  get offset(): number {
    return this.view - this.live;
  }

  get rewound(): boolean {
    return this.mode !== "live" && this.offset < -0.05;
  }
}
