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
| `common.css` · `student.css` · `admin.css` | 디자인 토큰과 공통 컴포넌트 / 학생 화면 / 강사 화면 스타일 |
| `firestore.rules` · `storage.rules` | 보안 규칙(저장소의 파일이 기준입니다. 콘솔에 **직접 게시**해야 적용됩니다) |
| `senorayu-*.svg/png/jpg` | 로고·아이콘·배너 이미지 |
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
- **캐시 버전(`?v=`):** CSS·JS를 바꾸면 두 HTML 안의 `?v=` 값을 함께 올려야 학생 브라우저가 새 파일을 받습니다. 지금 값은 `20261029m`이고, 한 번에 바꾸는 명령은 다음과 같습니다(예: m → n).

```bash
sed -i 's/20261029m/20261029n/g' index.html admin.html
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

## 8. 백업 · 복구

- **Firestore:** 관리형 내보내기·가져오기(`gcloud firestore export` / `import`)와 예약 백업 기능이 공식으로 있습니다. 결제 계정(Blaze 요금제)과 Cloud Storage 버킷이 필요한 것으로 알고 있으나, 요금제 조건은 **확인 필요**입니다.
- **Storage(음성·영상·자료 파일):** 별도 자동 백업은 없습니다. 필요하면 `gsutil`·`gcloud storage` 명령으로 버킷의 `classes/` 폴더를 내려받아 보관합니다(명령 형식은 Google Cloud 문서 기준으로 확인 필요).
- 앱 안에는 반 **보관**(기록 유지, 복원 가능)과 **영구 삭제**(되돌릴 수 없음)가 따로 있습니다. 수업이 끝난 반은 삭제 대신 보관하세요.
