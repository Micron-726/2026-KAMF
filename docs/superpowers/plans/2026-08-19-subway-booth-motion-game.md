# Subway Surfers 모션 부스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 몸동작(좌/우/점프)으로 브라우저 WebGL Subway Surfers를 조작하는 단일 웹 부스 앱을 만든다.

**Architecture:** 기존 게임(`game/`)은 same-origin iframe으로 로드하고 수정하지 않는다. 부스 셸(`booth/`)이 카메라·MediaPipe 포즈인식·동작판정·게임 트리거·UI(메뉴/설정/도움말/보정/미리보기)를 담당한다. 동작판정 로직은 `motion_control.py --body`를 순수 함수로 이식해 Node 내장 테스트로 검증한다. 조작은 `iframe.contentWindow.Mousetrap.trigger('left'|'right'|'up')` 직접 호출로 지연을 최소화한다.

**Tech Stack:** Vanilla JS(ES modules), MediaPipe Tasks-Vision(web, PoseLandmarker), WebGL 게임(기존), Node 22 내장 테스트 러너(`node --test`), 로컬 정적 서버(`python -m http.server`).

**Spec:** `docs/superpowers/specs/2026-08-19-subway-booth-motion-game-design.md`

## Global Constraints

- 게임 내부 코드(`game/`)는 수정하지 않는다. 조작은 `Mousetrap.trigger`로만.
- 동작: 좌/우/점프 3개만. 숙이기/아이템 없음.
- 완전 오프라인: MediaPipe wasm·모델을 `vendor/`에 두고 로컬 참조. 외부 네트워크 요청 금지(런타임).
- `file://` 금지 — 카메라·모듈 로딩 때문에 반드시 `localhost`로 서빙.
- 키 매핑 설정 없음. 조작 키는 left/right/up 고정.
- 서버 스크립트 동봉하지 않음 — README 실행 안내만.
- 순수 판정 로직은 DOM/브라우저 의존 없이 Node에서 import·테스트 가능해야 함.
- 이식 상수(원본 그대로): `LANE_TRIGGER=0.35`, `LANE_HYST=0.12`, `JUMP_RATIO=0.15`, `JUMP_COOLDOWN=0.5`, `JUMP_MAX=1.0`, `VIS_MIN=0.3`, `CALIB_HOLD=1.5`, `CALIB_TOL=0.20`, `SCALE_MIN=0.10`, `SCALE_MAX=0.45`. 랜드마크 인덱스: 어깨 L=11/R=12, 엉덩이 L=23/R=24.

---

## 파일 구조

```
subway-booth/
├─ game/                         # 기존 WebGL 게임 (수정 금지)
├─ booth/
│  ├─ booth.html                # 진입점(부모 페이지): 게임 iframe + 화면들 + 오버레이
│  ├─ styles.css                # 부스 UI 스타일
│  ├─ controls.mjs              # 순수 판정: 랜드마크→동작 (이식, 테스트 대상)
│  ├─ adapter.mjs              # 동작→게임 입력(Mousetrap.trigger)
│  ├─ pose-engine.mjs          # MediaPipe 로딩 + 카메라 + 검출 루프
│  ├─ overlay.mjs              # 미리보기 캔버스(거울+스켈레톤+상태)
│  ├─ settings.mjs             # 설정 모델 + localStorage + 게임속도 적용
│  ├─ shell.mjs                # 상태머신 + 전체 배선(부모)
│  └─ devtest-pose.html        # (개발용) 포즈 엔진 수동 확인 페이지
├─ vendor/mediapipe/
│  ├─ tasks-vision/            # @mediapipe/tasks-vision dist (mjs + wasm)
│  └─ pose_landmarker_lite.task
├─ tests/
│  ├─ controls.test.mjs
│  ├─ adapter.test.mjs
│  ├─ overlay.test.mjs
│  └─ settings.test.mjs
├─ package.json                # {"type":"module","scripts":{"test":"node --test"}}
├─ README.md
└─ docs/…
```

`booth/controls.mjs`는 브라우저·DOM에 의존하지 않는 순수 로직만 담아 Node에서 그대로 import·테스트한다.

---

## Task 1: 프로젝트 뼈대 + controls.mjs 리딩/칸 수학 (순수)

**Files:**
- Create: `package.json`
- Create: `booth/controls.mjs`
- Test: `tests/controls.test.mjs`

**Interfaces:**
- Produces:
  - `readingFromLandmarks(landmarks, aspect)` → `{ok:boolean, cx?:number, yJump?:number, scale?:number}`. `cx`는 거울반전(1−rawCx). `scale`=몸통길이(hipY−shoulderY). 가시성 최소<0.3 또는 랜드마크 부족이면 `{ok:false}`.
  - `fitLane(cx, scaleX)` → `{center:number, half:number, hyst:number}` (`half=0.35*scaleX`, `hyst=0.12*scaleX`, `center=clamp(cx,half,1−half)`).
  - `laneZone(cx, lane, cur)` → `0|1|2` (히스테리시스 적용).
  - 상수 export: `L_SH,R_SH,L_HIP,R_HIP,VIS_MIN,LANE_TRIGGER,LANE_HYST`.

