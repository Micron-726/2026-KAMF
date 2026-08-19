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

import { JumpDetector } from '../booth/controls.mjs';

test('JumpDetector: 기준선 대비 엉덩이 상승 시 1회 발동', () => {
  const j = new JumpDetector();
  j.seed(0.6);                 // 선 자세 hipY=0.6
  const scale = 0.3;           // 문턱 = 0.15*0.3 = 0.045
  assert.deepEqual(j.update(0.6, scale, 0.0), { fired: false, jumping: false });
  // hipY 0.5 → 상승 0.1 > 0.045 → 점프
  const a = j.update(0.5, scale, 0.1);
  assert.equal(a.jumping, true);
  assert.equal(a.fired, true);
  // 유지되는 동안 재발동 안 함(엣지)
  assert.equal(j.update(0.5, scale, 0.2).fired, false);
});

test('JumpDetector: 쿨다운 내 재점프는 무시', () => {
  const j = new JumpDetector();
  j.seed(0.6);
  j.update(0.5, 0.3, 0.0);          // fire
  j.update(0.6, 0.3, 0.1);          // 착지(jumping false)
  // 쿨다운 0.5s 안(0.3s)에 다시 뛰면 fired=false
  assert.equal(j.update(0.5, 0.3, 0.3).fired, false);
  // 쿨다운 지난 뒤(0.7s)엔 다시 발동
  j.update(0.6, 0.3, 0.6);
  assert.equal(j.update(0.5, 0.3, 0.7).fired, true);
});

test('JumpDetector: JUMP_MAX 초과로 갇히면 기준선 리셋', () => {
  const j = new JumpDetector();
  j.seed(0.6);
  j.update(0.5, 0.3, 0.0);          // 점프 시작
  const a = j.update(0.5, 0.3, 1.2); // 1.2s > JUMP_MAX(1.0) → 리셋
  assert.equal(a.jumping, false);
});

import { MotionControls } from '../booth/controls.mjs';

function still(cx = 0.5) { // 정지 자세 리딩용 랜드마크
  const a = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  a[11] = { x: 1 - (cx - 0.05), y: 0.3, visibility: 1 };
  a[12] = { x: 1 - (cx + 0.05), y: 0.3, visibility: 1 };
  a[23] = { x: 1 - (cx - 0.05), y: 0.6, visibility: 1 };
  a[24] = { x: 1 - (cx + 0.05), y: 0.6, visibility: 1 };
  return a;
}

test('MotionControls: 보정 → 플레이 전환', () => {
  const mc = new MotionControls();
  let out;
  for (let i = 0; i <= 20; i++) out = mc.update(still(0.5), i * 0.1, 640 / 480);
  assert.equal(out.phase, 'playing');
});

test('MotionControls: 보정 후 오른쪽 이동에서 right 액션', () => {
  const mc = new MotionControls();
  for (let i = 0; i <= 20; i++) mc.update(still(0.5), i * 0.1, 640 / 480);
  // 크게 오른쪽으로(거울 cx 증가) 이동
  const out = mc.update(still(0.85), 3.0, 640 / 480);
  assert.equal(out.laneAction, 'right');
  assert.equal(out.zone, 2);
});
