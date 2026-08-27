// booth/shell.mjs
import { createPoseEngine } from './pose-engine.mjs';
import { MotionControls } from './controls.mjs';
import { makeAdapter } from './adapter.mjs';
import { drawOverlay } from './overlay.mjs';
import { loadSettings, saveSettings, defaultSettings, applySpeed, sendSpeed, settingsToConfig } from './settings.mjs';

const $ = (id) => document.getElementById(id);
const unityContainer = $('unity-container');
const unityCanvas = $('unity-canvas');
const preview = $('preview'), hintEl = $('hint');
// desynchronized: 캔버스 합성을 표시 파이프라인과 분리해 미리보기 지연을 줄인다.
const ctx = preview.getContext('2d', { alpha: false, desynchronized: true });
const calibEl = $('calib'), calibStatus = $('calib-status'), calibRing = document.querySelector('#calib .prog');
const fxEl = $('fx'), fxFlash = $('fx-flash'), fxVig = $('fx-vig');
const countdownEl = $('countdown'), cdNum = $('cd-num'), cdSub = $('cd-sub');
const RING_C = 2 * Math.PI * 90;   // 링 둘레(r=90) — CSS stroke-dasharray와 일치

const storage = window.localStorage;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 연출/난이도 조정 상수 ────────────────────────────────────────────────
// 피격 후 무적 표시 길이(ms). Unity의 PlayerController._flashingAnimationDuration
// (씬 값 = 3초) 동안 _canVulnerable 이 false 이므로 그 길이에 맞춘다.
// 게임 쪽 값을 바꾸면 여기도 같이 맞춰야 한다.
const INVINCIBLE_MS = 3000;
const BLINK_SLOW_MS = 260;   // 무적 시작 직후 깜박임 주기
const BLINK_FAST_MS = 70;    // 무적 종료 직전 깜박임 주기 (끝날수록 빨라진다)

const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'];
const COUNTDOWN_STEP_MS = 700;

const DIST_SCORE_RATE = 0.6;         // 이동량 1당 거리 점수
const DETECT_FALLBACK_MS = 22;       // requestVideoFrameCallback 미지원 시 스로틀

// ── 보정 안내 ───────────────────────────────────────────────────────────
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

function showHud(on) { $('hud').hidden = !on; }
const gameoverEl = $('gameover');
const hudLives = $('hud-lives'), hudCoins = $('hud-coins'), hudScore = $('hud-score');
const hudBest = $('hud-best'), hudDist = $('hud-dist'), goScore = $('go-score');
function showGameOver(on) { gameoverEl.hidden = !on; }

// ── 상태 ────────────────────────────────────────────────────────────────
let settings = loadSettings(storage);
let engine = null, video = null, controls = null;
let phase = 'menu';         // menu | settings | help | calibrate | play
let rafId = 0, vfcHandle = 0, usingVfc = false;
let sessionToken = 0;       // startCalibrate() continuation 무효화용
let runToken = 0;           // 진행 중 카운트다운 무효화용
let lastTickAt = 0, lastDetectAt = -Infinity;
let lastLandmarks = null;
let lastOut = { phase: 'calibrating', hint: '', jumping: false };

let inputGate = false;      // false면 동작을 게임에 보내지 않는다(카운트다운/게임오버)
let currentSpeed = 0, lastSentSpeed = -1;
let prevHealth = null, invincibleUntil = 0, blinkPhase = 0;

// ── 점수: Unity 점수(코인) + 웹에서 계산한 거리 점수 ──────────────────────
// Unity의 _score는 코인만 반영해서 달리기만 해서는 점수가 안 오른다.
// 게임 빌드를 못 고치므로 거리 점수는 셸에서 직접 적산해 합산 표시한다.
const BEST_KEY = 'subway-booth:best';
let unityScore = 0, unityCoins = 0, distTravelled = 0, distScore = 0;
let bestScore = Number(storage.getItem(BEST_KEY) || 0) || 0;

