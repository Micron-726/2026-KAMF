import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, saveSettings, applyGameSpeed, settingsToConfig } from '../booth/settings.mjs';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
}

test('loadSettings: 저장 없으면 기본값', () => {
  assert.deepEqual(loadSettings(fakeStorage()), defaultSettings());
});

test('save→load 왕복', () => {
  const st = fakeStorage();
  const s = { ...defaultSettings(), topSpeed: 0.5 };
  saveSettings(st, s);
  assert.equal(loadSettings(st).topSpeed, 0.5);
});

test('loadSettings: 부분 저장값도 기본과 병합', () => {
  const st = fakeStorage({ 'subway-booth:settings': JSON.stringify({ topSpeed: 0.9 }) });
  const s = loadSettings(st);
  assert.equal(s.topSpeed, 0.9);
  assert.equal(s.laneSensitivity, 0.35); // 기본 유지
});

test('applyGameSpeed: 게임 전역 덮어쓰기', () => {
  const win = { top_speed: 0.3, acc: 0.0005 };
  applyGameSpeed(win, { ...defaultSettings(), topSpeed: 0.6, accel: 0.001 });
  assert.equal(win.top_speed, 0.6);
  assert.equal(win.acc, 0.001);
});

test('settingsToConfig: 감도→cfg 매핑', () => {
  const cfg = settingsToConfig({ ...defaultSettings(), laneSensitivity: 0.4, jumpStrength: 0.2 });
  assert.equal(cfg.LANE_TRIGGER, 0.4);
  assert.equal(cfg.JUMP_RATIO, 0.2);
});
