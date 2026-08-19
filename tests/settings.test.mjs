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

test('defaultSettings: 죽은 필드 previewScale은 없음(아무 데서도 안 읽던 필드 제거)', () => {
  const s = defaultSettings();
  assert.deepEqual(s, {
    topSpeed: 0.3, startSpeed: 0, accel: 0.0005,
    laneSensitivity: 0.35, jumpStrength: 0.15,
    previewCorner: 'br', mirror: true,
  });
  assert.equal('previewScale' in s, false);
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

test('applyGameSpeed: startSpeed → 게임 전역 speed 반영', () => {
  const win = { top_speed: 0.3, acc: 0.0005, speed: 0 };
  applyGameSpeed(win, { ...defaultSettings(), startSpeed: 0.1 });
  assert.equal(win.speed, 0.1);
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

test('applyGameSpeed: 없는 게임 전역은 건드리지 않음', () => {
  const win = { top_speed: 0.3 };            // acc 없음
  applyGameSpeed(win, { ...defaultSettings(), topSpeed: 0.6, accel: 0.001 });
  assert.equal(win.top_speed, 0.6);
  assert.equal('acc' in win, false);         // 가드가 없으면 acc가 생겨서 실패
});
