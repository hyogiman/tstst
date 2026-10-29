# [06] 데이터 구조 v2 — 처음부터 남겨야 하는 기록 (P1-01 ~ P1-06)

> 먼저 `docs/prompts/00-common.md`를 읽고 따르세요.
> 관련 결정사항: **D3**(마감 정책), **D7**(실제 데이터 유무 → 데이터 이전 필요 여부), **D10**(시간대).
> 배치 05에서 만든 `revision`, `firstSubmittedAt`, `latestSubmittedAt`, `forRevision`을 그대로 확장합니다(이름 변경 금지).

## 1. 목표

나중에 코드를 고쳐도 **과거 기록이 생기지 않는 데이터**를 지금부터 남깁니다.
대상은 제출 이력, 응시 당시의 퀴즈 버전, 마감 시각, 수강 기간, 확인 시각, 녹음 길이입니다.
이 배치는 **기록을 남기는 것**이 목적이고, 그 기록을 쓰는 화면(대시보드·배지·학생 상세)은 배치 09~11에서 만듭니다. 단, 강사가 바로 써야 하는 최소 화면(제출 회차 비교, 응시 이력의 버전 해석)은 이 배치에 포함합니다.

## 2. 설계 원칙

- **변경 불가능한 이력 + 현재 상태 요약**으로 나눕니다. 이력 문서는 만들기만 하고 수정·삭제하지 않습니다(보안 규칙으로 강제).
- 계산으로 알 수 있는 값(예: 정시 제출 여부)은 저장하지 않고 **읽을 때 계산**합니다. 마감을 바꿔도 결과가 자동으로 맞춰집니다.
- 기존 필드는 유지하고, 새 필드가 없으면 기존 방식으로 해석합니다(00 공통 머리말 원칙 3).

---

## 3. 요구사항

### P1-01. 과제 제출 이력

**구조**
```
weeks/{wid}/submissions/{uid}                    ← 현재 상태 요약 (기존 문서)
  revision, firstSubmittedAt, latestSubmittedAt, submittedAt(호환),
  text, audioPath, audioDuration                 ← 최신 제출 내용 (호환)
  feedbacks[{…, forRevision}]
weeks/{wid}/submissions/{uid}/revisions/{revNo}  ← 신규: 제출 1회 = 문서 1개 (revNo = "1", "2", …)
  revision, text, audioPath, audioDuration, submittedAt, studentName
```

**쓰기:** 학생 제출 시 `runTransaction`으로 요약 문서를 읽고 다음 번호를 정한 뒤, 같은 트랜잭션에서 `revisions/{번호}` 생성과 요약 갱신을 함께 합니다.
- 기존 요약 문서에 `revision`이 없고 내용이 있으면(이전 버전 제출): 처음 v2로 저장할 때 기존 내용으로 `revisions/1`을 만들고(기존 `submittedAt` 사용), 새 제출을 `revisions/2`로 저장합니다. 이전 내용이 사라지지 않게 하기 위해서입니다.

**강사 화면 (과제·복습 관리 상세)**
- 제출 회차 탭: `1차 제출 · 10/28(화) 21:03 | 2차 제출 · 10/30(목) 08:12`
- [이전 제출과 비교]: 두 회차 텍스트를 나란히 보여 주고, 음성은 각각 재생합니다.
- 피드백은 대상 회차별로 묶어 표시합니다(`forRevision` 기준, 없으면 1차).

**학생 화면:** 과제 카드에 [이전 제출 보기] 접기 영역을 둡니다.

**파일 생명주기**
- 제출된 음성은 이력으로 보존합니다(교체해도 삭제하지 않음).
- 반·차시 영구 삭제(`deleteClassDeep`, `deleteWeekDeep`)의 삭제 대상에 `revisions`의 문서와 음성 경로를 추가합니다.
- 오래된 음성의 자동 정리 정책은 만들지 않고 보고서에 '보류'로 적습니다.

### P1-02. 퀴즈 버전 스냅샷

