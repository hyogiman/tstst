# 쎄뇨라유 스페인어 학습공간

스페인어 수업용 학습관리 웹앱입니다. 학생은 과제 제출·복습 퀴즈·예습·질문을, 강사는 차시 자료·피드백·출석·대시보드를 한곳에서 다룹니다.
빌드 도구 없이 정적 파일(HTML·CSS·JS)과 Firebase(Authentication · Firestore · Storage)로 동작합니다.

> 개발 계획·결정사항·배치별 작업 지시서는 `docs/DEV-PLAN.md`, `docs/prompts/`에 있습니다. 데이터 구조의 기준 문서는 `docs/prompts/00-common.md` 2장입니다.

---

## 1. 파일 구성

| 경로 | 내용 |
|---|---|
| `index.html` | 학생 화면(홈과 공지사항 · 과제 · 복습(수업 영상 · 복습 퀴즈) · 질문 · 내 정보) |
| `admin.html` | 강사 화면(대시보드 · 클래스 관리 · 차시별 학습자료 · 과제·복습 관리 · 질문함 · 공지사항 · 출석체크 · 수강생 관리) |
| `common.js` | 두 화면이 함께 쓰는 코드: Firebase 연결(`firebaseConfig`), 날짜(한국 시간), 상태 판정, 업로드, 녹음, 모달, 초안 저장 등 |
| `dashboard.js` | 강사 대시보드 집계(순수 함수, Firebase를 불러오지 않음). 출석률·제출률·첫 응시 정답률·처리할 일·문항 분석 |
| `classexport.js` | 반 내보내기(순수 함수). 출석·과제·복습 결과를 CSV로 만들고 음성 파일과 함께 ZIP 하나로 묶음 |
| `common.css` · `student.css` · `admin.css` | 디자인 토큰과 공통 컴포넌트 / 학생 화면 / 강사 화면 스타일 |
| `firestore.rules` · `storage.rules` | 보안 규칙(저장소의 파일이 기준입니다. 콘솔에 **직접 게시**해야 적용됩니다) |
| `senorayu-*.svg/png/jpg` | 로고·아이콘·배너 이미지(앱 아이콘 `senorayu-app-192/512.png`, 알림 작은 아이콘 `senorayu-badge-96.png`) |
| `admin.webmanifest` · `admin-sw.js` · `push-view.js` | 강사 화면을 앱으로 설치하는 정보 / 알림을 받아 띄우는 서비스 워커 / 과제 제출 알림 묶기(9장) |
| `functions/` · `firebase.json` · `.firebaserc` | 강사 알림을 보내는 Cloud Functions와 배포 설정(9장) |
| `tests/` | 모의 Firebase 시나리오 테스트, 정적 검사, 보안 규칙 에뮬레이터 테스트, 화면 캡처 |
| `docs/` | 검토 보고서, 개발 계획, 배치별 작업 지시서 |

## 2. 처음 설정 (Firebase)

1. Firebase 콘솔에서 프로젝트를 만들고 **Authentication(이메일/비밀번호)**, **Firestore**, **Storage**를 켭니다.
2. 웹 앱을 등록해 받은 설정값을 `common.js` 맨 위 `firebaseConfig`에 넣습니다(두 HTML이 이 파일 하나를 함께 씁니다).
3. **보안 규칙 게시:** `firestore.rules`와 `storage.rules`의 내용을 각각 콘솔의 Firestore·Storage 규칙 편집기에 붙여 넣고 게시합니다(4장).
4. **강사 계정:** 강사 계정은 가입 화면으로 만들 수 없습니다. Authentication에서 사용자를 만든 뒤, Firestore에 `users/{그 사용자 UID}` 문서를 만들고 `role` 필드를 `admin`으로 넣습니다. 강사 화면에 로그인하면 UID가 화면에 안내됩니다.
5. **승인된 도메인:** 앱을 올린 주소(예: `내아이디.github.io`)를 Authentication 설정의 승인된 도메인에 추가합니다. 빠뜨리면 로그인 창에서 도메인 오류가 납니다.

## 3. 실행과 배포

### 로컬에서 보기
ES 모듈을 쓰므로 파일을 더블클릭(`file://`)하면 동작하지 않습니다. 정적 서버로 엽니다.

