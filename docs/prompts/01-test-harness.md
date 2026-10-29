# [01] 검증 환경 구축 — 모의 Firebase 테스트 하네스

> **2026-10-29 일부 완료.** `tests/mock/`(모의 Firebase), `tests/fixtures/seed.cjs`(가상 데이터), `tests/lib/harness.cjs`, `tests/run.cjs`(시나리오: 배치 04 범위), `tests/screens.cjs`(스크린샷)가 있습니다. 이 프롬프트와 다른 점: Playwright 테스트 러너 대신 의존성 없는 Node 스크립트로 작성했고, 이 환경에 설치된 Playwright를 그대로 씁니다. **남은 일:** B08~B17 시나리오(배치 05·07·09에서 해당 배치와 함께 추가), README.

> 먼저 `docs/prompts/00-common.md`를 읽고 따르세요. 이 배치는 **운영 코드(index.html, admin.html)를 한 줄도 바꾸지 않는 것**이 원칙입니다.

## 1. 목표

운영 Firebase에 접속하지 않고, 실제 `index.html`·`admin.html`을 브라우저에서 띄워 학생·강사 흐름을 자동으로 확인할 수 있는 **로컬 테스트 하네스**를 `tests/`에 만듭니다.
이후 모든 수정 배치는 이 하네스로 "버그 재현 → 수정 → 통과"를 증명합니다.

## 2. 범위

- **포함:** 모의 Firebase 모듈, 가상 데이터, Playwright 시나리오 테스트, 반응형 스크린샷 스크립트, 실행 안내 README
- **제외:** 운영 코드 수정, 보안 규칙 검증(배치 02 담당), 실제 Firebase 접속

## 3. 요구사항

### 3-1. 폴더 구조 (예시, 더 나은 구조가 있으면 제안)

```
tests/
  package.json            # devDependencies: @playwright/test
  playwright.config.js    # webServer: 저장소 루트를 정적 서버로 제공
  mock/
    firebase-app.js
    firebase-auth.js
    firebase-firestore.js
    firebase-storage.js
    store.js              # 메모리 DB·업로드 기록·구독 관리 (공유)
  fixtures/seed.js        # 가상 데이터 생성기
  helpers.js              # 로그인 사용자 지정, 원격 쓰기 흉내, DB 조회 등
  specs/
    student.spec.js
    admin.spec.js
    known-bugs.spec.js    # 현재 버그 재현 (test.fail)
  scripts/screens.js      # 반응형 스크린샷
  README.md
```

`tests/node_modules/`, `tests/screenshots/`, `tests/test-results/`는 `.gitignore`에 추가합니다.

### 3-2. 모의 Firebase 주입 방식

- Playwright `page.route('https://www.gstatic.com/firebasejs/13.1.0/firebase-*.js', …)`로 SDK 요청을 가로채 `tests/mock/`의 모듈을 응답합니다. 운영 HTML은 그대로 둡니다.
- Google Fonts 요청은 차단(`route.abort()`)해 테스트 속도와 오프라인 동작을 확보합니다.
- 테스트 제어용 전역 객체 `window.__mock`을 `page.addInitScript`로 준비합니다.
  - `setUser(uid)` / `signOut()`: 로그인 상태 지정
  - `seed(data)`: 초기 데이터 적재
  - `dump(path)`: 문서·컬렉션 내용 조회
  - `uploads()`: 업로드 기록(경로·파일명·크기·순서)
  - `remoteWrite(path, data, {merge})`: 다른 기기(강사·다른 학생)의 쓰기를 흉내 내 `onSnapshot`을 발생시킴
  - `activeListeners()`: 현재 열린 구독 수 (로그아웃 정리 확인용)

### 3-3. 모의 구현이 지원해야 할 API (cd043b9에서 실제 import하는 목록)

