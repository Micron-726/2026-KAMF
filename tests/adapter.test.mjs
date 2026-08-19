import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAdapter } from '../booth/adapter.mjs';

// Unity 인스턴스 흉내: SendMessage(obj, method) 호출된 method를 기록.
function fakeUnity() {
  const calls = [];
  return { calls, SendMessage: (obj, method) => calls.push(`${obj}.${method}`) };
}

test('apply: 우측 이동을 steps만큼 MoveRight 호출', () => {
  const u = fakeUnity();
  const a = makeAdapter(() => u);
  a.apply({ laneAction: 'right', steps: 2, jumpAction: false });
  assert.deepEqual(u.calls, ['BoothBridge.MoveRight', 'BoothBridge.MoveRight']);
});

test('apply: 좌측 이동은 MoveLeft(steps 기본 1)', () => {
  const u = fakeUnity();
  const a = makeAdapter(() => u);
  a.apply({ laneAction: 'left', jumpAction: false });
  assert.deepEqual(u.calls, ['BoothBridge.MoveLeft']);
});

test('apply: 점프는 Jump 호출', () => {
  const u = fakeUnity();
  const a = makeAdapter(() => u);
  a.apply({ laneAction: null, steps: 0, jumpAction: true });
  assert.deepEqual(u.calls, ['BoothBridge.Jump']);
});

test('apply: Unity 없거나 SendMessage 없으면 조용히 무시', () => {
  const a = makeAdapter(() => null);
  assert.doesNotThrow(() => a.apply({ laneAction: 'left', steps: 1, jumpAction: true }));
  const b = makeAdapter(() => ({}));
  assert.doesNotThrow(() => b.apply({ laneAction: 'right', steps: 1, jumpAction: true }));
});