function renderScore() {
  const total = unityScore + distScore;
  hudScore.textContent = total;
  hudCoins.textContent = unityCoins;
  hudDist.textContent = Math.floor(distTravelled);
  if (total > bestScore) {
    bestScore = total;
    try { storage.setItem(BEST_KEY, String(bestScore)); } catch { /* 시크릿 모드 */ }
  }
  hudBest.textContent = bestScore;
}

// ── Unity → 웹 콜백 (jslib) ─────────────────────────────────────────────
window.boothScore = (score, coins) => { unityScore = score | 0; unityCoins = coins | 0; renderScore(); };
window.boothHealth = (hp) => {
  const h = Math.max(0, Math.min(3, hp | 0));
  hudLives.textContent = '♥'.repeat(h) + '♡'.repeat(3 - h);
  if (prevHealth !== null && h < prevHealth) onHit();
  prevHealth = h;
};
// Unity 최고점수는 코인만 반영해 웹 총점과 단위가 달라 쓰지 않는다(BEST는 localStorage).
window.boothHighScore = () => {};
window.boothGameOver = () => {
  inputGate = false;
  runToken++;                       // 진행 중이던 카운트다운 무효화
  countdownEl.hidden = true;
  goScore.textContent = hudScore.textContent;
  showGameOver(true);
};

// ── 피격 연출 + 무적 표시 ───────────────────────────────────────────────
function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

function onHit() {
  fxEl.hidden = false;
  retrigger(unityContainer, 'shake');   // 화면 흔들림
  retrigger(fxFlash, 'on');             // 붉은 플래시
  invincibleUntil = performance.now() + INVINCIBLE_MS;
  blinkPhase = 0;
}
unityContainer.addEventListener('animationend', () => unityContainer.classList.remove('shake'));
fxFlash.addEventListener('animationend', () => fxFlash.classList.remove('on'));

// 남은 무적 시간이 줄수록 깜박임 주기를 짧게 해서 "곧 끝난다"를 알린다.
function updateHitFx(t, dt) {
  const remain = invincibleUntil - t;
  if (remain <= 0) {
    if (fxVig.style.opacity !== '0') fxVig.style.opacity = '0';
    return;
  }
  const k = remain / INVINCIBLE_MS;                                   // 1 → 0
  const period = BLINK_FAST_MS + (BLINK_SLOW_MS - BLINK_FAST_MS) * k;
  blinkPhase += (dt * 1000) / period;
  fxVig.style.opacity = (blinkPhase % 1) < 0.5 ? '0.9' : '0';
}

// ── Unity WebGL 호스팅 ──────────────────────────────────────────────────
// 파일 이름은 Unity WebGL 빌드의 기본 출력(빌드 폴더 이름 = Build)을 그대로 쓴다.
// 예전엔 ss-webgl.* 로 바꿔 넣는 규칙이었는데, 빌드할 때마다 손으로 옮겨 담아야 해서
// 실제로 어긋났다(새 빌드가 들어와도 부스는 옛 빌드를 계속 읽었다).
const UNITY_BUILD = '../game-unity/Build';
const UNITY_CONFIG = {
  dataUrl: UNITY_BUILD + '/Build.data.gz',
  frameworkUrl: UNITY_BUILD + '/Build.framework.js.gz',
  codeUrl: UNITY_BUILD + '/Build.wasm.gz',
  streamingAssetsUrl: '../game-unity/StreamingAssets',
  companyName: 'DefaultCompany',
  productName: 'Subway-Surfers-Clone',
  productVersion: '0.1',
};
let unity = null;
let unityReady = null;          // 진행 중/완료된 로드 Promise (중복 생성 방지)
let unityLoaderInjected = false;

const adapter = makeAdapter(() => unity);

