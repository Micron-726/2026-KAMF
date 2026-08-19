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

// getUserMedia가 거부(권한 거부/장치 없음 등)되면 예전엔 조용히 검은 화면으로
// 남았다. 예외가 startCalibrate()까지 unhandled로 새지 않게 여기서 잡고,
// 화면(hint)에 안내를 띄운 뒤 false를 돌려준다 — 호출자가 이어지는 단계를
// 진행하지 않도록. showScreen(null) 상태라 메뉴 오버레이에 가려지지 않고
// hint가 그대로 보인다. Esc는 어느 상태에서든 동작하므로 메뉴 복귀는 그걸로 충분.
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
  const gotCamera = await ensureCamera();
  if (myToken !== sessionToken || !gotCamera) return;   // 취소됨(Esc) 또는 카메라 실패
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
  startGame(() => {
    // 게임 iframe의 load 이벤트 이후(=main.js의 var top_speed/acc 등 전역이
    // 생성된 이후)에만 속도를 반영할 수 있다.
    applyGameSpeed(gameWin(), settings);
    // 코너 전환도 게임이 실제로 보이는 이 시점에 함께 일으킨다 — 미리 옮기면
    // 게임이 아직 안 보이는 동안 잠깐 검은 화면 + 작은 코너 프리뷰만 보이는
    // 어색한 틈이 생긴다.
    setPreviewMode('corner');
    gameFrame.hidden = false;
  });
}

// pose 검출(MediaPipe)은 매 rAF(60fps)마다 돌리면 게임 WebGL 렌더와 경쟁해
// 부스 PC에서 성능/지연 문제를 일으킬 수 있다. 검출만 ~30fps로 스로틀하고,
// rAF 자체와 화면 그리기(오버레이)는 풀레이트를 유지한다 — 재사용 프레임에서는
// 직전 landmarks/out으로 그리기만 한다.
const DETECT_INTERVAL_MS = 33;
let lastDetectAt = -Infinity;
let lastLandmarks = null;
let lastOut = { phase: 'calibrating', hint: '', jumping: false };
let lastGameOver = false;

function loop(t = performance.now()) {
  rafId = requestAnimationFrame(loop);
  if (phase !== 'calibrate' && phase !== 'play') return;
  const aspect = (video.videoWidth || 640) / (video.videoHeight || 480);

  if (t - lastDetectAt >= DETECT_INTERVAL_MS) {
    lastDetectAt = t;
    lastLandmarks = engine.detect(video, t);
    lastOut = controls.update(lastLandmarks, t / 1000, aspect);
    if (phase === 'calibrate' && lastOut.phase === 'playing') startPlay();
    if (phase === 'play') {
      // 게임 전역 var gameover(main.js) 폴링 — 죽은 게임에는 입력을 보내지 않는다.
      lastGameOver = !!(gameWin() && gameWin().gameover);
      if (!lastGameOver) adapter.apply(lastOut);
    }
  }

  drawOverlay(ctx, video, lastLandmarks, { hint: lastOut.hint, jumping: lastOut.jumping, phase: lastOut.phase }, settings);
  if (phase === 'calibrate') hintEl.textContent = lastOut.hint || '';
  else if (phase === 'play') hintEl.textContent = lastGameOver ? '게임 오버 — 다시 하려면 C' : '';
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
  lastGameOver = false;
  showScreen('menu');
}

function recalibrateNow() {
  if (!controls) return;   // 초기 await(ensureCamera/ensureEngine) 완료 전엔 controls가 아직 없다
  controls.recalibrate();
  phase = 'calibrate';
  lastGameOver = false;
  stopGame();
  setPreviewMode('full');
  gameFrame.hidden = true;
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
  if (e.key === 'c' || e.key === 'C') { if (phase === 'play' || phase === 'calibrate') recalibrateNow(); }
  if (e.key === 'Escape') toMenu();
});

attachSettingsListeners();
populateSettings();
showScreen('menu');
