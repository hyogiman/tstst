# [00 공통 머리말] 쎄뇨라유 스페인어 LMS 수정개발 지침

> 모든 배치 프롬프트(01~13)와 함께 사용하는 공통 지침입니다.
> - **Claude Code(이 저장소)**: 배치 프롬프트 첫 줄의 "docs/prompts/00-common.md를 먼저 읽고 따르세요"로 충분합니다.
> - **ChatGPT 등 저장소를 읽지 못하는 도구**: 이 문서 전체 + 배치 프롬프트 + 관련 HTML 파일을 함께 붙여 넣으세요.

---

## 1. 프로젝트 맥락

- **목적:** 스페인어 강사가 반·차시별로 수강생을 관리하고, 수업 전후(예습 → 출석 → 과제·복습 → 피드백·질문)로 소통하는 학습관리 웹앱입니다.
- **규모:** 소규모 반(반당 수 명~20명 내외 가정), 강사 1명.
- **구성:** 빌드 도구 없는 정적 파일 + Firebase
  - `index.html` — 수강생 화면 (로그인·가입, 수강 코드 입장, 과제 · 복습 · 다음차시 · 질문 · 우리 반 · 내 정보)
  - `admin.html` — 강사 화면 (대시보드, 클래스 관리, 주차별 콘텐츠, 과제·복습 관리, 질문함, 출석체크, 수강생 관리)
  - Firebase Web SDK **13.1.0**을 `https://www.gstatic.com/firebasejs/13.1.0/...`에서 ES module로 import (Auth, Firestore, Storage)
  - 이미지: `senorayu-mark.svg`, `senorayu-mark-white.svg`, `senorayu-icon.png`, `senorayu-hero-banner.jpg`
- **참고 문서:** `docs/REVIEW.md`(Claude 리뷰), `docs/REVIEW-chatgpt-2026-10-29.md`(ChatGPT 리뷰), `docs/DEV-PLAN.md`(통합 우선순위·**결정사항 D1~D10**)
- **라인 번호는 커밋 `cd043b9` 기준**입니다. 이후 수정으로 달라지므로 **함수명으로 찾으세요.**
- **결정사항:** `docs/DEV-PLAN.md` 5장 표의 **'확정' 값(2026-10-29 확정)**을 따릅니다. 이 프롬프트를 ChatGPT 등에 쓸 때는 확정값 표를 함께 붙여 넣습니다.
- **이미 끝난 작업:** 배치 04, 디자인 개편(배치 12의 CSS 부분), 보안 규칙 저장소 관리(배치 02 일부), 테스트 하네스(배치 01 일부). `docs/DEV-PLAN.md`의 '진행 현황'을 먼저 확인하세요.
- **화면 스타일:** `common.css`(토큰·공통 컴포넌트), `student.css`, `admin.css`. HTML 안에는 `<style>`이 없습니다.
- **보안 규칙:** 저장소의 `firestore.rules`, `storage.rules`가 기준입니다(배포는 사용자가 콘솔에서). 규칙을 바꾸면 `tests/rules`의 에뮬레이터 테스트도 함께 고칩니다.

---

## 2. 현재 데이터 구조 (cd043b9 기준)