**강사 저장 (`saveWeek`)**
- 퀴즈 문항 내용(순서, `type`, `stem`, `options`, `correctIndices`, `explanation`)이 저장된 버전과 달라졌으면 `quiz.version`을 1 올리고(없으면 1), `weeks/{wid}/quizVersions/{version}`에 `{version, questions, savedAt, savedBy}` 스냅샷을 만듭니다.
- 비교는 정규화한 JSON으로 합니다. 제목만 바뀐 경우는 버전을 올리지 않습니다.
- `quizVersions`에는 정답이 들어 있으므로 **강사만 읽을 수 있게** 합니다(보안 규칙).
- 문항 `id`가 없는 기존 문항은 강사 화면이 렌더링할 때마다 새 임의 ID를 받습니다(`normalizeQuestion`, `admin.html:913`). 저장할 때 ID를 확정하고, 이후 바뀌지 않는지 확인합니다.
- 보기 ID는 도입하지 않습니다. 버전 스냅샷으로 응시 당시 보기 순서를 복원할 수 있기 때문입니다. (보기 ID가 더 낫다고 판단하면 이유와 함께 제안합니다.)

**학생 응시 (`renderQuiz` → `finishQuiz`)**
- 응시를 시작할 때의 `quiz.version`과 문항을 메모리에 고정합니다. 풀던 중 강사가 퀴즈를 바꿔도 시작한 버전으로 채점·저장합니다.
- `attempts` 문서에 추가할 필드: `quizVersion`, `questionIds`(순서), `answersById: {questionId: [선택 인덱스]}`. 기존 `answers` 배열도 호환을 위해 계속 저장합니다.
- `quizResults` 요약의 `firstAttempt`에 `answers`, `answersById`, `quizVersion`, `legacy:false`를 저장합니다(현재 새 첫 응시에는 `answers`가 없음, `index.html:604`).

**강사 응시 이력 화면 (`drawFeedbackList`의 응시 기록, `admin.html:1092`)**
- 각 응시를 그 응시의 `quizVersion` 스냅샷으로 해석해 표시합니다.
- 버전이 없는 기존 기록은 `이전 기록 · 문제 버전 미상`으로 표시하고, 현재 문제로 해석한 결과에는 `현재 문제 기준 추정` 경고를 붙입니다.
- `firstAttempt.legacy === true`인 값은 `이전 기록에서 가져온 첫 결과`로 표시합니다. 배치 09의 대시보드는 이 값을 '실제 첫 응시'와 구분해야 합니다.

### P1-03. 마감 시각 정규화 (D3, D10)

> **D3 확정(2026-10-29):** 제출 권장일은 **통계 마감으로 쓰지 않습니다.** 통계는 실시간 제출 현황으로 보여 주고, 늦은 제출도 인정합니다. 따라서 아래의 `dueAtTs`는 **학생 화면의 D-day 표시와 정렬용**으로만 쓰고, 정시·늦음 판정(`submissionTiming`)은 만들지 않습니다(필요해지면 그때 추가).

- 강사 저장 시 `assignment.dueAt`(문자열)은 유지하고, `assignment.dueAtTs`(Timestamp)를 추가합니다. 문자열은 D10 시간대(Asia/Seoul) 기준으로 해석합니다(배치 05의 `formatDateTime`과 같은 해석 함수 사용).
- 학생 과제 화면 표시
  - 마감 전: `마감 10월 30일 (목) 오후 11:59 · 2일 남음`
  - 마감 후(D3 권장값: 제출 허용): `마감이 지났어요 · 지금 제출하면 '늦은 제출'로 기록돼요`
- 정시 여부는 저장하지 않고 분석할 때 `firstSubmittedAt <= dueAtTs`로 계산합니다. **최초 제출 기준**이므로, 마감 전에 내고 마감 후에 고쳐 낸 경우는 정시 제출입니다. 이 정의를 결과 보고에 적습니다.
- 마감이 없는 과제는 분석에서 '마감 없음'으로 따로 분류합니다.
- 공통 계산 함수 `submissionTiming(submission, assignment)` → `'onTime' | 'late' | 'none' | 'noDeadline' | 'notDue'`를 만들어 둡니다(배치 09에서 사용).

### P1-04. 수강 기간 이력

**구조**
```
enrollments/{uid}_{cid}/events/{eid}    ← 신규, 변경 불가
  type: 'joined' | 'stopped' | 'resumed' | 'transferred_out' | 'transferred_in'
  at (Timestamp), by (uid), fromClassId?, toClassId?
```
- 상태를 바꾸는 **모든 경로**에서 같은 일괄 쓰기로 이벤트를 남깁니다.
  - 학생 코드 입장(`wireJoin`) → `joined` (학생은 자기 등록에 `joined`만 만들 수 있음, 보안 규칙)
  - 강사 수강 중지·재등록 → `stopped` / `resumed`
  - 반 이동(배치 04의 `activateEnrollment`) → 이전 반 `transferred_out`, 새 반 `transferred_in`
