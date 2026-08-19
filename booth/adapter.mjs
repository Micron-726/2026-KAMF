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