function injectUnityLoader() {
  return new Promise((resolve, reject) => {
    if (unityLoaderInjected) { resolve(); return; }
    const s = document.createElement('script');
    s.src = UNITY_BUILD + '/Build.loader.js';
    s.onload = () => { unityLoaderInjected = true; resolve(); };
    s.onerror = () => reject(new Error('Unity 로더(Build.loader.js) 로드 실패'));
    document.body.appendChild(s);
  });
}

// 최초 플레이 때 한 번만 인스턴스를 만든다(수 초 소요). 이후 판 교체는 Restart로.
function ensureUnity() {
  if (unityReady) return unityReady;
  unityReady = (async () => {
    hintEl.textContent = '게임 불러오는 중…';
    try {
      await injectUnityLoader();
      unity = await createUnityInstance(unityCanvas, UNITY_CONFIG, () => {});
      applySpeed(unity, settings);
      hintEl.textContent = '';
    } catch (e) {
      hintEl.textContent = '게임 로드 실패: ' + (e && e.message ? e.message : e);
      unityReady = null;        // 다음 시도 때 재시도 가능하게
    }
    return unity;
  })();
  return unityReady;
}

function showUnity(on) { unityContainer.classList.toggle('show', !!on); }
function showScreen(name) { for (const s of ['menu', 'settings', 'help']) $(s).hidden = (s !== name); }

// ── 카메라 / 엔진 ───────────────────────────────────────────────────────
async function ensureCamera() {
  if (video) return true;
  const v = document.createElement('video');
  v.autoplay = true; v.playsInline = true; v.muted = true;
  try {
    // frameRate를 높게 요청해야 카메라→인식 지연이 준다(30fps면 프레임 간격만 33ms).
    v.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60, min: 30 } },
    });
    await v.play();
  } catch {
    hintEl.textContent = '카메라 권한이 필요합니다 — 허용 후 새로고침해주세요. (Esc: 메뉴)';
    return false;
  }
  video = v;
  return true;
}

async function ensureEngine() { if (!engine) engine = await createPoseEngine(); }

function setPreviewMode(mode) {
  const full = mode === 'full';
  preview.className = full ? 'full' : `corner ${settings.previewCorner}`;
  // 플레이 중엔 구석에 320×240으로만 보이므로 백버퍼도 줄여 그리기 비용을 반으로.
  const w = full ? 640 : 320, h = full ? 480 : 240;
  if (preview.width !== w) { preview.width = w; preview.height = h; }
}

// ── 프레임 루프 ─────────────────────────────────────────────────────────
// 인식은 "카메라에 새 프레임이 올라온 순간"에만 돌린다(requestVideoFrameCallback).
// rAF 스로틀 방식은 카메라 프레임과 어긋나면 최대 한 프레임(≈33ms)을 통째로
// 손해 보고, 같은 프레임을 두 번 추론하는 낭비도 생긴다.
function onCameraFrame(t) {
  if (phase !== 'calibrate' && phase !== 'play') return;
  if (!engine || !video || !controls) return;
  const aspect = (video.videoWidth || 640) / (video.videoHeight || 480);
  lastLandmarks = engine.detect(video, t);
  lastOut = controls.update(lastLandmarks, t / 1000, aspect);
  if (phase === 'calibrate' && lastOut.phase === 'playing') startPlay();
  else if (phase === 'play' && inputGate) adapter.apply(lastOut);
  drawOverlay(ctx, video, lastLandmarks, { jumping: lastOut.jumping }, settings);
  if (phase === 'calibrate') updateCalib(lastOut);
}