```bash
python3 -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000/index.html`(학생), `http://localhost:8000/admin.html`(강사)을 엽니다. 녹음(마이크)은 `https://` 또는 `localhost`에서만 동작합니다.

### 배포(정적 호스팅)
- 이 저장소는 **GitHub Pages**로 배포됩니다. `main`에 올리면 GitHub의 'pages build and deployment' 작업이 저절로 돌아 화면 파일이 바뀝니다(저장소의 Actions 탭에서 확인, 지난 기록 기준 1분 안쪽). 기본 주소 형식은 `https://hyogiman.github.io/tstst/`입니다. 사용자 지정 도메인을 쓰면 주소가 다르니 GitHub 저장소의 Settings → Pages에서 확인하세요.
- **배포 순서:** ① 보안 규칙 게시 → ② 화면 파일 반영(`main`에 병합). 새 화면은 새 규칙(질문의 차시 연결, 틀린 문제 연습, 학습 목표 등)을 전제로 합니다. 규칙이 이전 버전이면 일부 저장이 거부되거나(화면에 안내) 기능이 조용히 빠집니다. 반대로 규칙은 이전 화면이 쓰는 저장 형식도 받도록 유지합니다(`tests/rules/legacyclient.test.mjs`). 배포할 때 이미 열려 있던 학생 화면(새로고침 전)에서도 저장이 되게 하려는 것입니다.
- **캐시 버전(`?v=`):** CSS·JS를 바꾸면 두 HTML 안의 `?v=` 값을 함께 올려야 학생 브라우저가 새 파일을 받습니다. 지금 값은 `20261030e`이고, 한 번에 바꾸는 명령은 다음과 같습니다(예: e → f).

```bash
sed -i 's/20261030e/20261030f/g' index.html admin.html
```

## 4. 보안 규칙 게시 · 되돌리기

- 게시: Firebase 콘솔 → Firestore Database → 규칙 탭에 `firestore.rules` 전체를 붙여 넣고 게시, Storage → 규칙 탭에 `storage.rules`를 붙여 넣고 게시합니다.
- 되돌리기: 저장소에 규칙의 모든 버전이 커밋으로 남아 있습니다. 이전 커밋의 규칙을 꺼내 다시 게시하면 됩니다.

```bash
git log --oneline -- firestore.rules
```

```bash
git show <커밋ID>:firestore.rules
```

  콘솔 규칙 편집기에도 이전 버전 기록이 있는 것으로 알고 있으나, 메뉴 위치는 콘솔 화면이 바뀔 수 있어 **확인 필요**입니다.
- 게시 전 확인: `tests/rules`의 에뮬레이터 테스트(5장)로 바뀐 규칙을 먼저 검증합니다.
- Storage 규칙은 다른 문서를 읽는 횟수에 제한이 있습니다(한 번의 판정에서 다른 문서 2개). 영상 규칙은 이 한도 안에서 동작하도록 순서를 맞춰 두었습니다. 에뮬레이터는 이 제한을 검사하지 않으므로, 규칙을 고칠 때 주의하세요.

## 5. 테스트

| 무엇 | 명령 | 비고 |
|---|---|---|
| 시나리오 테스트(모의 Firebase) | `node tests/run.cjs` | Playwright(Chromium)가 필요합니다. 이름 일부로 골라 실행: `node tests/run.cjs DB0` |
| 정적 검사 | `node tests/lint.cjs` | ESLint 필요. 정의되지 않은 이름·쓰지 않는 import를 찾습니다 |
| 보안 규칙 | `cd tests/rules && npm install && npm test` | Firebase 에뮬레이터(Java 필요)로 `firestore.rules`·`storage.rules`를 검증합니다 |
| 화면 캡처 | `node tests/screens.cjs 출력폴더 390,1440` | 화면 전후 비교용(`tests/screenshots/`는 저장소에 올리지 않음) |
| 알림 문구(Functions) | `cd functions && npm install && npm test` | 알림 제목·본문·이동 위치·제출 판단 단위 테스트 |
| 알림 함수 전체 | `cd tests/functions && npm test` | 에뮬레이터(Firestore + Functions)에서 질문·답글·제출을 쓰고 보낼 알림을 확인(`tests/rules`의 firebase-tools 사용) |