- 판정 함수 `wasActiveAt(enrollment, events, date)`를 만듭니다. 그 날짜에 수강 중이었는지 반환하고, 근거가 부족하면 `estimated: true`를 함께 반환합니다.
  - 이벤트가 없는 기존 등록: `joinedAt`부터 수강 중으로 봅니다. 현재 상태가 `inactive`·`transferred`인데 언제 바뀌었는지 모르면 `estimated: true`
- **차시 대상자** = 그 차시 날짜에 수강 중이던 학생. 날짜 없는 차시는 현재 수강생 기준으로 보고 `estimated: true`
- (선택) 면제: `weeks/{wid}/exemptions/{uid}` `{reason, by, at}` — 대상자에서 제외합니다. 구현 여부는 보고서에 적습니다.

### P1-05. 확인 시각 (새 소식 배지의 전제)

- `submissions/{uid}.studentSeenFeedbackAt`, `quizResults/{uid}.studentSeenFeedbackAt`
  - 학생 화면에 피드백이 표시될 때, 마지막 확인 이후 새 피드백이 있을 때만 갱신합니다(렌더링마다 쓰지 않음).
- `questions/{qid}.studentSeenAt`: 학생이 질문 대화를 열 때 갱신합니다.
- 강사 화면: 피드백 옆에 `학생 확인 10/30 08:12` 표시 (`studentSeenFeedbackAt >= 피드백 시각`일 때)
- 보안 규칙: 학생이 자기 문서의 이 필드들만 쓸 수 있게 허용 목록에 추가합니다.

### P1-06. 녹음 길이

- 녹음: 시작·종료 시각 차이로 길이(초)를 계산합니다. Chrome의 `MediaRecorder`로 만든 webm은 길이 정보가 비어 `audio.duration`이 `Infinity`로 나오는 경우가 있으므로, 메타데이터를 믿지 않습니다.
- 파일 선택 업로드: `loadedmetadata`로 읽고, `Infinity`·`NaN`이면 `null`로 저장합니다.
- 저장 위치: 제출 `revisions`·요약의 `audioDuration`, 강사 피드백 항목의 `audioDuration`
- 표시: 음성 옆에 `0:42`

---

## 4. 기존 데이터 이전 (D7에 따라)

- **D7 = 실제 데이터 없음:** 이전 작업을 하지 않습니다. 테스트 데이터 정리 방법만 안내합니다.
- **D7 = 실제 데이터 있음:** 강사 화면에 숨은 '데이터 구조 점검' 도구를 만듭니다.
  1. **미리 보기:** 새 필드가 없는 문서 수를 컬렉션별로 보여 줍니다.
  2. **안전한 보정만 실행:** 기존 제출 → `revisions/1`, 기존 등록 → `joined` 이벤트(`joinedAt` 기준)
  3. 결과 기록을 남기고, 다시 실행해도 중복이 생기지 않게 합니다.
  - 퀴즈 legacy 기록은 보정하지 않습니다(정보가 없으므로). '버전 미상'으로 남깁니다.

## 5. 보안 규칙

- 새 컬렉션 `revisions`, `quizVersions`, `events`(+ 선택 `exemptions`)와 새 필드 허용 목록을 `firestore.rules`에 반영하고 규칙 테스트를 추가합니다.
- 이력 컬렉션은 **생성만 허용, 수정·삭제 거부**(강사의 영구 삭제 흐름은 예외로 허용할지 보고서에서 제안)

## 6. 완료 기준

- [ ] 데이터 구조 before/after 표를 `00-common.md` 2장에 반영
- [ ] 테스트: 재제출 3회 → `revisions` 3개, `firstSubmittedAt` 불변, 강사 화면에서 1차·3차 비교 가능
- [ ] 테스트: 기존 형식 제출 문서에 v2 제출 → `revisions/1`(기존 내용) + `revisions/2` 생성
- [ ] 테스트: 퀴즈 보기 순서를 바꿔 저장 → `version` 증가, 이전 응시 이력은 이전 버전 기준으로 동일하게 표시
- [ ] 테스트: 응시 도중 강사가 퀴즈 수정 → 시작한 버전으로 저장
- [ ] 테스트: 반 이동·중지·재등록 → `events` 기록, `wasActiveAt`이 날짜별로 맞게 판정
- [ ] 테스트: 녹음 길이가 저장·표시됨 (가짜 미디어 장치)
- [ ] 보안 규칙 테스트 추가·통과 (이력 수정·삭제 거부 포함)
- [ ] 00 공통 머리말의 '결과 보고 형식'으로 보고
