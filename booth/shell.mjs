// booth/shell.mjs
import { createPoseEngine } from './pose-engine.mjs';
import { MotionControls } from './controls.mjs';
import { makeAdapter } from './adapter.mjs';
import { drawOverlay } from './overlay.mjs';
import { loadSettings, saveSettings, defaultSettings, applySpeed, settingsToConfig } from './settings.mjs';

const $ = (id) => document.getElementById(id);
const unityContainer = $('unity-container');
const unityCanvas = $('unity-canvas');
const preview = $('preview'), hintEl = $('hint');
const ctx = preview.getContext('2d');
const calibEl = $('calib'), calibStatus = $('calib-status'), calibRing = document.querySelector('#calib .prog');
const RING_C = 2 * Math.PI * 90;   // 링 둘레(r=90) — CSS stroke-dasharray와 일치

// 보정 상태 코드(controls.mjs) → 한국어 문구 + 색상 클래스
const CALIB_MSG = {
  'STEP INTO VIEW': ['화면 안에 들어와 주세요', 'warn'],
  'TOO CLOSE': ['너무 가까워요 — 뒤로', 'warn'],
  'TOO FAR': ['너무 멀어요 — 앞으로', 'warn'],
  'STAND STILL': ['가만히 서 계세요', 'hold'],
  'READY': ['완료!', 'ok'],
  'GO': ['시작!', 'ok'],
};
function showCalib(on) { calibEl.hidden = !on; }
function updateCalib(out) {
  const [msg, cls] = CALIB_MSG[out.hint] || [out.hint || '준비 중…', 'hold'];
  calibStatus.textContent = msg;
  calibStatus.className = cls;
  const p = Math.max(0, Math.min(1, out.progress || 0));
  calibRing.style.strokeDashoffset = String(RING_C * (1 - p));
}

// 플레이 HUD (온스크린 버튼 — Unity 키보드 캡처와 무관하게 클릭으로 동작)
function showHud(on) { $('hud').hidden = !on; }
// 재시도: 보정은 유지하고 게임 판만 새로 시작.
function restartRun() {
  if (!unity) return;
  showGameOver(false);
  unity.SendMessage('BoothBridge', 'Restart');
  applySpeed(unity, settings);
}

// ── 점수/목숨/게임오버 (Unity jslib → window 콜백) ──
const gameoverEl = $('gameover');
const hudLives = $('hud-lives'), hudCoins = $('hud-coins'), hudScore = $('hud-score'), hudBest = $('hud-best'), goScore = $('go-score');
function showGameOver(on) { gameoverEl.hidden = !on; }
window.boothScore = (score, coins) => { hudScore.textContent = score; hudCoins.textContent = coins; };
window.boothHealth = (hp) => { const h = Math.max(0, Math.min(3, hp | 0)); hudLives.textContent = '♥'.repeat(h) + '♡'.repeat(3 - h); };
window.boothHighScore = (hs) => { hudBest.textContent = hs; };
window.boothGameOver = () => { goScore.textContent = hudScore.textContent; showGameOver(true); };
const storage = window.localStorage;

let settings = loadSettings(storage);
let engine = null, video = null, controls = null;
let phase = 'menu';         // menu | settings | help | calibrate | play
let rafId = 0;
let sessionToken = 0;       // 진행 중이던 startCalibrate() continuation 무효화용

// ── Unity WebGL 호스팅 ──
// 부스 페이지가 직접 Unity 로더를 주입해 캔버스에 인스턴스를 만든다(iframe 아님).
// 이러면 unityInstance가 이 스코프에 있어 SendMessage가 간단하고, 게임을 재빌드해도
// game-unity/Build/ 파일만 바뀌면 되며 이 코드는 손댈 필요가 없다.
const UNITY_BUILD = '../game-unity/Build';
const UNITY_CONFIG = {
  dataUrl: UNITY_BUILD + '/ss-webgl.data.gz',
  frameworkUrl: UNITY_BUILD + '/ss-webgl.framework.js.gz',
  codeUrl: UNITY_BUILD + '/ss-webgl.wasm.gz',
  streamingAssetsUrl: '../game-unity/StreamingAssets',
  companyName: 'DefaultCompany',
  productName: 'Subway-Surfers-Clone',
  productVersion: '0.1',
};
let unity = null;               // createUnityInstance 결과
let unityLoaderInjected = false;
let unityStarting = false;

