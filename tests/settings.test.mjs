import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, saveSettings, applySpeed, settingsToConfig } from '../booth/settings.mjs';

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
    gameSpeed: 20, laneSpeed: 16,
    laneSensitivity: 0.35, jumpStrength: 0.15,
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
  const st = fakeStorage({ 'subway-booth:settings': JSON.stringify({ gameSpeed: 40 }) });
  const s = loadSettings(st);
  assert.equal(s.gameSpeed, 40);
  assert.equal(s.laneSensitivity, 0.35); // 기본 유지
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

test('settingsToConfig: 감도→cfg 매핑', () => {
  const cfg = settingsToConfig({ ...defaultSettings(), laneSensitivity: 0.4, jumpStrength: 0.2 });
  assert.equal(cfg.LANE_TRIGGER, 0.4);
  assert.equal(cfg.JUMP_RATIO, 0.2);
});

test('loadSettings: 파싱 실패 시 기본값', () => {
  const st = fakeStorage({ 'subway-booth:settings': 'not-json' });
  assert.deepEqual(loadSettings(st), defaultSettings());
});
