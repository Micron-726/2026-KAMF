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
