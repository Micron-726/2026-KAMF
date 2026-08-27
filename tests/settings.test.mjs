import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, saveSettings, applyLaneSpeed, applySpeed, sendSpeed, settingsToConfig } from '../booth/settings.mjs';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('loadSettings: 저장 없으면 기본값', () => {
  assert.deepEqual(loadSettings(fakeStorage()), defaultSettings());
});

test('defaultSettings: Unity 게임속도 기본 필드 구성', () => {
  const s = defaultSettings();
  assert.deepEqual(s, {
    schema: 2,
    gameSpeed: 20, laneSpeed: 16,
    laneSens: 6, jumpSens: 6,
    previewCorner: 'br', mirror: true,
  });
});

test('save→load 왕복', () => {
  const st = fakeStorage();
  const s = { ...defaultSettings(), gameSpeed: 35 };
  saveSettings(st, s);
  assert.equal(loadSettings(st).gameSpeed, 35);
});

test('loadSettings: 부분 저장값도 기본과 병합', () => {
  const st = fakeStorage({ 'subway-booth:settings': JSON.stringify({ schema: 2, gameSpeed: 40 }) });
  const s = loadSettings(st);
  assert.equal(s.gameSpeed, 40);
  assert.equal(s.laneSens, 6); // 기본 유지
});

test('applySpeed: Unity에 SetSpeed(정수)+SetLaneSpeed 전송', () => {
  const calls = [];
  const unity = { SendMessage: (obj, method, arg) => calls.push([obj, method, arg]) };
  applySpeed(unity, { ...defaultSettings(), gameSpeed: 33.6, laneSpeed: 20 });
  assert.deepEqual(calls, [
    ['BoothBridge', 'SetSpeed', 34],       // Math.round
    ['BoothBridge', 'SetLaneSpeed', 20],
  ]);
});

test('applySpeed: Unity 없으면 조용히 무시', () => {
  assert.doesNotThrow(() => applySpeed(null, defaultSettings()));
  assert.doesNotThrow(() => applySpeed({}, defaultSettings()));
});

test('sendSpeed: SetSpeed만 정수로 전송', () => {
  const calls = [];
  const unity = { SendMessage: (obj, method, arg) => calls.push([obj, method, arg]) };
  sendSpeed(unity, 0);
  sendSpeed(unity, 12.6);
  assert.deepEqual(calls, [
    ['BoothBridge', 'SetSpeed', 0],
    ['BoothBridge', 'SetSpeed', 13],
  ]);
  assert.doesNotThrow(() => sendSpeed(null, 5));
});

test('applyLaneSpeed: 카운트다운 중 게임 속도 없이 좌우 속도만 적용', () => {
  const calls = [];
  const unity = { SendMessage: (obj, method, arg) => calls.push([obj, method, arg]) };
  applyLaneSpeed(unity, { ...defaultSettings(), laneSpeed: 19 });
  assert.deepEqual(calls, [
    ['BoothBridge', 'SetLaneSpeed', 19],
  ]);
  assert.doesNotThrow(() => applyLaneSpeed(null, defaultSettings()));
});

// ── 민감도 방향 ──
// LANE_TRIGGER / JUMP_RATIO 는 "몸 크기 대비 얼마나 움직여야 발동하냐"라 값이
// 클수록 둔감하다. 슬라이더(민감도)는 그 반대 방향이어야 한다.
test('settingsToConfig: 민감도가 높을수록 임계값이 작아진다', () => {
  const low = settingsToConfig({ laneSens: 1, jumpSens: 1 });
  const mid = settingsToConfig({ laneSens: 5, jumpSens: 5 });
  const high = settingsToConfig({ laneSens: 10, jumpSens: 10 });

  assert.ok(low.LANE_TRIGGER > mid.LANE_TRIGGER, 'LANE: 1 > 5');
  assert.ok(mid.LANE_TRIGGER > high.LANE_TRIGGER, 'LANE: 5 > 10');
  assert.ok(low.JUMP_RATIO > mid.JUMP_RATIO, 'JUMP: 1 > 5');
  assert.ok(mid.JUMP_RATIO > high.JUMP_RATIO, 'JUMP: 5 > 10');
});

test('settingsToConfig: 범위를 벗어난 값은 1~10으로 잘린다', () => {
  assert.deepEqual(settingsToConfig({ laneSens: -5, jumpSens: -5 }), settingsToConfig({ laneSens: 1, jumpSens: 1 }));
  assert.deepEqual(settingsToConfig({ laneSens: 99, jumpSens: 99 }), settingsToConfig({ laneSens: 10, jumpSens: 10 }));
});

test('settingsToConfig: 기본값(6)은 예전 기본 임계값 근처', () => {
  const cfg = settingsToConfig(defaultSettings());
  assert.ok(Math.abs(cfg.LANE_TRIGGER - 0.35) < 0.03, `LANE_TRIGGER=${cfg.LANE_TRIGGER}`);
  assert.ok(Math.abs(cfg.JUMP_RATIO - 0.15) < 0.03, `JUMP_RATIO=${cfg.JUMP_RATIO}`);
});

// ── 구버전 저장값 마이그레이션 ──
test('loadSettings: 구버전(schema 없음)은 민감도만 기본으로 되돌린다', () => {
  const old = JSON.stringify({
    gameSpeed: 33, laneSpeed: 22,
    laneSensitivity: 0.55, jumpStrength: 0.28,   // 의미가 뒤집힌 옛 키
    previewCorner: 'tl',
  });
  const s = loadSettings(fakeStorage({ 'subway-booth:settings': old }));

  assert.equal(s.gameSpeed, 33, '속도는 의미가 안 바뀌어 보존');
  assert.equal(s.laneSpeed, 22);
  assert.equal(s.previewCorner, 'tl');
  assert.equal(s.laneSens, 6, '민감도는 기본값으로');
  assert.equal(s.jumpSens, 6);
  assert.equal(s.laneSensitivity, undefined, '옛 키는 남지 않는다');
  assert.equal(s.jumpStrength, undefined);
});

test('loadSettings: 파싱 실패 시 기본값', () => {
  const st = fakeStorage({ 'subway-booth:settings': 'not-json' });
  assert.deepEqual(loadSettings(st), defaultSettings());
});
