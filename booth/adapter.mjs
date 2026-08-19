// booth/adapter.mjs — 추상 동작(LEFT/RIGHT/JUMP)을 Unity 게임 입력으로.
// Unity WebGL은 unityInstance.SendMessage(GameObject, Method) 로 JS→게임 호출을 받는다.
// 게임 쪽 BoothBridge(자동 생성 GameObject)의 MoveLeft/MoveRight/Jump 를 호출한다.
export function makeAdapter(getUnity) {
  const send = (method) => {
    const u = getUnity();
    if (u && typeof u.SendMessage === 'function') {
      u.SendMessage('BoothBridge', method);
    }
  };
  return {
    apply(result) {
      if (!result) return;
      if (result.laneAction) {
        const method = result.laneAction === 'right' ? 'MoveRight' : 'MoveLeft';
        const n = Math.max(1, result.steps || 1);
        for (let i = 0; i < n; i++) send(method);
      }
      if (result.jumpAction) send('Jump');
    },
  };
}
