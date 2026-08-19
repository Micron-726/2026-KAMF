# Subway Surfers 모션 부스 — 설계 문서

- 작성일: 2026-08-19
- 대상: 학생회 행사 부스에서 몸동작으로 조작하는 Subway Surfers 웹게임
- 상태: 설계(승인 대기)

## 1. 개요

행사 부스에서 플레이어가 **몸을 움직여** 브라우저 WebGL Subway Surfers를 조작하는
**단일 웹 앱**을 만든다. 카메라·동작인식·게임·설정을 브라우저 한 화면에서 처리하며,
Python이나 별도 창, OS 키 전송이 없다.

기반 게임은 `game/` 폴더의 WebGL 클론(ShashwatNigam99/Subway-Surfers)이다.
이 게임은 **좌·우·점프 3개 동작만** 지원한다(숙이기/구르기 없음).

## 2. 목표 / 비목표

### 목표
- 몸동작(좌우 이동, 점프)으로 게임을 조작
- 시작 메뉴(게임 시작 / 설정 / 도움말)
- 캘리브레이션: 처음엔 카메라 전체화면, 게임 시작 시 구석 미리보기로 축소
- 세밀한 설정창(게임 속도, 키 매핑, 인식 감도, 카메라 미리보기)
- 담당자 상주 전제(무인 자동복구 로직 불필요)
- 완전 오프라인 동작(부스 와이파이 불신), OS 무관
- Mac에서 개발·테스트 → 윈도우 PC로 폴더째 복사해 실행

### 비목표 (YAGNI)
- "컨트롤러 모드"(범용/다른 게임 조작) — 브라우저 샌드박스 제약으로 제외
- 실제 게임 사이트/데스크톱 게임 조작 — OS 키가 필요하므로 웹에서 불가(파이썬 도구가 별도로 담당, 이 앱과 무관)
- WebSocket 브릿지, 리더보드, 무인 자동 리셋
- 게임 3D 지오메트리 변경(형태). 텍스처 교체·속도 조정만 지원.

## 3. 아키텍처

기존 게임 위에 부스 셸(shell) 레이어를 얹는다. **게임 내부 로직은 수정하지 않고**,
조작은 `Mousetrap.trigger('left'|'right'|'up')`로 게임의 기존 핸들러를 호출한다.
(빌드 시 합성 KeyboardEvent 반응 여부도 확인, 기본은 trigger 사용)

```
subway-booth/
├─ game/                     # 기존 WebGL 게임 (거의 수정 안 함)
│  ├─ index.html, main.js, surfer.js, path.js, ... , textures/
├─ booth/                    # 새로 만드는 부스 셸
│  ├─ booth.html            # 진입점: 메뉴/설정/도움말/캘리브레이션 + 게임 iframe/캔버스
│  ├─ shell.js              # 화면 전환(메뉴→보정→플레이), 상태 머신
│  ├─ pose-engine.js        # MediaPipe 로딩 + 포즈 → 추상 동작(LEFT/RIGHT/JUMP)
│  ├─ controls.js           # 보정·좌우 3칸·점프 판정 (motion_control.py 이식)
│  ├─ adapter.js            # 추상 동작 → 게임 입력(Mousetrap.trigger / 합성 키)
│  ├─ overlay.js            # 카메라 미리보기 + 스켈레톤 + 상태 렌더
│  ├─ settings.js           # 설정 UI + localStorage 저장/로드
│  └─ styles.css
├─ vendor/mediapipe/         # MediaPipe Tasks(web) wasm + 모델 (오프라인 번들)
├─ serve.py 또는 실행 안내    # localhost 정적 서버
└─ docs/…
```

### 컴포넌트 경계
- **pose-engine**: 카메라 프레임 → 랜드마크. MediaPipe 세부는 여기 안에 숨김.
- **controls**: 랜드마크 → 추상 동작. 순수 함수 위주로 단위 테스트 대상.
- **adapter**: 추상 동작 → 게임. 게임 교체 시 여기만 바뀜.
- **overlay/settings/shell**: UI. 로직과 분리.

## 4. 동작 인식 로직 (motion_control.py `--body` 이식)

포즈 랜드마크: 어깨 L=11, R=12 / 엉덩이 L=23, R=24.

- `cx` = 엉덩이 중심 x = (l_hip.x + r_hip.x)/2
- `y_jump` = 엉덩이 중심 y = (l_hip.y + r_hip.y)/2
- `scale` = 몸통 길이 = hip_y − shoulder_y (거리 보정 기준)
- **가시성 필터**: 네 랜드마크의 visibility 중 최솟값 < `VIS_MIN`(0.3)이면 그 프레임 무시
- **x 보정**: 좌우 거리 계산 시 화면 가로세로비(aspect)로 보정

### 4.1 캘리브레이션
- "가운데 서세요" 안내 + 3초 카운트다운 동안 정지 자세 샘플 수집
- 흔들림(표준편차)이 `CALIB_TOL·scale` 이내로 안정되면 기준(baseline) 확정:
  - 기준 `cx`, 기준 `y_jump`, 기준 `scale`
- `scale`이 `SCALE_MIN~SCALE_MAX` 범위를 벗어나면(너무 멀거나 가까움) 재안내
- 가운데 칸을 플레이어 위치·몸 크기에 맞춤:
  - 칸 절반폭 `half = LANE_TRIGGER(0.35) · scale_x`
  - 여유폭 `hyst = LANE_HYST(0.12) · scale_x`
  - `center = clamp(cx, half, 1−half)`
- 담당자 재보정 단축키 제공(사람 교체 시)