- [ ] **Step 1: package.json 생성**

```json
{
  "name": "subway-booth",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/controls.test.mjs`

```js
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd subway-booth && node --test`
Expected: FAIL — `controls.mjs`에 export 없음("does not provide an export").

- [ ] **Step 4: controls.mjs 최소 구현**

```js
// booth/controls.mjs — motion_control.py --body 이식 (순수 로직)
export const L_SH = 11, R_SH = 12, L_HIP = 23, R_HIP = 24;
export const VIS_MIN = 0.3;
export const LANE_TRIGGER = 0.35, LANE_HYST = 0.12;

const vis = (q) => (q == null || q.visibility == null ? 1 : q.visibility);

export function readingFromLandmarks(landmarks, aspect) {
  if (!landmarks || landmarks.length < 25) return { ok: false };
  const ls = landmarks[L_SH], rs = landmarks[R_SH];
  const lh = landmarks[L_HIP], rh = landmarks[R_HIP];
  if (!ls || !rs || !lh || !rh) return { ok: false };
  if (Math.min(vis(ls), vis(rs), vis(lh), vis(rh)) < VIS_MIN) return { ok: false };
  const hipY = (lh.y + rh.y) / 2;
  const shY = (ls.y + rs.y) / 2;
  const rawCx = (lh.x + rh.x) / 2;
  return {
    ok: true,
    cx: 1 - rawCx,                 // 거울 반전: 몸을 왼쪽으로 → 화면 왼쪽
    yJump: hipY,
    scale: Math.max(hipY - shY, 1e-3),
  };
}

export function fitLane(cx, scaleX) {
  const half = LANE_TRIGGER * scaleX;
  const hyst = LANE_HYST * scaleX;
  const center = Math.min(Math.max(cx, half), 1 - half);
  return { center, half, hyst };
}

export function laneZone(cx, lane, cur = 1) {
  const left = lane.center - lane.half;
  const right = lane.center + lane.half;
  const lb = left + (cur === 0 ? lane.hyst : -lane.hyst);
  const rb = right - (cur === 2 ? lane.hyst : -lane.hyst);
  if (cx < lb) return 0;
  if (cx > rb) return 2;
  return 1;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test`
Expected: PASS (4 tests)

- [ ] **Step 6: 커밋**

```bash
git add package.json booth/controls.mjs tests/controls.test.mjs
git commit -m "feat: controls 리딩·칸 판정 순수 로직 + 테스트"
```

---

## Task 2: controls.mjs — Calibrator (순수)

**Files:**
- Modify: `booth/controls.mjs` (Calibrator 추가)
- Test: `tests/controls.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: `readingFromLandmarks` 결과 형태 `{ok,cx,yJump,scale}`.
- Produces: `class Calibrator`
  - `update(reading, now)` → `{progress:number, hint:string, result:null | {cx,yJump,scale}}`.
  - 규칙: `reading.ok===false`이면 samples 비우고 "STEP INTO VIEW". `scale>SCALE_MAX`→"TOO CLOSE", `<SCALE_MIN`→"TOO FAR". 모은 구간 전체에서 cx/yJump/scale 각각의 (max−min)이 `CALIB_TOL*scale` 초과면 재시작+"STAND STILL". `span≥CALIB_HOLD && n≥10`이면 평균을 result로 "READY". 그 전엔 `min(span/CALIB_HOLD,0.99)`, "STAND STILL".
  - `reset()`.
  - 상수 export: `CALIB_HOLD,CALIB_TOL,SCALE_MIN,SCALE_MAX`.

- [ ] **Step 1: 실패하는 테스트 추가** (파일 하단에 append)

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — `Calibrator` export 없음.

- [ ] **Step 3: Calibrator 구현** (controls.mjs에 추가)

```js
export const CALIB_HOLD = 1.5, CALIB_TOL = 0.20;
export const SCALE_MIN = 0.10, SCALE_MAX = 0.45;

export class Calibrator {
  constructor() { this.reset(); }
  reset() { this.samples = []; }   // 각 항목 [t, cx, yJump, scale]

  _restart(now, r) { this.samples = [[now, r.cx, r.yJump, r.scale]]; }