모의 Firebase(`tests/mock/`)는 실제 SDK 대신 쓰는 가짜 모듈이라 실제 규칙과 100% 같지는 않습니다. 규칙은 에뮬레이터 테스트를 기준으로 봅니다.

## 6. 데이터 구조 요약

자세한 필드는 `docs/prompts/00-common.md` 2장을 보세요.

```
users/{uid}                      역할(admin|student), 이름·별명, 배정된 반
enrollments/{uid}_{cid}          수강 등록(수강 중·중지·반 이동) / events: 입장·중지·이동 기록(변경 불가)
classes/{cid}                    반(이름, 수강 코드, 보관 여부, 일정 사본)
  members/{uid}                  같은 반 학생에게 공개되는 이름(별명)
  teacherNotes/{uid}             강사 메모(강사 전용)
  studentGoals/{uid}             다음 학습 목표(강사가 쓰고 그 학생만 읽음)
  notices/{nid}                  공지사항(강사가 쓰고 이 반 학생이 읽음, 상단 고정)
  noticeReads/{uid}              학생이 공지 화면을 연 시각(새 공지 표시 · 강사의 '읽음' 수)
  questions/{qid} → replies      질문과 대화(본인·강사만)
  weeks/{wid}                    차시(예습·과제·복습 퀴즈·복습 수업 영상, 공개 여부, 날짜)
    submissions/{uid} → revisions   과제 제출(회차 이력은 변경 불가)
    quizResults/{uid} → attempts    복습 결과(첫 응시 보존) / 응시 기록(틀린 문제 연습 포함)
    quizVersions/{v}             퀴즈 문항 사본(강사 전용, 응시 당시 문제로 해석)
    attendance/{uid}             출결(출석·불참)
joinCodes/{CODE}                 수강 코드 → 반 연결표
adminDevices/{id}                강사 알림 받는 기기(알림 주소·기기 이름, 강사만, 9장)
```

## 7. 자주 생기는 문제

| 증상 | 확인할 것 |
|---|---|
| 흰 화면 또는 "화면을 불러오지 못했어요" | 회사·학교 네트워크가 외부 스크립트(Firebase CDN)를 막는 경우입니다. 휴대폰 데이터 등 다른 네트워크로 열어 보세요. 파일을 바꾼 직후라면 `?v=`를 올렸는지 확인합니다 |
| 로그인할 때 도메인 오류 | 2장 5번 승인된 도메인 |
| "권한이 없어…" 저장 오류 | 저장소의 최신 `firestore.rules`·`storage.rules`를 게시했는지(4장), 강사 계정의 `role`이 `admin`인지 |
| 녹음 버튼이 동작하지 않음 | 브라우저의 마이크 권한, `https://` 주소인지 확인합니다. 카카오톡 등 앱 안의 브라우저는 마이크나 파일 선택을 막는 경우가 있어, 그 앱 메뉴의 '다른 브라우저로 열기'(앱마다 이름이 다름)로 Chrome·Safari에서 열어 주세요 |
| 학생에게 강의 영상이 안 보임 | 보관된 반에서는 영상만 막는 것이 정상입니다(지난 자료는 읽기 전용). 운영 중인 반이면 차시 공개·예습 켜짐을 확인합니다 |
| 유튜브 영상을 막고 싶음 | 앱은 유튜브 '일부 공개' 링크를 끌 수 없습니다. 유튜브 스튜디오에서 영상을 '비공개'로 바꿔 주세요 |
| 내보낸 ZIP에 음성 파일이 없음 | Storage CORS 설정이 필요합니다(8장). 받지 못한 파일은 ZIP 안 README.txt 맨 아래에 적혀 있습니다 |

## 8. 백업 · 복구