function startFrameLoop() {
  stopFrameLoop();
  usingVfc = !!(video && typeof video.requestVideoFrameCallback === 'function');
  if (usingVfc) {
    const pump = (now) => { vfcHandle = video.requestVideoFrameCallback(pump); onCameraFrame(now); };
    vfcHandle = video.requestVideoFrameCallback(pump);
  }
  lastTickAt = 0; lastDetectAt = -Infinity;
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function stopFrameLoop() {
  if (vfcHandle && video && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfcHandle);
  vfcHandle = 0;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
}

// 게임 속도를 맞춘다: 카운트다운 동안 0(정지), 그 뒤 설정 속도.
// 중간 단계를 거치지 않는 이유 — GameManager.GameSpeed 세터가 호출될 때마다
// 점수 배율을 건드리므로, 속도는 판당 꼭 필요한 횟수만 보낸다.
// 시작 직후 "장애물 없는 구간"은 Unity 쪽 GameManager._obstacleGraceSeconds 가 만든다.
function updateSpeed() {
  const v = inputGate ? settings.gameSpeed : 0;     // 카운트다운/게임오버 중엔 월드 정지
  currentSpeed = v;
  const iv = Math.round(v);
  if (iv !== lastSentSpeed) { lastSentSpeed = iv; sendSpeed(unity, iv); }
}

function accumulateDistance(dt) {
  if (!inputGate || dt <= 0) return;
  distTravelled += currentSpeed * dt;
  const ds = Math.floor(distTravelled * DIST_SCORE_RATE);
  if (ds !== distScore) { distScore = ds; renderScore(); }
}

// rAF 틱: 속도 램프·거리 적산·연출 갱신 (+ rVFC 미지원 브라우저의 인식 폴백)
function tick(t = performance.now()) {
  rafId = requestAnimationFrame(tick);
  const dt = lastTickAt ? Math.min((t - lastTickAt) / 1000, 0.1) : 0;
  lastTickAt = t;
  if (phase !== 'calibrate' && phase !== 'play') return;
  if (!usingVfc && t - lastDetectAt >= DETECT_FALLBACK_MS) { lastDetectAt = t; onCameraFrame(t); }
  if (phase === 'play') { updateSpeed(); accumulateDistance(dt); }
  updateHitFx(t, dt);
}

// ── 흐름 ────────────────────────────────────────────────────────────────
function resetRunStats() {
  unityScore = 0; unityCoins = 0; distTravelled = 0; distScore = 0;
  prevHealth = null; invincibleUntil = 0; blinkPhase = 0;
  currentSpeed = 0; lastSentSpeed = -1; inputGate = false;
  fxVig.style.opacity = '0';
  hudLives.textContent = '♥♥♥';
  renderScore();
}

async function runCountdown(token) {
  inputGate = false;
  lastSentSpeed = -1;
  countdownEl.hidden = false;
  for (let i = 0; i < COUNTDOWN_STEPS.length; i++) {
    const step = COUNTDOWN_STEPS[i];
    if (token !== runToken) { countdownEl.hidden = true; return; }
    // 처음 한 번, 그리고 Restart 씬 리로드가 끝났을 무렵 한 번만 0을 보낸다.
    // (GameManager.GameSpeed 세터가 점수 배율을 건드려서 남발하면 안 된다)
    if (i === 0 || i === 1) { sendSpeed(unity, 0); lastSentSpeed = 0; }
    cdNum.textContent = step;
    cdNum.classList.toggle('go', step === 'GO!');
    retrigger(cdNum, 'pop');
    cdSub.textContent = step === 'GO!' ? '' : '준비!';
    await sleep(COUNTDOWN_STEP_MS);
  }
  countdownEl.hidden = true;
  if (token !== runToken) return;
  inputGate = true;
}

async function startCalibrate() {
  const myToken = ++sessionToken;
  runToken++;                    // 남아있던 카운트다운 중단
  phase = 'calibrate';
  showScreen(null);
  showGameOver(false);
  countdownEl.hidden = true;
  inputGate = false;
  const gotCamera = await ensureCamera();
  if (myToken !== sessionToken || !gotCamera) return;   // 취소(Esc) 또는 카메라 실패
  await ensureEngine();
  if (myToken !== sessionToken) return;
  controls = new MotionControls(settingsToConfig(settings));
  showUnity(false);              // 보정 중엔 카메라 전체화면
  setPreviewMode('full');
  showCalib(true);
  showHud(false);
  startFrameLoop();
}

// 보정 완료 → 플레이. 최초엔 Unity 인스턴스 생성(자동 시작), 이후엔 Restart.
async function startPlay() {
  phase = 'play';
  showCalib(false);
  showHud(true);
  setPreviewMode('corner');
  showUnity(true);
  const token = ++runToken;
  resetRunStats();
  const firstLoad = !unity;
  const u = await ensureUnity();
  if (token !== runToken || phase !== 'play') return;
  if (u) {
    if (!firstLoad) u.SendMessage('BoothBridge', 'Restart');   // 최초 로드는 이미 새 판
    applySpeed(u, settings);
  }
  runCountdown(token);
}

// 재시도: 보정은 유지하고 게임 판만 새로 시작.
function restartRun() {
  if (!unity) return;
  showGameOver(false);
  const token = ++runToken;
  resetRunStats();
  unity.SendMessage('BoothBridge', 'Restart');
  // 씬 리로드로 새 GameManager/Player가 생긴 뒤에 설정을 재적용해야 확실히 먹는다.
  setTimeout(() => { if (unity && token === runToken) applySpeed(unity, settings); }, 300);
  runCountdown(token);
}

function toMenu() {
  phase = 'menu';
  sessionToken++; runToken++;
  stopFrameLoop();
  inputGate = false;
  sendSpeed(unity, 0); lastSentSpeed = 0;    // 메뉴에선 게임을 세워 둔다
  showUnity(false);                          // 인스턴스는 살려두고 숨기기만(재생성은 비쌈)
  showCalib(false);
  showHud(false);
  showGameOver(false);
  countdownEl.hidden = true;
  fxEl.hidden = true;
  preview.className = '';
  ctx.clearRect(0, 0, preview.width, preview.height);
  hintEl.textContent = '';
  showScreen('menu');
}

function recalibrateNow() {
  if (!controls) return;         // 초기 await 완료 전엔 controls가 아직 없음
  runToken++;
  controls.cfg = settingsToConfig(settings);   // 설정에서 바꾼 민감도를 여기서 반영
  controls.recalibrate();
  phase = 'calibrate';
  inputGate = false;
  sendSpeed(unity, 0); lastSentSpeed = 0;
  showUnity(false);
  setPreviewMode('full');
  showCalib(true);
  showHud(false);
  showGameOver(false);
  countdownEl.hidden = true;
  fxEl.hidden = true;
}

// ── 설정 UI 바인딩 ──────────────────────────────────────────────────────
const SETTINGS_FIELD_MAP = {
  's-gameSpeed': 'gameSpeed', 's-laneSpeed': 'laneSpeed',
  's-laneSens': 'laneSens', 's-jumpSens': 'jumpSens',
};

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
      if (key === 'gameSpeed' || key === 'laneSpeed') {
        applySpeed(unity, settings);
        lastSentSpeed = Math.round(settings.gameSpeed);   // 속도 램프 로직과 동기
      } else if (controls) {
        controls.cfg = settingsToConfig(settings);        // 민감도는 다음 보정부터 적용
      }
    });
  }
  const corner = $('s-corner');
  corner.addEventListener('change', () => { settings.previewCorner = corner.value; saveSettings(storage, settings); });
  $('s-reset').addEventListener('click', () => {
    settings = defaultSettings();
    saveSettings(storage, settings);
    applySpeed(unity, settings);
    lastSentSpeed = Math.round(settings.gameSpeed);
    if (controls) controls.cfg = settingsToConfig(settings);
    populateSettings();
  });
}

function populateSettings() {
  for (const [id, key] of Object.entries(SETTINGS_FIELD_MAP)) { const el = $(id); el.value = settings[key]; updateFieldDisplay(el); }
  $('s-corner').value = settings.previewCorner;
}

// ── 이벤트 ──────────────────────────────────────────────────────────────
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
renderScore();
showScreen('menu');
