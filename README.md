# Subway 모션 부스

몸동작(좌/우/점프)으로 즐기는 브라우저 Subway Surfers. 학생회 부스용.

## 실행 (개발/부스 공통)
1. 이 폴더에서 정적 서버를 켠다(둘 중 하나):
   - `python3 -m http.server 8000`  (또는 Windows: `py -m http.server 8000`)
2. Chrome에서 `http://localhost:8000/booth/booth.html` 접속.
3. 카메라 권한 허용. `F11`로 전체화면.
4. "게임 시작" → 가운데 서서 3초 보정 → 플레이.
   - `C` 재보정, `Esc` 메뉴.

> `file://`로 직접 열면 카메라·모듈이 막힌다. 반드시 `localhost` 서버로 열 것.
> 완전 오프라인(인터넷 불필요) — MediaPipe는 `vendor/`에 포함.

## 배포
- 이 폴더를 통째로 전달하거나 `git clone` 후 위 "실행"대로.
- Mac/Windows 동일(브라우저만 있으면 됨).

## 커스텀
- 속도: 설정창 슬라이더(즉시) 또는 `game/main.js`의 `top_speed` 편집(영구).
- 외형: `game/textures/`의 이미지 교체(surfer/train/coin 등).

## 테스트(개발)
- `npm test` (Node 18+ 필요) — 판정 로직 단위 테스트.

## 참고: 데스크톱/타 게임
- 브라우저는 보안상 다른 앱에 키를 못 보낸다. 데스크톱 게임을 몸으로 하려면
  별도 파이썬 도구(`개발/motion_control.py`)를 사용.