- **Firestore:** 관리형 내보내기·가져오기(`gcloud firestore export` / `import`)와 예약 백업 기능이 공식으로 있습니다. 결제 계정(Blaze 요금제)과 Cloud Storage 버킷이 필요한 것으로 알고 있으나, 요금제 조건은 **확인 필요**입니다.
- **Storage(음성·영상·자료 파일):** 별도 자동 백업은 없습니다. 필요하면 `gsutil`·`gcloud storage` 명령으로 버킷의 `classes/` 폴더를 내려받아 보관합니다(명령 형식은 Google Cloud 문서 기준으로 확인 필요).
- 앱 안에는 반 **보관**(기록 유지, 복원 가능)과 **영구 삭제**(되돌릴 수 없음)가 따로 있습니다. 수업이 끝난 반은 삭제 대신 보관하세요.
- **반 내보내기(2026-10-30):** 클래스 관리 → 그 반의 '내보내기'. 학생 명단·출석표·과제(답안·음성·피드백)·제출 이력·복습 결과·복습 문항을 ZIP 하나로 내려받습니다. CSV는 엑셀에서 두 번 눌러 열면 됩니다(UTF-8 BOM). 강의 영상·예습 자료(강사 원본)·질문함·공지사항은 넣지 않습니다. 압축 파일 안 이름은 영문·숫자이고, 각 파일 설명은 안의 README.txt에 있습니다.
- **음성까지 받으려면 Storage CORS 설정(한 번만):** 브라우저가 Storage 파일 내용을 직접 내려받으려면 버킷에 CORS 설정이 필요합니다(Firebase 문서 '웹에서 Cloud Storage로 파일 다운로드'). 설정 전에는 기록(CSV)만 들어가고 받지 못한 음성 목록이 README.txt에 남습니다. Google Cloud 콘솔에서 같은 프로젝트를 고른 뒤 Cloud Shell에서 아래 두 명령을 실행합니다. 버킷 이름은 Firebase 콘솔 Storage 화면 위쪽의 `gs://…`입니다. 앱 주소가 바뀌면 `origin`도 바꿉니다.

```bash
echo '[{"origin":["https://2nhyeok.kr"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
```

```bash
gsutil cors set cors.json gs://버킷이름
```

- **영구 삭제와 저장 용량:** 반을 영구 삭제하면 Firestore 기록과 Storage의 그 반 파일(강의·수업 영상, 예습 자료, 학생·피드백 음성)을 지웁니다. 문서에 연결되지 않은 파일(저장하지 않고 닫은 업로드, 예전에 지운 차시의 영상)까지 찾으려면 2026-10-30 Storage 규칙(강사 폴더 목록)을 게시해야 합니다. 게시 전에는 연결된 파일과 차시별 영상 폴더까지만 지웁니다. 유튜브 링크 영상은 유튜브에 있으므로 지워지지 않습니다.

## 9. 강사 알림(앱 설치 · Cloud Functions, 2026-10-30)

학생이 **새 질문 · 추가 질문**을 남기거나 **과제를 내면(수정본 포함)** 강사 휴대폰·PC로 알림이 옵니다. 알림을 누르면 강사 앱의 그 질문·그 학생 답안이 열립니다.

| 부분 | 파일 | 하는 일 |
|---|---|---|
| 보내기 | `functions/` (Cloud Functions, Node 22) | Firestore에 질문·답글·제출이 생기면 강사 기기 목록(`adminDevices`)으로 FCM 웹 푸시를 보냅니다. 문구는 `functions/notify.js` |
| 받기 | `admin-sw.js` · `push-view.js` | 앱이 꺼져 있어도 알림을 띄웁니다. 과제 제출은 알림 하나로 묶고(10분 안에는 소리 없이 내용만 바꿈), 질문은 질문마다 하나 |
| 설치·설정 | `admin.webmanifest` · 강사 화면 상단 **🔔 알림** | 휴대폰에 앱으로 설치, 이 기기 알림 켜기·끄기, 테스트 알림, 알림 받는 기기 목록 |

- 잠금 화면에는 **학생 이름 + 글 첫 줄**이 보입니다(휴대폰 설정에서 숨길 수 있음).
- **앱 아이콘 숫자**(답할 질문 수)는 PC에 설치한 앱과 아이폰에서만 표시됩니다. 안드로이드는 이 기능을 지원하지 않아, 처리하지 않은 알림이 남아 있으면 아이콘에 **점**으로 표시됩니다. 앱에서 질문에 답하거나 과제·복습 관리를 열면 해당 알림을 지웁니다.
- Functions는 **Blaze 요금제**가 필요합니다. FCM(푸시 발송)은 무료이고, 이 반 규모의 알림은 Functions 무료 사용량 안에 들 것으로 예상합니다(정확한 요금은 Google 가격 페이지 기준).

