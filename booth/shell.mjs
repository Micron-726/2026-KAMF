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

// startCalibrate()는 카메라 권한/PoseLandmarker 로드를 await하는데, 그 사이에
// 사용자가 Esc(→menu)를 누르면 나중에 이어지는(stale) continuation이 그대로
// loop()를 또 시작해 RAF 루프가 중복 실행될 수 있다. 진입마다 토큰을 새로
// 발급하고, 각 await 뒤에 현재 토큰과 비교해 낡은 continuation을 중단한다.
// toMenu()/stopGame()처럼 진행 중이던 보정을 무효화해야 하는 모든 종료
// 경로에서 토큰을 증가시킨다.
let sessionToken = 0;

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

// 게임은 index.html이 로드되는 즉시 자체적으로 실행을 시작한다(main.js 최상위에서
// requestAnimationFrame 루프가 바로 돈다). 그래서 메뉴/보정 단계에서 iframe을 미리
// 띄워두면 플레이어가 화면을 보기도 전에 게임이 진행돼버린다. 이를 막기 위해
// iframe은 평소엔 src가 비어 있고, 플레이가 시작되는 순간에만 (재)로드해서
// 매번 완전히 새 게임 상태로 시작하게 한다.
let pendingLoadHandler = null;

function stopGame() {
  // 로딩 중(=아직 load 이벤트가 안 온) iframe을 중단시키면 브라우저가 load를
  // 절대 쏘지 않아 { once:true } 리스너가 영영 안 떨어진다. 재보정을 반복해도
  // 리스너가 쌓이지 않도록 대기 중이면 직접 떼어준다.
  if (pendingLoadHandler) { gameFrame.removeEventListener('load', pendingLoadHandler); pendingLoadHandler = null; }
  gameFrame.removeAttribute('src');
  sessionToken++;   // 루프를 끊는 종료 경로 — 진행 중이던 startCalibrate()를 무효화
}

function startGame(onReady) {
  stopGame();
  pendingLoadHandler = () => { pendingLoadHandler = null; onReady(); };
  gameFrame.addEventListener('load', pendingLoadHandler, { once: true });
  // 캐시된 동일 URL이면 브라우저가 load를 재발화하지 않을 수 있으므로 매번 다른 URL로 로드
  gameFrame.src = `../game/index.html?boothrun=${Date.now()}`;
}

async function startCalibrate() {
  const myToken = ++sessionToken;
  phase = 'calibrate';
  showScreen(null);            // 모든 메뉴 숨김
  await ensureCamera();
  if (myToken !== sessionToken) return;   // 대기 중 취소됨(예: Esc) — 낡은 continuation 중단
  await ensureEngine();
  if (myToken !== sessionToken) return;
  controls = new MotionControls(settingsToConfig(settings));
  stopGame();
  gameFrame.hidden = true;
  setPreviewMode('full');
  loop();
}

function startPlay() {
  phase = 'play';
  setPreviewMode('corner');
  startGame(() => {
    // 게임 iframe의 load 이벤트 이후(=main.js의 var top_speed/acc 등 전역이
    // 생성된 이후)에만 속도를 반영할 수 있다.
    applyGameSpeed(gameWin(), settings);
    gameFrame.hidden = false;
  });
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
  sessionToken++;   // 진행 중이던 startCalibrate() continuation을 무효화
  cancelAnimationFrame(rafId); rafId = 0;
  stopGame();
  gameFrame.hidden = true;
  preview.className = '';
  ctx.clearRect(0, 0, preview.width, preview.height);
  hintEl.textContent = '';
  showScreen('menu');
}

// ── 설정 UI 바인딩 ──
// 슬라이더 input id ↔ settings 키 매핑(리스너 부착·값 채우기 양쪽에서 공용).
const SETTINGS_FIELD_MAP = { 's-topSpeed': 'topSpeed', 's-accel': 'accel', 's-lane': 'laneSensitivity', 's-jump': 'jumpStrength' };

// 리스너 부착은 페이지 초기화 시 딱 1회만 호출한다(설정 초기화 버튼을 누를
// 때마다 다시 부착하면 addEventListener가 누적돼 입력마다 저장/적용이
// N배로 중복 실행된다).
function attachSettingsListeners() {
  for (const [id, key] of Object.entries(SETTINGS_FIELD_MAP)) {
    const el = $(id);
    el.addEventListener('input', () => { settings[key] = parseFloat(el.value); saveSettings(storage, settings); applyGameSpeed(gameWin(), settings); });
  }
  const corner = $('s-corner');
  corner.addEventListener('change', () => { settings.previewCorner = corner.value; saveSettings(storage, settings); });
  $('s-reset').addEventListener('click', () => {
    settings = defaultSettings();
    saveSettings(storage, settings);
    applyGameSpeed(gameWin(), settings);
    populateSettings();
  });
}

// 현재 settings 값을 입력 요소들에 채워 넣기만 한다(리스너는 건드리지 않음).
// 초기 로드 시, 그리고 "기본값으로 초기화" 이후에 호출된다.
function populateSettings() {
  for (const [id, key] of Object.entries(SETTINGS_FIELD_MAP)) { $(id).value = settings[key]; }
  $('s-corner').value = settings.previewCorner;
}

// ── 이벤트 ──
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
  const go = b.dataset.go;
  if (go === 'calibrate') startCalibrate();
  else if (go === 'menu') { showScreen('menu'); phase = 'menu'; }
  else showScreen(go);   // settings | help
}));
window.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') { if (phase === 'play' || phase === 'calibrate') { controls.recalibrate(); phase = 'calibrate'; stopGame(); setPreviewMode('full'); gameFrame.hidden = true; } }
  if (e.key === 'Escape') toMenu();
});

attachSettingsListeners();
populateSettings();
showScreen('menu');