  update(r, now) {
    if (!r || !r.ok) { this.samples = []; return { progress: 0, hint: 'STEP INTO VIEW', result: null }; }
    if (r.scale > SCALE_MAX) { this.samples = []; return { progress: 0, hint: 'TOO CLOSE', result: null }; }
    if (r.scale < SCALE_MIN) { this.samples = []; return { progress: 0, hint: 'TOO FAR', result: null }; }

    this.samples.push([now, r.cx, r.yJump, r.scale]);

    const tol = CALIB_TOL * r.scale;
    for (const i of [1, 2, 3]) { // cx, yJump, scale
      let mn = Infinity, mx = -Infinity;
      for (const s of this.samples) { if (s[i] < mn) mn = s[i]; if (s[i] > mx) mx = s[i]; }
      if (mx - mn > tol) { this._restart(now, r); return { progress: 0, hint: 'STAND STILL', result: null }; }
    }

    const span = now - this.samples[0][0];
    if (span >= CALIB_HOLD && this.samples.length >= 10) {
      const n = this.samples.length;
      const avg = (i) => this.samples.reduce((a, s) => a + s[i], 0) / n;
      return { progress: 1, hint: 'READY', result: { cx: avg(1), yJump: avg(2), scale: avg(3) } };
    }
    return { progress: Math.min(span / CALIB_HOLD, 0.99), hint: 'STAND STILL', result: null };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add booth/controls.mjs tests/controls.test.mjs
git commit -m "feat: Calibrator 이식 + 테스트"
```

---

## Task 3: controls.mjs — JumpDetector (순수)

**Files:**
- Modify: `booth/controls.mjs`
- Test: `tests/controls.test.mjs`

**Interfaces:**
- Produces: `class JumpDetector`
  - `seed(baselineYJump)` — 보정된 선 자세 엉덩이 y를 고정 기준선으로.
  - `update(yJump, scale, now)` → `{fired:boolean, jumping:boolean}`.
  - 규칙(body 모드 freeze): `jumping = (baseline − yJump) > JUMP_RATIO*scale`. 점프가 `JUMP_MAX(1.0s)` 넘게 지속되면 기준선을 현재값으로 리셋하고 jumping=false. `fired = jumping && !prevJump && (now−lastJump > JUMP_COOLDOWN)`. fired 시 lastJump 갱신.
  - 상수 export: `JUMP_RATIO,JUMP_COOLDOWN,JUMP_MAX`.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — `JumpDetector` export 없음.

- [ ] **Step 3: JumpDetector 구현**

```js
export const JUMP_RATIO = 0.15, JUMP_COOLDOWN = 0.5, JUMP_MAX = 1.0;

export class JumpDetector {
  constructor(cfg = {}) {
    this.jumpRatio = cfg.JUMP_RATIO ?? JUMP_RATIO;
    this.cooldown = cfg.JUMP_COOLDOWN ?? JUMP_COOLDOWN;
    this.maxHold = cfg.JUMP_MAX ?? JUMP_MAX;
    this.baseline = null;
    this.prevJump = false;
    this.jumpSince = null;
    this.lastJump = -Infinity;
  }
  seed(baselineYJump) { this.baseline = baselineYJump; }
  update(yJump, scale, now) {
    if (this.baseline == null) this.baseline = yJump;
    let jumping = (this.baseline - yJump) > this.jumpRatio * scale;
    if (jumping) {
      if (this.jumpSince == null) this.jumpSince = now;
      else if (now - this.jumpSince > this.maxHold) {
        this.baseline = yJump; this.jumpSince = null; jumping = false;
      }
    } else {
      this.jumpSince = null;
    }
    const fired = jumping && !this.prevJump && (now - this.lastJump > this.cooldown);
    if (fired) this.lastJump = now;
    this.prevJump = jumping;
    return { fired, jumping };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add booth/controls.mjs tests/controls.test.mjs
git commit -m "feat: JumpDetector 이식 + 테스트"
```

---

## Task 4: controls.mjs — MotionControls 오케스트레이터 (순수)

**Files:**
- Modify: `booth/controls.mjs`
- Test: `tests/controls.test.mjs`

**Interfaces:**
- Consumes: `readingFromLandmarks, fitLane, laneZone, Calibrator, JumpDetector`.
- Produces: `class MotionControls`
  - `constructor(cfg?)`, `reset()`, `recalibrate()`.
  - `update(landmarks, now, aspect)` → 결과 객체:
    - 보정 중: `{phase:'calibrating', progress, hint, laneAction:null, steps:0, jumpAction:false}`
    - 보정 완료 순간: `phase`가 `'playing'`으로 바뀌고 `hint:'GO'`.
    - 플레이 중: `{phase:'playing', laneAction:'left'|'right'|null, steps:number, jumpAction:boolean, zone:0|1|2, jumping:boolean, lost:boolean}`
  - `scaleX = result.scale / aspect`로 `fitLane` 호출(원본: `sc0/(w/h)`).

- [ ] **Step 1: 실패하는 테스트 추가**

```js
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
```

> 주의: `still(cx)`는 **거울 반전 후** cx가 되도록 원시 x를 `1−cx`로 넣는다(readingFromLandmarks가 다시 1−rawCx 하므로 최종 cx=원하는 값).

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test`
Expected: FAIL — `MotionControls` export 없음.

- [ ] **Step 3: MotionControls 구현**

```js
export class MotionControls {
  constructor(cfg = {}) { this.cfg = cfg; this.reset(); }
  reset() {
    this.phase = 'calibrating';
    this.cal = new Calibrator();
    this.lane = null;
    this.jump = null;
    this.refScale = null;
    this.curZone = 1;
  }
  recalibrate() { this.reset(); }

  update(landmarks, now, aspect) {
    const r = readingFromLandmarks(landmarks, aspect);

    if (this.phase === 'calibrating') {
      const { progress, hint, result } = this.cal.update(r, now);
      if (result) {
        this.lane = fitLane(result.cx, result.scale / aspect);
        this.refScale = result.scale;
        this.jump = new JumpDetector(this.cfg);
        this.jump.seed(result.yJump);
        this.curZone = 1;
        this.phase = 'playing';
        return { phase: 'playing', progress: 1, hint: 'GO', laneAction: null, steps: 0, jumpAction: false, zone: 1, jumping: false, lost: false };
      }
      return { phase: 'calibrating', progress, hint, laneAction: null, steps: 0, jumpAction: false };
    }

    // playing
    if (!r.ok) return { phase: 'playing', laneAction: null, steps: 0, jumpAction: false, zone: this.curZone, jumping: false, lost: true };
    const { fired, jumping } = this.jump.update(r.yJump, this.refScale, now);
    const zone = laneZone(r.cx, this.lane, this.curZone);
    let laneAction = null, steps = 0;
    if (zone !== this.curZone) {
      laneAction = zone > this.curZone ? 'right' : 'left';
      steps = Math.abs(zone - this.curZone);
      this.curZone = zone;
    }
    return { phase: 'playing', laneAction, steps, jumpAction: fired, zone, jumping, lost: false };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test`
Expected: PASS (전체 controls 테스트)

- [ ] **Step 5: 커밋**

```bash
git add booth/controls.mjs tests/controls.test.mjs
git commit -m "feat: MotionControls 오케스트레이터 + 테스트"
```

---

## Task 5: adapter.mjs — 게임 입력 어댑터

**Files:**
- Create: `booth/adapter.mjs`
- Test: `tests/adapter.test.mjs`

**Interfaces:**
- Consumes: `MotionControls.update()` 결과 `{laneAction, steps, jumpAction}`.
- Produces: `makeAdapter(getGameWindow)` → `{ apply(result) }`.
  - `getGameWindow()`는 게임 iframe의 contentWindow(또는 `null`)를 반환.
  - `apply`는 `laneAction`이면 `steps`(최소 1)번 `Mousetrap.trigger(laneAction)`, `jumpAction`이면 `Mousetrap.trigger('up')` 호출. 게임/ Mousetrap 미준비면 조용히 무시.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/adapter.test.mjs`

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/adapter.test.mjs`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: adapter.mjs 구현**

```js
// booth/adapter.mjs — 추상 동작을 게임 입력(Mousetrap.trigger)으로
export function makeAdapter(getGameWindow) {
  const trig = (key) => {
    const w = getGameWindow();
    if (w && w.Mousetrap && typeof w.Mousetrap.trigger === 'function') {
      w.Mousetrap.trigger(key);
    }
  };
  return {
    apply(result) {
      if (!result) return;
      if (result.laneAction) {
        const n = Math.max(1, result.steps || 1);
        for (let i = 0; i < n; i++) trig(result.laneAction);
      }
      if (result.jumpAction) trig('up');
    },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/adapter.test.mjs`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add booth/adapter.mjs tests/adapter.test.mjs
git commit -m "feat: 게임 입력 어댑터(Mousetrap.trigger) + 테스트"
```

---

## Task 6: pose-engine.mjs + MediaPipe 오프라인 번들

**Files:**
- Create: `vendor/mediapipe/tasks-vision/` (다운로드), `vendor/mediapipe/pose_landmarker_lite.task` (복사)
- Create: `booth/pose-engine.mjs`
- Create: `booth/devtest-pose.html` (수동 확인용)

**Interfaces:**
- Produces: `createPoseEngine({ wasmPath, modelPath })` → `Promise<engine>`
  - `engine.detect(videoEl, timestampMs)` → `landmarks[] | null` (첫 번째 포즈의 랜드마크 배열, `{x,y,z,visibility}`).
  - `engine.close()`.
- Consumes(런타임): 브라우저 `getUserMedia`(호출부는 shell), MediaPipe Tasks-Vision.

> 이 태스크는 wasm/카메라 때문에 Node 단위 테스트가 불가하다. **브라우저 수동 확인**으로 검증한다.

- [ ] **Step 1: MediaPipe web 자산 다운로드(빌드 타임 1회, 이후 오프라인)**

Run:
```bash
cd subway-booth
mkdir -p vendor/mediapipe/tasks-vision
npm pack @mediapipe/tasks-vision@0.10.18
tar -xzf mediapipe-tasks-vision-*.tgz
cp -R package/wasm vendor/mediapipe/tasks-vision/wasm
cp package/vision_bundle.mjs vendor/mediapipe/tasks-vision/vision_bundle.mjs
rm -rf package mediapipe-tasks-vision-*.tgz
cp ../개발/pose_landmarker_lite.task vendor/mediapipe/pose_landmarker_lite.task
ls vendor/mediapipe/tasks-vision vendor/mediapipe
```
Expected: `vision_bundle.mjs`, `wasm/`(여러 .wasm/.js), `pose_landmarker_lite.task` 존재.

> 버전은 검증된 `0.10.18` 기준(웹 tasks-vision, 파이썬 mediapipe와 별개). 다운로드 실패 시 사용 가능한 최신 0.10.x로 대체하고 README에 기록.

- [ ] **Step 2: pose-engine.mjs 작성**

```js
// booth/pose-engine.mjs — MediaPipe PoseLandmarker(web) 래퍼
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/tasks-vision/vision_bundle.mjs';

export async function createPoseEngine({
  wasmPath = '../vendor/mediapipe/tasks-vision/wasm',
  modelPath = '../vendor/mediapipe/pose_landmarker_lite.task',
} = {}) {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
  let lastTs = 0;
  return {
    detect(videoEl, timestampMs) {
      let ts = Math.floor(timestampMs);
      if (ts <= lastTs) ts = lastTs + 1;
      lastTs = ts;
      const res = landmarker.detectForVideo(videoEl, ts);
      const lms = res && res.landmarks && res.landmarks[0];
      return lms || null;
    },
    close() { landmarker.close(); },
  };
}
```

- [ ] **Step 3: devtest-pose.html 작성(수동 확인)**

```html
<!doctype html>
<meta charset="utf-8">
<title>pose devtest</title>
<video id="v" autoplay playsinline muted width="480" height="360"></video>
<pre id="log">loading…</pre>
<script type="module">
  import { createPoseEngine } from './pose-engine.mjs';
  const v = document.getElementById('v');
  const log = document.getElementById('log');
  v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  await v.play();
  const engine = await createPoseEngine();
  log.textContent = 'engine ready';
  function loop(t) {
    const lms = engine.detect(v, t);
    log.textContent = lms ? `landmarks: ${lms.length} (hip23 y=${lms[23].y.toFixed(3)})` : 'no pose';
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
</script>
```

- [ ] **Step 4: 수동 확인**

Run:
```bash
cd subway-booth && python3 -m http.server 8000
```
브라우저에서 `http://localhost:8000/booth/devtest-pose.html` 열기 → 카메라 허용 →
화면에 `landmarks: 33 …`가 뜨고 몸을 움직이면 hip y값이 변하는지 확인.
Expected: 33개 랜드마크가 안정적으로 보고됨, 콘솔에 네트워크 에러 없음(완전 로컬).

- [ ] **Step 5: 커밋**

```bash
git add vendor booth/pose-engine.mjs booth/devtest-pose.html
git commit -m "feat: MediaPipe 오프라인 번들 + pose-engine + 수동확인 페이지"
```

---

## Task 7: overlay.mjs — 미리보기(거울+스켈레톤+상태)

**Files:**
- Create: `booth/overlay.mjs`
- Test: `tests/overlay.test.mjs` (순수 부분만)

**Interfaces:**
- Produces:
  - `skeletonSegments(landmarks)` → `[[a,b], …]` 각 점 `{x,y}` (어깨선, 엉덩이선, 척추선). 순수 함수, 테스트 대상.
  - `drawOverlay(ctx, videoEl, landmarks, state, opts)` — 거울로 비디오 그리고 스켈레톤·상태 텍스트 오버레이. DOM/canvas 의존, 수동 확인.
- Consumes: `MotionControls.update` 결과의 `zone/jumping/phase/hint`.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/overlay.test.mjs`

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/overlay.test.mjs`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: overlay.mjs 구현**

```js
// booth/overlay.mjs — 미리보기 렌더
import { L_SH, R_SH, L_HIP, R_HIP } from './controls.mjs';

export function skeletonSegments(lms) {
  if (!lms || lms.length < 25) return [];
  const ls = lms[L_SH], rs = lms[R_SH], lh = lms[L_HIP], rh = lms[R_HIP];
  if (!ls || !rs || !lh || !rh) return [];
  const midSh = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  return [
    [{ x: ls.x, y: ls.y }, { x: rs.x, y: rs.y }],   // 어깨선
    [{ x: lh.x, y: lh.y }, { x: rh.x, y: rh.y }],   // 엉덩이선
    [midSh, midHip],                                 // 척추선
  ];
}

// 거울 모드로 비디오+스켈레톤+상태를 그린다. (수동 확인)
export function drawOverlay(ctx, videoEl, lms, state = {}, opts = {}) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  // 거울: x축 반전
  ctx.translate(w, 0); ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, w, h);
  // 스켈레톤(정규좌표→픽셀). 비디오가 이미 반전되어 그려졌으므로 원좌표 사용.
  ctx.strokeStyle = state.jumping ? '#ffd400' : '#00e0ff';
  ctx.lineWidth = 4;
  for (const [a, b] of skeletonSegments(lms)) {
    ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
  }
  ctx.restore();
  // 상태 텍스트(반전 안 함)
  if (state.hint || state.phase) {
    ctx.fillStyle = '#fff'; ctx.font = `${Math.round(h * 0.09)}px sans-serif`;
    ctx.fillText(state.hint || '', 10, h - 12);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/overlay.test.mjs`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add booth/overlay.mjs tests/overlay.test.mjs
git commit -m "feat: 미리보기 오버레이(스켈레톤 순수함수 + 렌더) + 테스트"
```

---

## Task 8: settings.mjs — 설정 + localStorage + 게임속도 적용

**Files:**
- Create: `booth/settings.mjs`
- Test: `tests/settings.test.mjs`

**Interfaces:**
- Produces:
  - `defaultSettings()` → `{ topSpeed:0.3, startSpeed:0, accel:0.0005, laneSensitivity:0.35, jumpStrength:0.15, previewCorner:'br', previewScale:1, mirror:true }`.
  - `loadSettings(storage)` / `saveSettings(storage, s)` — `storage`는 `getItem/setItem` 가진 객체(localStorage 호환). 저장값과 기본값 병합.
  - `applyGameSpeed(gameWindow, s)` — 게임 창의 `top_speed` 등 전역을 설정값으로 덮어씀(존재할 때만).
  - `settingsToConfig(s)` → `{ JUMP_RATIO, LANE_TRIGGER }` (MotionControls cfg로 전달).

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/settings.test.mjs`

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/settings.test.mjs`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: settings.mjs 구현**

```js
// booth/settings.mjs
const KEY = 'subway-booth:settings';

export function defaultSettings() {
  return {
    topSpeed: 0.3, startSpeed: 0, accel: 0.0005,
    laneSensitivity: 0.35, jumpStrength: 0.15,
    previewCorner: 'br', previewScale: 1, mirror: true,
  };
}

export function loadSettings(storage) {
  const base = defaultSettings();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return base;
    return { ...base, ...JSON.parse(raw) };
  } catch { return base; }
}

export function saveSettings(storage, s) {
  storage.setItem(KEY, JSON.stringify(s));
}

export function applyGameSpeed(gameWindow, s) {
  if (!gameWindow) return;
  if ('top_speed' in gameWindow) gameWindow.top_speed = s.topSpeed;
  if ('acc' in gameWindow) gameWindow.acc = s.accel;
}

export function settingsToConfig(s) {
  return { LANE_TRIGGER: s.laneSensitivity, JUMP_RATIO: s.jumpStrength };
}
```

> `applyGameSpeed`의 `acc` 전역명은 Task 9에서 게임 배선 시 실제 이름을 확인해 맞춘다(게임 `main.js`가 `acc`를 전역으로 노출하는지). 노출 안 하면 top_speed만 적용하고 README에 한계 기록.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/settings.test.mjs`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add booth/settings.mjs tests/settings.test.mjs
git commit -m "feat: 설정 모델·localStorage·게임속도 적용 + 테스트"
```

---

## Task 9: booth.html + shell.mjs — 전체 배선

**Files:**
- Create: `booth/booth.html`
- Create: `booth/styles.css`
- Create: `booth/shell.mjs`
- Modify(필요 시 확인만): `game/main.js` 전역 노출 여부 조사(수정은 최소·회피)

**Interfaces:**
- Consumes: `createPoseEngine`, `MotionControls`, `makeAdapter`, `drawOverlay`, `loadSettings/saveSettings/applyGameSpeed/settingsToConfig`.
- Produces: 브라우저에서 동작하는 부스 앱. Node 단위 테스트 없음 — **수동 E2E**로 검증.

- [ ] **Step 1: booth.html 뼈대 작성**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Subway 모션 부스</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- 게임: same-origin iframe (플레이 시 표시) -->
  <iframe id="game" src="../game/index.html" title="game" hidden></iframe>

  <!-- 미리보기 캔버스 (보정=전체화면, 플레이=구석) -->
  <canvas id="preview" width="640" height="480"></canvas>
  <div id="hint"></div>

  <!-- 화면들 -->
  <section id="menu" class="screen">
    <h1>Subway 모션 부스</h1>
    <button data-go="calibrate">▶ 게임 시작</button>
    <button data-go="settings">⚙ 설정</button>
    <button data-go="help">? 도움말</button>
  </section>

  <section id="settings" class="screen" hidden>
    <h2>설정</h2>
    <label>최고 속도 <input id="s-topSpeed" type="range" min="0.1" max="0.8" step="0.05"></label>
    <label>가속도 <input id="s-accel" type="range" min="0.0001" max="0.002" step="0.0001"></label>
    <label>좌우 민감도 <input id="s-lane" type="range" min="0.15" max="0.6" step="0.01"></label>
    <label>점프 강도 <input id="s-jump" type="range" min="0.08" max="0.3" step="0.01"></label>
    <label>미리보기 위치
      <select id="s-corner"><option value="br">오른쪽아래</option><option value="bl">왼쪽아래</option>
      <option value="tr">오른쪽위</option><option value="tl">왼쪽위</option></select></label>
    <button id="s-reset">기본값으로 초기화</button>
    <button data-go="menu">← 뒤로</button>
  </section>

  <section id="help" class="screen" hidden>
    <h2>도움말</h2>
    <ul>
      <li>카메라 정면 2~3m에 서세요(전신이 보이게).</li>
      <li>"가운데 서세요" 3초 유지 → 보정 완료.</li>
      <li>좌/우로 한 발 이동 = 칸 이동, 살짝 점프 = 점프.</li>
      <li>담당자: <b>C</b> 키로 재보정, <b>Esc</b>로 메뉴.</li>
      <li>데스크톱 게임을 몸으로 하려면 파이썬 도구(개발/motion_control.py)를 쓰세요.</li>
    </ul>
    <button data-go="menu">← 뒤로</button>
  </section>

  <script type="module" src="shell.mjs"></script>
</body>
</html>
```

- [ ] **Step 2: styles.css 작성**

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #000; color: #fff; font-family: sans-serif; overflow: hidden; }
#game { position: fixed; inset: 0; width: 100vw; height: 100vh; border: 0; }
#game[hidden] { display: none; }

#preview { position: fixed; background: #111; z-index: 5; transition: all .6s ease; }
#preview.full { inset: 0; width: 100vw; height: 100vh; }
#preview.corner { width: 320px; height: 240px; right: 16px; bottom: 16px; border: 2px solid #0af; border-radius: 8px; }
#preview.corner.bl { left: 16px; right: auto; } #preview.corner.tr { top: 16px; bottom: auto; }
#preview.corner.tl { top: 16px; bottom: auto; left: 16px; right: auto; }

#hint { position: fixed; z-index: 6; left: 50%; top: 12%; transform: translateX(-50%);
  font-size: 5vh; font-weight: 700; text-shadow: 0 2px 8px #000; pointer-events: none; }

.screen { position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px; background: rgba(0,0,0,.85); }
.screen[hidden] { display: none; }
.screen button, .screen label { font-size: 3vh; padding: 10px 18px; }
.screen h1 { font-size: 8vh; } .screen label { display: flex; gap: 10px; align-items: center; }
```

- [ ] **Step 3: 게임 전역 노출 확인(조사)**

Run: `grep -nE "var (top_speed|acc|speed|surfer)|Mousetrap" subway-booth/game/main.js | head`
확인: `top_speed`, `acc`가 `var`로 전역(window)에 있는지. iframe이면 `document.getElementById('game').contentWindow.top_speed`로 접근 가능. `Mousetrap`도 전역인지 확인.
- `acc`가 지역이라 접근 불가면: Task 8 주석대로 top_speed만 적용하고 README에 기록.

- [ ] **Step 4: shell.mjs 작성 (상태머신 + 루프 배선)**

```js
// booth/shell.mjs
import { createPoseEngine } from './pose-engine.mjs';
import { MotionControls } from './controls.mjs';
import { makeAdapter } from './adapter.mjs';
import { drawOverlay } from './overlay.mjs';
import { loadSettings, saveSettings, defaultSettings, applyGameSpeed, settingsToConfig } from './settings.mjs';

const $ = (id) => document.getElementById(id);
const gameFrame = $('game'), preview = $('preview'), hintEl = $('hint');
const ctx = preview.getContext('2d');
const storage = window.localStorage;

let settings = loadSettings(storage);
let engine = null, video = null, controls = null, adapter = null;
let phase = 'menu';         // menu | settings | help | calibrate | play
let rafId = 0;

const gameWin = () => (gameFrame.contentWindow || null);
adapter = makeAdapter(gameWin);

function showScreen(name) {
  for (const s of ['menu', 'settings', 'help']) $(s).hidden = (s !== name);
}

async function ensureCamera() {
  if (video) return;
  video = document.createElement('video');
  video.autoplay = true; video.playsInline = true; video.muted = true;
  video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  await video.play();
}

async function ensureEngine() {
  if (!engine) engine = await createPoseEngine();
}

function setPreviewMode(mode) {
  preview.className = mode === 'full' ? 'full' : `corner ${settings.previewCorner}`;
}

async function startCalibrate() {
  phase = 'calibrate';
  showScreen(null);            // 모든 메뉴 숨김
  await ensureCamera();
  await ensureEngine();
  controls = new MotionControls(settingsToConfig(settings));
  gameFrame.hidden = true;
  setPreviewMode('full');
  loop();
}

function startPlay() {
  phase = 'play';
  gameFrame.hidden = false;
  applyGameSpeed(gameWin(), settings);   // 게임 로드 후 속도 반영
  setPreviewMode('corner');
}

function loop(t = performance.now()) {
  rafId = requestAnimationFrame(loop);
  if (phase !== 'calibrate' && phase !== 'play') return;
  const aspect = (video.videoWidth || 640) / (video.videoHeight || 480);
  const lms = engine.detect(video, t);
  const out = controls.update(lms, t / 1000, aspect);
  if (phase === 'calibrate' && out.phase === 'playing') startPlay();
  if (phase === 'play') adapter.apply(out);
  drawOverlay(ctx, video, lms, { hint: out.hint, jumping: out.jumping, phase: out.phase }, settings);
  hintEl.textContent = phase === 'calibrate' ? (out.hint || '') : '';
}

function toMenu() {
  phase = 'menu';
  cancelAnimationFrame(rafId); rafId = 0;
  gameFrame.hidden = true;
  preview.className = '';
  ctx.clearRect(0, 0, preview.width, preview.height);
  hintEl.textContent = '';
  showScreen('menu');
}

// ── 설정 UI 바인딩 ──
function bindSettings() {
  const map = { 's-topSpeed': 'topSpeed', 's-accel': 'accel', 's-lane': 'laneSensitivity', 's-jump': 'jumpStrength' };
  for (const [id, key] of Object.entries(map)) {
    const el = $(id); el.value = settings[key];
    el.addEventListener('input', () => { settings[key] = parseFloat(el.value); saveSettings(storage, settings); applyGameSpeed(gameWin(), settings); });
  }
  const corner = $('s-corner'); corner.value = settings.previewCorner;
  corner.addEventListener('change', () => { settings.previewCorner = corner.value; saveSettings(storage, settings); });
  $('s-reset').addEventListener('click', () => { settings = defaultSettings(); saveSettings(storage, settings); bindSettings(); });
}

// ── 이벤트 ──
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
  const go = b.dataset.go;
  if (go === 'calibrate') startCalibrate();
  else if (go === 'menu') { showScreen('menu'); phase = 'menu'; }
  else showScreen(go);   // settings | help
}));
window.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') { if (phase === 'play' || phase === 'calibrate') { controls.recalibrate(); phase = 'calibrate'; setPreviewMode('full'); gameFrame.hidden = true; } }
  if (e.key === 'Escape') toMenu();
});