const adapter = makeAdapter(() => unity);

function injectUnityLoader() {
  return new Promise((resolve, reject) => {
    if (unityLoaderInjected) { resolve(); return; }
    const s = document.createElement('script');
    s.src = UNITY_BUILD + '/ss-webgl.loader.js';
    s.onload = () => { unityLoaderInjected = true; resolve(); };
    s.onerror = () => reject(new Error('Unity 로더(ss-webgl.loader.js) 로드 실패'));
    document.body.appendChild(s);
  });
}

// 최초 플레이 때 한 번만 Unity 인스턴스를 만든다(수 초 소요). 이후 판 교체는 Restart로.
async function ensureUnity() {
  if (unity) return unity;
  if (unityStarting) return null;
  unityStarting = true;
  hintEl.textContent = '게임 불러오는 중…';
  try {
    await injectUnityLoader();
    // createUnityInstance는 로더가 window에 정의하는 전역 함수.
    unity = await createUnityInstance(unityCanvas, UNITY_CONFIG, () => {});
    applySpeed(unity, settings);
    hintEl.textContent = '';
  } catch (e) {
    hintEl.textContent = '게임 로드 실패: ' + (e && e.message ? e.message : e);
  } finally {
    unityStarting = false;
  }
  return unity;
}

function showUnity(on) {
  unityContainer.classList.toggle('show', !!on);
}

function showScreen(name) {
  for (const s of ['menu', 'settings', 'help']) $(s).hidden = (s !== name);
}

// getUserMedia 거부 시 조용한 검은 화면 대신 안내를 띄우고 false 반환.
async function ensureCamera() {
  if (video) return true;
  const v = document.createElement('video');
  v.autoplay = true; v.playsInline = true; v.muted = true;
  try {
    v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    await v.play();
  } catch {
    hintEl.textContent = '카메라 권한이 필요합니다 — 허용 후 새로고침해주세요. (Esc: 메뉴)';
    return false;
  }
  video = v;
  return true;
}

async function ensureEngine() {
  if (!engine) engine = await createPoseEngine();
}

function setPreviewMode(mode) {
  preview.className = mode === 'full' ? 'full' : `corner ${settings.previewCorner}`;
}

async function startCalibrate() {
  const myToken = ++sessionToken;
  phase = 'calibrate';
  showScreen(null);
  const gotCamera = await ensureCamera();
  if (myToken !== sessionToken || !gotCamera) return;   // 취소(Esc) 또는 카메라 실패
  await ensureEngine();
  if (myToken !== sessionToken) return;
  controls = new MotionControls(settingsToConfig(settings));
  showUnity(false);            // 보정 중엔 카메라 전체화면
  setPreviewMode('full');
  showCalib(true);
  showHud(false);
  loop();
}

// 보정 완료 → 플레이. 최초엔 Unity 인스턴스 생성(자동으로 새 게임 시작),
// 이후엔 Restart로 새 판 시작.
function startPlay() {
  phase = 'play';
  showCalib(false);
  showHud(true);
  setPreviewMode('corner');
  showUnity(true);
  if (unity) {
    unity.SendMessage('BoothBridge', 'Restart');
    applySpeed(unity, settings);
  } else {
    ensureUnity();             // async 이지만 기다리지 않는다 — 준비되면 loop가 입력을 보냄
  }
}

// pose 검출은 ~30fps로 스로틀(게임 WebGL 렌더와 경쟁 방지). rAF·그리기는 풀레이트.
const DETECT_INTERVAL_MS = 33;
let lastDetectAt = -Infinity;
let lastLandmarks = null;
let lastOut = { phase: 'calibrating', hint: '', jumping: false };