```
users/{uid}               role('admin'|'student'), displayName, realName, nickname, email,
                          assignedClassId, createdAt, updatedAt
joinCodes/{CODE}          classId, createdBy, updatedAt                 ← 코드 단건 조회용
enrollments/{uid}_{cid}   uid, classId, studentName, email, joinCode,
                          status('active'|'inactive'|'transferred'), joinedAt
  events/{eid}            type('joined'|'stopped'|'resumed'|'transferred_out'|'transferred_in'),
                          at, by, fromClassId?, toClassId?      ← 배치 06, 변경 불가(학생은 입장 때 'joined'만)
classes/{cid}             name, description, joinCode, archived,
                          schedule[{weekId, label, date}], createdAt, createdBy
  members/{uid}           uid, name(공개 표시명), status, joinedAt       ← 같은 반 학생에게 공개
  teacherNotes/{uid}      text, studentUid, updatedAt, updatedBy         ← 강사 전용
  questions/{qid}         uid, studentName, title, content, status('open'|'answered'),
                          createdAt, answeredAt,
                          needsTeacherReply(bool), lastMessageAt, lastSenderRole('student'|'admin')  ← 배치 05
                          studentSeenAt                                                         ← 배치 06
                          weekId?(차시 연결), context?('assignment'|'quiz', '이 피드백에 질문하기')   ← 배치 10
                          (필드 없는 이전 질문은 status로 판단: common.js needsReply())
    replies/{rid}         uid, role('student'|'admin'), author, text, createdAt
  weeks/{wid}             label, order, sessionDate, published, createdAt, updatedAt,
                          assignment{enabled, title, instructions, allowText, allowAudio,
                                     dueAt('YYYY-MM-DDTHH:mm' 문자열, 한국 시간으로 해석),
                                     dueAtTs(Timestamp, 배치 06 — 학생 D-day 표시용, D3: 통계 마감 아님)},
                          quiz{enabled, title, version(배치 06), questions[{id, type('single'|'multiple'|'ox'),
                               stem, options[], correctIndices[], correctIndex, explanation}]},
                          preview{enabled, title, mode('rich'|'image'), richHtml, imagePath,
                                  videos[{path,name,size}], files[{path,name,size}]}
    submissions/{uid}     userId, studentName, email, text, audioPath,
                          submittedAt(재제출 시 덮어씀),
                          revision(1부터, 재제출마다 +1), firstSubmittedAt(불변), latestSubmittedAt  ← 배치 05
                          audioDuration(초), studentSeenFeedbackAt                                  ← 배치 06
                          feedbacks[{id, text, audioPath, audioDuration, createdAt(ISO 문자열), author, forRevision}],
                          (구버전) feedback{text, audioPath, updatedAt}
      revisions/{회차}    revision, text, audioPath, audioDuration, submittedAt, studentName, legacy?
                          ← 배치 06: 제출 1회 = 문서 1개, 변경 불가. 회차 없던 이전 제출은 처음 다시 낼 때 1차로 보존
    quizVersions/{버전}   version, questions(정답 포함), savedAt, savedBy   ← 배치 06, 강사 전용
    quizResults/{uid}     userId, studentName, email, score, total, submittedAt, attemptCount,
                          answers["2","0,2",…](문자열 목록), answersById{문항ID:[선택]}, questionIds[], quizVersion,
                          firstAttempt{score, total, submittedAt, answers, answersById, quizVersion, legacy},
                          studentSeenFeedbackAt, feedbacks[]
                          ※ Firestore는 배열 안에 배열을 저장하지 못합니다. 복수정답 답을 [2,[0,2]]처럼 저장하면
                            오류가 나므로(배치 06에서 수정) answersById(맵 안의 배열)로 저장합니다.
      attempts/{aid}      userId, answers[], answersById{}, questionIds[], quizVersion, score, total,
                          attemptNumber, submittedAt,
                          mode?('wrongOnly' = 틀린 문제만 다시 풀기. 요약 문서의 점수·첫 응시는 바꾸지 않음)   ← 배치 10
    attendance/{uid}      status('present'|'absent'), note, updatedAt   ← 문서 없음 = 미입력
                          (D2: 출석·불참 두 가지. 이전 형식의 'late'는 출석, 'excused'는 불참으로 읽음)
Storage
  classes/{cid}/submissions/{wid}/{uid}/…            학생 과제 음성
  classes/{cid}/feedback/{wid}/{uid}/…               강사 피드백 음성
  classes/{cid}/previews/{wid}/{image|video|file}/…  예습 자료
```

이 구조가 배치 06·08 등에서 바뀌면, 해당 배치의 결과 보고에 바뀐 구조를 적고 이 표도 갱신하세요.

**보관된 반(2026-10-29 요청):** 수강 등록이 active인 학생은 반이 보관된 뒤에도 그 반의 기록을 읽을 수 있습니다(읽기 전용, 강의 영상 제외). 규칙의 `enrolled(cid)`(읽기)와 `member(cid)`(쓰기, 운영 중인 반)를 구분해 씁니다.

**공통 판정 함수(common.js):** `formatDateTime`·`toDate`·`todayKey`·`daysBetween`(D10 시간대), `sessionState`(차시 예정·오늘·완료), `attendanceValue`(D2 출결 읽기: 지각→출석, 인정결석→불참), `needsReply`·`byLastActivity`(질문), `reviewState`·`feedbackItems`(과제 피드백), `statusPill`(상태 배지), `answersFor`·`parseAnswer`·`quizContentKey`(퀴즈 답·버전), `normalizeQuizQuestion`·`isCorrectAnswer`(학생 채점 기준 — 학생 채점과 문항 분석이 함께 씀), `wasActiveAt`(그 날짜에 수강 중이었는지, 근거 부족 시 estimated), `readAudioDuration`·`audioMarkup`(음성 길이).

**대시보드 집계(dashboard.js, 배치 09):** `computeDashboard(input, today, deps)`·`analyzeQuiz(...)`는 화면과 분리한 순수 함수입니다. Firebase를 불러오지 않고 위 판정 함수를 `deps`로 받습니다(이 파일이 `common.js`를 다른 `?v=` 주소로 불러오면 모듈이 두 번 실행되어 Firebase가 두 번 초기화되기 때문). 기준 정의는 파일 머리말과 `09-dashboard.md` 3-2를 따릅니다.

---

## 3. 작업 원칙

1. **기술 스택 유지:** 바닐라 JS + ES module + Firebase Web SDK 13.1.0(CDN). React·Vue·번들러·TypeScript는 도입하지 않습니다. 새 외부 라이브러리는 꼭 필요할 때만 쓰고, 이유를 보고합니다.
2. **범위 준수:** 이 배치에 적힌 항목만 수정합니다. 다른 문제를 발견하면 고치지 말고 결과 보고의 '추가 발견'에 적습니다.
3. **기존 데이터 호환:** 결정사항 D7(실제 데이터 유무)에 따릅니다. 기본값은 다음과 같습니다.
   - 기존 문서를 반드시 읽을 수 있어야 합니다.
   - 새 필드는 "있으면 사용, 없으면 기존 방식으로 해석"합니다.
   - 기존 필드를 삭제하거나 이름을 바꾸지 않습니다.