bindSettings();
showScreen('menu');
```

- [ ] **Step 5: 수동 E2E 확인**

Run: `cd subway-booth && python3 -m http.server 8000`
브라우저 `http://localhost:8000/booth/booth.html`:
1. 메뉴 표시 → "게임 시작" → 카메라 전체화면 + "STAND STILL/READY" 안내
2. 가운데 서서 3초 → 게임 나타나고 미리보기가 구석으로 축소
3. 좌/우 한 발 → 캐릭터 칸 이동, 살짝 점프 → 캐릭터 점프
4. **C** 재보정 전체화면 복귀, **Esc** 메뉴 복귀
5. 설정에서 속도/민감도 바꾸면 반영, 새로고침 후 유지(localStorage)
Expected: 위 흐름 정상, 콘솔 네트워크 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add booth/booth.html booth/styles.css booth/shell.mjs
git commit -m "feat: 부스 앱 전체 배선(메뉴/설정/도움말/보정/플레이)"
```

---

## Task 10: README — 실행/배포 안내

**Files:**
- Create: `README.md`

- [ ] **Step 1: README 작성**

```markdown
# Subway 모션 부스

몸동작(좌/우/점프)으로 즐기는 브라우저 Subway Surfers. 학생회 부스용.

## 실행 (개발/부스 공통)
1. 이 폴더에서 정적 서버를 켠다(둘 중 하나):
   - `python3 -m http.server 8000`  (또는 Windows: `py -m http.server 8000`)
