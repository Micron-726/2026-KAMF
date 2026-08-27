// booth/settings.mjs
const KEY = 'subway-booth:settings';

// 스키마 2: 민감도 값의 "의미"가 뒤집혔다(1~10 단계, 클수록 민감).
// 예전에 저장된 값을 그대로 쓰면 방향이 반대로 먹으므로 마이그레이션한다.
const SCHEMA = 2;

// ── 민감도(1~10, 클수록 민감) → controls.mjs 임계값(작을수록 민감) ──
// controls.mjs의 LANE_TRIGGER/JUMP_RATIO는 "몸 크기 대비 얼마나 움직여야 발동하냐"라
// 값이 클수록 둔감하다. 사용자가 보는 슬라이더와 방향이 정반대이므로 여기서 뒤집는다.
const LANE_TRIGGER_DULL = 0.55, LANE_TRIGGER_KEEN = 0.18;
const JUMP_RATIO_DULL = 0.28, JUMP_RATIO_KEEN = 0.07;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
// 민감도 1 → dull, 10 → keen 으로 선형 보간(= 방향 반전)
const sensToThreshold = (sens, dull, keen) =>
  dull - ((clamp(Number(sens) || 1, 1, 10) - 1) / 9) * (dull - keen);

export function defaultSettings() {
  return {
    schema: SCHEMA,
    gameSpeed: 20,        // Unity GameManager.GameSpeed (int)
    laneSpeed: 16,        // PlayerController._laneChangeSpeed (좌우 이동 속도)
    laneSens: 6,          // 1~10, 클수록 민감 (6 ≈ 예전 기본 LANE_TRIGGER 0.35)
    jumpSens: 6,          // 1~10, 클수록 민감 (6 ≈ 예전 기본 JUMP_RATIO 0.15)
    previewCorner: 'br',
    mirror: true,
  };
}

export function loadSettings(storage) {
  const base = defaultSettings();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (saved.schema !== SCHEMA) {
      // 구버전 저장값: 의미가 안 바뀐 항목만 살리고 민감도는 기본값으로 되돌린다.
      const kept = {};
      for (const k of ['gameSpeed', 'laneSpeed', 'previewCorner']) {
        if (saved[k] !== undefined) kept[k] = saved[k];
      }
      return { ...base, ...kept };
    }
    return { ...base, ...saved, schema: SCHEMA };
  } catch { return base; }
}

export function saveSettings(storage, s) {
  try { storage.setItem(KEY, JSON.stringify(s)); } catch { /* 시크릿 모드 등 */ }
}

const canSend = (u) => u && typeof u.SendMessage === 'function';

// 게임 속도만 따로 보낸다. 카운트다운/유예 구간에서 shell.mjs가 매 프레임 호출한다.
export function sendSpeed(unity, gameSpeed) {
  if (canSend(unity)) unity.SendMessage('BoothBridge', 'SetSpeed', Math.round(gameSpeed));
}

// Unity 인스턴스에 속도 설정을 반영한다. unity가 아직 없으면(로드 전) 조용히 무시.
export function applySpeed(unity, s) {
  if (!canSend(unity)) return;
  unity.SendMessage('BoothBridge', 'SetSpeed', Math.round(s.gameSpeed));
  unity.SendMessage('BoothBridge', 'SetLaneSpeed', s.laneSpeed);
}

export function settingsToConfig(s) {
  return {
    LANE_TRIGGER: sensToThreshold(s.laneSens, LANE_TRIGGER_DULL, LANE_TRIGGER_KEEN),
    JUMP_RATIO: sensToThreshold(s.jumpSens, JUMP_RATIO_DULL, JUMP_RATIO_KEEN),
  };
}
