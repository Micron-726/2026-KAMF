// booth/controls.mjs — motion_control.py --body 이식 (순수 로직)
export const L_SH = 11, R_SH = 12, L_HIP = 23, R_HIP = 24;
export const VIS_MIN = 0.3;
export const LANE_TRIGGER = 0.35, LANE_HYST = 0.12;

const vis = (q) => (q == null || q.visibility == null ? 1 : q.visibility);

export function readingFromLandmarks(landmarks, aspect) {
  if (!landmarks || landmarks.length < 25) return { ok: false };
  const ls = landmarks[L_SH], rs = landmarks[R_SH];
  const lh = landmarks[L_HIP], rh = landmarks[R_HIP];
  if (!ls || !rs || !lh || !rh) return { ok: false };
  if (Math.min(vis(ls), vis(rs), vis(lh), vis(rh)) < VIS_MIN) return { ok: false };
  const hipY = (lh.y + rh.y) / 2;
  const shY = (ls.y + rs.y) / 2;
  const rawCx = (lh.x + rh.x) / 2;
  return {
    ok: true,
    cx: 1 - rawCx,                 // 거울 반전: 몸을 왼쪽으로 → 화면 왼쪽
    yJump: hipY,
    scale: Math.max(hipY - shY, 1e-3),
  };
}

export function fitLane(cx, scaleX) {
  const half = LANE_TRIGGER * scaleX;
  const hyst = LANE_HYST * scaleX;
  const center = Math.min(Math.max(cx, half), 1 - half);
  return { center, half, hyst };
}

export function laneZone(cx, lane, cur = 1) {
  const left = lane.center - lane.half;
  const right = lane.center + lane.half;
  const lb = left + (cur === 0 ? lane.hyst : -lane.hyst);
  const rb = right - (cur === 2 ? lane.hyst : -lane.hyst);
  if (cx < lb) return 0;
  if (cx > rb) return 2;
  return 1;
}

export const CALIB_HOLD = 1.5, CALIB_TOL = 0.20;
export const SCALE_MIN = 0.10, SCALE_MAX = 0.45;

export class Calibrator {
  constructor() { this.reset(); }
  reset() { this.samples = []; }   // 각 항목 [t, cx, yJump, scale]

  _restart(now, r) { this.samples = [[now, r.cx, r.yJump, r.scale]]; }

  update(r, now) {
    if (!r || !r.ok) { this.samples = []; return { progress: 0, hint: 'STEP INTO VIEW', result: null }; }
    if (r.scale > SCALE_MAX) { this.samples = []; return { progress: 0, hint: 'TOO CLOSE', result: null }; }
    if (r.scale < SCALE_MIN) { this.samples = []; return { progress: 0, hint: 'TOO FAR', result: null }; }

    this.samples.push([now, r.cx, r.yJump, r.scale]);

    const tol = CALIB_TOL * r.scale;
    for (const i of [1, 2, 3]) { // cx, yJump, scale
      let mn = Infinity, mx = -Infinity;
      for (const s of this.samples) { if (s[i] < mn) mn = s[i]; if (s[i] > mx) mx = s[i]; }
      if (mx - mn > tol) { this._restart(now, r); return { progress: 0, hint: 'STAND STILL', result: null }; }
    }

    const span = now - this.samples[0][0];
    if (span >= CALIB_HOLD && this.samples.length >= 10) {
      const n = this.samples.length;
      const avg = (i) => this.samples.reduce((a, s) => a + s[i], 0) / n;
      return { progress: 1, hint: 'READY', result: { cx: avg(1), yJump: avg(2), scale: avg(3) } };
    }
    return { progress: Math.min(span / CALIB_HOLD, 0.99), hint: 'STAND STILL', result: null };
  }
}
