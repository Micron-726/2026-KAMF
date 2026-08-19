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
}

function startGame(onReady) {
  stopGame();
  pendingLoadHandler = () => { pendingLoadHandler = null; onReady(); };
  gameFrame.addEventListener('load', pendingLoadHandler, { once: true });
  // 캐시된 동일 URL이면 브라우저가 load를 재발화하지 않을 수 있으므로 매번 다른 URL로 로드
  gameFrame.src = `../game/index.html?boothrun=${Date.now()}`;
}

async function startCalibrate() {
  phase = 'calibrate';
  showScreen(null);            // 모든 메뉴 숨김
  await ensureCamera();
  await ensureEngine();
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
  cancelAnimationFrame(rafId); rafId = 0;
  stopGame();
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
  if (e.key === 'c' || e.key === 'C') { if (phase === 'play' || phase === 'calibrate') { controls.recalibrate(); phase = 'calibrate'; stopGame(); setPreviewMode('full'); gameFrame.hidden = true; } }
  if (e.key === 'Escape') toMenu();
});

bindSettings();
showScreen('menu');
