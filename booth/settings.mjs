// booth/settings.mjs
const KEY = 'subway-booth:settings';

export function defaultSettings() {
  return {
    gameSpeed: 20,              // Unity GameManager.GameSpeed (int)로 전달
    laneSpeed: 16,              // PlayerController._laneChangeSpeed (좌우 이동 속도)
    laneSensitivity: 0.35,      // MotionControls LANE_TRIGGER
    jumpStrength: 0.15,         // MotionControls JUMP_RATIO
    previewCorner: 'br', mirror: true,
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

// Unity 인스턴스에 게임 속도를 반영한다. unity가 아직 없으면(로드 전) 조용히 무시.
export function applySpeed(unity, s) {
  if (unity && typeof unity.SendMessage === 'function') {
    unity.SendMessage('BoothBridge', 'SetSpeed', Math.round(s.gameSpeed));
    unity.SendMessage('BoothBridge', 'SetLaneSpeed', s.laneSpeed);
  }
}

export function settingsToConfig(s) {
  return { LANE_TRIGGER: s.laneSensitivity, JUMP_RATIO: s.jumpStrength };
}
