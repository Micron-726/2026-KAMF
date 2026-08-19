// booth/settings.mjs
const KEY = 'subway-booth:settings';

export function defaultSettings() {
  return {
    topSpeed: 0.3, startSpeed: 0, accel: 0.0005,
    laneSensitivity: 0.35, jumpStrength: 0.15,
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

export function applyGameSpeed(gameWindow, s) {
  if (!gameWindow) return;
  if ('top_speed' in gameWindow) gameWindow.top_speed = s.topSpeed;
  if ('acc' in gameWindow) gameWindow.acc = s.accel;
  if ('speed' in gameWindow) gameWindow.speed = s.startSpeed;
}

export function settingsToConfig(s) {
  return { LANE_TRIGGER: s.laneSensitivity, JUMP_RATIO: s.jumpStrength };
}