| 모듈 | API |
|---|---|
| firebase-app | `initializeApp` |
| firebase-auth | `getAuth`, `onAuthStateChanged`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `updateProfile`, `signOut`, `sendPasswordResetEmail` |
| firebase-firestore | `getFirestore`, `doc`, `getDoc`, `getDocs`, `collection`, `query`, `where`, `addDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `serverTimestamp`, `arrayUnion`, `onSnapshot`, `writeBatch`, `runTransaction`, `deleteField` |
| firebase-storage | `getStorage`, `ref`, `uploadBytesResumable`, `getDownloadURL`, `deleteObject` |

이후 배치에서 새 API를 import하면 모의 구현에도 추가합니다. 실제 import 목록은 두 파일의 `import` 줄을 직접 확인하세요.

**Firestore 동작 요건** (실제 SDK와 같은 의미로)
- 경로 기반 저장, 하위 컬렉션, `doc(collection(...))`·`addDoc`의 자동 ID
- `query(..., where(field, '==', value))` (현재 코드는 `==`만 사용)
- `onSnapshot`: 문서·컬렉션·쿼리 모두 지원. 등록 직후 1회, 이후 변경 시마다 **비동기**로 콜백. 해제 함수 반환. 오류 콜백 지원
- `serverTimestamp()`: 쓰기 시점의 Timestamp 객체로 확정 (`toDate()`, `seconds`, `nanoseconds` 제공)
- `setDoc` 병합(`{merge:true}`), `updateDoc`(문서가 없으면 `not-found` 오류), `deleteField()`, `arrayUnion()`
- `writeBatch`(원자적 커밋), `runTransaction`(get → set/update, 실패 시 전체 취소)
- 존재하지 않는 문서의 `getDoc` → `exists() === false`

**Auth 동작 요건:** 지정한 사용자로 로그인된 상태에서 `onAuthStateChanged` 콜백, `signOut` 시 `null` 콜백, `updateProfile`로 `displayName` 반영. 가입 함수는 새 uid 생성.

**Storage 동작 요건:** `uploadBytesResumable`은 `state_changed` 진행 이벤트를 몇 번 보낸 뒤 완료합니다. `getDownloadURL`은 재생 가능한 URL(예: blob URL)을 반환하고, `deleteObject`는 삭제합니다. 모든 업로드는 `__mock.uploads()`로 확인할 수 있어야 합니다.

**흉내 내지 않는 것:** 보안 규칙, 네트워크 지연·단절, 동시 편집 충돌. README에 한계로 명시합니다.

### 3-4. 가상 데이터 (seed)

날짜는 테스트 실행일 기준 **상대 날짜**로 생성하고, 필요한 테스트는 `page.clock`으로 시간을 고정합니다.

- **사용자:** 강사 1명(`role:'admin'`), 학생 4명
  - A: 정상 수강, 모든 과제 제출
  - B: 지각·결석이 섞이고 일부 미제출
  - C: 다른 반에서 이동해 온 학생 (이전 반 등록 `transferred`)
  - D: 수강 중지(`inactive`)
- **반:** '초급반'(12차시: 1~4차시는 과거 날짜·기록 있음, 5~12차시는 미래 날짜·기록 없음), 이동 대상 '회화반'
- **1~4차시 기록:**
  - 출결: 출석·지각·인정결석·결석·미입력이 섞이게
  - 과제: 텍스트·음성 제출, 일부에 강사 피드백. 그중 1건은 '피드백 후 재제출' 시나리오용
  - 퀴즈: 단일·복수·O/X 문항, 재응시 기록(`attempts`) 포함, legacy 첫 응시 1건
- **질문:** 답변 완료 1건, 답변 대기 1건

### 3-5. 시나리오 테스트

**(a) 기본 동작 — 지금도 통과해야 함**
- 학생 로그인 → 과제 텍스트 제출 → 제출 기록 표시
- 퀴즈 3유형 정답 선택 → 3/3 저장, 재응시 시 첫 결과 보존 + `attemptCount` 증가
- 강사 피드백 등록 → 학생 과제 화면에 실시간 표시
- 학생 질문 등록 → 강사 답변 → 학생 화면에 표시
- 강사 출석 화면에서 한 학생 체크 → 저장 → 해당 문서 `present`

**(b) 알려진 버그 재현 — `test.fail()`로 표시하고, 수정 배치에서 표시를 제거**

| 테스트 ID | 기대 동작 (수정 후 통과해야 할 내용) | 관련 항목 |
|---|---|---|
| B01 | 지각·인정결석이 있는 차시에서 아무것도 바꾸지 않고 출석 저장 → 기존 상태 그대로 | P0-01 |
| B02 | 1차시 학생 A에게 음성 선택 → 저장 없이 2차시로 이동 → 같은 학생에게 텍스트 피드백만 등록 → 2차시 업로드에 1차시 음성 없음 | P0-02 |
| B03 | 학생이 1차시에서 녹음 시작 → 다른 탭으로 이동 → 녹음이 멈추고 마이크 트랙 종료 → 2차시 과제 제출에 1차시 녹음 미첨부 | P0-02 (N2) |
| B04 | 반 이동한 학생(C)의 이전 반에서 '재등록' → 활성 등록 1개만 유지 | P0-08 |
| B05 | 수강 중지 학생(D)이 다른 반 코드를 입력할 수 있는 화면이 보임 | P0-08 |
| B06 | 강사 로그아웃 후 `activeListeners() === 0`, 오류 토스트 없음 | P0-09 |
| B07 | 학생이 퀴즈 2번 문항까지 진행 중 강사가 다른 차시를 저장(`remoteWrite`) → 학생은 2번 문항과 선택한 답을 유지 | P0-10 (N1) |
| B08 | 답변 완료된 질문에 학생이 추가 질문 → 질문 상태 `open`, 강사 목록에 '답변 대기' | P0-03 |
| B09 | 강사 답변 등록 직후 열린 상세 화면 배지가 '답변 완료' | P0-03 |
| B10 | 피드백을 받은 학생이 과제 재제출 → 강사 목록에서 '재검토 대기' | P0-04 |
| B11 | 한국 시간 21:00에 등록한 피드백이 '21:00'으로 표시 (시간대 고정: `Asia/Seoul`) | P0-05 |
| B12 | 강사 메모 모달: Enter → 줄바꿈, Ctrl/Cmd+Enter → 저장 | P0-06 |
| B13 | 여러 줄 피드백을 수정해도 줄바꿈 유지 | P0-06 |
| B14 | 대시보드 차시별 차트에 미래 차시(5~12) 미포함 | P2-01 |
| B15 | 강사가 차시 과제 제목 수정 → 다른 차시 선택 → 이탈 확인 또는 초안 유지 | P1-07 |
| B16 | 강사가 학생 A 피드백 입력 → 학생 B 선택 → A로 복귀 → 입력 내용 유지 | P1-07 |
| B17 | 학생이 과제 답안 수정 → 다른 탭 → 과제로 복귀 → 수정 내용 유지 | P1-07 |

녹음 테스트는 Chromium의 가짜 미디어 장치 옵션(`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`)을 사용합니다. 마이크 트랙 종료 여부는 `MediaStreamTrack.readyState`로 확인합니다.

### 3-6. 반응형 스크린샷 스크립트

- 대상: 학생(로그인, 과제, 복습, 다음차시, 질문, 내 정보), 강사(대시보드, 클래스, 주차 콘텐츠, 과제·복습 관리, 질문함, 출석, 수강생 관리)
- 폭: 320 / 390 / 768 / 1440px, 전체 페이지
- 저장: `tests/screenshots/{날짜}/{화면}-{폭}.png` (git 제외)
- 이후 배치의 전후 비교에 사용합니다.

### 3-7. README (`tests/README.md`)

설치·실행 명령, 시나리오 목록, 가상 데이터 설명, **한계**(보안 규칙·실기기·네트워크 미검증)를 적습니다.

## 4. 제약

- 운영 HTML diff 0줄이 원칙입니다. 테스트를 위해 운영 코드 수정이 꼭 필요하면 먼저 이유를 보고하고 승인을 받습니다.
- 환경에 이미 설치된 Playwright·Chromium이 있으면 재사용합니다. 브라우저 다운로드가 막혀 있으면 기존 실행 파일 경로를 설정합니다.

## 5. 완료 기준

- [ ] `cd tests && npm install && npm test` 실행 시 (a)는 모두 통과하고, (b)는 '예상된 실패'로 표시되어 전체 결과가 성공
- [ ] (b)의 각 테스트가 **실제로 버그 때문에 실패하는지** 확인 (일부러 통과 조건을 넣어 보는 등)
- [ ] 스크린샷 스크립트가 52장(13화면 × 4폭)을 생성
- [ ] 운영 HTML 변경 없음 (`git diff --stat index.html admin.html` 결과 없음)
- [ ] 00 공통 머리말의 '결과 보고 형식'으로 보고
