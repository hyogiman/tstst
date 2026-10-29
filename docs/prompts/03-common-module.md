# [03] 공통 JS 모듈 분리 — 기능 변화 없는 구조 정리 (P3-03)

> 먼저 `docs/prompts/00-common.md`를 읽고 따르세요.
> **이 배치는 동작을 바꾸지 않습니다.** 버그를 발견해도 고치지 말고 보고만 합니다(버그 수정은 04·05 배치).
> 실행 순서는 선택입니다. 04·05 배치를 먼저 했다면, 그 수정 내용이 공통 모듈에 그대로 옮겨졌는지 확인합니다.

## 1. 목표

`index.html`과 `admin.html`에 복사되어 있는 공통 코드를 `common.js` 하나로 모읍니다. 앞으로 공통 기능은 한 곳만 고치면 되게 만드는 것이 목적입니다.

## 2. 배경

cd043b9에서 두 파일의 공통 블록(`index.html:275-429`, `admin.html:397-550`)과 CSS 1~212줄은 원래 같은 코드였습니다. 그런데 이미 다음 부분이 서로 달라졌습니다.

| 차이 | index.html | admin.html |
|---|---|---|
| Firestore import 목록 | `deleteField` 없음 | `deleteField` 있음 |
| `ensureProfile` 새 프로필 | `realName`, `nickname` 저장 | 저장 안 함 |
| `signedOut` 로그인 화면 | 세 줄 타이포(`senorayu-opening`) | 단순 `<h1>` |
| `mountAuth` 가입 처리 | 가입 후 `realName` 등 추가 저장 | 다름 (강사 페이지는 가입 숨김) |
| `modalDialog` 입력 최대 길이 | 한 줄 입력 150자 | 한 줄 입력 1,000자 |

한쪽만 고치는 실수가 이미 생기고 있다는 뜻입니다.

## 3. 요구사항

### 3-1. 분리 대상

두 파일을 비교해 **이름과 역할이 같은 함수·상수**를 모두 목록으로 만듭니다. 예상 대상은 다음과 같습니다.

- Firebase 초기화: `firebaseConfig`, `CONFIGURED`, `app`, `auth`, `db`, `storage`
- 유틸: `$`, `$$`, `esc`, `fmt`, `ex`, `toast`, `loading`, `loaded`, `empty`, `makeId`, `enId`
- 파일: `isMedia`, `sizeLimit`, `uploadMedia`, `urlFor`, `useMediaPaths`
- 서식: `sanitizeRich`
- 인증: `ensureProfile`, `signedOut`, `mountAuth`
- 녹음: `activeRecorder`, `recordStart`, `recordStop`, `makeMediaUi`, `wireMediaUi`
- 모달: `modalDialog`, `modalConfirm`, `modalInput`

**주의:** 이름이 같아도 구현이 다른 함수는 함부로 합치지 않습니다. 예를 들어 `normalizeQuestion`은 학생용(`index.html:544`)과 강사용(`admin.html:913`)의 기본값·반환 필드가 다릅니다. 이런 함수는 각 페이지에 그대로 두거나, 합친다면 차이를 표로 보고하고 두 동작을 모두 보존합니다.

### 3-2. 차이가 있는 함수의 처리

2장 표처럼 이미 달라진 부분은 **현재 각 페이지의 동작을 그대로 유지**하도록 매개변수나 옵션으로 처리합니다. 예: `mountAuth(root, {signup:true, variant:'student'})`
어느 쪽이 맞는지 판단이 필요한 차이(예: 모달 최대 길이)는 이 배치에서 바꾸지 말고 '04·05 배치에서 결정할 차이' 목록으로 보고합니다.

### 3-3. 파일 구성

- 저장소 루트에 `common.js` (ES module). 필요한 것만 `export`합니다.
- 각 페이지는 `<script type="module">`에서 `import { … } from './common.js?v=YYYYMMDD'`로 불러옵니다.
  - `?v=` 버전 문자열은 배포할 때 HTML과 JS가 서로 다른 버전으로 캐시되는 문제를 줄이기 위한 것입니다. 갱신 방법을 README나 보고서에 적어 둡니다.
- Firebase 앱 초기화는 `common.js`에서 한 번만 합니다.
- **CSS는 이 배치에서 건드리지 않습니다.** (배치 12에서 한꺼번에 정리)

### 3-4. 배포 관련 주의

- ES module import는 `file://`로 직접 연 HTML에서는 동작하지 않습니다. 로컬에서는 정적 서버로 확인한다는 안내를 남깁니다.
- 새 파일 `common.js`가 실제 배포 대상(GitHub Pages, Firebase Hosting 등)에 함께 올라가는지 사용자가 확인하도록 보고서에 적습니다.

## 4. 완료 기준

- [ ] 두 페이지에서 공통 코드가 제거되고 `common.js`에서 import됨
- [ ] 2장 표의 차이가 모두 원래대로 유지됨 (각 페이지 동작 불변)
- [ ] `tests/`의 테스트 결과가 분리 전과 **완전히 같음** (통과는 통과, 예상된 실패는 예상된 실패)
- [ ] 로그인 화면 스크린샷이 분리 전과 같음 (4개 폭)
- [ ] 브라우저 콘솔에 새 오류 없음
- [ ] 00 공통 머리말의 '결과 보고 형식'으로 보고하고, '04·05 배치에서 결정할 차이' 목록 포함
