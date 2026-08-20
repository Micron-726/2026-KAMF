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

## 게임 캐릭터·장애물 바꾸기 (선택)
게임은 Unity 프로젝트(별도)에서 WebGL로 빌드한 결과가 `game-unity/`에 들어있습니다.
캐릭터/장애물/텍스처를 바꾸려면 Unity에서 교체 후 **WebGL로 다시 Build → `game-unity/Build/`에 덮어쓰기**만 하면 됩니다. 부스 셸·조작 코드는 그대로 재사용됩니다.

## 폴더 구성
```
booth/        부스 셸(메뉴/보정/플레이 UI + 동작인식 + Unity 조작)
game-unity/   Unity WebGL 게임 빌드
vendor/       MediaPipe(오프라인 번들)
serve.py      로컬 서버(Unity gzip 헤더 처리)
tests/        판정 로직 단위 테스트 (npm test / node --test)
```

## 라이선스 / 크레딧
[CREDITS.md](CREDITS.md) 참고. 게임은 Ezgi Keserci의 Subway Surfers Clone(MIT), 동작인식은 Google MediaPipe(Apache-2.0)를 사용합니다.
