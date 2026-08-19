import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAdapter } from '../booth/adapter.mjs';

function fakeWin() {
  const calls = [];
  return { calls, Mousetrap: { trigger: (k) => calls.push(k) } };
}

test('apply: 좌우 액션을 steps만큼 트리거', () => {
  const w = fakeWin();
  const a = makeAdapter(() => w);
  a.apply({ laneAction: 'right', steps: 2, jumpAction: false });
  assert.deepEqual(w.calls, ['right', 'right']);
});

test('apply: 점프는 up 트리거', () => {
  const w = fakeWin();
  const a = makeAdapter(() => w);
  a.apply({ laneAction: null, steps: 0, jumpAction: true });
  assert.deepEqual(w.calls, ['up']);
});

test('apply: 게임 창 없으면 조용히 무시', () => {
  const a = makeAdapter(() => null);
  assert.doesNotThrow(() => a.apply({ laneAction: 'left', steps: 1, jumpAction: true }));
});
