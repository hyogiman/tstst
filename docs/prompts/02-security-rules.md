# [02] 보안 규칙을 저장소에서 관리하고 테스트하기 (P0-11)

> 먼저 `docs/prompts/00-common.md`를 읽고 따르세요.
> **이 배치는 규칙을 배포하지 않습니다.** 작성·테스트·배포 절차 안내까지만 하고, 배포는 사람이 합니다.

## 0. 사용자 준비물 (시작 전에 사람이 할 일)

1. Firebase 콘솔 → **Firestore Database → 규칙** 탭의 내용을 전부 복사해 저장소 루트의 `firestore.rules.current`로 저장합니다.
2. Firebase 콘솔 → **Storage → 규칙** 탭의 내용을 `storage.rules.current`로 저장합니다.
3. (있다면) Firestore → 색인 탭의 복합 색인 목록을 캡처하거나 적어 둡니다.

준비물이 없으면 "현재 규칙 미확인" 상태로 새 규칙을 작성하고, 보고서에 그 사실을 명시합니다.

## 1. 목표

앱이 실제로 하는 읽기·쓰기만 허용하고 나머지는 거부하는 `firestore.rules`·`storage.rules`를 저장소에서 관리합니다. 각 정책마다 **허용 1건 이상 + 거부 1건 이상**을 에뮬레이터 테스트로 증명합니다.

## 2. 작업 순서

### 2-1. 앱의 실제 접근 경로 목록화

`index.html`·`admin.html`의 모든 Firestore·Storage 호출을 찾아 표로 만듭니다. (주체 / 경로 / 동작 get·list·create·update·delete / 쓰는 필드 / 함수명)

반드시 포함할 학생 흐름:

| 흐름 | cd043b9 기준 호출 순서 |
|---|---|
| 가입 | `users/{uid}` get → 없으면 set(`role:'student'` 포함) → update(`displayName`, `realName`, `nickname`, `updatedAt`) |
| 코드 입장 (`wireJoin`) | `joinCodes/{CODE}` get → `enrollments/{uid}_{cid}` set(`status:'active'`) → `classes/{cid}/members/{uid}` set merge → `users/{uid}` update(`assignedClassId`) |
| 첫 로드 (`loadStudent`) | `enrollments` where `uid==나` → `classes/{cid}` get → `weeks` where `published==true` |
| 실시간 | 위 쿼리들 + `classes/{cid}` 문서 구독 |
| 과제 | `submissions/{나}` get·구독 → Storage 업로드 → `submissions/{나}` set merge |
| 복습 | `quizResults/{나}` get·구독 → 트랜잭션(`quizResults/{나}` get·set + `attempts/{새 ID}` set) |
| 내 정보 | `users/{나}` update, `members/{나}` set merge, `attendance/{나}` get·구독(차시별) |
| 질문 | `questions` add, `questions` where `uid==나` 구독, `replies` add·구독 |
| 우리 반 | `members` 컬렉션 구독 |

강사 흐름은 `role=='admin'`으로 전체 접근하되, 표에는 모두 적어 둡니다.

### 2-2. 현재 규칙 분석

`*.current` 파일을 아래 정책 표와 비교해 '과도한 허용 / 누락된 허용(앱이 막힘) / 일치'로 분류합니다.

### 2-3. 정책 (새 규칙이 지켜야 할 기대 동작)

**공통**
- 로그인하지 않은 사용자는 모두 거부합니다.
- 강사 판정은 `users/{auth.uid}.role == 'admin'`입니다.
- 규칙은 필터가 아닙니다. 학생 쿼리는 이미 `where('uid','==',나)`, `where('published','==',true)` 조건을 갖고 있으니, 규칙도 이 조건과 맞게 작성합니다.

**Firestore**

| 경로 | 학생 | 강사 |
|---|---|---|
| `users/{uid}` | 본인만 읽기. 생성 시 `role=='student'`만 허용. 수정 시 `role`·`email` 변경 불가. 허용 필드: `displayName`, `nickname`, `assignedClassId`, `updatedAt`, `realName`(가입 때 입력, 이후 강사만 변경 — 기존 값과 같거나 비어 있거나 `'수강생'`일 때만 학생이 쓸 수 있음) | 전체 |
| `joinCodes/{code}` | 단건 get만 (list 거부), 쓰기 거부 | 전체 |
| `enrollments/{id}` | 본인 문서만 읽기. 생성: 문서 ID == `{uid}_{classId}`, `uid==나`, `status=='active'`, `joinCodes/{joinCode}.classId == classId`, 반이 보관 상태가 아님. **수정·삭제 거부** (같은 반의 수강 중지 문서를 학생이 다시 active로 바꾸지 못함) | 전체 |
| `classes/{cid}` | 해당 반에 active 등록이 있을 때만 읽기 | 전체 |
| `classes/{cid}/members/{uid}` | 같은 반 active 수강생 읽기. 본인 문서만 생성·수정, 허용 필드 `uid`·`name`·`status`·`joinedAt`, `status`는 `'active'`만 | 전체 |
| `classes/{cid}/teacherNotes/{uid}` | **전부 거부** | 전체 |
| `classes/{cid}/questions/{qid}` | 본인 질문만 읽기. 생성: `uid==나`, `status=='open'`. 수정: 본인 질문의 `status`(→ `'open'`만), `needsTeacherReply`, `lastMessageAt`, `lastSenderRole`, `studentSeenAt`, `updatedAt`만 (배치 05에서 사용). 삭제 거부 | 전체 |
| `…/questions/{qid}/replies/{rid}` | 상위 질문 작성자만 읽기. 생성: 본인 질문, `uid==나`, `role=='student'`. 수정·삭제 거부 | 읽기·생성(`role=='admin'`)·삭제 |
| `classes/{cid}/weeks/{wid}` | active 수강생이고 `published==true`인 문서만 읽기 | 전체 |
| `…/weeks/{wid}/submissions/{uid}` | 본인만 읽기·생성·수정. 차시가 공개 + 과제 ON일 때만 쓰기(마감 후 제출 허용 여부는 D3). **`feedbacks`·`feedback` 필드 변경 불가**. 삭제 거부 | 전체 |
| `…/submissions/{uid}/revisions/{rev}` (배치 06에서 생김) | 본인만 생성·읽기. 수정·삭제 거부 | 읽기 |
| `…/weeks/{wid}/quizResults/{uid}` | 본인만 읽기·쓰기. 차시 공개 + 퀴즈 ON일 때만. `feedbacks` 변경 불가 | 전체 |
| `…/quizResults/{uid}/attempts/{aid}` | 본인만 생성·읽기. 수정·삭제 거부 | 읽기·삭제 |
| `…/weeks/{wid}/attendance/{uid}` | 본인만 읽기. 쓰기 거부 | 전체 |