2. Chrome에서 `http://localhost:8000/booth/booth.html` 접속.
3. 카메라 권한 허용. `F11`로 전체화면.
4. "게임 시작" → 가운데 서서 3초 보정 → 플레이.
   - `C` 재보정, `Esc` 메뉴.

> `file://`로 직접 열면 카메라·모듈이 막힌다. 반드시 `localhost` 서버로 열 것.
> 완전 오프라인(인터넷 불필요) — MediaPipe는 `vendor/`에 포함.

## 배포
- 이 폴더를 통째로 전달하거나 `git clone` 후 위 "실행"대로.
- Mac/Windows 동일(브라우저만 있으면 됨).

## 커스텀
- 속도: 설정창 슬라이더(즉시) 또는 `game/main.js`의 `top_speed` 편집(영구).
- 외형: `game/textures/`의 이미지 교체(surfer/train/coin 등).

## 테스트(개발)
- `npm test` (Node 18+ 필요) — 판정 로직 단위 테스트.

## 참고: 데스크톱/타 게임
- 브라우저는 보안상 다른 앱에 키를 못 보낸다. 데스크톱 게임을 몸으로 하려면
  별도 파이썬 도구(`개발/motion_control.py`)를 사용.
```

- [ ] **Step 2: 전체 테스트 재확인 + 커밋**

Run: `cd subway-booth && node --test`
Expected: 전체 PASS.

```bash
git add README.md
git commit -m "docs: 실행·배포·커스텀 안내 README"
```

---

## 자기검토(작성자 체크)

- **스펙 커버리지**: 메뉴(T9)·보정 전체화면→구석 축소(T9 setPreviewMode)·설정 속도/감도/미리보기(T8,T9)·좌우/점프 판정 이식(T1~T4)·게임 직접 트리거·최소지연(T5)·오프라인 번들(T6)·미리보기 스켈레톤(T7)·배포/실행 안내(T10) 모두 태스크로 매핑됨. 키 매핑은 비목표 — 태스크 없음(정상).
- **플레이스홀더**: 각 코드 스텝에 실제 코드 포함. "적절히 처리" 류 없음. 단, T6/T7/T9의 브라우저 부분은 성격상 수동 확인(명시함).
- **타입 일관성**: `MotionControls.update` 반환 `{phase,progress,hint,laneAction,steps,jumpAction,zone,jumping,lost}`을 T5 adapter(`laneAction,steps,jumpAction`)와 T9 shell(`hint,jumping,phase`)이 동일 필드명으로 소비. `settingsToConfig`→`{LANE_TRIGGER,JUMP_RATIO}`가 `MotionControls`/`JumpDetector` cfg 키와 일치.
- **알려진 확인점**: 게임 전역(`top_speed`,`acc`,`Mousetrap`) iframe 노출 여부는 T9 Step3에서 실측 후, 미노출 시 README에 한계 기록.
