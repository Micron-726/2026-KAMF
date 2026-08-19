import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeletonSegments } from '../booth/overlay.mjs';

test('skeletonSegments: 어깨/엉덩이/척추 3선 반환', () => {
  const a = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 }));
  a[11] = { x: 0.4, y: 0.3 }; a[12] = { x: 0.6, y: 0.3 };
  a[23] = { x: 0.45, y: 0.6 }; a[24] = { x: 0.55, y: 0.6 };
  const segs = skeletonSegments(a);
  assert.equal(segs.length, 3);
  // 첫 선분은 어깨(양 끝 y=0.3)
  assert.ok(Math.abs(segs[0][0].y - 0.3) < 1e-9 && Math.abs(segs[0][1].y - 0.3) < 1e-9);
});

test('skeletonSegments: 랜드마크 부족이면 빈 배열', () => {
  assert.deepEqual(skeletonSegments(null), []);
  assert.deepEqual(skeletonSegments([{ x: 0, y: 0 }]), []);
});