**Storage**

| 경로 | 학생 | 강사 |
|---|---|---|
| `classes/{cid}/submissions/{wid}/{uid}/{file}` | 본인(`uid==나`)만 쓰기·읽기. `audio/*`, 15MB 이하 | 읽기·삭제 |
| `classes/{cid}/feedback/{wid}/{uid}/{file}` | 해당 학생만 읽기 | 쓰기(`audio/*`, 15MB)·읽기·삭제 |
| `classes/{cid}/previews/{wid}/{image\|video\|file}/{name}` | 해당 반 active 수강생 읽기 | 쓰기(이미지 8MB, 영상 D9 기준, 파일 20MB)·삭제 |
| 그 외 | 거부 | 거부 |

Storage 규칙에서 강사 판정·수강 여부를 확인할 때는 Storage 규칙의 Firestore 조회 기능(`firestore.get` / `firestore.exists`)을 사용합니다.

**설계 시 주의**
- 규칙의 `get()`·`exists()` 호출 횟수에는 요청당 한도가 있습니다. 현재 한도를 공식 문서에서 확인하고, 학생 가입·입장 일괄 쓰기 흐름이 한도 안에 드는지 검증합니다.
- 퀴즈 점수는 학생 브라우저에서 계산되므로 규칙으로 위조를 완전히 막을 수 없습니다(D5). `score <= total`, `total`이 숫자인지 정도만 검사하고, 한계를 보고서에 명시합니다.

### 2-4. 파일 작성

- `firestore.rules`, `storage.rules`
- `firebase.json` (에뮬레이터·규칙 경로 설정, 호스팅 설정은 건드리지 않음)
- 필요하면 `firestore.indexes.json`
- 테스트: `tests/rules/` (`@firebase/rules-unit-testing` + Firestore·Storage 에뮬레이터). 2-3 표의 각 행마다 허용 1건 이상 + 거부 1건 이상
- 에뮬레이터에는 Java(JDK)와 `firebase-tools`가 필요합니다. 필요한 JDK 버전은 firebase-tools 문서를 확인하세요. 실행이 불가능한 환경이면 테스트 코드와 실행 방법만 작성하고 '미실행'으로 보고합니다.

### 2-5. 앱과의 정합성 검증

2-1 표의 **모든 경로가 새 규칙에서 허용되는지** 테스트로 확인합니다. 특히 가입 → 코드 입장의 연속 쓰기와 퀴즈 트랜잭션을 확인합니다.
규칙 때문에 앱 코드 수정이 필요하면 고치지 말고 '필요한 앱 수정' 목록으로 보고합니다(해당 배치에서 반영).

## 3. 제출물

1. 앱 접근 경로 표 (2-1)
2. 현재 규칙 분석 결과 (2-2)
3. 새 규칙 파일, 테스트 코드, 테스트 결과
4. **배포 절차** (사람이 실행)
   - CLI: `firebase deploy --only firestore:rules,storage`
   - 또는 콘솔 규칙 탭에 붙여 넣고 '게시'
   - 배포 직후 확인할 것: 학생 가입·입장·과제 제출·퀴즈·질문, 강사 전체 메뉴
   - 문제가 생겼을 때 되돌리는 방법: `*.current` 내용을 다시 게시
5. 남은 위험: 클라이언트 채점(D5), 강사 권한을 `users` 문서 role로 판정하는 방식의 한계(장기적으로 Custom Claims 검토)

## 4. 완료 기준

- [ ] 2-3 표의 모든 행에 허용·거부 테스트가 있고 통과 (또는 미실행 사유 명시)
- [ ] 2-1의 모든 앱 경로가 새 규칙에서 허용됨
- [ ] 운영 규칙을 배포하지 않음
- [ ] 00 공통 머리말의 '결과 보고 형식'으로 보고