function loop(t = performance.now()) {
  rafId = requestAnimationFrame(loop);
  if (phase !== 'calibrate' && phase !== 'play') return;
  const aspect = (video.videoWidth || 640) / (video.videoHeight || 480);

  if (t - lastDetectAt >= DETECT_INTERVAL_MS) {
    lastDetectAt = t;
    lastLandmarks = engine.detect(video, t);
    lastOut = controls.update(lastLandmarks, t / 1000, aspect);
    if (phase === 'calibrate' && lastOut.phase === 'playing') startPlay();
    if (phase === 'play') adapter.apply(lastOut);   // unity 미준비면 adapter가 무시
  }

  // 캔버스에는 스켈레톤만(영어 상태 텍스트는 그리지 않음 — 보정 링/배지가 대신).
  drawOverlay(ctx, video, lastLandmarks, { jumping: lastOut.jumping }, settings);
  if (phase === 'calibrate') updateCalib(lastOut);
  hintEl.textContent = '';
}

function toMenu() {
  phase = 'menu';
  sessionToken++;
  cancelAnimationFrame(rafId); rafId = 0;
  showUnity(false);            // Unity 인스턴스는 살려두고 숨기기만(재생성은 비쌈)
  showCalib(false);
  showHud(false);
  showGameOver(false);
  preview.className = '';
  ctx.clearRect(0, 0, preview.width, preview.height);
  hintEl.textContent = '';
  showScreen('menu');
}

function recalibrateNow() {
  if (!controls) return;       // 초기 await 완료 전엔 controls가 아직 없음
  controls.recalibrate();
  phase = 'calibrate';
  showUnity(false);
  setPreviewMode('full');
  showCalib(true);
  showHud(false);
  showGameOver(false);
}

// ── 설정 UI 바인딩 ──
const SETTINGS_FIELD_MAP = { 's-gameSpeed': 'gameSpeed', 's-lane': 'laneSensitivity', 's-jump': 'jumpStrength' };

// 슬라이더 옆 숫자값과 채움(--fill) 갱신.
function updateFieldDisplay(el) {
  const out = document.getElementById(el.id + '-val');
  if (out) out.textContent = el.value;
  const min = parseFloat(el.min), max = parseFloat(el.max);
  if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
    el.style.setProperty('--fill', (((parseFloat(el.value) - min) / (max - min)) * 100) + '%');
  }
}

function attachSettingsListeners() {
  for (const [id, key] of Object.entries(SETTINGS_FIELD_MAP)) {
    const el = $(id);
    el.addEventListener('input', () => {
      settings[key] = parseFloat(el.value);
      updateFieldDisplay(el);
      saveSettings(storage, settings);
      if (key === 'gameSpeed') applySpeed(unity, settings);   // 속도만 게임에 즉시 반영
      // 좌우 민감도/점프 강도는 다음 보정 때 MotionControls로 반영됨
    });
  }
  const corner = $('s-corner');
  corner.addEventListener('change', () => { settings.previewCorner = corner.value; saveSettings(storage, settings); });
  $('s-reset').addEventListener('click', () => {
    settings = defaultSettings();
    saveSettings(storage, settings);
    applySpeed(unity, settings);
    populateSettings();
  });
}

function populateSettings() {
  for (const [id, key] of Object.entries(SETTINGS_FIELD_MAP)) { const el = $(id); el.value = settings[key]; updateFieldDisplay(el); }
  $('s-corner').value = settings.previewCorner;
}

// ── 이벤트 ──
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
  const go = b.dataset.go;
  if (go === 'calibrate') startCalibrate();
  else if (go === 'menu') { showScreen('menu'); phase = 'menu'; }
  else showScreen(go);   // settings | help
}));
// HUD 온스크린 버튼(클릭). Unity가 키보드를 잡아도 클릭은 항상 동작한다.
$('hud-retry').addEventListener('click', restartRun);
$('hud-recal').addEventListener('click', recalibrateNow);
$('hud-menu').addEventListener('click', toMenu);
$('go-retry').addEventListener('click', restartRun);
$('go-menu').addEventListener('click', toMenu);

// 키보드 단축키(담당자용, 보조). Unity 포커스 시엔 안 먹을 수 있어 HUD 버튼이 기본.
window.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') { if (phase === 'play' || phase === 'calibrate') recalibrateNow(); }
  if (e.key === 'Escape') toMenu();
});

attachSettingsListeners();
populateSettings();
showScreen('menu');