4. **중복 코드:** `common.js`(배치 03)가 아직 없다면, `index.html`과 `admin.html`에 복사된 같은 이름의 함수(`esc`, `fmt`, `modalDialog`, `uploadMedia`, `recordStart`, `wireMediaUi` 등)를 **양쪽 모두 같은 방식으로** 고칩니다. `common.js`가 있다면 그곳에서만 고칩니다.
5. **코드 스타일:** 기존 패턴(템플릿 문자열 렌더링, `$`/`$$` 헬퍼, `A`(강사)·`S`(학생) 상태 객체, `onSnapshot` 구독을 `A.live`/`S.live`에 보관)을 따릅니다. 단, 새로 쓰거나 크게 고치는 함수는 한 줄로 압축하지 말고 여러 줄로 읽기 쉽게 작성합니다. 관계없는 기존 코드를 재포맷하지 않습니다(사람이 diff를 검토할 수 있어야 합니다).
6. **화면 문구:** 한국어 존댓말을 씁니다. 학생 화면에 개발 용어(Firestore, Rules, Storage, UID, permission-denied 등)를 노출하지 않습니다. 학생에게는 '무엇이 안 됐는지 + 다시 시도 / 강사에게 문의'를 보여 주고, 기술 상세는 `console`에만 남깁니다.
7. **보안:**
   - 사용자 입력은 `esc()`로 이스케이프한 뒤 삽입하고, 서식 HTML은 `sanitizeRich()`를 거칩니다.
   - 권한은 화면이 아니라 보안 규칙이 강제한다는 전제로 설계합니다.
   - 새 필드나 컬렉션을 만들면 `firestore.rules`·`storage.rules` 수정안과 규칙 테스트를 함께 제시합니다.
8. **시간:**
   - 저장은 `serverTimestamp()`를 우선합니다.
   - `arrayUnion` 안처럼 `serverTimestamp()`를 쓸 수 없는 곳은 ISO 문자열을 쓰되, 표시할 때는 반드시 공통 포맷 함수로 변환합니다.
   - 표시 시간대는 D10(기본 `Asia/Seoul`)입니다.
9. **CSS:** `common.css`의 디자인 토큰(`--wine-*`, `--olive-*`, `--saffron-*`, `--success` 등)만 사용하고, 새 덮어쓰기 레이어나 `!important`를 덧붙이지 않습니다. 공통 컴포넌트는 `common.css`, 화면별 스타일은 `student.css`/`admin.css`의 해당 선택자를 직접 고칩니다. CSS를 바꾸면 HTML의 `?v=` 값을 올립니다.
10. **운영 영향 작업 금지:** 보안 규칙 배포, 운영 데이터 일괄 수정, Storage 파일 일괄 삭제는 직접 실행하지 않습니다. 명령어와 절차만 제시합니다.
11. **커밋:** 항목 단위로 나누고, 메시지에 항목 ID를 포함합니다. 예: `fix(P0-01): 빠른 출석 재저장 시 기존 상태 보존`

---

## 4. 검증 방법

- **테스트 하네스:** `node tests/run.cjs`(시나리오), `node tests/screens.cjs <출력폴더> 390,1440`(스크린샷), `cd tests/rules && npm test`(보안 규칙, Java 필요)가 있습니다. 모두 통과해야 합니다.
  - 이번 배치에서 고친 버그 테스트의 `test.fail()` 표시를 제거해 정상 통과로 바꿉니다.
  - 새 동작에 대한 시나리오를 추가합니다.
- **하네스가 없으면:** 고친 항목마다 '재현 절차 → 기대 결과' 체크리스트를 작성합니다.
- **문법 검사:** 두 HTML의 `<script type="module">` 내용을 추출해 문법 오류가 없는지 확인합니다(예: 임시 `.mjs` 파일로 저장 후 `node --check`).
- **화면이 바뀌면:** 320 / 390 / 768 / 1440px 스크린샷을 전후로 비교합니다(하네스의 스크린샷 스크립트).
- **실제 Firebase·실기기는 사람이 확인합니다:** 결과 보고에 확인 체크리스트를 넣습니다.

---

## 5. 결과 보고 형식

작업을 마치면 아래 순서로 보고합니다.

1. **변경 요약:** 항목 ID별로 '원인 → 수정 내용 → 변경한 파일·함수'
2. **데이터 구조 변경:** before/after 표, 기존 데이터를 읽는 방법
3. **보안 규칙 변경 필요 사항:** 수정안과 테스트 (해당 시)
4. **테스트 결과:** 통과·실패 목록, 실패가 남았다면 이유
5. **사람이 확인할 체크리스트:** 실제 Firebase·PC·휴대폰별로 구분
6. **남은 위험 · 보류 · 추가 발견**
