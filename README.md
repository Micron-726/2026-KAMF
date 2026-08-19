# Subway 모션 부스

몸동작(좌/우/점프)으로 즐기는 Unity WebGL Subway Surfers. 학생회 부스용.
카메라·동작인식(MediaPipe)·게임을 브라우저 한 화면에서 처리한다.

## 구성
- `booth/` — 부스 셸(메뉴/보정/플레이 + 모션 인식 + Unity 조작).
- `game-unity/` — Unity WebGL 빌드(`Build/ss-webgl.*`). Unity 프로젝트를 재빌드하면 이 폴더의 `Build/`만 갈아끼운다.
- `vendor/` — MediaPipe(오프라인 번들).
- `serve.py` — Unity `.gz` 파일에 gzip 헤더를 붙이는 로컬 서버.

## 실행 (개발/부스 공통)
1. 이 폴더에서 서버를 켠다:
   ```
   python3 serve.py          # 또는 Windows: py serve.py
   ```
   > `python -m http.server`는 Unity WebGL의 gzip 파일을 못 띄운다(Content-Encoding 에러). 반드시 `serve.py`로 열 것.
2. Chrome에서 `http://localhost:8000/booth/booth.html` 접속.
3. 카메라 권한 허용. `F11`로 전체화면.
4. "게임 시작" → 가운데 서서 3초 보정 → 플레이.

> `file://` 직접 열기는 카메라·모듈이 막힌다. 반드시 `localhost` 서버로.
> 완전 오프라인(인터넷 불필요).

## 운영 카드(부스 담당자용)
- **C** = 재보정 / 새 판 시작(다음 플레이어, 또는 게임이 끝났을 때).
- **Esc** = 메뉴로 복귀.
- 설정에서 **게임 속도**·**좌우 민감도**·**점프 강도**·**미리보기 위치** 조정 가능.

## 배포
- 이 폴더를 통째로 전달하거나 `git clone` 후 위 "실행"대로.
- Mac/Windows 동일(브라우저만 있으면 됨). 첫 플레이 때 Unity 로드 수 초 소요.

## 게임/외형 바꾸기 (나중에)
- Unity 프로젝트(`../Subway-Surfers-Clone`)에서 캐릭터/장애물 프리팹·모델을 교체하거나 텍스처를 바꾼 뒤,
  **WebGL로 다시 Build → `game-unity/Build/`에 덮어쓰기**만 하면 된다. 부스 셸/조작 코드는 그대로.
- 조작·속도 연동은 `BoothBridge`(Unity)와 `booth/adapter.mjs`가 담당하므로 아트를 바꿔도 재통합 불필요.

## 테스트(개발)
- `npm test` (Node 18+) — 동작판정·어댑터·설정 등 순수 로직 단위 테스트.

## 참고: 데스크톱/타 게임
- 브라우저는 보안상 다른 앱에 키를 못 보낸다. 데스크톱 게임을 몸으로 하려면
  별도 파이썬 도구(`개발/motion_control.py`)를 사용.