### 처음 한 번: 준비
1. **Firestore 규칙 게시**: `firestore.rules`의 `adminDevices`(강사 알림 기기) 규칙이 들어간 판을 콘솔에 게시합니다(4장).
2. **웹 푸시 인증서(선택이지만 권장)**: Firebase 콘솔 → 프로젝트 설정 → 클라우드 메시징 → 웹 구성 → 웹 푸시 인증서 → '키 쌍 생성'. 나온 **공개 키**를 `admin.html`의 `PUSH_VAPID_KEY`에 넣습니다. 비워 두면 Firebase 기본 키를 씁니다. 나중에 키를 넣으면 기기는 앱을 열 때 새 주소로 바뀝니다.

### Functions 배포(Google Cloud Shell에서)
Google Cloud 콘솔에서 같은 프로젝트를 고르고 오른쪽 위 Cloud Shell을 엽니다. 아래 명령을 차례로 실행합니다. 앱을 다른 저장소로 옮긴 뒤라면 첫 줄의 주소만 새 저장소로 바꿉니다.

```bash
git clone https://github.com/hyogiman/tstst.git && cd tstst
```

```bash
cd functions && npm ci && cd ..
```

```bash
npx firebase-tools@latest login --no-localhost
```

```bash
npx firebase-tools@latest deploy --only functions --project senora-c9b84
```

- 로그인 명령은 주소를 하나 보여 줍니다. 그 주소를 열어 Firebase 계정으로 로그인하고, 받은 코드를 Cloud Shell에 붙여 넣습니다.
- 처음 배포할 때는 필요한 Google Cloud 기능을 켜느라 몇 분 걸립니다. 컨테이너 이미지 보관 기간을 물으면 기본값(Enter)으로 둡니다.
- 처음 배포에서 권한(Eventarc·서비스 계정) 오류가 나면 몇 분 뒤 같은 배포 명령을 다시 실행합니다. 처음 켠 권한이 퍼지는 데 시간이 걸리는 경우입니다.
- 배포된 함수 확인: `npx firebase-tools@latest functions:list --project senora-c9b84` → `notifyNewQuestion` · `notifyStudentReply` · `notifySubmission` · `sendTestNotification` 4개.
- 함수 코드를 고쳤을 때만 다시 배포합니다. 화면 파일(HTML·CSS·JS)을 바꾸거나 저장소를 옮기는 것만으로는 다시 배포할 필요가 없습니다.

### 강사 휴대폰(안드로이드)에 설치
1. Chrome으로 강사 화면 주소(`…/admin.html`)를 엽니다.
2. Chrome 메뉴(⋮) → **'앱 설치'**(또는 '홈 화면에 추가')를 누릅니다.
3. 홈 화면의 '쎄뇨라유 강사' 아이콘으로 열고 로그인합니다.
4. 상단 **🔔 알림** → **이 기기에서 알림 받기** → 허용 → **테스트 알림 보내기**로 확인합니다.

아이폰은 iOS 16.4 이상에서 Safari 공유 버튼 → '홈 화면에 추가'로 설치한 앱에서만 알림을 받을 수 있습니다.

### 저장소·주소를 옮길 때 확인할 것
- Functions와 Firestore·Storage는 Firebase 프로젝트에 있으므로 그대로 둡니다. 알림은 화면 위치(예: `questions?class=…`)만 담고, 주소는 설치된 앱이 붙이므로 함수를 다시 배포하지 않아도 됩니다.
- 주소(도메인)가 바뀌면: Firebase Authentication의 **승인된 도메인**에 새 주소를 넣고, Storage **CORS**의 `origin`을 새 주소로 다시 설정합니다(8장).
- 알림 받는 기기는 주소마다 따로입니다. 옮긴 뒤 새 주소에서 앱을 설치하고 알림을 켭니다. 옮기기 전에 시험으로 켜 둔 기기는 🔔 알림 → 알림 받는 기기에서 지웁니다.
