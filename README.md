# runtime — 모션 지하철 러너 부스

몸동작(좌/우/점프)으로 즐기는 **Unity WebGL Subway Surfers**. 학생회 이벤트 부스용.
카메라·동작인식(MediaPipe)·게임을 브라우저 한 화면에서 처리하며, **완전 오프라인**으로 동작합니다.

<p align="center"><img src="booth/assets/runtime.png" width="360" alt="runtime"></p>

---

## 필요한 것 (부스 PC)
- **Python 3** (서버 실행용)
- **Chrome** (또는 Chromium 계열 브라우저)
- **웹캠**

인터넷·추가 설치는 필요 없습니다.

## 설치
아래 둘 중 하나:

**A. 배포 zip**
1. [Releases](https://github.com/legojeon/soc-runtime/releases)에서 `soc-runtime.zip` 다운로드 → 압축 풀기 (또는 USB로 부스 PC에 복사)

**B. git clone**
```bash
git clone https://github.com/legojeon/soc-runtime.git
cd soc-runtime
```

## 실행
압축 푼 / clone한 폴더에서:
```bash
python3 serve.py        # Windows: py serve.py
```
그다음 Chrome에서 접속:
```
http://localhost:8000/booth/booth.html
```
- 카메라 권한 **허용**, `F11`로 전체화면.
- ⚠️ 반드시 `serve.py`로 열 것 — `python -m http.server`나 `file://`로 열면 카메라/게임이 안 뜹니다.
- 첫 플레이 때 게임(Unity) 로딩에 몇 초 걸립니다.

## 플레이 방법
1. 메뉴에서 **게임 시작**
2. 카메라 앞 **2~3m**에 전신이 보이게 서고, **가운데서 3초 정지** → 보정 완료
3. 몸을 **좌/우로 한 발** = 칸 이동, **살짝 점프** = 점프
4. 코인·점수·목숨은 화면 상단 HUD에 표시, 목숨 다하면 게임오버

## 담당자 조작 (화면 버튼)
플레이 중 화면 버튼(클릭):
- **↻ 재시도** — 보정 유지하고 새 판 시작(죽었을 때 빠르게)
- **⟲ 재보정** — 다음 플레이어용(키·위치 다시 맞춤)
- **≡ 메뉴** — 시작 화면으로

## 설정
메뉴 → **설정**에서 실시간 조정:
- **게임 속도** / **좌우 민감도** / **점프 강도** / **미리보기 위치**
(값은 브라우저에 저장되어 유지됩니다.)

## 게임 수정·다시 빌드하기 (선택)
게임 소스와 WebGL 빌드가 모두 저장소에 들어있습니다.
- `game-unity/project/` — Unity 프로젝트 원본 (캐릭터·장애물·조작 로직)
- `game-unity/Build/` — 부스가 실제로 실행하는 WebGL 빌드 결과

빌드 환경:
- **Unity 2022.3.0f1** (LTS) — Unity Hub에서 이 버전으로 열기
- WebGL Build Support 모듈 필요
- 주요 패키지: FBX Importer(4.2.1), TextMeshPro(3.0.6) 등 (`Packages/manifest.json`이 자동 복원)

수정 순서:
1. Unity Hub → `game-unity/project/` 폴더 열기 (첫 실행 시 `Library/` 재생성에 시간이 걸립니다)
2. 캐릭터/장애물/텍스처/스크립트 수정
3. **File → Build Settings → WebGL → Build**
4. 빌드 산출물을 `game-unity/Build/`에 덮어쓰기

부스 셸(`booth/`)·조작 코드는 그대로 재사용됩니다. Unity↔셸 연동은 `Assets/Scripts/BoothBridge.cs`(WebGL로 `MoveLeft`/`MoveRight`/`Jump`/`Restart` 수신)를 참고하세요.

## 폴더 구성
```
booth/            부스 셸(메뉴/보정/플레이 UI + 동작인식 + Unity 조작)
game-unity/
  ├─ project/   Unity 프로젝트 원본(2022.3.0f1) — 게임 수정용
  └─ Build/     Unity WebGL 게임 빌드(부스 실행본)
vendor/           MediaPipe(오프라인 번들)
serve.py      로컬 서버(Unity gzip 헤더 처리)
tests/        판정 로직 단위 테스트 (npm test / node --test)
```

## 라이선스 / 크레딧
[CREDITS.md](CREDITS.md) 참고. 게임은 Ezgi Keserci의 Subway Surfers Clone(MIT), 동작인식은 Google MediaPipe(Apache-2.0)를 사용합니다.