### 4.2 좌우 3칸 판정 (히스테리시스)
- 현재 칸(0=좌,1=중,2=우) 기준으로 경계에 `hyst` 여유를 적용해 흔들림에 강하게:
  - `cx < left_edge (± hyst)` → 0, `cx > right_edge (∓ hyst)` → 2, 아니면 1
- 칸이 바뀌면 방향 1회 입력(탭): 오른쪽으로 이동 → `RIGHT`, 왼쪽 → `LEFT`
- 탭은 순차 처리(KeyTapper): 연속 이동도 간격을 두고 하나씩 확실히

### 4.3 점프 판정
- `y_jump`의 EMA(지수이동평균)를 유지
- `(ema_jump − y_jump) > JUMP_RATIO(0.15) · scale` 이면 점프 성립
- 엣지 트리거 + 쿨다운(`JUMP_COOLDOWN`): 한 번 뛰면 착지 후 재무장
- 너무 오래 유지되면(JUMP_MAX) 기준선 재설정으로 오검출 방지
- 성립 시 `UP` 1회 입력

> 상수(LANE_TRIGGER, LANE_HYST, JUMP_RATIO, VIS_MIN, JUMP_COOLDOWN, TAP_HOLD/GAP,
> EMA 계수 등)는 파이썬 원본 값을 그대로 옮겨 시작점으로 삼고, 부스 PC에서 미세조정.

## 5. 화면 흐름 (shell 상태 머신)

```
[메뉴] ──게임 시작──▶ [캘리브레이션: 카메라 전체화면] ──완료──▶ [플레이: 게임 전체화면 + 구석 미리보기]
   │                                                                      │
   ├─ 설정 ──▶ [설정창] ──뒤로──▶ [메뉴]                        게임오버 ──▶ [메뉴] 또는 재시작
   └─ 도움말 ─▶ [도움말] ──뒤로──▶ [메뉴]
```

- 캘리브레이션→플레이 전환 시 카메라 뷰가 **애니메이션으로 축소**되어 구석 미리보기로.
- 미리보기는 거울(좌우반전) + 스켈레톤 + 현재 칸/점프 상태 표시.

## 6. 설정창 (localStorage 저장)

- **게임 속도**: 시작 속도 / 최고 속도(`main.js top_speed`, 기본 0.3) / 가속도 — 슬라이더
- **키 매핑**: 좌·우·점프 각각에 보낼 입력 선택(기본 left/right/up)
- **인식 감도**: 좌우 민감도(LANE_TRIGGER), 점프 강도(JUMP_RATIO)
- **카메라**: 미리보기 위치(네 구석)·크기, 좌우반전 on/off, 카메라 장치 선택
- **재보정 단축키** 안내/변경
- 잘못 만지면 복구할 수 있게 "기본값으로 초기화" 버튼

## 7. 오프라인 & 배포

- **오프라인 번들**: MediaPipe Tasks(web)의 wasm과 pose 모델(`pose_landmarker_lite.task`)을
  `vendor/`에 두고 로컬 참조. 인터넷 불필요.
- **실행**: 정적 서버를 `localhost`로 띄우고 Chrome 접속 후 전체화면(F11/키오스크).
  - `file://`는 카메라(getUserMedia)·모듈 로딩이 막히므로 반드시 `localhost` 사용.
  - 서버는 `python -m http.server` 또는 동봉 `serve.py` 한 줄.
- **배포**: Mac에서 개발·테스트 → `subway-booth/` 폴더째 윈도우 PC로 복사 → 동일 실행.

## 8. 커스텀 (부스 튜닝)

- **속도**: 설정창 슬라이더(런타임) 또는 `main.js` 값 편집(영구)
- **외형**: `game/textures/`의 `surfer.jpg`, `train.jpg`, `coin.jpg` 등 이미지 교체(학생회 테마)
- 3D 형태 변경은 범위 밖.

## 9. 리스크 & 검증 포인트

1. **게임 품질**: 그래픽스 과제 클론이라 거칠 수 있음(예: space 핸들러 디버그 로그).
   → 빌드 초반에 실제 플레이 확인, 필요 시 최소 정리.
2. **성능**: WebGL 게임 + MediaPipe pose 동시 구동. 부스 PC에서 프레임률 측정,
   필요 시 pose 추론 주기/해상도 조정.
3. **입력 반영**: 게임이 합성 KeyboardEvent에 반응하는지 확인. 안 되면 `Mousetrap.trigger` 사용.
4. **인식 튜닝 이식 정확도**: 파이썬 상수·알고리즘을 충실히 옮겼는지 단위 테스트로 검증.
5. **조명/배경**: 부스 조명에서 인식률 확인, 감도 설정으로 보완.

## 10. 테스트 전략

- **controls.js 단위 테스트**: 녹화한 랜드마크 시퀀스(정지/좌이동/우이동/점프)를 입력으로
  기대 동작(LEFT/RIGHT/JUMP/none)이 나오는지 검증. 히스테리시스·쿨다운 경계 케이스 포함.
- **adapter 테스트**: 추상 동작 입력 시 게임 트리거가 호출되는지(모의 게임).
- **수동 E2E**: Mac에서 카메라로 전체 흐름(메뉴→보정→플레이) 확인, 윈도우에서 재확인.

## 11. 열린 질문

- MediaPipe Tasks(web) 정확한 배포 방식(로컬 wasm 경로) — 구현 시 확정
- 정적 서버를 동봉 스크립트로 줄지, 실행 안내만 줄지
- 설정 "키 매핑"이 단일 게임 맥락에서 필요 최소 범위인지(과설계 경계)
