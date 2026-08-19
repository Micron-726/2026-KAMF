import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingFromLandmarks, fitLane, laneZone } from '../booth/controls.mjs';

// 랜드마크 33개짜리 더미 생성기(필요한 인덱스만 채움)
function lm(overrides = {}) {
  const arr = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  arr[11] = { x: 0.4, y: 0.3, visibility: 1 }; // 왼어깨
  arr[12] = { x: 0.6, y: 0.3, visibility: 1 }; // 오른어깨
  arr[23] = { x: 0.45, y: 0.6, visibility: 1 }; // 왼엉덩이
  arr[24] = { x: 0.55, y: 0.6, visibility: 1 }; // 오른엉덩이
  return Object.assign(arr, overrides);
}

test('readingFromLandmarks: 정상 입력에서 cx(거울)·scale 계산', () => {
  const r = readingFromLandmarks(lm(), 640 / 480);
  assert.equal(r.ok, true);
  // rawCx = (0.45+0.55)/2 = 0.5 → 거울 1-0.5 = 0.5
  assert.ok(Math.abs(r.cx - 0.5) < 1e-9);
  // scale = hipY(0.6) - shY(0.3) = 0.3
  assert.ok(Math.abs(r.scale - 0.3) < 1e-9);
  // yJump = hipY = 0.6
  assert.ok(Math.abs(r.yJump - 0.6) < 1e-9);
});

test('readingFromLandmarks: 가시성 낮으면 ok=false', () => {
  const bad = lm();
  bad[23] = { x: 0.45, y: 0.6, visibility: 0.1 };
  assert.equal(readingFromLandmarks(bad, 1.333).ok, false);
});

test('fitLane: half=0.35*scaleX, center는 clamp', () => {
  const lane = fitLane(0.5, 0.3);
  assert.ok(Math.abs(lane.half - 0.105) < 1e-9);  // 0.35*0.3
  assert.ok(Math.abs(lane.hyst - 0.036) < 1e-9);  // 0.12*0.3
  assert.ok(Math.abs(lane.center - 0.5) < 1e-9);
  // cx가 왼쪽 끝이면 center는 half로 clamp
  assert.ok(Math.abs(fitLane(0.0, 0.3).center - 0.105) < 1e-9);
});

test('laneZone: 히스테리시스로 경계 떨림 방지', () => {
  const lane = { center: 0.5, half: 0.1, hyst: 0.04 }; // edges 0.4~0.6
  // 중앙(cur=1)에서: 왼쪽 진입은 0.4-0.04=0.36 미만이어야 0
  assert.equal(laneZone(0.5, lane, 1), 1);
  assert.equal(laneZone(0.38, lane, 1), 1); // 아직 여유 안에
  assert.equal(laneZone(0.35, lane, 1), 0); // 넘어감
  // 왼칸(cur=0)에서 되돌아올 때는 0.4+0.04=0.44 넘어야 1
  assert.equal(laneZone(0.42, lane, 0), 0);
  assert.equal(laneZone(0.45, lane, 0), 1);
});

import { Calibrator, CALIB_HOLD } from '../booth/controls.mjs';

test('Calibrator: 화면 밖이면 진행률 0, STEP INTO VIEW', () => {
  const c = new Calibrator();
  const out = c.update({ ok: false }, 0);
  assert.equal(out.progress, 0);
  assert.equal(out.hint, 'STEP INTO VIEW');
  assert.equal(out.result, null);
});

test('Calibrator: 너무 멀거나 가까우면 안내', () => {
  const c = new Calibrator();
  assert.equal(c.update({ ok: true, cx: 0.5, yJump: 0.6, scale: 0.05 }, 0).hint, 'TOO FAR');
  assert.equal(c.update({ ok: true, cx: 0.5, yJump: 0.6, scale: 0.6 }, 0).hint, 'TOO CLOSE');
});

test('Calibrator: 안정 자세를 CALIB_HOLD 이상 유지하면 READY + 평균', () => {
  const c = new Calibrator();
  const still = { ok: true, cx: 0.5, yJump: 0.6, scale: 0.3 };
  let out;
  // 0s부터 촘촘히 20프레임(0.1s 간격) → 1.9s 유지
  for (let i = 0; i <= 20; i++) out = c.update(still, i * 0.1);
  assert.equal(out.hint, 'READY');
  assert.ok(out.result);
  assert.ok(Math.abs(out.result.cx - 0.5) < 1e-9);
  assert.ok(Math.abs(out.result.scale - 0.3) < 1e-9);
});

test('Calibrator: 도중에 움직이면 재시작', () => {
  const c = new Calibrator();
  c.update({ ok: true, cx: 0.5, yJump: 0.6, scale: 0.3 }, 0.0);
  // cx가 tol(0.2*0.3=0.06) 넘게 튀면 재시작
  const out = c.update({ ok: true, cx: 0.7, yJump: 0.6, scale: 0.3 }, 0.1);
  assert.equal(out.hint, 'STAND STILL');
  assert.equal(out.progress, 0);
});
