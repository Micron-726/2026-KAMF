// Unity WebGL → 브라우저(booth) 로 점수/목숨/게임오버를 전달하는 브릿지.
// GameManager(C#)가 아래 함수를 호출하면, booth 셸이 window에 정의한 콜백이 실행된다.
mergeInto(LibraryManager.library, {
  BoothScore: function (score, coins) {
    if (typeof window !== 'undefined' && window.boothScore) window.boothScore(score, coins);
  },
  BoothHealth: function (health) {
    if (typeof window !== 'undefined' && window.boothHealth) window.boothHealth(health);
  },
  BoothHighScore: function (hs) {
    if (typeof window !== 'undefined' && window.boothHighScore) window.boothHighScore(hs);
  },
  BoothGameOver: function () {
    if (typeof window !== 'undefined' && window.boothGameOver) window.boothGameOver();
  },
});
