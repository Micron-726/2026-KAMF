// booth/overlay.mjs — 미리보기 렌더
import { L_SH, R_SH, L_HIP, R_HIP } from './controls.mjs';

export function skeletonSegments(lms) {
  if (!lms || lms.length < 25) return [];
  const ls = lms[L_SH], rs = lms[R_SH], lh = lms[L_HIP], rh = lms[R_HIP];
  if (!ls || !rs || !lh || !rh) return [];
  const midSh = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  return [
    [{ x: ls.x, y: ls.y }, { x: rs.x, y: rs.y }],   // 어깨선
    [{ x: lh.x, y: lh.y }, { x: rh.x, y: rh.y }],   // 엉덩이선
    [midSh, midHip],                                 // 척추선
  ];
}

// 비디오+스켈레톤+상태를 그린다. opts.mirror(기본 true)가 거짓이면 거울 반전을
// 생략한다 — 그 경우 비디오와 스켈레톤 모두 반전 없는 동일 좌표계로 그려진다.
export function drawOverlay(ctx, videoEl, lms, state = {}, opts = {}) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const mirror = opts.mirror ?? true;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }   // 거울: x축 반전
  ctx.drawImage(videoEl, 0, 0, w, h);
  // 스켈레톤(정규좌표→픽셀). 비디오가 이미 반전되어 그려졌으므로 원좌표 사용.
  ctx.strokeStyle = state.jumping ? '#ffd400' : '#00e0ff';
  ctx.lineWidth = 4;
  for (const [a, b] of skeletonSegments(lms)) {
    ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
  }
  ctx.restore();
  // 상태 텍스트(반전 안 함)
  if (state.hint || state.phase) {
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(h * 0.09)}px sans-serif`;
    ctx.fillText(state.hint || '', 10, h - 12);
  }
}
