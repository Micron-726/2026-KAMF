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
